from __future__ import annotations

import asyncio
import os
from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from pymongo import ASCENDING, DESCENDING, GEOSPHERE
from pymongo.errors import DuplicateKeyError

from .config import settings

try:
    from motor.motor_asyncio import AsyncIOMotorClient
except Exception:  # pragma: no cover
    AsyncIOMotorClient = None


COLLECTION_NAMES = [
    "users",
    "refresh_tokens",
    "password_resets",
    "email_verifications",
    "driver_applications",
    "worker_applications",
    "drivers",
    "courier_profiles",
    "courier_shifts",
    "courier_shift_bookings",
    "courier_online_sessions",
    "courier_deliveries",
    "courier_events",
    "courier_location_snapshots",
    "restaurants",
    "food_orders",
    "food_order_events",
    "rides",
    "ride_requests",
    "notifications",
    "conversations",
    "messages",
    "reports",
    "hailing_cities",
    "hailing_driver_presence",
    "hailing_trips",
    "hailing_dispatch_offers",
    "hailing_quotes",
    "hailing_trip_events",
    "audit_logs",
]


class Database:
    def __init__(self):
        self.client = None
        self.db = None
        self.memory: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        self._memory_lock = asyncio.Lock()

    def _ensure_memory_allowed(self) -> None:
        if settings.ALLOW_MEMORY_DB:
            return
        raise RuntimeError(
            "MongoDB is unavailable and the in-memory database is disabled for this environment."
        )

    async def connect(self) -> None:
        if self.db is not None:
            return
        if not settings.MONGODB_URI or AsyncIOMotorClient is None:
            self._ensure_memory_allowed()
            return
        try:
            self.client = AsyncIOMotorClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)
            self.db = self.client[settings.DB_NAME]
            await self.client.admin.command("ping")
            await self.ensure_indexes()
        except Exception:
            if self.client is not None:
                self.client.close()
            self.client = None
            self.db = None
            self._ensure_memory_allowed()
            raise

    async def disconnect(self) -> None:
        if self.client is not None:
            self.client.close()
        self.client = None
        self.db = None

    def _clean(self, doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if doc is None:
            return None
        result = dict(doc)
        result.pop("_id", None)
        return result

    async def ensure_indexes(self) -> None:
        """Create the small set of operational indexes required by live product queries."""
        if self.db is None:
            return
        await self._prepare_unique_user_id_index()
        await self._prepare_unique_user_email_index()
        await self.db["courier_deliveries"].create_index(
            [("courier_user_id", 1), ("status", 1), ("updated_at", -1)],
            name="courier_active_by_user",
        )
        await self.db["courier_deliveries"].create_index(
            [("courier_user_id", 1)],
            name="one_active_delivery_per_courier",
            unique=True,
            partialFilterExpression={
                "courier_user_id": {"$type": "string"},
                "status": {"$in": ["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]},
            },
        )
        await self.db["courier_deliveries"].create_index(
            [("status", 1), ("courier_user_id", 1), ("quote_status", 1), ("created_at", 1)],
            name="courier_offer_matching",
        )
        await self.db["courier_profiles"].create_index(
            [("status", 1), ("online", 1), ("user_id", 1)],
            name="courier_offer_audience",
        )
        await self.db["food_orders"].create_index(
            [("customer_user_id", 1), ("created_at", -1)],
            name="food_orders_by_customer",
        )
        await self.db["food_orders"].create_index(
            [("restaurant_id", 1), ("created_at", -1)],
            name="food_orders_by_restaurant",
        )
        await self.db["restaurants"].create_index(
            [("status", 1), ("is_accepting_orders", 1), ("name", 1)],
            name="public_restaurant_availability",
        )
        await self.db["worker_applications"].create_index(
            [("user_id", 1), ("product", 1)],
            name="one_worker_application_per_product",
            unique=True,
        )
        await self.db["courier_shifts"].create_index(
            [("active", 1), ("starts_at", 1), ("zone", 1)],
            name="available_courier_shifts",
        )
        await self.db["courier_shift_bookings"].create_index(
            [("shift_id", 1), ("courier_user_id", 1)],
            name="one_booking_per_courier_shift",
            unique=True,
        )
        await self.db["courier_online_sessions"].create_index(
            [("courier_user_id", 1), ("started_at", -1)],
            name="courier_online_time_by_user",
        )
        await self.db["courier_events"].create_index(
            [("delivery_id", 1), ("created_at", 1)],
            name="courier_events_by_delivery_time",
        )
        await self.db["courier_location_snapshots"].create_index(
            [("delivery_id", 1), ("recorded_at", 1)],
            name="courier_location_snapshots_by_delivery_time",
        )
        await self.db["courier_location_snapshots"].create_index(
            [("expires_at", 1)],
            expireAfterSeconds=0,
            name="courier_telemetry_ttl",
        )
        await self.db["drivers"].create_index(
            [("created_at", -1), ("id", 1)],
            name="drivers_admin_hailing_recent",
        )
        await self.db["rides"].create_index(
            [("user_id", 1), ("updated_at", -1)],
            name="driver_rides_workspace",
        )
        await self.db["ride_requests"].create_index(
            [("ride_id", 1), ("status", 1), ("updated_at", -1)],
            name="ride_requests_by_ride",
        )
        await self.db["ride_requests"].create_index(
            [("user_id", 1), ("updated_at", -1)],
            name="ride_requests_by_passenger",
        )
        await self.db["hailing_cities"].create_index(
            [("slug", 1)],
            name="unique_hailing_city_slug",
            unique=True,
        )
        await self.db["hailing_cities"].create_index(
            [("enabled", 1), ("ride_hailing_enabled", 1), ("country_code", 1)],
            name="hailing_city_availability",
        )
        await self.db["hailing_driver_presence"].create_index(
            [("driver_id", 1)],
            name="unique_hailing_presence_driver",
            unique=True,
        )
        await self.db["hailing_driver_presence"].create_index(
            [("location", GEOSPHERE)],
            name="hailing_presence_location",
        )
        await self.db["hailing_driver_presence"].create_index(
            [("city_id", 1), ("status", 1), ("ride_class", 1), ("last_seen_at", -1)],
            name="hailing_presence_dispatch",
        )
        await self.db["hailing_trips"].create_index(
            [("passenger_user_id", 1), ("status", 1), ("created_at", -1)],
            name="hailing_active_by_passenger",
        )
        await self.db["hailing_trips"].create_index(
            [("driver_user_id", 1), ("status", 1), ("created_at", -1)],
            name="hailing_active_by_driver",
        )
        await self.db["hailing_trips"].create_index(
            [("city_id", 1), ("status", 1), ("created_at", -1)],
            name="hailing_trips_by_city_status",
        )
        await self.db["hailing_trips"].create_index(
            [("status", 1), ("search_expires_at", 1), ("created_at", 1)],
            name="hailing_searching_due_work",
        )
        await self.db["hailing_trips"].create_index(
            [("status", 1), ("next_dispatch_at", 1), ("created_at", 1)],
            name="hailing_searching_next_dispatch",
        )
        await self.db["hailing_trips"].create_index(
            [("driver_id", 1), ("status", 1), ("completed_at", -1)],
            name="hailing_driver_completed_stats",
        )
        await self.db["hailing_trips"].create_index(
            [("passenger_user_id", 1), ("client_request_id", 1)],
            name="unique_hailing_trip_idempotency",
            unique=True,
            partialFilterExpression={"client_request_id": {"$type": "string"}},
        )
        await self.db["hailing_dispatch_offers"].create_index(
            [("trip_id", 1), ("status", 1)],
            name="hailing_offers_by_trip",
        )
        await self.db["hailing_dispatch_offers"].create_index(
            [("driver_id", 1), ("status", 1), ("expires_at", 1)],
            name="hailing_pending_offer_by_driver",
        )
        await self.db["hailing_dispatch_offers"].create_index(
            [("status", 1), ("expires_at", 1)],
            name="hailing_pending_offers_due_work",
        )
        await self.db["hailing_quotes"].create_index(
            [("user_id", 1), ("expires_at", 1)],
            name="hailing_quotes_by_user_expiry",
        )
        await self.db["hailing_trip_events"].create_index(
            [("trip_id", 1), ("created_at", 1)],
            name="hailing_trip_events_by_trip_time",
        )

    async def _index_names(self, collection: str) -> set[str]:
        info = await self.db[collection].index_information()
        return set(info.keys())

    async def _prepare_unique_user_id_index(self) -> None:
        """Ensure stable application user IDs are enforced without steady-state full scans."""
        if "unique_user_app_id" in await self._index_names("users"):
            return
        missing = await self.db["users"].count_documents(
            {
                "$or": [
                    {"id": {"$exists": False}},
                    {"id": None},
                    {"id": ""},
                ]
            }
        )
        if missing:
            raise RuntimeError(
                f"{missing} users are missing application IDs; run the user-id backfill before creating the unique index."
            )
        duplicates = await self.db["users"].aggregate(
            [
                {"$match": {"id": {"$type": "string"}}},
                {"$group": {"_id": "$id", "count": {"$sum": 1}}},
                {"$match": {"count": {"$gt": 1}}},
                {"$limit": 10},
            ]
        ).to_list(length=10)
        if duplicates:
            fingerprints = [
                __import__("hashlib").sha256(str(item.get("_id") or "").encode()).hexdigest()[:12]
                for item in duplicates
            ]
            raise RuntimeError(f"Duplicate user application IDs must be resolved before startup: {fingerprints}")
        await self.db["users"].create_index(
            [("id", 1)],
            name="unique_user_app_id",
            unique=True,
            partialFilterExpression={"id": {"$type": "string"}},
        )

    async def _prepare_unique_user_email_index(self) -> None:
        """Backfill normalized emails only after proving the existing set is unique."""
        if "unique_normalized_user_email" in await self._index_names("users"):
            return
        users = [self._clean(item) async for item in self.db["users"].find({"email": {"$type": "string"}})]
        groups: Dict[str, List[str]] = {}
        for user in users:
            normalized = str(user.get("email") or "").strip().lower()
            if not normalized:
                continue
            groups.setdefault(normalized, []).append(str(user.get("id") or ""))
        duplicates = {
            email: ids for email, ids in groups.items() if len(ids) > 1
        }
        if duplicates:
            fingerprints = [
                __import__("hashlib").sha256(email.encode()).hexdigest()[:12]
                for email in duplicates.keys()
            ]
            raise RuntimeError(f"Duplicate normalized user emails must be resolved before startup: {fingerprints}")
        for user in users:
            normalized = str(user.get("email") or "").strip().lower()
            if not normalized:
                continue
            if user.get("email_normalized") != normalized:
                await self.db["users"].update_one(
                    {"id": user.get("id")},
                    {"$set": {"email_normalized": normalized}},
                )
        await self.db["users"].create_index(
            [("email_normalized", 1)],
            name="unique_normalized_user_email",
            unique=True,
            partialFilterExpression={"email_normalized": {"$type": "string"}},
        )

    def _memory_match_condition(self, actual: Any, expected: Any) -> bool:
        if isinstance(expected, dict):
            for operator, target in expected.items():
                if operator == "$in":
                    if actual not in target:
                        return False
                elif operator == "$nin":
                    if actual in target:
                        return False
                elif operator == "$ne":
                    if actual == target:
                        return False
                elif operator == "$exists":
                    if bool(actual is not None) != bool(target):
                        return False
                elif operator == "$lt":
                    if actual is None or not (actual < target):
                        return False
                elif operator == "$lte":
                    if actual is None or not (actual <= target):
                        return False
                elif operator == "$gt":
                    if actual is None or not (actual > target):
                        return False
                elif operator == "$gte":
                    if actual is None or not (actual >= target):
                        return False
                elif operator == "$type":
                    if target == "string" and not isinstance(actual, str):
                        return False
                    if target == "date" and not isinstance(actual, datetime):
                        return False
                else:
                    return False
            return True
        return actual == expected

    def _matches(self, item: Dict[str, Any], filters: Dict[str, Any]) -> bool:
        if not filters:
            return True
        for key, expected in filters.items():
            if key == "$or":
                if not any(self._matches(item, clause) for clause in expected):
                    return False
                continue
            if key == "$and":
                if not all(self._matches(item, clause) for clause in expected):
                    return False
                continue
            actual = item.get(key)
            if not self._memory_match_condition(actual, expected):
                return False
        return True

    async def find_one(self, collection: str, filters: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if self.db is not None:
            return self._clean(await self.db[collection].find_one(filters))
        self._ensure_memory_allowed()
        for item in self.memory[collection]:
            if self._matches(item, filters):
                return deepcopy(item)
        return None

    async def find_many(
        self,
        collection: str,
        filters: Optional[Dict[str, Any]] = None,
        *,
        sort: Optional[Sequence[Tuple[str, int]]] = None,
        skip: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        filters = filters or {}
        if self.db is not None:
            cursor = self.db[collection].find(filters)
            if sort:
                cursor = cursor.sort(list(sort))
            if skip is not None:
                cursor = cursor.skip(max(0, int(skip)))
            if limit is not None:
                cursor = cursor.limit(max(0, int(limit)))
            return [self._clean(item) async for item in cursor]

        self._ensure_memory_allowed()
        rows = []
        for item in self.memory[collection]:
            if self._matches(item, filters):
                rows.append(deepcopy(item))
        if sort:
            for field, direction in reversed(list(sort)):
                rows.sort(
                    key=lambda item: (item.get(field) is None, item.get(field)),
                    reverse=int(direction) < 0,
                )
        if skip is not None:
            rows = rows[max(0, int(skip)) :]
        if limit is not None:
            rows = rows[: max(0, int(limit))]
        return rows

    async def count(self, collection: str, filters: Optional[Dict[str, Any]] = None) -> int:
        filters = filters or {}
        if self.db is not None:
            return await self.db[collection].count_documents(filters)
        self._ensure_memory_allowed()
        return sum(1 for item in self.memory[collection] if self._matches(item, filters))

    async def insert_one(self, collection: str, data: Dict[str, Any]) -> Dict[str, Any]:
        if self.db is not None:
            try:
                result = await self.db[collection].insert_one(deepcopy(data))
                row = deepcopy(data)
                row["_id"] = result.inserted_id
                return self._clean(row)
            except DuplicateKeyError as exc:
                raise ValueError("A record with a unique value already exists.") from exc

        self._ensure_memory_allowed()
        async with self._memory_lock:
            if collection == "users":
                user_id = str(data.get("id") or "").strip()
                if not user_id:
                    raise ValueError("User id is required.")
                if any(str(item.get("id") or "") == user_id for item in self.memory[collection]):
                    raise ValueError("User id must be unique.")
            self.memory[collection].append(deepcopy(data))
        return deepcopy(data)

    async def update_one(
        self,
        collection: str,
        filters: Dict[str, Any],
        updates: Dict[str, Any],
        *,
        upsert: bool = False,
    ) -> Optional[Dict[str, Any]]:
        if self.db is not None:
            update_doc = {"$set": deepcopy(updates)}
            try:
                await self.db[collection].update_one(filters, update_doc, upsert=upsert)
            except DuplicateKeyError as exc:
                raise ValueError("A record with a unique value already exists.") from exc
            return self._clean(await self.db[collection].find_one(filters))

        self._ensure_memory_allowed()
        async with self._memory_lock:
            for item in self.memory[collection]:
                if self._matches(item, filters):
                    item.update(deepcopy(updates))
                    return deepcopy(item)
            if upsert:
                candidate = {**deepcopy(filters), **deepcopy(updates)}
                self.memory[collection].append(candidate)
                return deepcopy(candidate)
        return None

    async def update_one_if(
        self,
        collection: str,
        filters: Dict[str, Any],
        updates: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Atomic compare-and-set used by state transitions and dispatch claims."""
        if self.db is not None:
            from pymongo import ReturnDocument

            try:
                doc = await self.db[collection].find_one_and_update(
                    filters,
                    {"$set": deepcopy(updates)},
                    return_document=ReturnDocument.AFTER,
                )
            except DuplicateKeyError as exc:
                raise ValueError("A record with a unique value already exists.") from exc
            return self._clean(doc)

        self._ensure_memory_allowed()
        async with self._memory_lock:
            for item in self.memory[collection]:
                if self._matches(item, filters):
                    item.update(deepcopy(updates))
                    return deepcopy(item)
        return None

    async def delete_one(self, collection: str, filters: Dict[str, Any]) -> bool:
        if self.db is not None:
            result = await self.db[collection].delete_one(filters)
            return bool(result.deleted_count)
        self._ensure_memory_allowed()
        async with self._memory_lock:
            for index, item in enumerate(self.memory[collection]):
                if self._matches(item, filters):
                    self.memory[collection].pop(index)
                    return True
        return False

    async def delete_many(self, collection: str, filters: Dict[str, Any]) -> int:
        if self.db is not None:
            result = await self.db[collection].delete_many(filters)
            return int(result.deleted_count)
        self._ensure_memory_allowed()
        async with self._memory_lock:
            kept = []
            deleted = 0
            for item in self.memory[collection]:
                if self._matches(item, filters):
                    deleted += 1
                else:
                    kept.append(item)
            self.memory[collection] = kept
            return deleted

    async def replace_collection(self, collection: str, values: List[Dict[str, Any]]) -> None:
        if self.db is not None:
            await self.db[collection].delete_many({})
            if values:
                await self.db[collection].insert_many(deepcopy(values))
            return
        self._ensure_memory_allowed()
        async with self._memory_lock:
            self.memory[collection] = deepcopy(values)


database = Database()
