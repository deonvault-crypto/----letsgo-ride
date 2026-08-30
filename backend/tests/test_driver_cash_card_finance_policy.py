import unittest

from app.database import database
from app.services.worker_finance_service import _driver_trip_financials, _driver_wallet


class DriverCashCardFinancePolicyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        await database.replace_collection("drivers", [{"id": "driver-1", "user_id": "user-1"}])
        await database.replace_collection("hailing_trips", [])
        await database.replace_collection("worker_payouts", [])
        self.user = {"id": "user-1", "role": "driver"}

    def test_cash_ignores_quoted_commission_and_belongs_to_driver_in_full(self):
        settlement = _driver_trip_financials(
            {
                "id": "cash-trip",
                "payment_method": "cash",
                "fare": {"total_fare": 12.50, "platform_commission": 2.50},
            }
        )

        self.assertEqual(settlement["payment_method"], "cash")
        self.assertEqual(settlement["gross_usd"], 12.50)
        self.assertEqual(settlement["platform_commission_usd"], 0.0)
        self.assertEqual(settlement["worker_earnings_usd"], 12.50)
        self.assertEqual(settlement["cash_collected_usd"], 12.50)
        self.assertEqual(settlement["digital_earnings_usd"], 0.0)
        self.assertEqual(settlement["settlement_state"], "cash_collected_by_driver")

    def test_card_keeps_configured_commission_and_accrues_net_earnings(self):
        settlement = _driver_trip_financials(
            {
                "id": "card-trip",
                "payment_method": "card",
                "fare": {"total_fare": 20.00, "platform_commission": 4.00},
            }
        )

        self.assertEqual(settlement["platform_commission_usd"], 4.00)
        self.assertEqual(settlement["worker_earnings_usd"], 16.00)
        self.assertEqual(settlement["cash_collected_usd"], 0.0)
        self.assertEqual(settlement["digital_earnings_usd"], 16.00)
        self.assertEqual(settlement["settlement_state"], "accrued")

    async def test_wallet_never_creates_driver_debt_from_cash_and_only_card_fees_count(self):
        await database.replace_collection(
            "hailing_trips",
            [
                {
                    "id": "cash-trip",
                    "driver_user_id": "user-1",
                    "status": "COMPLETED",
                    "payment_method": "cash",
                    "fare": {"total_fare": 10.00, "platform_commission": 2.00},
                    "dropoff": {"formatted_address": "Cash destination"},
                    "completed_at": "2026-08-30T10:00:00+00:00",
                },
                {
                    "id": "card-trip",
                    "driver_user_id": "user-1",
                    "status": "COMPLETED",
                    "payment_method": "card",
                    "fare": {"total_fare": 20.00, "platform_commission": 4.00},
                    "dropoff": {"formatted_address": "Card destination"},
                    "completed_at": "2026-08-30T11:00:00+00:00",
                },
                {
                    "id": "cancelled-trip",
                    "driver_user_id": "user-1",
                    "status": "CANCELLED",
                    "payment_method": "card",
                    "fare": {"total_fare": 99.00, "platform_commission": 99.00},
                },
            ],
        )
        await database.replace_collection(
            "worker_payouts",
            [
                {
                    "id": "payout-1",
                    "user_id": "user-1",
                    "worker_role": "driver",
                    "status": "paid",
                    "amount_usd": 5.00,
                    "created_at": "2026-08-30T12:00:00+00:00",
                }
            ],
        )

        wallet = await _driver_wallet(self.user)

        self.assertEqual(wallet["gross_earnings_usd"], 30.00)
        self.assertEqual(wallet["net_earnings_usd"], 26.00)
        self.assertEqual(wallet["cash_collected_usd"], 10.00)
        self.assertEqual(wallet["digital_earnings_usd"], 16.00)
        self.assertEqual(wallet["platform_commission_usd"], 4.00)
        self.assertEqual(wallet["amount_due_to_platform_usd"], 0.0)
        self.assertEqual(wallet["paid_out_usd"], 5.00)
        self.assertEqual(wallet["available_balance_usd"], 11.00)

        entries = {entry["source_id"]: entry for entry in wallet["ledger"]}
        self.assertEqual(entries["cash-trip"]["platform_commission_usd"], 0.0)
        self.assertEqual(entries["cash-trip"]["worker_earnings_usd"], 10.00)
        self.assertEqual(entries["card-trip"]["platform_commission_usd"], 4.00)
        self.assertEqual(entries["card-trip"]["worker_earnings_usd"], 16.00)
        self.assertNotIn("cancelled-trip", entries)


if __name__ == "__main__":
    unittest.main()
