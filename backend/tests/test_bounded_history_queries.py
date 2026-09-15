import unittest
from unittest.mock import AsyncMock, patch

from app.routers.reports import my_reports
from app.routers.support import my_messages


class BoundedHistoryQueryTests(unittest.IsolatedAsyncioTestCase):
    async def test_current_support_history_request_is_sorted_and_bounded(self):
        find_many = AsyncMock(return_value=[])
        with patch("app.routers.support.database.find_many", find_many):
            await my_messages(limit=100, user={"id": "user-1", "role": "passenger"})

        find_many.assert_awaited_once_with(
            "support_messages",
            {"user_id": "user-1"},
            sort=[("updated_at", -1)],
            limit=100,
        )

    async def test_legacy_support_history_request_keeps_unbounded_contract(self):
        find_many = AsyncMock(return_value=[])
        with patch("app.routers.support.database.find_many", find_many):
            await my_messages(limit=None, user={"id": "user-1", "role": "passenger"})

        find_many.assert_awaited_once_with("support_messages", {"user_id": "user-1"})

    async def test_current_report_history_request_is_sorted_and_bounded(self):
        find_many = AsyncMock(return_value=[])
        with patch("app.routers.reports.database.find_many", find_many):
            await my_reports(limit=100, user={"id": "user-1", "role": "passenger"})

        find_many.assert_awaited_once_with(
            "reports",
            {"user_id": "user-1"},
            sort=[("created_at", -1)],
            limit=100,
        )

    async def test_legacy_admin_report_history_request_keeps_unbounded_contract(self):
        find_many = AsyncMock(return_value=[])
        with patch("app.routers.reports.database.find_many", find_many):
            await my_reports(limit=None, user={"id": "admin-1", "role": "admin"})

        find_many.assert_awaited_once_with("reports", None)


if __name__ == "__main__":
    unittest.main()
