from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))


database_path = "backend/app/database.py"
replace_once(
    database_path,
    '''        await self.db["courier_location_snapshots"].create_index(
            [("delivery_id", 1), ("recorded_at", 1)],
            name="courier_location_snapshots_by_delivery_time",
        )
        await self.db["rides"].create_index(''',
    '''        await self.db["courier_location_snapshots"].create_index(
            [("delivery_id", 1), ("recorded_at", 1)],
            name="courier_location_snapshots_by_delivery_time",
        )
        await self.db["courier_location_snapshots"].create_index(
            [("expires_at", 1)],
            expireAfterSeconds=0,
            name="courier_location_snapshots_ttl",
        )
        await self.db["drivers"].create_index(
            [("created_at", -1), ("id", 1)],
            name="drivers_admin_hailing_recent",
        )
        await self.db["rides"].create_index(''',
)
replace_once(
    database_path,
    '''        sort: Optional[Sequence[Tuple[str, int]]] = None,
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
        return rows''',
    '''        sort: Optional[Sequence[Tuple[str, int]]] = None,
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
        return rows''',
)

router_path = "backend/app/routers/hailing.py"
replace_once(
    router_path,
    "from fastapi import APIRouter, Depends, Request",
    "from fastapi import APIRouter, Depends, Query, Request",
)
replace_once(
    router_path,
    '''@admin_router.get("/drivers")
async def admin_hailing_drivers(user=Depends(get_admin_user)):
    _ = user
    drivers = await database.find_many("drivers")
    rows = []
    for driver in sorted(drivers, key=lambda item: item.get("name") or item.get("created_at") or ""):
        presence = await database.find_one("hailing_driver_presence", {"driver_id": driver.get("id")})
        rows.append(_hailing_driver_payload(driver, presence))
    return api_success(rows)''',
    '''@admin_router.get("/drivers")
async def admin_hailing_drivers(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user=Depends(get_admin_user),
):
    _ = user
    filters: dict = {}
    count = await database.count("drivers", filters)
    drivers = await database.find_many(
        "drivers",
        filters,
        sort=[("created_at", -1), ("id", 1)],
        skip=offset,
        limit=limit,
    )
    driver_ids = [driver.get("id") for driver in drivers if driver.get("id")]
    presences = (
        await database.find_many("hailing_driver_presence", {"driver_id": {"$in": driver_ids}})
        if driver_ids
        else []
    )
    presence_by_driver = {presence.get("driver_id"): presence for presence in presences}
    rows = [
        _hailing_driver_payload(driver, presence_by_driver.get(driver.get("id")))
        for driver in drivers
    ]
    return api_success(
        {
            "count": count,
            "items": rows,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(rows) < count,
        }
    )''',
)
replace_once(
    router_path,
    '''@admin_router.get("/trips")
async def admin_trips(user=Depends(get_admin_user)):
    trips = await database.find_many("hailing_trips")
    return api_success([public_trip(trip, user) for trip in trips])''',
    '''@admin_router.get("/trips")
async def admin_trips(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    active_only: bool = Query(default=False),
    status: str | None = Query(default=None),
    user=Depends(get_admin_user),
):
    filters: dict = {}
    if status:
        filters["status"] = status.strip().upper()
    elif active_only:
        filters["status"] = {
            "$in": [
                "SEARCHING",
                "DRIVER_ASSIGNED",
                "DRIVER_EN_ROUTE",
                "DRIVER_ARRIVED",
                "PASSENGER_CONFIRMED_BOARDING",
                "IN_PROGRESS",
            ]
        }
    count = await database.count("hailing_trips", filters)
    trips = await database.find_many(
        "hailing_trips",
        filters,
        sort=[("created_at", -1), ("id", 1)],
        skip=offset,
        limit=limit,
    )
    rows = [public_trip(trip, user) for trip in trips]
    return api_success(
        {
            "count": count,
            "items": rows,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(rows) < count,
        }
    )''',
)

