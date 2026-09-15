import unittest
from unittest.mock import AsyncMock, patch

from app.database import database
from app.services.support_recipient_service import search_support_recipients


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


class _UsersCollection:
    def __init__(self, payload):
        self.payload = payload
        self.pipeline = None

    def aggregate(self, pipeline):
        self.pipeline = pipeline
        return _AsyncCursor([self.payload])


class _MongoDb:
    def __init__(self, users_collection):
        self.users_collection = users_collection

    def __getitem__(self, name):
        if name != "users":
            raise AssertionError(f"unexpected collection: {name}")
        return self.users_collection


class SupportRecipientServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_db = database.db
        self.original_users = list(database.memory["users"])

    async def asyncTearDown(self):
        database.db = self.original_db
        database.memory["users"] = self.original_users

    async def test_memory_mode_preserves_search_count_and_recency_semantics(self):
        database.db = None
        database.memory["users"] = [
            {
                "id": "u1",
                "name": "Alice Example",
                "email": "alice@example.com",
                "phone": "+263771000001",
                "city": "Harare",
                "role": "passenger",
                "status": "active",
                "created_at": "2026-09-10T10:00:00Z",
            },
            {
                "id": "u2",
                "name": "Alice Driver",
                "email": "driver@example.com",
                "phone": "+263771000002",
                "city": "Harare",
                "role": "driver",
                "status": "active",
                "updated_at": "2026-09-12T10:00:00Z",
            },
            {
                "id": "u3",
                "name": "Alice Deleted",
                "email": "deleted@example.com",
                "status": "deleted",
                "updated_at": "2026-09-13T10:00:00Z",
            },
        ]

        result = await search_support_recipients("alice", 1)

        self.assertEqual(result["count"], 2)
        self.assertEqual([row["id"] for row in result["items"]], ["u2"])

    async def test_mongo_mode_uses_one_bounded_aggregation_instead_of_full_user_scan(self):
        users = _UsersCollection(
            {
                "metadata": [{"count": 7}],
                "items": [{"id": "u7", "name": "Target User", "status": "active"}],
            }
        )
        database.db = _MongoDb(users)

        with patch.object(database, "find_many", new=AsyncMock()) as find_many:
            result = await search_support_recipients("Target +263", 40)

        self.assertEqual(result["count"], 7)
        self.assertEqual(result["items"][0]["id"], "u7")
        find_many.assert_not_awaited()

        self.assertIsNotNone(users.pipeline)
        self.assertEqual(users.pipeline[0], {"$match": {"status": {"$ne": "deleted"}}})
        facet = users.pipeline[-1]["$facet"]
        self.assertEqual(facet["items"][1], {"$limit": 40})
        self.assertEqual(facet["items"][0], {"$sort": {"_support_recency": -1}})


if __name__ == "__main__":
    unittest.main()
