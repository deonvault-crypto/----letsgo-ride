import unittest
from datetime import datetime, timedelta, timezone

from app.database import COLLECTION_NAMES, database
from app.services.courier_earnings_service import courier_earnings_summary


class CourierEarningsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_summary_counts_only_delivered_jobs_for_current_courier(self):
        now = datetime.now(timezone.utc)
        rows = [
            {
                "id": "delivery-today",
                "courier_user_id": "courier-1",
                "status": "DELIVERED",
                "courier_payout_usd": 5.41,
                "delivered_at": now.isoformat(),
                "source_type": "COURIER_REQUEST",
            },
            {
                "id": "delivery-week",
                "courier_user_id": "courier-1",
                "status": "DELIVERED",
                "courier_payout_usd": 10.0,
                "delivered_at": (now - timedelta(days=3)).isoformat(),
                "source_type": "FOOD_ORDER",
            },
            {
                "id": "delivery-old",
                "courier_user_id": "courier-1",
                "status": "DELIVERED",
                "courier_payout_usd": 3.0,
                "delivered_at": (now - timedelta(days=10)).isoformat(),
                "source_type": "COURIER_REQUEST",
            },
            {
                "id": "delivery-active",
                "courier_user_id": "courier-1",
                "status": "IN_TRANSIT",
                "courier_payout_usd": 99.0,
                "updated_at": now.isoformat(),
            },
            {
                "id": "delivery-other-courier",
                "courier_user_id": "courier-2",
                "status": "DELIVERED",
                "courier_payout_usd": 50.0,
                "delivered_at": now.isoformat(),
            },
        ]
        for row in rows:
            await database.insert_one("courier_deliveries", row)

        summary = await courier_earnings_summary({"id": "courier-1"})

        self.assertEqual(summary["currency"], "USD")
        self.assertEqual(summary["completed_deliveries"], 3)
        self.assertEqual(summary["total_payout_usd"], 18.41)
        self.assertEqual(summary["today_payout_usd"], 5.41)
        self.assertEqual(summary["last_7_days_payout_usd"], 15.41)
        self.assertEqual(summary["latest_payouts"][0]["delivery_id"], "delivery-today")
        self.assertNotIn("delivery-active", [item["delivery_id"] for item in summary["latest_payouts"]])


if __name__ == "__main__":
    unittest.main()
