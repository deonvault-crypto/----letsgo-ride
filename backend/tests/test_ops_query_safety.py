import unittest
from unittest.mock import patch

from app.database import COLLECTION_NAMES, database
from app.routers.ops import list_cases, list_staff


class OpsQuerySafetyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        for collection in ("ops_cases", "ops_case_events", "ops_staff"):
            database.memory[collection] = []
        self.ops_user = {"id": "ops-manager", "role": "admin", "name": "Ops Manager", "email": "ops@example.com"}

    async def test_case_exact_filters_are_applied_before_limit(self):
        await database.insert_one(
            "ops_cases",
            {
                "id": "newer-closed",
                "case_number": "LGR-NEW",
                "subject": "Closed",
                "description": "not wanted",
                "status": "closed",
                "priority": "normal",
                "escalation_level": "cs",
                "updated_at": "2026-09-14T12:00:00+00:00",
            },
        )
        await database.insert_one(
            "ops_cases",
            {
                "id": "older-open",
                "case_number": "LGR-OPEN",
                "subject": "Open",
                "description": "wanted",
                "status": "open",
                "priority": "normal",
                "escalation_level": "cs",
                "updated_at": "2026-09-14T11:00:00+00:00",
            },
        )

        response = await list_cases(
            status="open",
            escalation_level=None,
            assigned_to=None,
            priority=None,
            search=None,
            limit=1,
            user=self.ops_user,
        )

        self.assertEqual(response["data"]["count"], 1)
        self.assertEqual(response["data"]["items"][0]["id"], "older-open")

    async def test_case_search_happens_before_final_limit(self):
        await database.insert_one(
            "ops_cases",
            {
                "id": "newer-nonmatch",
                "case_number": "LGR-NEW",
                "subject": "General question",
                "description": "no keyword here",
                "status": "open",
                "priority": "normal",
                "escalation_level": "cs",
                "updated_at": "2026-09-14T12:00:00+00:00",
            },
        )
        await database.insert_one(
            "ops_cases",
            {
                "id": "older-match",
                "case_number": "LGR-MATCH",
                "subject": "Payment investigation",
                "description": "needle is here",
                "status": "open",
                "priority": "normal",
                "escalation_level": "cs",
                "updated_at": "2026-09-14T11:00:00+00:00",
            },
        )

        response = await list_cases(
            status=None,
            escalation_level=None,
            assigned_to=None,
            priority=None,
            search="needle",
            limit=1,
            user=self.ops_user,
        )

        self.assertEqual(response["data"]["count"], 1)
        self.assertEqual(response["data"]["items"][0]["id"], "older-match")

    async def test_staff_list_batches_user_lookup(self):
        for index in range(3):
            user_id = f"staff-{index}"
            await database.insert_one(
                "users",
                {
                    "id": user_id,
                    "name": f"Staff {index}",
                    "email": f"staff{index}@example.com",
                    "role": "passenger",
                    "status": "active",
                    "updated_at": f"2026-09-14T10:0{index}:00+00:00",
                },
            )
            await database.insert_one(
                "ops_staff",
                {
                    "id": f"ops-staff-{index}",
                    "user_id": user_id,
                    "role": "cs",
                    "enabled": True,
                    "updated_at": f"2026-09-14T10:0{index}:00+00:00",
                },
            )

        with patch.object(database, "find_one", wraps=database.find_one) as find_one:
            response = await list_staff(user=self.ops_user)

        self.assertEqual(response["data"]["count"], 3)
        self.assertEqual(find_one.await_count, 0)


if __name__ == "__main__":
    unittest.main()
