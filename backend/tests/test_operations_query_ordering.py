import unittest
from unittest.mock import patch

from app.database import COLLECTION_NAMES, database
from app.services.operations_service import (
    admin_courier_deliveries,
    assigned_courier_deliveries,
    courier_delivery_history,
    list_availability,
)


class OperationsQueryOrderingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_availability_ordering_is_pushed_to_database(self):
        user = {"id": "courier-ordering", "role": "courier"}
        await database.insert_one("work_availability", {"id": "later", "user_id": user["id"], "date": "2026-09-17", "start_time": "12:00"})
        await database.insert_one("work_availability", {"id": "earlier", "user_id": user["id"], "date": "2026-09-16", "start_time": "08:00"})

        with patch.object(database, "find_many", wraps=database.find_many) as find_many:
            rows = await list_availability(user)

        self.assertEqual([row["id"] for row in rows], ["earlier", "later"])
        self.assertEqual(find_many.await_args.kwargs["sort"], [("date", 1), ("start_time", 1)])

    async def test_active_delivery_ordering_is_pushed_to_database(self):
        user = {"id": "courier-ordering", "role": "courier"}
        await database.insert_one("courier_deliveries", {"id": "old", "courier_user_id": user["id"], "status": "IN_TRANSIT", "updated_at": "2026-09-15T08:00:00+00:00"})
        await database.insert_one("courier_deliveries", {"id": "new", "courier_user_id": user["id"], "status": "ARRIVING", "updated_at": "2026-09-15T09:00:00+00:00"})

        with patch.object(database, "find_many", wraps=database.find_many) as find_many:
            rows = await assigned_courier_deliveries(user)

        self.assertEqual([row["id"] for row in rows], ["new", "old"])
        self.assertEqual(find_many.await_args.kwargs["sort"], [("updated_at", -1)])

    async def test_history_ordering_is_pushed_to_database(self):
        user = {"id": "courier-ordering", "role": "courier"}
        await database.insert_one("courier_deliveries", {"id": "old", "courier_user_id": user["id"], "status": "DELIVERED", "updated_at": "2026-09-14T08:00:00+00:00"})
        await database.insert_one("courier_deliveries", {"id": "new", "courier_user_id": user["id"], "status": "CANCELLED", "updated_at": "2026-09-15T09:00:00+00:00"})

        with patch.object(database, "find_many", wraps=database.find_many) as find_many:
            rows = await courier_delivery_history(user)

        self.assertEqual([row["id"] for row in rows], ["new", "old"])
        self.assertEqual(find_many.await_args.kwargs["sort"], [("updated_at", -1)])

    async def test_admin_delivery_ordering_is_pushed_to_database(self):
        await database.insert_one("courier_deliveries", {"id": "old", "created_at": "2026-09-14T08:00:00+00:00"})
        await database.insert_one("courier_deliveries", {"id": "new", "created_at": "2026-09-15T09:00:00+00:00"})

        with patch.object(database, "find_many", wraps=database.find_many) as find_many:
            rows = await admin_courier_deliveries()

        self.assertEqual([row["id"] for row in rows], ["new", "old"])
        self.assertEqual(find_many.await_args.kwargs["sort"], [("created_at", -1)])


if __name__ == "__main__":
    unittest.main()
