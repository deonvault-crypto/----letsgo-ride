import unittest
from unittest.mock import AsyncMock, patch

from app.database import database
from app.services.ops_bounded_read_service import (
    list_ops_audit_logs,
    search_ops_cases,
    search_ops_safety_reports,
    search_ops_support_messages,
)


class _AsyncCursor:
    def __init__(self, rows):
        self._rows = list(rows)
        self._index = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._index >= len(self._rows):
            raise StopAsyncIteration
        row = self._rows[self._index]
        self._index += 1
        return row


class _Collection:
    def __init__(self, rows):
        self.rows = list(rows)
        self.pipeline = None

    def aggregate(self, pipeline):
        self.pipeline = pipeline
        return _AsyncCursor(self.rows)


class _MongoDb:
    def __init__(self, collections):
        self.collections = dict(collections)

    def __getitem__(self, name):
        if name not in self.collections:
            raise AssertionError(f"unexpected raw collection access: {name}")
        return self.collections[name]


class OpsBoundedReadServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_db = database.db
        self.original_support = list(database.memory["support_messages"])
        self.original_reports = list(database.memory["reports"])
        self.original_cases = list(database.memory.get("ops_cases", []))
        self.original_audit = list(database.memory["audit_logs"])
        database.memory.setdefault("ops_cases", [])

    async def asyncTearDown(self):
        database.db = self.original_db
        database.memory["support_messages"] = self.original_support
        database.memory["reports"] = self.original_reports
        database.memory["ops_cases"] = self.original_cases
        database.memory["audit_logs"] = self.original_audit

    async def test_support_memory_preserves_filter_search_order_and_limit(self):
        database.db = None
        database.memory["support_messages"] = [
            {
                "id": "older-open",
                "subject": "Needle older",
                "status": "open",
                "updated_at": "2026-09-15T10:00:00Z",
            },
            {
                "id": "newer-open",
                "message": "contains needle",
                "status": "open",
                "updated_at": "2026-09-15T11:00:00Z",
            },
            {
                "id": "newest-closed",
                "subject": "Needle closed",
                "status": "closed",
                "updated_at": "2026-09-15T12:00:00Z",
            },
        ]

        rows = await search_ops_support_messages("needle", "open", 1)

        self.assertEqual([row["id"] for row in rows], ["newer-open"])

    async def test_support_mongo_search_is_bounded_and_escapes_regex(self):
        support = _Collection([{"id": "target", "status": "open"}])
        database.db = _MongoDb({"support_messages": support})

        with patch.object(database, "find_many", new=AsyncMock()) as find_many:
            rows = await search_ops_support_messages("a+b@example.com", "open", 40)

        self.assertEqual([row["id"] for row in rows], ["target"])
        find_many.assert_not_awaited()
        self.assertEqual(support.pipeline[0], {"$match": {"status": "open"}})
        self.assertEqual(support.pipeline[-3], {"$sort": {"updated_at": -1}})
        self.assertEqual(support.pipeline[-2], {"$limit": 40})
        regex_stage = support.pipeline[2]
        self.assertEqual(
            regex_stage["$match"]["_ops_search_haystack"]["$regex"],
            r"a\+b@example\.com",
        )

    async def test_safety_mongo_search_applies_status_before_limit(self):
        reports = _Collection([{"id": "report-1", "status": "open"}])
        database.db = _MongoDb({"reports": reports})

        with patch.object(database, "find_many", new=AsyncMock()) as find_many:
            rows = await search_ops_safety_reports("unsafe", "open", 20)

        self.assertEqual([row["id"] for row in rows], ["report-1"])
        find_many.assert_not_awaited()
        self.assertEqual(reports.pipeline[0], {"$match": {"status": "open"}})
        self.assertEqual(reports.pipeline[-2], {"$limit": 20})
        self.assertIn("reported_user_id", reports.pipeline[-1]["$project"])

    async def test_cases_memory_applies_exact_filters_before_search_limit(self):
        database.db = None
        database.memory["ops_cases"] = [
            {
                "id": "closed-new",
                "subject": "Needle",
                "status": "closed",
                "priority": "normal",
                "updated_at": "2026-09-15T12:00:00Z",
            },
            {
                "id": "open-new",
                "subject": "Needle",
                "status": "open",
                "priority": "normal",
                "updated_at": "2026-09-15T11:00:00Z",
            },
            {
                "id": "open-old",
                "subject": "Needle",
                "status": "open",
                "priority": "normal",
                "updated_at": "2026-09-15T10:00:00Z",
            },
        ]

        rows = await search_ops_cases("needle", {"status": "open"}, 1)

        self.assertEqual([row["id"] for row in rows], ["open-new"])

    async def test_cases_mongo_uses_exact_filter_and_bounded_aggregation(self):
        cases = _Collection([{"id": "case-1", "status": "open"}])
        database.db = _MongoDb({"ops_cases": cases})
        filters = {"$and": [{"status": "open"}, {"priority": "high"}]}

        with patch.object(database, "find_many", new=AsyncMock()) as find_many:
            rows = await search_ops_cases("payment", filters, 25)

        self.assertEqual([row["id"] for row in rows], ["case-1"])
        find_many.assert_not_awaited()
        self.assertEqual(cases.pipeline[0], {"$match": filters})
        self.assertEqual(cases.pipeline[-2], {"$limit": 25})

    async def test_manager_audit_log_mongo_filters_prefix_before_limit(self):
        audit = _Collection([{"id": "a1", "action": "ops_case_created"}])
        database.db = _MongoDb({"audit_logs": audit})

        with patch.object(database, "find_many", new=AsyncMock()) as find_many:
            rows = await list_ops_audit_logs(is_admin=False, limit=30)

        self.assertEqual([row["id"] for row in rows], ["a1"])
        find_many.assert_not_awaited()
        self.assertEqual(audit.pipeline[0], {"$match": {"action": {"$regex": r"^ops_"}}})
        self.assertEqual(audit.pipeline[1], {"$sort": {"created_at": -1}})
        self.assertEqual(audit.pipeline[2], {"$limit": 30})

    async def test_admin_audit_logs_keep_bounded_find_many_shape(self):
        database.db = object()
        find_many = AsyncMock(return_value=[{"id": "a1"}])

        with patch.object(database, "find_many", new=find_many):
            rows = await list_ops_audit_logs(is_admin=True, limit=40)

        self.assertEqual(rows, [{"id": "a1"}])
        find_many.assert_awaited_once_with(
            "audit_logs",
            sort=[("created_at", -1)],
            limit=40,
        )


if __name__ == "__main__":
    unittest.main()
