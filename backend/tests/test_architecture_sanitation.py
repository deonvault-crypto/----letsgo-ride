import unittest

from fastapi import HTTPException

from app.database import COLLECTION_NAMES, database
from app.routers.operations import admin_courier_delivery_list
from app.services.operations_service import admin_courier_deliveries


class ArchitectureSanitationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_admin_delivery_read_model_returns_all_deliveries_in_recency_order(self):
        await database.insert_one("courier_deliveries", {"id": "older", "sender_user_id": "customer-a", "created_at": "2026-01-01T00:00:00+00:00"})
        await database.insert_one("courier_deliveries", {"id": "newer", "sender_user_id": "customer-b", "created_at": "2026-02-01T00:00:00+00:00"})

        deliveries = await admin_courier_deliveries()

        self.assertEqual([item["id"] for item in deliveries], ["newer", "older"])

    async def test_admin_delivery_route_rejects_customer_identity(self):
        with self.assertRaises(HTTPException) as raised:
            await admin_courier_delivery_list(user={"id": "customer-a", "role": "passenger"})
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
