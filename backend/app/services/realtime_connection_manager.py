from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Dict, FrozenSet

from fastapi import WebSocket

from app.database import database
from app.models.event import PublishedRealtimeEvent, RealtimeAudience
from app.utils import new_id, now_iso


@dataclass
class RealtimePrincipal:
    user_id: str
    role: str
    restaurant_ids: FrozenSet[str] = field(default_factory=frozenset)


@dataclass
class RealtimeConnection:
    connection_id: str
    websocket: WebSocket
    principal: RealtimePrincipal
    last_seen: float = field(default_factory=time.monotonic)
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


def principal_can_receive(principal: RealtimePrincipal, audience: RealtimeAudience) -> bool:
    if audience.admin_only:
        return principal.role == "admin"
    if principal.user_id in audience.user_ids:
        return True
    if principal.role in audience.roles:
        return True
    return bool(principal.restaurant_ids.intersection(audience.restaurant_ids))


async def principal_for_user(user: dict) -> RealtimePrincipal:
    user_id = str(user.get("id") or "")
    role = str(user.get("role") or "passenger")
    restaurant_ids = set()
    if role == "merchant":
        restaurants = await database.find_many("restaurants")
        restaurant_ids = {
            str(item.get("id"))
            for item in restaurants
            if item.get("owner_user_id") == user_id or user_id in (item.get("staff_user_ids") or [])
        }
    return RealtimePrincipal(user_id=user_id, role=role, restaurant_ids=frozenset(restaurant_ids))


class RealtimeConnectionManager:
    def __init__(self, heartbeat_seconds: float = 25.0) -> None:
        self.heartbeat_seconds = heartbeat_seconds
        self._connections: Dict[int, RealtimeConnection] = {}
        self._lock = asyncio.Lock()

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    async def register(self, websocket: WebSocket, principal: RealtimePrincipal) -> RealtimeConnection:
        socket_key = id(websocket)
        async with self._lock:
            existing = self._connections.get(socket_key)
            if existing:
                return existing
            connection = RealtimeConnection(new_id(), websocket, principal)
            self._connections[socket_key] = connection
            return connection

    async def unregister(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.pop(id(websocket), None)

    def touch(self, websocket: WebSocket) -> None:
        connection = self._connections.get(id(websocket))
        if connection:
            connection.last_seen = time.monotonic()

    async def send_control(self, connection: RealtimeConnection, message: dict) -> bool:
        try:
            async with connection.send_lock:
                await asyncio.wait_for(connection.websocket.send_json(message), timeout=5.0)
            return True
        except Exception:
            await self._drop(connection, 1011)
            return False

    async def _drop(self, connection: RealtimeConnection, code: int) -> None:
        await self.unregister(connection.websocket)
        try:
            await asyncio.wait_for(connection.websocket.close(code=code), timeout=2.0)
        except Exception:
            pass

    async def broadcast(self, event: PublishedRealtimeEvent) -> None:
        connections = [
            connection
            for connection in list(self._connections.values())
            if principal_can_receive(connection.principal, event.audience)
        ]
        if connections:
            await asyncio.gather(*(
                self.send_control(connection, event.envelope.model_dump(mode="json"))
                for connection in connections
            ))

    async def heartbeat(self, connection: RealtimeConnection) -> None:
        while id(connection.websocket) in self._connections:
            await asyncio.sleep(self.heartbeat_seconds)
            if time.monotonic() - connection.last_seen > self.heartbeat_seconds * 2.5:
                await self._drop(connection, 1011)
                return
            sent = await self.send_control(
                connection,
                {"type": "realtime.ping", "sent_at": now_iso()},
            )
            if not sent:
                return


connection_manager = RealtimeConnectionManager()
