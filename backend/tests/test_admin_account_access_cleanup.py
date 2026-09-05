import unittest
from unittest.mock import AsyncMock, patch

from app.auth import reconcile_inactive_account_access


class AdminAccountAccessCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_deleted_account_revokes_session_push_and_open_application(self):
        user = {
            "id": "deleted-user",
            "status": "deleted",
            "token": "acct-old",
            "token_issued_at": "2026-09-01T00:00:00+00:00",
            "token_expires_at": "2026-10-01T00:00:00+00:00",
            "sessions_revoked_at": None,
        }
        with (
            patch("app.auth.database.find_one", new=AsyncMock(return_value=user)),
            patch("app.auth.database.update_one", new=AsyncMock(return_value={**user, "token": ""})) as update_user,
            patch("app.auth.database.update_many", new=AsyncMock(return_value=1)) as update_many,
        ):
            await reconcile_inactive_account_access(user["id"])

        update_user.assert_awaited_once()
        user_update = update_user.await_args.args[2]
        self.assertEqual(user_update["token"], "")
        self.assertIsNone(user_update["token_issued_at"])
        self.assertIsNone(user_update["token_expires_at"])
        self.assertTrue(user_update["sessions_revoked_at"])

        self.assertEqual(update_many.await_count, 2)
        push_call, application_call = update_many.await_args_list
        self.assertEqual(push_call.args[0], "device_push_tokens")
        self.assertEqual(push_call.args[1], {"user_id": user["id"], "active": True})
        self.assertFalse(push_call.args[2]["active"])
        self.assertEqual(application_call.args[0], "worker_applications")
        self.assertEqual(application_call.args[1]["user_id"], user["id"])
        self.assertEqual(application_call.args[2]["status"], "WITHDRAWN")

    async def test_suspended_account_revokes_access_without_withdrawing_application(self):
        user = {
            "id": "suspended-user",
            "status": "suspended",
            "token": "acct-old",
            "token_issued_at": None,
            "token_expires_at": "2026-10-01T00:00:00+00:00",
            "sessions_revoked_at": None,
        }
        with (
            patch("app.auth.database.find_one", new=AsyncMock(return_value=user)),
            patch("app.auth.database.update_one", new=AsyncMock(return_value={**user, "token": ""})),
            patch("app.auth.database.update_many", new=AsyncMock(return_value=1)) as update_many,
        ):
            await reconcile_inactive_account_access(user["id"])

        update_many.assert_awaited_once()
        self.assertEqual(update_many.await_args.args[0], "device_push_tokens")

    async def test_active_account_is_not_mutated(self):
        user = {"id": "active-user", "status": "active", "token": "acct-live"}
        with (
            patch("app.auth.database.find_one", new=AsyncMock(return_value=user)),
            patch("app.auth.database.update_one", new=AsyncMock()) as update_user,
            patch("app.auth.database.update_many", new=AsyncMock()) as update_many,
        ):
            await reconcile_inactive_account_access(user["id"])

        update_user.assert_not_awaited()
        update_many.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
