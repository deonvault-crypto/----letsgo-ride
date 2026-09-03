import unittest

from fastapi import HTTPException

from app.database import database
from app.ops_auth import get_ops_user
from app.routers.support_conversations import (
    CustomerSupportReplyBody,
    OpsSupportNoteBody,
    OpsSupportReplyBody,
    customer_support_reply,
    customer_support_thread,
    ops_support_internal_note,
    ops_support_reply,
    ops_support_thread,
)


class SupportConversationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in list(database.memory.keys()):
            await database.replace_collection(collection, [])

        self.admin = {
            "id": "admin-1",
            "role": "admin",
            "name": "Admin",
            "email": "admin@example.com",
            "status": "active",
        }
        self.cs_user = {
            "id": "cs-1",
            "role": "passenger",
            "name": "Support Agent",
            "email": "support@example.com",
            "status": "active",
        }
        self.customer = {
            "id": "customer-1",
            "role": "passenger",
            "name": "Customer",
            "email": "customer@example.com",
            "status": "active",
        }
        self.other_customer = {
            "id": "customer-2",
            "role": "passenger",
            "name": "Other Customer",
            "email": "other@example.com",
            "status": "active",
        }
        for user in (self.admin, self.cs_user, self.customer, self.other_customer):
            await database.insert_one("users", user)
        await database.insert_one("ops_staff", {
            "id": "ops-cs-1",
            "user_id": self.cs_user["id"],
            "role": "cs",
            "enabled": True,
        })
        self.cs_ops = await get_ops_user(self.cs_user)

        await database.insert_one("support_messages", {
            "id": "support-1",
            "user_id": self.customer["id"],
            "user_name": self.customer["name"],
            "user_email": self.customer["email"],
            "subject": "Ride support",
            "message": "My driver did not arrive.",
            "status": "received",
            "created_at": "2026-09-03T00:00:00+00:00",
            "updated_at": "2026-09-03T00:00:00+00:00",
        })

    async def test_existing_ticket_becomes_thread_without_mutating_ticket(self):
        response = await ops_support_thread("support-1", user=self.cs_ops)
        items = response["data"]["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["sender_type"], "customer")
        self.assertEqual(items[0]["message"], "My driver did not arrive.")
        self.assertTrue(items[0]["synthetic"])

        stored = await database.find_one("support_messages", {"id": "support-1"})
        self.assertEqual(stored["message"], "My driver did not arrive.")
        self.assertEqual(stored["status"], "received")

    async def test_ops_reply_persists_thread_and_preserves_legacy_fields(self):
        response = await ops_support_reply(
            "support-1",
            OpsSupportReplyBody(message="We are checking this for you.", status="in_review"),
            user=self.cs_ops,
        )
        self.assertEqual(response["data"]["sender_type"], "staff")
        self.assertFalse(response["data"]["is_internal"])

        stored = await database.find_one("support_messages", {"id": "support-1"})
        self.assertEqual(stored["status"], "in_review")
        self.assertEqual(stored["admin_notes"], "We are checking this for you.")
        self.assertTrue(stored.get("last_staff_reply_at"))

        thread = await customer_support_thread("support-1", user=self.customer)
        items = thread["data"]["items"]
        self.assertEqual([item["sender_type"] for item in items], ["customer", "staff"])
        self.assertEqual(items[-1]["message"], "We are checking this for you.")

    async def test_internal_note_is_ops_only(self):
        await ops_support_internal_note(
            "support-1",
            OpsSupportNoteBody(note="Escalate if driver disputes the report."),
            user=self.cs_ops,
        )

        ops_thread = await ops_support_thread("support-1", user=self.cs_ops)
        self.assertTrue(any(item["is_internal"] for item in ops_thread["data"]["items"]))

        customer_thread = await customer_support_thread("support-1", user=self.customer)
        self.assertFalse(any(item["is_internal"] for item in customer_thread["data"]["items"]))
        self.assertFalse(any(
            item["message"] == "Escalate if driver disputes the report."
            for item in customer_thread["data"]["items"]
        ))

    async def test_customer_cannot_read_or_reply_to_another_users_thread(self):
        with self.assertRaises(HTTPException) as read_error:
            await customer_support_thread("support-1", user=self.other_customer)
        self.assertEqual(read_error.exception.status_code, 404)

        with self.assertRaises(HTTPException) as reply_error:
            await customer_support_reply(
                "support-1",
                CustomerSupportReplyBody(message="I should not be allowed here."),
                user=self.other_customer,
            )
        self.assertEqual(reply_error.exception.status_code, 404)

    async def test_customer_reply_reopens_closed_ticket(self):
        await database.update_one("support_messages", "support-1", {"status": "closed"})
        response = await customer_support_reply(
            "support-1",
            CustomerSupportReplyBody(message="I still need help with this."),
            user=self.customer,
        )
        self.assertEqual(response["data"]["sender_type"], "customer")

        stored = await database.find_one("support_messages", {"id": "support-1"})
        self.assertEqual(stored["status"], "received")
        self.assertTrue(stored.get("last_customer_reply_at"))


if __name__ == "__main__":
    unittest.main()
