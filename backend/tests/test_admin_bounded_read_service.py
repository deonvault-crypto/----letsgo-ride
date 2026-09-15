import unittest
from unittest.mock import AsyncMock, patch

from app.database import database
from app.services.admin_bounded_read_service import (
    list_admin_audit_logs,
    list_admin_reports,
    list_admin_support_messages,
)


class _AsyncCursor:
    def __init__(self, rows):
        self.rows = list(rows)
        self.index = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.index >= len(self.rows):
            raise StopAsyncIteration
        row = self.rows[self.index]
        self.index += 1
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


class AdminBoundedReadServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_db = database.db
        self.original_support = list(database.memory["support_messages"])
        self.original_reports = list(database.memory["reports"])
        self.original_audit = list(database.memory["audit_logs"])

    async def asyncTearDown(self):
        database.db = self.original_db
        database.memory["support_messages"] = self.original_support
        database.memory["reports"] = self.original_reports
        database.memory["audit_logs"] = self.original_audit

    async def test_support_memory_preserves_any_field_search_and_recent_order(self):
        database.db = None
        database.memory["support_messages"] = [
            {"id": "old", "subject": "Needle", "status": "open", "created_at": "2026-09-14T10:00:00Z"},
            {"id": "new", "user_email": "needle@example.com", "status": "open", "created_at": "2026-09-15T10:00:00Z"},
            {"id": "closed", "subject": "Needle", "status": "closed", "created_at": "2026-09-16T10:00:00Z"},
        ]

        rows = await list_admin_support_messages(search="needle", status="open", limit=1)

        self.assertEqual([row["id"] for row in rows], ["new"])

    async def test_support_mongo_filters_searches_sorts_and_limits_before_return(self):
        support = _Collection([{"id": "s1"}])
        database.db = _MongoDb({"support_messages": support})

        with patch.object(database, "find_many", new=AsyncMock()) as find_many:
            rows = await list_admin_support_messages(
                search="a+b@example.com",
                status="open",
                limit=40,
            )

        self.assertEqual(rows, [{"id": "s1"}])
        find_many.assert_not_awaited()
        match = support.pipeline[0]["$match"]
        self.assertEqual(match["$and"][0], {"status": "open"})
        for clause in match["$and"][1]["$expr"]["$or"]:
            self.assertEqual(clause["$regexMatch"]["regex"], r"a\+b@example\.com")
            self.assertEqual(clause["$regexMatch"]["options"], "i")
        self.assertEqual(support.pipeline[-2], {"$limit": 40})
        self.assertEqual(support.pipeline[-1], {"$unset": "_admin_recent_at"})

    async def test_report_mongo_uses_existing_search_fields_only(self):
        reports = _Collection([{"id": "r1"}])
        database.db = _MongoDb({"reports": reports})

        rows = await list_admin_reports(search="unsafe", status="open", limit=25)

        self.assertEqual(rows, [{"id": "r1"}])
        search_or = reports.pipeline[0]["$match"]["$and"][1]["$expr"]["$or"]
        self.assertEqual(len(search_or), 6)
        self.assertEqual(reports.pipeline[-2], {"$limit": 25})

    async def test_audit_mongo_pushes_exact_filters_and_limit_to_database(self):
        audit = _Collection([{"id": "a1", "action": "ops_case_created"}])
        database.db = _MongoDb({"audit_logs": audit})

        rows = await list_admin_audit_logs(
            action="ops_case_created",
            target_type="ops_case",
            limit=30,
        )

        self.assertEqual(rows, [{"id": "a1", "action": "ops_case_created"}])
        self.assertEqual(
            audit.pipeline[0],
            {"$match": {"action": "ops_case_created", "target_type": "ops_case"}},
        )
        self.assertEqual(audit.pipeline[-2], {"$limit": 30})

    async def test_memory_audit_keeps_recent_fallback_sort(self):
        database.db = None
        database.memory["audit_logs"] = [
            {"id": "updated-only", "action": "x", "updated_at": "2026-09-15T12:00:00Z"},
            {"id": "created", "action": "x", "created_at": "2026-09-15T13:00:00Z"},
        ]

        rows = await list_admin_audit_logs(action="x", target_type=None, limit=1)

        self.assertEqual([row["id"] for row in rows], ["created"])


if __name__ == "__main__":
    unittest.main()
