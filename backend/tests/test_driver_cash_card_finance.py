from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from app.database import database
from app.services.driver_weekly_settlement_service import (
    FEE_LEDGER_COLLECTION,
    PAYMENT_COLLECTION,
    STATEMENT_COLLECTION,
    _create_or_update_statement,
    apply_settlement_intent,
    enforce_driver_settlement_standing,
    prepare_settlement_payment,
    record_completed_ride_fee,
    settlement_summary,
    weekly_period_for,
)
from app.services.worker_wallet_service import wallet_summary


class DriverWeeklyPostpaidFinanceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in (
            "users",
            "drivers",
            "hailing_trips",
            "app_notifications",
            FEE_LEDGER_COLLECTION,
            STATEMENT_COLLECTION,
            PAYMENT_COLLECTION,
        ):
            database.memory.setdefault(collection, [])
            await database.replace_collection(collection, [])
        self.user = {
            "id": "driver-user",
            "role": "driver",
            "name": "Test Driver",
            "email": "driver@example.com",
        }
        await database.insert_one("users", self.user)
        await database.insert_one(
            "drivers",
            {"id": "driver-1", "user_id": self.user["id"], "verified": True},
        )

    def completed_cash_trip(
        self,
        trip_id: str,
        *,
        fare: float,
        fee: float,
        completed_at: str,
    ):
        return {
            "id": trip_id,
            "driver_id": "driver-1",
            "driver_user_id": self.user["id"],
            "status": "COMPLETED",
            "payment_method": "cash",
            "payment_status": "cash_collected",
            "fare": {
                "total_fare": fare,
                "platform_commission": fee,
                "platform_commission_percent": round((fee / fare) * 100, 2),
            },
            "completed_at": completed_at,
            "created_at": completed_at,
        }

    async def test_completed_cash_trip_accrues_exact_snapshot_fee_once(self):
        trip = self.completed_cash_trip(
            "cash-trip",
            fare=10.00,
            fee=0.60,
            completed_at="2026-08-20T12:00:00+00:00",
        )
        first = await record_completed_ride_fee(trip)
        second = await record_completed_ride_fee(trip)
        self.assertEqual(first["fee_usd"], 0.60)
        self.assertEqual(first["gross_fare_usd"], 10.00)
        self.assertEqual(second["id"], first["id"])
        self.assertEqual(await database.count(FEE_LEDGER_COLLECTION, {}), 1)

    async def test_weekly_statement_is_exact_sum_and_wallet_does_no_manual_math(self):
        trips = [
            self.completed_cash_trip(
                "ride-a",
                fare=10.00,
                fee=0.60,
                completed_at="2026-08-20T12:00:00+00:00",
            ),
            self.completed_cash_trip(
                "ride-b",
                fare=7.50,
                fee=0.45,
                completed_at="2026-08-21T12:00:00+00:00",
            ),
        ]
        for trip in trips:
            await database.insert_one("hailing_trips", trip)
            await record_completed_ride_fee(trip)
        start, end = weekly_period_for(
            datetime(2026, 8, 20, 12, tzinfo=timezone.utc)
        )
        with patch(
            "app.services.driver_weekly_settlement_service._notify_statement",
            new=AsyncMock(),
        ):
            statement = await _create_or_update_statement(
                self.user["id"], start, end
            )
        self.assertIsNotNone(statement)
        self.assertEqual(statement["ride_count"], 2)
        self.assertEqual(statement["gross_fares_usd"], 17.50)
        self.assertEqual(statement["amount_due_usd"], 1.05)

        wallet = await wallet_summary(self.user)
        self.assertEqual(wallet["cash_collected_usd"], 17.50)
        self.assertEqual(wallet["platform_commission_usd"], 1.05)
        self.assertEqual(wallet["amount_due_to_platform_usd"], 1.05)
        self.assertEqual(wallet["platform_fee_policy"], "weekly_postpaid")
        self.assertTrue(wallet["driver_settlement"]["can_settle"])

    async def test_only_overdue_statement_blocks_new_ride_now_work(self):
        trip = self.completed_cash_trip(
            "old-ride",
            fare=20.00,
            fee=1.20,
            completed_at="2026-08-10T12:00:00+00:00",
        )
        await record_completed_ride_fee(trip)
        start, end = weekly_period_for(
            datetime(2026, 8, 10, 12, tzinfo=timezone.utc)
        )
        with patch(
            "app.services.driver_weekly_settlement_service._notify_statement",
            new=AsyncMock(),
        ):
            await _create_or_update_statement(self.user["id"], start, end)
            with self.assertRaises(PermissionError):
                await enforce_driver_settlement_standing(self.user)

    async def test_successful_stripe_settlement_clears_exact_statement(self):
        trip = self.completed_cash_trip(
            "settle-ride",
            fare=25.00,
            fee=1.50,
            completed_at="2026-08-10T12:00:00+00:00",
        )
        await record_completed_ride_fee(trip)
        start, end = weekly_period_for(
            datetime(2026, 8, 10, 12, tzinfo=timezone.utc)
        )
        with patch(
            "app.services.driver_weekly_settlement_service._notify_statement",
            new=AsyncMock(),
        ):
            statement = await _create_or_update_statement(
                self.user["id"], start, end
            )
        payment = await prepare_settlement_payment(self.user)
        self.assertEqual(payment["amount_usd"], 1.50)
        self.assertEqual(payment["statement_ids"], [statement["id"]])

        intent = {
            "id": "pi_weekly_test",
            "amount": 150,
            "currency": "usd",
            "status": "succeeded",
            "metadata": {
                "product": "driver_weekly_settlement",
                "settlement_payment_id": payment["id"],
                "user_id": self.user["id"],
            },
        }
        result = await apply_settlement_intent(
            intent,
            event_id="evt_weekly_test",
            event_type="payment_intent.succeeded",
        )
        self.assertEqual(result["payment"]["status"], "paid")
        paid_statement = await database.find_one(
            STATEMENT_COLLECTION, {"id": statement["id"]}
        )
        self.assertEqual(paid_statement["status"], "paid")
        summary = await settlement_summary(self.user)
        self.assertEqual(summary["amount_due_usd"], 0.0)
        self.assertFalse(summary["can_settle"])
        self.assertFalse(summary["ride_now_blocked"])


if __name__ == "__main__":
    unittest.main()
