import unittest
from unittest.mock import AsyncMock, patch

from app.database import database
from app.services.courier_wallet_service import (
    COURIER_LEDGER_LIMIT,
    COURIER_PAYOUT_HISTORY_LIMIT,
    _recent_deliveries,
)
from app.services.worker_wallet_service import wallet_summary


class CourierWalletServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in ("courier_deliveries", "worker_payouts", "worker_payout_methods"):
            database.memory.setdefault(collection, [])
            await database.replace_collection(collection, [])

    async def test_memory_wallet_preserves_totals_and_bounds_histories(self):
        user = {"id": "courier-1", "role": "courier"}
        for index in range(125):
            await database.insert_one(
                "courier_deliveries",
                {
                    "id": f"delivery-{index:03d}",
                    "courier_user_id": "courier-1",
                    "status": "DELIVERED",
                    "courier_payout_usd": 2.0,
                    "price_usd": 3.0,
                    "dropoff_address": f"Drop {index}",
                    "delivered_at": f"2026-09-{(index % 28) + 1:02d}T{index % 24:02d}:00:00+00:00",
                },
            )
        for index in range(60):
            await database.insert_one(
                "worker_payouts",
                {
                    "id": f"payout-{index:03d}",
                    "user_id": "courier-1",
                    "worker_role": "courier",
                    "status": "paid",
                    "amount_usd": 1.0,
                    "created_at": f"2026-09-{(index % 28) + 1:02d}T{index % 24:02d}:00:00+00:00",
                },
            )

        summary = await wallet_summary(user)

        self.assertEqual(summary["worker_role"], "courier")
        self.assertEqual(summary["gross_earnings_usd"], 250.0)
        self.assertEqual(summary["paid_out_usd"], 60.0)
        self.assertEqual(summary["available_balance_usd"], 190.0)
        self.assertEqual(len(summary["ledger"]), COURIER_LEDGER_LIMIT)
        self.assertEqual(len(summary["payout_history"]), COURIER_PAYOUT_HISTORY_LIMIT)
        self.assertEqual(summary["payout_methods"], [])
        self.assertFalse(summary["settlement_integrated"])

    async def test_production_recent_delivery_reads_are_bounded_with_legacy_fallback(self):
        database.db = object()
        current = [
            {"id": "current", "delivered_at": "2026-09-15T12:00:00+00:00"},
        ]
        legacy = [
            {"id": "legacy", "updated_at": "2026-09-14T12:00:00+00:00"},
        ]
        find_many = AsyncMock(side_effect=[current, legacy])

        with patch("app.services.courier_wallet_service.database.find_many", find_many):
            rows = await _recent_deliveries("courier-1")

        self.assertEqual([row["id"] for row in rows], ["current", "legacy"])
        self.assertEqual(find_many.await_count, 2)
        first = find_many.await_args_list[0]
        second = find_many.await_args_list[1]
        self.assertEqual(first.kwargs["sort"], [("delivered_at", -1)])
        self.assertEqual(first.kwargs["limit"], COURIER_LEDGER_LIMIT)
        self.assertEqual(first.args[1]["delivered_at"], {"$exists": True})
        self.assertEqual(second.kwargs["sort"], [("updated_at", -1)])
        self.assertEqual(second.kwargs["limit"], COURIER_LEDGER_LIMIT)
        self.assertEqual(second.args[1]["delivered_at"], {"$exists": False})

    async def test_wallet_facade_routes_courier_directly_to_courier_service(self):
        expected = {"worker_role": "courier", "currency": "USD"}
        with patch(
            "app.services.worker_wallet_service.courier_wallet_summary",
            AsyncMock(return_value=expected),
        ) as courier_summary:
            result = await wallet_summary({"id": "courier-1", "role": "courier"})

        courier_summary.assert_awaited_once_with({"id": "courier-1", "role": "courier"})
        self.assertIs(result, expected)

    async def test_wallet_facade_rejects_non_worker_roles(self):
        with self.assertRaises(PermissionError):
            await wallet_summary({"id": "passenger-1", "role": "passenger"})


if __name__ == "__main__":
    unittest.main()
