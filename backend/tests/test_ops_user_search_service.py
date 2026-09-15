import unittest
from unittest.mock import AsyncMock, patch

from app.database import database
from app.services.ops_user_search_service import search_ops_users


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
    def __init__(self, rows):
        self.rows = rows
        self.pipeline = None

    def aggregate(self, pipeline):
        self.pipeline = pipeline
        return _AsyncCursor(self.rows)


class _MongoDb:
    def __init__(self, users_collection):
        self.users_collection = users_collection

    def __getitem__(self, name):
        if name != "users":
            raise AssertionError(f"unexpected raw collection access: {name}")
        return self.users_collection


class OpsUserSearchServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_db = database.db
        self.original_users = list(database.memory["users"])
        self.original_ops_staff = list(database.memory.get("ops_staff", []))
        database.memory.setdefault("ops_staff", [])

    async def asyncTearDown(self):
        database.db = self.original_db
        database.memory["users"] = self.original_users
        database.memory["ops_staff"] = self.original_ops_staff

    async def test_memory_mode_preserves_role_search_order_and_operations_role(self):
        database.db = None
        database.memory["users"] = [
            {
                "id": "u-old",
                "name": "Needle Older",
                "email": "older@example.com",
                "phone": "+263771000001",
                "city": "Harare",
                "role": "driver",
                "status": "active",
                "updated_at": "2026-09-14T10:00:00Z",
                "password_hash": "hidden",
            },
            {
                "id": "u-new",
                "name": "Needle Newer",
                "email": "newer@example.com",
                "phone": "+263771000002",
                "city": "Harare",
                "role": "driver",
                "status": "active",
                "updated_at": "2026-09-15T10:00:00Z",
                "ops_role": "should-not-leak",
                "ops_enabled": True,
            },
            {
                "id": "u-passenger",
                "name": "Needle Passenger",
                "email": "passenger@example.com",
                "role": "passenger",
                "status": "active",
                "updated_at": "2026-09-15T11:00:00Z",
            },
        ]
        database.memory["ops_staff"] = [
            {
                "id": "staff-new",
                "user_id": "u-new",
                "role": "cs",
                "enabled": True,
            },
        ]

        result = await search_ops_users("needle", "driver", 1)

        self.assertEqual(result["count"], 1)
        self.assertEqual(result["items"][0]["id"], "u-new")
        self.assertEqual(result["items"][0]["operations_role"], "cs")
        self.assertNotIn("ops_role", result["items"][0])
        self.assertNotIn("ops_enabled", result["items"][0])
        self.assertNotIn("password_hash", result["items"][0])

    async def test_memory_mode_admin_role_overrides_staff_enrichment(self):
        database.db = None
        database.memory["users"] = [
            {
                "id": "admin-1",
                "name": "Needle Admin",
                "email": "admin@example.com",
                "role": "admin",
                "status": "active",
                "updated_at": "2026-09-15T10:00:00Z",
            },
        ]
        database.memory["ops_staff"] = [
            {
                "id": "staff-admin",
                "user_id": "admin-1",
                "role": "cs",
                "enabled": True,
            },
        ]

        result = await search_ops_users("needle", None, 10)

        self.assertEqual(result["items"][0]["operations_role"], "admin")

    async def test_mongo_search_uses_bounded_aggregation_and_only_batches_matching_staff(self):
        users = _UsersCollection(
            [
                {
                    "_id": "mongo-id",
                    "id": "u-target",
                    "name": "Target User",
                    "email": "target@example.com",
                    "phone": "+263771234567",
                    "city": "Harare",
                    "role": "driver",
                    "status": "active",
                    "updated_at": "2026-09-15T10:00:00Z",
                }
            ]
        )
        database.db = _MongoDb(users)
        find_many = AsyncMock(
            return_value=[
                {
                    "id": "staff-target",
                    "user_id": "u-target",
                    "role": "manager",
                    "enabled": True,
                }
            ]
        )

        with patch.object(database, "find_many", new=find_many):
            result = await search_ops_users("Target +263", "driver", 40)

        self.assertEqual(result["count"], 1)
        self.assertEqual(result["items"][0]["id"], "u-target")
        self.assertEqual(result["items"][0]["operations_role"], "manager")
        self.assertNotIn("_id", result["items"][0])

        self.assertIsNotNone(users.pipeline)
        self.assertEqual(users.pipeline[0], {"$match": {"role": "driver"}})
        self.assertEqual(users.pipeline[-3], {"$sort": {"updated_at": -1}})
        self.assertEqual(users.pipeline[-2], {"$limit": 40})
        self.assertEqual(users.pipeline[-1], {"$unset": "_ops_user_haystack"})

        self.assertEqual(find_many.await_count, 1)
        args, kwargs = find_many.await_args
        self.assertEqual(args[0], "ops_staff")
        self.assertEqual(args[1]["user_id"], {"$in": ["u-target"]})
        self.assertEqual(kwargs["limit"], 200)

    async def test_mongo_search_escapes_regex_metacharacters(self):
        users = _UsersCollection([])
        database.db = _MongoDb(users)

        with patch.object(database, "find_many", new=AsyncMock(return_value=[])):
            result = await search_ops_users("a+b@example.com", None, 25)

        self.assertEqual(result, {"count": 0, "items": []})
        regex_match = users.pipeline[1]["$match"]["_ops_user_haystack"]["$regex"]
        self.assertEqual(regex_match, r"a\+b@example\.com")


if __name__ == "__main__":
    unittest.main()
