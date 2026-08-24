from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

from app.config import get_settings
from app.models.event import PublishedRealtimeEvent, RealtimeAudience, RealtimeEventEnvelope
from app.services.pubsub_service import PubSubTransport, RedisPubSubTransport
from app.services.realtime_connection_manager import connection_manager
from app.utils import new_id, now_iso


settings = get_settings()


class RealtimeEventService:
    def __init__(self, transport: PubSubTransport) -> None:
        self.transport = transport

    async def start(self) -> None:
        await self.transport.start(connection_manager.broadcast)

    async def close(self) -> None:
        await self.transport.close()

    def build_event(
        self,
        *,
        event_type: str,
        resource_type: str,
        resource_id: str,
        version: int,
        audience: RealtimeAudience,
        payload: Optional[Dict[str, Any]] = None,
    ) -> PublishedRealtimeEvent:
        return PublishedRealtimeEvent(
            envelope=RealtimeEventEnvelope(
                event_id=new_id(),
                type=event_type,
                resource_type=resource_type,
                resource_id=resource_id,
                version=version,
                occurred_at=now_iso(),
                payload=payload or {},
            ),
            audience=audience,
        )

    async def publish(self, event: PublishedRealtimeEvent) -> bool:
        return await self.transport.publish(event)

    async def publish_user_event(
        self,
        *,
        event_type: str,
        resource_type: str,
        resource_id: str,
        version: int,
        user_ids: Iterable[str],
        payload: Optional[Dict[str, Any]] = None,
    ) -> bool:
        event = self.build_event(
            event_type=event_type,
            resource_type=resource_type,
            resource_id=resource_id,
            version=version,
            audience=RealtimeAudience(user_ids=frozenset(str(item) for item in user_ids if item)),
            payload=payload,
        )
        return await self.publish(event)

    async def publish_restaurant_event(
        self,
        *,
        event_type: str,
        resource_type: str,
        resource_id: str,
        version: int,
        restaurant_ids: Iterable[str],
        payload: Optional[Dict[str, Any]] = None,
    ) -> bool:
        event = self.build_event(
            event_type=event_type,
            resource_type=resource_type,
            resource_id=resource_id,
            version=version,
            audience=RealtimeAudience(restaurant_ids=frozenset(str(item) for item in restaurant_ids if item)),
            payload=payload,
        )
        return await self.publish(event)

    async def publish_role_event(
        self,
        *,
        event_type: str,
        resource_type: str,
        resource_id: str,
        version: int,
        roles: Iterable[str],
        payload: Optional[Dict[str, Any]] = None,
    ) -> bool:
        event = self.build_event(
            event_type=event_type,
            resource_type=resource_type,
            resource_id=resource_id,
            version=version,
            audience=RealtimeAudience(roles=frozenset(str(item) for item in roles if item)),
            payload=payload,
        )
        return await self.publish(event)

    async def publish_admin_event(
        self,
        *,
        event_type: str,
        resource_type: str,
        resource_id: str,
        version: int,
        payload: Optional[Dict[str, Any]] = None,
    ) -> bool:
        event = self.build_event(
            event_type=event_type,
            resource_type=resource_type,
            resource_id=resource_id,
            version=version,
            audience=RealtimeAudience(admin_only=True),
            payload=payload,
        )
        return await self.publish(event)


realtime_event_service = RealtimeEventService(
    RedisPubSubTransport(settings.realtime_redis_url, settings.realtime_channel)
)
