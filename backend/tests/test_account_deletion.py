import unittest

from fastapi import HTTPException

from app.auth import get_current_user
from app.database import COLLECTION_NAMES, database
from app.routers.auth import delete_me
from app.services.account_deletion_service import (
    AccountDeletionBlockedError,
    delete_account,
)
from app.services.auth_service import find_user_by_token


class AccountDeletionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_deletion_revokes_access_and_deidentifies_non_retained_data(self):
        user = await database.insert_one(
            "users",
            {
                "id": "customer-delete",
                "role": "passenger",
                "status": "active",
                "name": "Private Person",
                "email": "private@example.com",
                "normalized_email": "private@example.com",
                "pending_email": "pending@example.com",
                "phone": "+263770000001",
                "city": "Harare",
                "bio": "Private bio",
                "travel_preferences": "Window seat",
                "profile_photo_url": "/media/profile-photos/customer-delete/photo.jpg",
                "profile_photo_name": "personal-name.jpg",
                "password_hash": "hash",
                "password_salt": "salt",
                "token": "session-token",
                "token_expires_at": "2099-01-01T00:00:00+00:00",
            },
        )
        await database.insert_one(
            "device_push_tokens",
            {"id": "push-1", "user_id": user["id"], "expo_push_token": "push-token", "active": True},
        )
        await database.insert_one(
            "notification_preferences",
            {"id": "prefs-1", "user_id": user["id"], "marketing_messages": True},
        )
        await database.insert_one(
            "messages",
            {"id": "message-1", "conversation_id": "conversation-1", "sender_id": user["id"], "body": "Private message"},
        )
        await database.insert_one(
            "support_messages",
            {
                "id": "support-1",
                "user_id": user["id"],
                "user_name": user["name"],
                "user_email": user["email"],
                "user_phone": user["phone"],
                "message": "Retained dispute evidence",
            },
        )
        await database.insert_one(
            "food_orders",
            {
                "id": "food-1",
                "customer_user_id": user["id"],
                "status": "DELIVERED",
                "customer_name": user["name"],
                "recipient_phone": user["phone"],
                "delivery_address": "Private address",
            },
        )

        result = await delete_account(user)

        self.assertTrue(result["deleted"])
        saved = await database.find_one("users", {"id": user["id"]})
        self.assertEqual(saved["status"], "deleted")
        self.assertEqual(saved["email"], "")
        self.assertEqual(saved["phone"], "")
        self.assertIsNone(saved["profile_photo_url"])
        self.assertEqual(saved["password_hash"], "")
        self.assertEqual(saved["token"], "")
        self.assertEqual(saved["account_deletion_state"], "deidentified_with_limited_retention")
        self.assertEqual(await database.find_many("device_push_tokens"), [])
        self.assertEqual(await database.find_many("notification_preferences"), [])

        message = await database.find_one("messages", {"id": "message-1"})
        self.assertEqual(message["body"], "Message removed after account deletion.")
        support = await database.find_one("support_messages", {"id": "support-1"})
        self.assertEqual(support["message"], "Retained dispute evidence")
        self.assertEqual(support["user_email"], "")
        self.assertEqual(support["retention_state"], "restricted_case_record")
        order = await database.find_one("food_orders", {"id": "food-1"})
        self.assertIsNone(order["delivery_address"])
        self.assertEqual(order["recipient_phone"], "")

    async def test_worker_verification_metadata_is_restricted_not_publicly_reactivated(self):
        user = await database.insert_one(
            "users",
            {"id": "driver-delete", "role": "driver", "status": "active", "name": "Driver", "email": "driver@example.com"},
        )
        await database.insert_one(
            "drivers",
            {
                "id": "driver-profile",
                "user_id": user["id"],
                "status": "approved",
                "verified": True,
                "documents": [
                    {
                        "id": "document-1",
                        "document_type": "national_id",
                        "cloudinary_public_id": "server-owned-provider-id",
                        "delivery_type": "authenticated",
                        "file_url": "https://historical.invalid/permanent-url",
                    }
                ],
            },
        )

        await delete_account(user)

        driver = await database.find_one("drivers", {"id": "driver-profile"})
        self.assertEqual(driver["status"], "deleted")
        self.assertFalse(driver["verified"])
        self.assertEqual(driver["retention_state"], "restricted_verification_record")
        self.assertNotIn("file_url", driver["documents"][0])
        self.assertEqual(driver["documents"][0]["retention_state"], "restricted_after_account_deletion")

    async def test_active_service_blocks_account_deletion_without_mutating_user(self):
        user = await database.insert_one(
            "users",
            {"id": "customer-active", "role": "passenger", "status": "active", "email": "active@example.com", "token": "token"},
        )
        await database.insert_one(
            "courier_deliveries",
            {"id": "delivery-active", "sender_user_id": user["id"], "status": "IN_TRANSIT"},
        )

        with self.assertRaises(AccountDeletionBlockedError):
            await delete_account(user)

        saved = await database.find_one("users", {"id": user["id"]})
        self.assertEqual(saved["status"], "active")
        self.assertEqual(saved["token"], "token")

    async def test_service_is_idempotent_for_already_deleted_truth(self):
        user = await database.insert_one(
            "users",
            {"id": "already-deleted", "role": "passenger", "status": "deleted", "email": "", "token": ""},
        )
        first = await delete_account(user)
        second = await delete_account(user)
        self.assertEqual(first, second)
        self.assertTrue(second["deleted"])

    async def test_deleted_session_is_immediately_rejected(self):
        user = await database.insert_one(
            "users",
            {
                "id": "session-delete",
                "role": "passenger",
                "status": "active",
                "email": "session-delete@example.com",
                "token": "old-session-token",
                "token_expires_at": "2099-01-01T00:00:00+00:00",
            },
        )

        self.assertEqual((await find_user_by_token("old-session-token"))["id"], user["id"])
        await delete_account(user)
        self.assertIsNone(await find_user_by_token("old-session-token"))

    async def test_account_deletion_requires_authentication(self):
        with self.assertRaises(HTTPException) as raised:
            await get_current_user(authorization="")
        self.assertEqual(raised.exception.status_code, 401)

    async def test_each_public_role_deletes_only_its_authenticated_account(self):
        other = await database.insert_one(
            "users",
            {
                "id": "unrelated-account",
                "role": "passenger",
                "status": "active",
                "email": "unrelated@example.com",
                "token": "unrelated-token",
            },
        )

        for role in ("passenger", "driver", "courier", "merchant"):
            with self.subTest(role=role):
                actor = await database.insert_one(
                    "users",
                    {
                        "id": f"delete-{role}",
                        "role": role,
                        "status": "active",
                        "email": f"{role}@example.com",
                        "token": f"token-{role}",
                    },
                )
                response = await delete_me(user=actor)
                self.assertTrue(response["success"])
                self.assertEqual(
                    (await database.find_one("users", {"id": actor["id"]}))["status"],
                    "deleted",
                )

        untouched = await database.find_one("users", {"id": other["id"]})
        self.assertEqual(untouched["status"], "active")
        self.assertEqual(untouched["email"], "unrelated@example.com")


if __name__ == "__main__":
    unittest.main()
