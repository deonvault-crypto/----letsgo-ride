from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient

from app.config import get_settings


COLLECTION_NAMES = [
    "users",
    "drivers",
    "vehicles",
    "rides",
    "ride_requests",
    "trips",
    "reports",
    "support_messages",
    "waitlist",
    "passenger_interests",
    "driver_applications",
    "audit_logs",
    "conversations",
    "messages",
    "app_notifications",
    "device_push_tokens",
    "notification_preferences",
    "trip_events",
]


class Database:
    def __init__(self) -> None:
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Any = None
        self.status = "not_configured"
        self.memory: Dict[str, List[Dict[str, Any]]] = {
            name: [] for name in COLLECTION_NAMES
        }

    async def connect(self) -> None:
        settings = get_settings()
        if not settings.mongodb_uri:
            self.status = "not_configured"
            return

        try:
            self.client = AsyncIOMotorClient(settings.mongodb_uri)
            self.db = self.client[settings.mongodb_db_name]
            await self.client.admin.command("ping")
            self.status = "connected"
        except Exception:
            self.client = None
            self.db = None
            self.status = "unavailable"

    async def close(self) -> None:
        if self.client:
            self.client.close()

    def _clean(self, item: Dict[str, Any]) -> Dict[str, Any]:
        cleaned = dict(item)
        cleaned.pop("_id", None)
        return cleaned

    async def find_many(
        self, collection: str, filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        filters = filters or {}
        if self.db is not None:
            cursor = self.db[collection].find(filters)
            return [self._clean(item) async for item in cursor]

        rows = []
        for item in self.memory[collection]:
            if all(item.get(key) == value for key, value in filters.items()):
                rows.append(deepcopy(item))
        return rows

    async def find_one(
        self, collection: str, filters: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        if self.db is not None:
            item = await self.db[collection].find_one(filters)
            return self._clean(item) if item else None

        for item in self.memory[collection]:
            if all(item.get(key) == value for key, value in filters.items()):
                return deepcopy(item)
        return None

    async def insert_one(self, collection: str, item: Dict[str, Any]) -> Dict[str, Any]:
        if self.db is not None:
            await self.db[collection].insert_one(item)
            return self._clean(item)

        self.memory[collection].append(deepcopy(item))
        return deepcopy(item)

    async def update_one(
        self, collection: str, item_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        if self.db is not None:
            await self.db[collection].update_one({"id": item_id}, {"$set": updates})
            return await self.find_one(collection, {"id": item_id})

        for index, item in enumerate(self.memory[collection]):
            if item.get("id") == item_id:
                self.memory[collection][index] = {**item, **deepcopy(updates)}
                return deepcopy(self.memory[collection][index])
        return None

    async def delete_one(self, collection: str, item_id: str) -> bool:
        if self.db is not None:
            result = await self.db[collection].delete_one({"id": item_id})
            return result.deleted_count > 0

        original_count = len(self.memory[collection])
        self.memory[collection] = [
            item for item in self.memory[collection] if item.get("id") != item_id
        ]
        return len(self.memory[collection]) < original_count

    async def replace_collection(
        self, collection: str, items: Iterable[Dict[str, Any]]
    ) -> None:
        if self.db is not None:
            await self.db[collection].delete_many({})
            if items:
                await self.db[collection].insert_many(list(items))
            return

        self.memory[collection] = [deepcopy(item) for item in items]


database = Database()
