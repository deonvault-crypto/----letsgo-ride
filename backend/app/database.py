from __future__ import annotations

from copy import deepcopy
import logging
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument

from app.config import get_settings


COLLECTION_NAMES = [
    "users",
    "drivers",
    "vehicles",
    "rides",
    "ride_requests",
    "trips",
    "reports",
    "reviews",
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
    "verification_events",
    "courier_deliveries",
    "courier_events",
    "courier_profiles",
    "courier_location_snapshots",
    "courier_online_sessions",
    "delivery_handoffs",
    "work_availability",
    "worker_applications",
    "courier_shifts",
    "courier_shift_bookings",
    "restaurants",
    "restaurant_categories",
    "menu_categories",
    "menu_items",
    "food_orders",
    "food_order_events",
    "hailing_cities",
    "hailing_driver_presence",
    "hailing_quotes",
    "hailing_trips",
    "hailing_dispatch_offers",
    "hailing_trip_events",
    "driver_fee_ledger",
    "driver_fee_statements",
    "driver_settlement_payments",
]

PERSISTENT_DATABASE_ENVS = {"staging", "production"}


logger = logging.getLogger(__name__)


class Database:
    def __init__(self) -> None:
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Any = None
        self.status = "not_configured"
        self.memory: Dict[str, List[Dict[str, Any]]] = {
            name: [] for name in COLLECTION_NAMES
        }

    async def connect(self, *, ensure_indexes: bool = True) -> None:
        settings = get_settings()
        app_env = str(settings.app_env or "development").strip().lower()
        requires_persistent_database = app_env in PERSISTENT_DATABASE_ENVS

        if not settings.mongodb_uri:
            self.status = "not_configured"
            if requires_persistent_database:
                logger.error(
                    "MongoDB is not configured for %s; refusing to start with in-memory storage.",
                    app_env,
                )
                raise RuntimeError(
                    f"MongoDB is required when APP_ENV={app_env}; MONGODB_URI is not configured."
                )
            return

        try:
            self.client = AsyncIOMotorClient(settings.mongodb_uri)
            self.db = self.client[settings.mongodb_db_name]
            await self.client.admin.command("ping")
            if ensure_indexes:
                await self.ensure_indexes()
            self.status = "connected"
        except Exception as exc:
            self.client = None
            self.db = None
            self.status = "unavailable"
            if requires_persistent_database:
                logger.error(
                    "MongoDB connection failed for %s; refusing to start with in-memory storage. error_type=%s",
                    app_env,
                    exc.__class__.__name__,
                )
                raise RuntimeError(
                    f"MongoDB is required when APP_ENV={app_env}, but the connection is unavailable."
                ) from exc

    def _requires_persistent_database(self) -> bool:
        app_env = str(get_settings().app_env or "development").strip().lower()
        return app_env in PERSISTENT_DATABASE_ENVS

    def _ensure_memory_allowed(self) -> None:
        if self._requires_persistent_database():
            raise RuntimeError(
                "Persistent database is required in this environment; in-memory storage is disabled."
            )

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
        await self.db["drivers"].create_index(
            [("verification_status", 1), ("updated_at", -1)],
            name="admin_driver_verification_queue",
        )
        await self.db["rides"].create_index(
            [("status", 1), ("is_demo", 1), ("updated_at", -1)],
            name="admin_rides_by_status",
        )
        await self.db["ride_requests"].create_index(
            [("status", 1), ("updated_at", -1)],
            name="admin_requests_by_status",
        )
        await self.db["support_messages"].create_index(
            [("status", 1), ("updated_at", -1)],
            name="admin_support_by_status",
        )
        await self.db["reports"].create_index(
            [("status", 1), ("updated_at", -1)],
            name="admin_reports_by_status",
        )
        await self.db["app_notifications"].create_index(
            [("user_id", 1), ("read", 1), ("created_at", -1)],
            name="notifications_unread_by_user",
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
            [("location", "2dsphere")],
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
            if normalized:
                groups.setdefault(normalized, []).append(str(user.get("id") or ""))
        duplicates = {email: ids for email, ids in groups.items() if len(ids) > 1}
        if duplicates:
            fingerprints = [__import__("hashlib").sha256(email.encode()).hexdigest()[:12] for email in duplicates]
            raise RuntimeError(f"Duplicate normalized user emails must be resolved before startup: {fingerprints}")
        for normalized, user_ids in groups.items():
            await self.db["users"].update_one({"id": user_ids[0]}, {"$set": {"normalized_email": normalized}})
        await self.db["users"].create_index(
            [("normalized_email", 1)],
            name="unique_normalized_user_email",
            unique=True,
            partialFilterExpression={"normalized_email": {"$type": "string"}},
        )

    async def close(self) -> None:
        if self.client:
            self.client.close()

    def _clean(self, item: Dict[str, Any]) -> Dict[str, Any]:
        cleaned = dict(item)
        cleaned.pop("_id", None)
        return cleaned

    async def find_many(
        self,
        collection: str,
        filters: Optional[Dict[str, Any]] = None,
        *,
        sort: Optional[Sequence[Tuple[str, int]]] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        filters = filters or {}
        if self.db is not None:
            cursor = self.db[collection].find(filters)
            if sort:
                cursor = cursor.sort(list(sort))
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
        if limit is not None:
            rows = rows[: max(0, int(limit))]
        return rows

    async def find_one(
        self, collection: str, filters: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        if self.db is not None:
            item = await self.db[collection].find_one(filters)
            return self._clean(item) if item else None

        self._ensure_memory_allowed()
        for item in self.memory[collection]:
            if self._matches(item, filters):
                return deepcopy(item)
        return None

    async def insert_one(self, collection: str, item: Dict[str, Any]) -> Dict[str, Any]:
        if self.db is not None:
            await self.db[collection].insert_one(item)
            return self._clean(item)

        self._ensure_memory_allowed()
        self.memory[collection].append(deepcopy(item))
        return deepcopy(item)

    async def update_one(
        self, collection: str, item_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        if self.db is not None:
            await self.db[collection].update_one({"id": item_id}, {"$set": updates})
            return await self.find_one(collection, {"id": item_id})

        self._ensure_memory_allowed()
        for index, item in enumerate(self.memory[collection]):
            if item.get("id") == item_id:
                self.memory[collection][index] = {**item, **deepcopy(updates)}
                return deepcopy(self.memory[collection][index])
        return None

    async def update_one_if(
        self,
        collection: str,
        filters: Dict[str, Any],
        updates: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Atomically update the first row that still matches all supplied filters."""
        if self.db is not None:
            item = await self.db[collection].find_one_and_update(
                filters,
                {"$set": updates},
                return_document=ReturnDocument.AFTER,
            )
            return self._clean(item) if item else None

        self._ensure_memory_allowed()
        for index, item in enumerate(self.memory[collection]):
            if self._matches(item, filters):
                self.memory[collection][index] = {**item, **deepcopy(updates)}
                return deepcopy(self.memory[collection][index])
        return None

    async def update_one_atomic(
        self,
        collection: str,
        filters: Dict[str, Any],
        updates: Dict[str, Any],
        increments: Optional[Dict[str, int | float]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Atomically apply ``$set`` and ``$inc`` and return committed truth.

        This is intentionally collection-agnostic so domain services do not need
        raw Motor calls when a mutation also advances a monotonic resource version.
        Missing numeric fields follow MongoDB ``$inc`` semantics and start at zero.
        """
        increments = increments or {}
        if self.db is not None:
            operation: Dict[str, Any] = {"$set": updates}
            if increments:
                operation["$inc"] = increments
            item = await self.db[collection].find_one_and_update(
                filters,
                operation,
                return_document=ReturnDocument.AFTER,
            )
            return self._clean(item) if item else None

        self._ensure_memory_allowed()
        for index, item in enumerate(self.memory[collection]):
            if self._matches(item, filters):
                next_item = {**item, **deepcopy(updates)}
                for field, amount in increments.items():
                    current = next_item.get(field, 0)
                    if not isinstance(current, (int, float)) or isinstance(current, bool):
                        raise TypeError(f"Cannot increment non-numeric field {field}.")
                    next_item[field] = current + amount
                self.memory[collection][index] = next_item
                return deepcopy(next_item)
        return None

    async def update_many(
        self,
        collection: str,
        filters: Dict[str, Any],
        updates: Dict[str, Any],
    ) -> int:
        """Apply one ``$set`` operation to every matching row and return its count."""
        if self.db is not None:
            result = await self.db[collection].update_many(filters, {"$set": updates})
            return int(result.modified_count)

        self._ensure_memory_allowed()
        changed = 0
        for index, item in enumerate(self.memory[collection]):
            if self._matches(item, filters):
                next_item = {**item, **deepcopy(updates)}
                if next_item != item:
                    self.memory[collection][index] = next_item
                    changed += 1
        return changed

    async def delete_one(self, collection: str, item_id: str) -> bool:
        if self.db is not None:
            result = await self.db[collection].delete_one({"id": item_id})
            return result.deleted_count > 0

        self._ensure_memory_allowed()
        before = len(self.memory[collection])
        self.memory[collection] = [item for item in self.memory[collection] if item.get("id") != item_id]
        return len(self.memory[collection]) < before

    async def delete_many(self, collection: str, filters: Dict[str, Any]) -> int:
        """Delete every matching row and return the number removed."""
        if self.db is not None:
            result = await self.db[collection].delete_many(filters)
            return int(result.deleted_count)

        self._ensure_memory_allowed()
        kept: List[Dict[str, Any]] = []
        deleted = 0
        for item in self.memory[collection]:
            if self._matches(item, filters):
                deleted += 1
            else:
                kept.append(item)
        self.memory[collection] = kept
        return deleted

    async def replace_collection(self, collection: str, items: Iterable[Dict[str, Any]]) -> None:
        clean_items = [deepcopy(item) for item in items]
        if self.db is not None:
            await self.db[collection].delete_many({})
            if clean_items:
                await self.db[collection].insert_many(clean_items)
            return
        self._ensure_memory_allowed()
        self.memory[collection] = clean_items

    async def count(self, collection: str, filters: Optional[Dict[str, Any]] = None) -> int:
        filters = filters or {}
        if self.db is not None:
            return await self.db[collection].count_documents(filters)
        self._ensure_memory_allowed()
        return sum(1 for item in self.memory[collection] if self._matches(item, filters))

    @staticmethod
    def _matches(item: Dict[str, Any], filters: Dict[str, Any]) -> bool:
        for key, expected in filters.items():
            if key == "$or" and isinstance(expected, list):
                if not any(Database._matches(item, option) for option in expected):
                    return False
                continue
            if key == "$and" and isinstance(expected, list):
                if not all(Database._matches(item, option) for option in expected):
                    return False
                continue
            actual = item.get(key)
            if isinstance(expected, dict):
                for operator, value in expected.items():
                    if operator == "$exists":
                        exists = key in item
                        if bool(value) != exists:
                            return False
                    if operator == "$in" and actual not in value:
                        return False
                    if operator == "$nin" and actual in value:
                        return False
                    if operator == "$ne" and actual == value:
                        return False
                    if operator == "$gte" and (actual is None or actual < value):
                        return False
                    if operator == "$gt" and (actual is None or actual <= value):
                        return False
                    if operator == "$lte" and (actual is None or actual > value):
                        return False
                    if operator == "$lt" and (actual is None or actual >= value):
                        return False
                continue
            if actual != expected:
                return False
        return True


database = Database()
