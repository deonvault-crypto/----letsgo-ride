import unittest
from unittest.mock import AsyncMock, patch

from app.database import database
from app.services.admin_user_list_service import list_admin_users


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
    def __init__(self, batches):
        self.batches = list(batches)
        self.pipelines = []

    def aggregate(self, pipeline):
        self.pipelines.append(pipeline)
        rows = self.batches.pop(0) if self.batches else []
        return _AsyncCursor(rows)


class _MongoDb:
    def __init__(self, users):
        self.users = users

    def __getitem__(self, name):
        if name != "users":
            raise AssertionError(f"unexpected raw collection access: {name}")
        return self.users


class AdminUserListServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_db = database.db
        self.original_users = list(database.memory["users"])

    async def asyncTearDown(self):
        database.db = self.original_db
        database.memory["users"] = self.original_users

    async def test_memory_mode_preserves_search_filters_verification_and_recent_order(self):
        database.db = None
        database.memory["users"] = [
            {
                "id": "old-driver",
                "name": "Needle Old",
                "role": "driver",
                "status": "active",
                "created_at": "2026-09-14T10:00:00Z",
            },
            {
                "id": "new-driver",
                "name": "Needle New",
                "role": "driver",
                "status": "active",
                "created_at": "2026-09-15T10:00:00Z",
            },
            {
                "id": "passenger",
                "name": "Needle Passenger",
                "role": "passenger",
                "status": "active",
                "created_at": "2026-09-16T10:00:00Z",
            },
        ]

        async def enrich(users):
            return [
                {
                    **user,
                    "driver_verification_status": "approved" if user["id"] == "new-driver" else "pending_uploads",
                }
                for user in users
            ]

        with patch(
            "app.services.admin_user_list_service.enrich_admin_users",
            new=AsyncMock(side_effect=enrich),
        ):
            result = await list_admin_users(
                search="needle",
                role="driver",
                status="active",
                verification="approved",
                limit=10,
            )

        self.assertEqual(result["count"], 1)
        self.assertEqual(result["items"][0]["id"], "new-driver")

    async def test_mongo_without_verification_bounds_candidates_before_enrichment(self):
        users = _UsersCollection(
            [[
                {"_id": "mongo", "id": "u1", "name": "Needle", "role": "driver", "status": "active"},
                {"id": "u2", "name": "Needle Two", "role": "driver", "status": "active"},
            ]]
        )
        database.db = _MongoDb(users)
        enrich = AsyncMock(side_effect=lambda rows: [{**row, "driver_verification_status": "approved"} for row in rows])

        with patch("app.services.admin_user_list_service.enrich_admin_users", new=enrich):
            result = await list_admin_users(
                search="needle+literal@example.com",
                role="driver",
                status="active",
                verification=None,
                limit=2,
            )

        self.assertEqual(result["count"], 2)
        self.assertEqual(enrich.await_count, 1)
        self.assertEqual(len(enrich.await_args.args[0]), 2)
        pipeline = users.pipelines[0]
        self.assertEqual(pipeline[-2], {"$limit": 2})
        self.assertEqual(pipeline[-1], {"$unset": "_admin_recent_at"})
        match = pipeline[0]["$match"]
        self.assertEqual(match["$and"][0], {"role": "driver"})
        self.assertEqual(match["$and"][1], {"status": "active"})
        search_clause = match["$and"][2]["$expr"]["$or"]
        self.assertEqual(len(search_clause), 6)
        for clause in search_clause:
            self.assertEqual(
                clause["$regexMatch"]["regex"],
                r"needle\+literal@example\.com",
            )
            self.assertEqual(clause["$regexMatch"]["options"], "i")

    async def test_mongo_verification_filter_continues_in_bounded_batches(self):
        first_batch = [
            {"id": f"u{index}", "name": f"User {index}", "role": "driver", "status": "active"}
            for index in range(50)
        ]
        second_batch = [
            {"id": "approved-user", "name": "Approved", "role": "driver", "status": "active"}
        ]
        users = _UsersCollection([first_batch, second_batch])
        database.db = _MongoDb(users)

        async def enrich(rows):
            return [
                {
                    **row,
                    "driver_verification_status": "approved" if row["id"] == "approved-user" else "pending_uploads",
                }
                for row in rows
            ]

        with patch(
            "app.services.admin_user_list_service.enrich_admin_users",
            new=AsyncMock(side_effect=enrich),
        ) as enrich_mock:
            result = await list_admin_users(
                search=None,
                role="driver",
                status="active",
                verification="approved",
                limit=1,
            )

        self.assertEqual(result["count"], 1)
        self.assertEqual(result["items"][0]["id"], "approved-user")
        self.assertEqual(enrich_mock.await_count, 2)
        self.assertEqual(len(users.pipelines), 2)
        self.assertEqual(users.pipelines[0][-2], {"$limit": 50})
        self.assertIn({"$skip": 50}, users.pipelines[1])
        self.assertEqual(users.pipelines[1][-2], {"$limit": 50})

    async def test_mongo_recent_sort_matches_created_at_fallback_contract(self):
        users = _UsersCollection([[]])
        database.db = _MongoDb(users)

        with patch(
            "app.services.admin_user_list_service.enrich_admin_users",
            new=AsyncMock(return_value=[]),
        ):
            await list_admin_users(
                search=None,
                role=None,
                status=None,
                verification=None,
                limit=80,
            )

        pipeline = users.pipelines[0]
        self.assertIn("$addFields", pipeline[0])
        self.assertEqual(pipeline[1], {"$sort": {"_admin_recent_at": -1}})
        self.assertEqual(pipeline[-2], {"$limit": 80})


if __name__ == "__main__":
    unittest.main()
