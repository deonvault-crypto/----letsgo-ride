from __future__ import annotations

import asyncio
import logging
import random
from abc import ABC, abstractmethod
from typing import Awaitable, Callable, Optional

from app.models.event import PublishedRealtimeEvent


logger = logging.getLogger(__name__)
EventHandler = Callable[[PublishedRealtimeEvent], Awaitable[None]]


class PubSubTransport(ABC):
    @property
    @abstractmethod
    def available(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def start(self, handler: EventHandler) -> None:
        raise NotImplementedError

    @abstractmethod
    async def publish(self, event: PublishedRealtimeEvent) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def close(self) -> None:
        raise NotImplementedError


class RedisPubSubTransport(PubSubTransport):
    """Shared Redis/Valkey pub/sub transport for cross-instance fan-out."""

    def __init__(self, url: str, channel: str) -> None:
        self._url = url.strip()
        self._channel = channel
        self._available = False
        self._closed = False
        self._handler: Optional[EventHandler] = None
        self._subscriber_task: Optional[asyncio.Task] = None
        self._publisher = None
        self._publisher_lock = asyncio.Lock()

    @property
    def available(self) -> bool:
        return self._available

    async def start(self, handler: EventHandler) -> None:
        self._handler = handler
        self._closed = False
        if not self._url:
            self._available = False
            logger.warning("realtime_pubsub_unavailable reason=missing_configuration")
            return
        if self._subscriber_task and not self._subscriber_task.done():
            return
        self._subscriber_task = asyncio.create_task(self._subscriber_loop())

    async def publish(self, event: PublishedRealtimeEvent) -> bool:
        if not self._url or self._closed:
            return False
        try:
            async with self._publisher_lock:
                if self._publisher is None:
                    self._publisher = self._create_client()
                await self._publisher.publish(self._channel, event.model_dump_json())
            return True
        except Exception as exc:
            self._available = False
            logger.warning("realtime_publish_failed error_type=%s", type(exc).__name__)
            await self._close_publisher()
            return False

    async def close(self) -> None:
        self._closed = True
        self._available = False
        if self._subscriber_task:
            self._subscriber_task.cancel()
            try:
                await self._subscriber_task
            except asyncio.CancelledError:
                pass
            self._subscriber_task = None
        await self._close_publisher()

    def _create_client(self):
        from redis.asyncio import Redis

        return Redis.from_url(
            self._url,
            decode_responses=True,
            health_check_interval=25,
            socket_keepalive=True,
        )

    async def _close_publisher(self) -> None:
        publisher, self._publisher = self._publisher, None
        if publisher is not None:
            await publisher.aclose()

    async def _subscriber_loop(self) -> None:
        attempt = 0
        while not self._closed:
            client = None
            subscription = None
            try:
                client = self._create_client()
                subscription = client.pubsub(ignore_subscribe_messages=True)
                await subscription.subscribe(self._channel)
                self._available = True
                attempt = 0
                logger.info("realtime_pubsub_connected channel=%s", self._channel)
                async for message in subscription.listen():
                    if self._closed:
                        break
                    if message.get("type") != "message" or not self._handler:
                        continue
                    try:
                        event = PublishedRealtimeEvent.model_validate_json(message.get("data") or "")
                    except Exception as exc:
                        logger.warning("realtime_pubsub_message_ignored error_type=%s", type(exc).__name__)
                        continue
                    await self._handler(event)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._available = False
                attempt += 1
                delay = min(30.0, float(2 ** min(attempt - 1, 5))) + random.uniform(0, 0.75)
                logger.warning(
                    "realtime_pubsub_disconnected error_type=%s reconnect_seconds=%.2f",
                    type(exc).__name__,
                    delay,
                )
                await asyncio.sleep(delay)
            finally:
                self._available = False
                if subscription is not None:
                    await subscription.aclose()
                if client is not None:
                    await client.aclose()