mobile_path = "mobile/services/hailingService.ts"
replace_once(
    mobile_path,
    '''export function listAdminHailingDrivers() {
  return requestData<AdminHailingDriver[]>({ method: "GET", url: "/admin/hailing/drivers" });
}''',
    '''type AdminHailingPage<T> = {
  count: number;
  items: T[];
  limit: number;
  offset: number;
  has_more: boolean;
};

export async function listAdminHailingDrivers(options: { limit?: number; offset?: number } = {}) {
  const page = await requestData<AdminHailingPage<AdminHailingDriver>>({
    method: "GET",
    url: "/admin/hailing/drivers",
    params: { limit: options.limit ?? 50, offset: options.offset ?? 0 },
  });
  return page.items;
}''',
)
replace_once(
    mobile_path,
    '''export function listAdminHailingTrips() {
  return requestData<HailingTrip[]>({ method: "GET", url: "/admin/hailing/trips" });
}''',
    '''export async function listAdminHailingTrips(options: { limit?: number; offset?: number; activeOnly?: boolean } = {}) {
  const page = await requestData<AdminHailingPage<HailingTrip>>({
    method: "GET",
    url: "/admin/hailing/trips",
    params: {
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      active_only: options.activeOnly ?? true,
    },
  });
  return page.items;
}''',
)

Path("backend/tests/test_hailing_admin_scale.py").write_text(
    '''from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from app.database import COLLECTION_NAMES, database
from app.routers.hailing import admin_hailing_drivers, admin_trips


class HailingAdminScaleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        self.admin = {"id": "admin-1", "role": "admin"}

    async def test_find_many_skip_applies_after_sort_and_before_limit(self):
        for index in range(6):
            await database.insert_one("audit_logs", {"id": f"row-{index}", "created_at": index})
        rows = await database.find_many(
            "audit_logs", sort=[("created_at", 1)], skip=2, limit=2
        )
        self.assertEqual([row["id"] for row in rows], ["row-2", "row-3"])

    async def test_admin_driver_page_bulk_loads_presence_without_n_plus_one(self):
        for index in range(5):
            driver_id = f"driver-{index}"
            await database.insert_one(
                "drivers",
                {
                    "id": driver_id,
                    "user_id": f"user-{index}",
                    "name": f"Driver {index}",
                    "created_at": f"2026-08-3{index}T12:00:00+00:00",
                    "hailing_enabled": True,
                },
            )
            await database.insert_one(
                "hailing_driver_presence",
                {"id": f"presence-{index}", "driver_id": driver_id, "status": "available"},
            )

        with patch.object(
            database,
            "find_one",
            new=AsyncMock(side_effect=AssertionError("N+1 presence lookup")),
        ):
            response = await admin_hailing_drivers(limit=2, offset=1, user=self.admin)

        page = response["data"]
        self.assertEqual(page["count"], 5)
        self.assertEqual(page["limit"], 2)
        self.assertEqual(page["offset"], 1)
        self.assertTrue(page["has_more"])
        self.assertEqual(len(page["items"]), 2)
        self.assertTrue(all(item["current_presence"] for item in page["items"]))

    async def test_admin_trip_page_is_bounded_and_can_filter_to_active(self):
        statuses = ["SEARCHING", "DRIVER_ARRIVED", "COMPLETED", "CANCELLED", "IN_PROGRESS"]
        for index, status in enumerate(statuses):
            await database.insert_one(
                "hailing_trips",
                {
                    "id": f"trip-{index}",
                    "status": status,
                    "created_at": f"2026-08-3{index}T12:00:00+00:00",
                    "passenger_user_id": f"passenger-{index}",
                },
            )

        response = await admin_trips(
            limit=2, offset=0, active_only=True, status=None, user=self.admin
        )
        page = response["data"]
        self.assertEqual(page["count"], 3)
        self.assertEqual(len(page["items"]), 2)
        self.assertTrue(page["has_more"])
        self.assertTrue(
            all(item["status"] not in {"COMPLETED", "CANCELLED"} for item in page["items"])
        )


if __name__ == "__main__":
    unittest.main()
'''
)
