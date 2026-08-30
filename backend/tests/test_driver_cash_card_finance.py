from __future__ import annotations

import unittest

from app.database import database
from app.services.worker_wallet_service import _trip_finance, wallet_summary


class DriverCashCardFinanceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.memory.setdefault("worker_payout_methods", [])
        database.memory.setdefault("worker_payouts", [])
        for collection in ("drivers", "hailing_trips", "worker_payout_methods", "worker_payouts"):
            await database.replace_collection(collection, [])
        self.user = {"id": "driver-user", "role": "driver"}
        await database.insert_one(
            "drivers",
            {"id": "driver-1", "user_id": self.user["id"], "verified": True},
        )

    def test_cash_trip_never_creates_platform_commission(self):
        finance = _trip_finance(
            {
                "payment_method": "cash",
                "payment_status": "cash_collected",
                "fare": {"total_fare": 7.50, "platform_commission": 0.23},
            }
        )
        self.assertEqual(finance["gross"], 7.50)
        self.assertEqual(finance["commission"], 0.0)
        self.assertEqual(finance["worker_earnings"], 7.50)
        self.assertEqual(finance["settlement_state"], "cash_kept_by_driver")

    async def test_wallet_keeps_all_cash_and_only_charges_settled_card(self):
        await database.insert_one(
            "hailing_trips",
            {
                "id": "cash-trip",
                "driver_user_id": self.user["id"],
                "status": "COMPLETED",
                "payment_method": "cash",
                "payment_status": "cash_collected",
                "fare": {"total_fare": 10.00, "platform_commission": 0.30},
                "created_at": "2026-08-30T10:00:00+00:00",
            },
        )
        await database.insert_one(
            "hailing_trips",
            {
                "id": "card-paid",
                "driver_user_id": self.user["id"],
                "status": "COMPLETED",
                "payment_method": "card",
                "payment_status": "paid",
                "fare": {"total_fare": 10.00, "platform_commission": 0.30},
                "created_at": "2026-08-30T11:00:00+00:00",
            },
        )
        await database.insert_one(
            "hailing_trips",
            {
                "id": "card-pending",
                "driver_user_id": self.user["id"],
                "status": "COMPLETED",
                "payment_method": "card",
                "payment_status": "capture_pending",
                "fare": {"total_fare": 10.00, "platform_commission": 0.30},
                "created_at": "2026-08-30T12:00:00+00:00",
            },
        )

        wallet = await wallet_summary(self.user)

        self.assertEqual(wallet["cash_collected_usd"], 10.00)
        self.assertEqual(wallet["digital_earnings_usd"], 9.70)
        self.assertEqual(wallet["platform_commission_usd"], 0.30)
        self.assertEqual(wallet["amount_due_to_platform_usd"], 0.0)
        self.assertEqual(wallet["available_balance_usd"], 9.70)
        self.assertEqual(wallet["net_earnings_usd"], 19.70)
        self.assertEqual(wallet["cash_policy"], "driver_keeps_100_percent")
        self.assertEqual(wallet["platform_fee_policy"], "card_only")

        cash_entry = next(entry for entry in wallet["ledger"] if entry["source_id"] == "cash-trip")
        pending_entry = next(entry for entry in wallet["ledger"] if entry["source_id"] == "card-pending")
        self.assertEqual(cash_entry["platform_commission_usd"], 0.0)
        self.assertEqual(cash_entry["worker_earnings_usd"], 10.00)
        self.assertEqual(pending_entry["settlement_state"], "payment_pending")


if __name__ == "__main__":
    unittest.main()
