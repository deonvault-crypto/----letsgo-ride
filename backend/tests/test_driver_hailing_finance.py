from __future__ import annotations

import unittest
from datetime import datetime, timezone

from app.database import database
from app.services.driver_hailing_finance_service import driver_daily_stats


class DriverHailingFinanceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        await database.replace_collection("hailing_trips", [])

    async def test_cash_is_full_driver_earnings_and_only_settled_card_pays_platform_fee(self):
        rows = [
            {
                "id": "cash",
                "driver_id": "driver-1",
                "status": "COMPLETED",
                "completed_at": "2026-08-30T08:00:00+00:00",
                "payment_method": "cash",
                "payment_status": "cash_due",
                "fare": {"total_fare": 10.0, "platform_commission": 0.30},
            },
            {
                "id": "card-paid",
                "driver_id": "driver-1",
                "status": "COMPLETED",
                "completed_at": "2026-08-30T09:00:00+00:00",
                "payment_method": "card",
                "payment_status": "paid",
                "fare": {"total_fare": 10.0, "platform_commission": 0.30},
            },
            {
                "id": "card-pending",
                "driver_id": "driver-1",
                "status": "COMPLETED",
                "completed_at": "2026-08-30T10:00:00+00:00",
                "payment_method": "card",
                "payment_status": "capture_pending",
                "fare": {"total_fare": 10.0, "platform_commission": 0.30},
            },
            {
                "id": "previous-harare-day",
                "driver_id": "driver-1",
                "status": "COMPLETED",
                "completed_at": "2026-08-29T21:59:59+00:00",
                "payment_method": "cash",
                "payment_status": "cash_due",
                "fare": {"total_fare": 99.0, "platform_commission": 2.97},
            },
        ]
        for row in rows:
            await database.insert_one("hailing_trips", row)

        stats = await driver_daily_stats(
            "driver-1",
            now=datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(stats["today_ride_count"], 3)
        self.assertEqual(stats["today_gross_fares"], 30.0)
        self.assertEqual(stats["today_platform_commission"], 0.30)
        self.assertEqual(stats["today_estimated_earnings"], 19.70)

    async def test_card_failure_is_not_reported_as_driver_earnings(self):
        await database.insert_one(
            "hailing_trips",
            {
                "id": "failed-card",
                "driver_id": "driver-1",
                "status": "COMPLETED",
                "completed_at": "2026-08-30T11:00:00+00:00",
                "payment_method": "card",
                "payment_status": "failed",
                "fare": {"total_fare": 8.0, "platform_commission": 0.24},
            },
        )

        stats = await driver_daily_stats(
            "driver-1",
            now=datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(stats["today_ride_count"], 1)
        self.assertEqual(stats["today_gross_fares"], 8.0)
        self.assertEqual(stats["today_platform_commission"], 0.0)
        self.assertEqual(stats["today_estimated_earnings"], 0.0)


if __name__ == "__main__":
    unittest.main()
