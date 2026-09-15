import unittest
from unittest.mock import AsyncMock, patch

from app.services.worker_finance_service import (
    create_payout_method,
    delete_payout_method,
    list_payout_methods,
)


class WorkerFinanceQueryShapeTests(unittest.IsolatedAsyncioTestCase):
    async def test_list_payout_methods_sorts_in_database(self):
        rows = [
            {"id": "default", "is_default": True, "created_at": "2026-09-01T00:00:00+00:00"},
            {"id": "other", "is_default": False, "created_at": "2026-09-02T00:00:00+00:00"},
        ]
        find_many = AsyncMock(return_value=rows)
        with (
            patch("app.services.worker_finance_service.database.find_many", find_many),
            patch("app.services.worker_finance_service._public_method", side_effect=lambda row: row),
        ):
            result = await list_payout_methods({"id": "courier-1", "role": "courier"})

        find_many.assert_awaited_once_with(
            "worker_payout_methods",
            {"user_id": "courier-1", "worker_role": "courier", "status": "active"},
            sort=[("is_default", -1), ("created_at", 1)],
        )
        self.assertEqual(result, rows)

    async def test_create_checks_only_for_one_existing_method(self):
        find_one = AsyncMock(return_value={"id": "existing"})
        update_many = AsyncMock()
        insert_one = AsyncMock(side_effect=lambda _collection, row: row)
        payload = {
            "method_type": "ECOCASH",
            "account_holder_name": "Courier One",
            "mobile_number": "+263700000001",
            "currency": "USD",
            "make_default": False,
        }
        with (
            patch("app.services.worker_finance_service.database.find_one", find_one),
            patch("app.services.worker_finance_service.database.update_many", update_many),
            patch("app.services.worker_finance_service.database.insert_one", insert_one),
            patch("app.services.worker_finance_service._encrypt_payload", return_value="encrypted"),
            patch("app.services.worker_finance_service._masked_reference", return_value="•••• 0001"),
            patch("app.services.worker_finance_service._public_method", side_effect=lambda row: row),
            patch("app.services.worker_finance_service.new_id", return_value="method-new"),
            patch("app.services.worker_finance_service.now_iso", return_value="2026-09-15T18:00:00+00:00"),
        ):
            created = await create_payout_method(payload, {"id": "courier-1", "role": "courier"})

        find_one.assert_awaited_once_with(
            "worker_payout_methods",
            {"user_id": "courier-1", "worker_role": "courier", "status": "active"},
        )
        update_many.assert_not_awaited()
        self.assertFalse(created["is_default"])

    async def test_delete_default_fetches_only_oldest_replacement(self):
        find_one = AsyncMock(return_value={"id": "method-1", "is_default": True})
        find_many = AsyncMock(return_value=[{"id": "method-2"}])
        update_one = AsyncMock(return_value={"id": "method-1"})
        with (
            patch("app.services.worker_finance_service.database.find_one", find_one),
            patch("app.services.worker_finance_service.database.find_many", find_many),
            patch("app.services.worker_finance_service.database.update_one", update_one),
            patch("app.services.worker_finance_service.now_iso", return_value="2026-09-15T18:00:00+00:00"),
        ):
            result = await delete_payout_method("method-1", {"id": "courier-1", "role": "courier"})

        find_many.assert_awaited_once_with(
            "worker_payout_methods",
            {"user_id": "courier-1", "worker_role": "courier", "status": "active"},
            sort=[("created_at", 1)],
            limit=1,
        )
        self.assertEqual(update_one.await_args_list[-1].args[1], "method-2")
        self.assertEqual(result, {"deleted": True, "id": "method-1"})


if __name__ == "__main__":
    unittest.main()
