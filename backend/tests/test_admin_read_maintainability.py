import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.database import COLLECTION_NAMES, database
from app.models.user import AdminRoleUpdateBody
from app.routers.admin import admin_ride_detail, list_users, provision_user_product_role


class AdminReadMaintainabilityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        self.admin = {
            "id": "admin-user",
            "role": "admin",
            "name": "Admin",
            "email": "admin@example.com",
            "status": "active",
        }
        await database.insert_one("users", self.admin)

    async def _user(self, user_id: str, *, role: str = "passenger", **extra):
        user = {
            "id": user_id,
            "role": role,
            "name": user_id.title(),
            "email": f"{user_id}@example.com",
            "status": "active",
            "created_at": "2026-09-14T10:00:00+00:00",
            "updated_at": "2026-09-14T10:00:00+00:00",
            **extra,
        }
        await database.insert_one("users", user)
        return user

    async def test_user_list_uses_bounded_batch_queries(self):
        for index in range(4):
            user = await self._user(f"rider-{index}")
            await database.insert_one(
                "ride_requests",
                {
                    "id": f"request-{index}",
                    "user_id": user["id"],
                    "status": "confirmed" if index % 2 == 0 else "pending",
                    "updated_at": f"2026-09-14T10:0{index}:00+00:00",
                },
            )

        with patch.object(database, "find_many", wraps=database.find_many) as find_many, patch.object(
            database, "find_one", wraps=database.find_one
        ) as find_one:
            response = await list_users(
                search=None,
                role=None,
                status=None,
                verification=None,
                limit=80,
                admin=self.admin,
            )

        self.assertEqual(response["success"], True)
        self.assertEqual(response["data"]["count"], 5)
        self.assertEqual(find_many.await_count, 6)
        self.assertEqual(find_one.await_count, 0)

    async def test_ride_detail_queries_only_linked_support_and_reports(self):
        driver = await self._user("driver-user", role="driver", verification_status="approved")
        await database.insert_one(
            "rides",
            {
                "id": "ride-1",
                "user_id": driver["id"],
                "status": "SCHEDULED",
                "origin": "Harare CBD",
                "destination": "Borrowdale",
                "created_at": "2026-09-14T10:00:00+00:00",
                "updated_at": "2026-09-14T10:00:00+00:00",
            },
        )
        await database.insert_one(
            "ride_requests",
            {
                "id": "request-1",
                "ride_id": "ride-1",
                "user_id": "passenger-1",
                "status": "pending",
                "created_at": "2026-09-14T10:01:00+00:00",
                "updated_at": "2026-09-14T10:01:00+00:00",
            },
        )
        await database.insert_one(
            "support_messages",
            {
                "id": "support-linked",
                "request_id": "request-1",
                "status": "open",
                "created_at": "2026-09-14T10:02:00+00:00",
            },
        )
        await database.insert_one(
            "support_messages",
            {
                "id": "support-unrelated",
                "ride_id": "ride-other",
                "status": "open",
                "created_at": "2026-09-14T10:03:00+00:00",
            },
        )

        with patch.object(database, "find_many", wraps=database.find_many) as find_many:
            response = await admin_ride_detail("ride-1", admin=self.admin)

        self.assertEqual(
            [item["id"] for item in response["data"]["support_cases"]],
            ["support-linked"],
        )
        support_calls = [
            call
            for call in find_many.await_args_list
            if call.args and call.args[0] == "support_messages"
        ]
        report_calls = [
            call
            for call in find_many.await_args_list
            if call.args and call.args[0] == "reports"
        ]
        self.assertEqual(len(support_calls), 1)
        self.assertEqual(len(report_calls), 1)
        self.assertTrue(support_calls[0].args[1])
        self.assertTrue(report_calls[0].args[1])

    async def test_admin_driver_grant_requires_approved_driver_profile(self):
        user = await self._user("driver-candidate")
        payload = AdminRoleUpdateBody(role="driver", reason="Approved onboarding")

        with self.assertRaises(HTTPException) as raised:
            await provision_user_product_role(user["id"], payload, admin=self.admin)
        self.assertEqual(raised.exception.status_code, 409)

        await database.insert_one(
            "drivers",
            {
                "id": "driver-profile",
                "user_id": user["id"],
                "verified": True,
                "verification_status": "approved",
                "status": "approved",
            },
        )
        response = await provision_user_product_role(user["id"], payload, admin=self.admin)
        self.assertEqual(response["data"]["role"], "driver")
        self.assertEqual(response["data"]["work_products"], ["driver"])

    async def test_granting_second_work_product_preserves_active_mode(self):
        user = await self._user("dual-worker", role="driver", work_products=["driver"])
        await database.insert_one(
            "courier_profiles",
            {
                "id": "courier-profile",
                "user_id": user["id"],
                "status": "APPROVED",
                "online": False,
            },
        )
        response = await provision_user_product_role(
            user["id"],
            AdminRoleUpdateBody(role="courier", reason="Courier onboarding approved"),
            admin=self.admin,
        )
        self.assertEqual(response["data"]["role"], "driver")
        self.assertEqual(set(response["data"]["work_products"]), {"driver", "courier"})


if __name__ == "__main__":
    unittest.main()
