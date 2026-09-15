import unittest
from unittest.mock import AsyncMock, patch

from app.database import database
from app.services.ops_support_message_search_service import search_ops_support_messages


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


class _SupportCollection:
    def __init__(self, rows):
        self.rows = list(rows)
        self.pipeline = None

    def aggregate(self, pipeline):
        self.pipeline = pipeline
        return _AsyncCursor(self.rows)


class _MongoDb:
    def __init__(self, support_collection):
        self.support_collection = support_collection

    def __getitem__(self, name):
        if name != "support_messages":
            raise AssertionError(f"unexpected raw collection access: {name}")
        return self.support_collection


class OpsSupportMessageSearchServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_db = database.db
        self.original_rows = list(database.memory["support_messages"])

    async def asyncTearDown(self):
        database.db = self.original_db
        database.memory["support_messages"] = self.original_rows

    async def test_memory_mode_preserves_status_search_order_and_limit(self):
        database.db = None
        database.memory["support_messages"] = [
            {
                "id": "older-match",
                "subject": "Payment issue",
                "message": "Needle appears here",
                "user_name": "Older User",
                "status": "open",
                "updated_at": "2026-09-14T10:00:00Z",
            },
            {
                "id": "newer-match",
                "subject": "Needle question",
                "message": "More details",
                "user_name": "Newer User",
                "status": "open",
                "updated_at": "2026-09-15T10:00:00Z",
            },
            {
                "id": "newest-wrong-status",
                "subject": "Needle closed",
                "message": "Should be filtered first",
                "user_name": "Closed User",
                "status": "closed",
                "updated_at": "2026-09-15T11:00:00Z",
            },
        ]

        rows = await search_ops_support_messages("needle", "open", 1)

        self.assertEqual([row["id"] for row in rows], ["newer-match"])

    async def test_memory_mode_searches_all_current_fields(self):
        database.db = None
        field_values = {
            "subject": "subject-needle",
            "message": "message-needle",
            "user_name": "name-needle",
            "user_email": "email-needle@example.com",
            "user_phone": "+263-needle",
            "status": "status-needle",
        }
        database.memory["support_messages"] = [
            {"id": field, field: value, "updated_at": f"2026-09-15T10:0{index}:00Z"}
            for index, (field, value) in enumerate(field_values.items())
        ]

        for field, value in field_values.items():
            rows = await search_ops_support_messages(value, None, 20)
            self.assertEqual([row["id"] for row in rows], [field])

    async def test_mongo_search_uses_one_bounded_aggregation_not_find_many(self):
        support = _SupportCollection(
            [
                {
                    "id": "target",
                    "subject": "Target issue",
                    "message": "Target details",
                    "status": "open",
                    "updated_at": "2026-09-15T10:00:00Z",
                }
            ]
        )
        database.db = _MongoDb(support)

        with patch.object(database, "find_many", new=AsyncMock()) as find_many:
            rows = await search_ops_support_messages("Target +263", "open", 40)

        self.assertEqual([row["id"] for row in rows], ["target"])
        find_many.assert_not_awaited()
        self.assertIsNotNone(support.pipeline)
        self.assertEqual(support.pipeline[0], {"$match": {"status": "open"}})
        self.assertEqual(support.pipeline[-3], {"$sort": {"updated_at": -1}})
        self.assertEqual(support.pipeline[-2], {"$limit": 40})
        self.assertIn("$project", support.pipeline[-1])

    async def test_mongo_search_escapes_regex_metacharacters(self):
        support = _SupportCollection([])
        database.db = _MongoDb(support)

        with patch.object(database, "find_many", new=AsyncMock()):
            rows = await search_ops_support_messages("a+b@example.com", None, 25)

        self.assertEqual(rows, [])
        regex_match = support.pipeline[1]["$match"]["_ops_support_haystack"]["$regex"]
        self.assertEqual(regex_match, r"a\+b@example\.com")

    async def test_mongo_without_search_keeps_existing_bounded_find_many_shape(self):
        database.db = object()
        find_many = AsyncMock(return_value=[{"id": "recent"}])

        with patch.object(database, "find_many", new=find_many):
            rows = await search_ops_support_messages(None, "open", 30)

        self.assertEqual(rows, [{"id": "recent"}])
        find_many.assert_awaited_once_with(
            "support_messages",
            {"status": "open"},
            sort=[("updated_at", -1)],
            limit=30,
        )


if __name__ == "__main__":
    unittest.main()
