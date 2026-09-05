import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.database import database
from app.ops_auth import get_ops_user
from app.routers.support_conversations import (
    CustomerSupportReplyBody,
    OpsSupportNoteBody,
    OpsSupportReplyBody,
    OpsSupportStartBody,
    customer_support_reply,
    customer_support_thread,
    ops_start_support_conversation,
    ops_support_internal_note,
    ops_support_reply,
    ops_support_thread,
)


class SupportConversationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in list(database.memory.keys()):
            await database.replace_collection(collection, [])

        self.realtime_patch = patch(
            "app.services.support_realtime_service.realtime_event_service.publish",
            new_callable=AsyncMock,
            return_value=True,
        )
        self.realtime_publish = self.realtime_patch.start()
        self.addCleanup(self.realtime_patch.stop)

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

        # Deliberately omit realtime_version to prove existing production tickets
        # safely enter the versioned realtime path on their first public reply.
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
        self.realtime_publish.assert_not_awaited()

    async def test_ops_can_start_conversation_and_customer_sees_staff_first(self):
        response = await ops_start_support_conversation(
            OpsSupportStartBody(
                user_id=self.customer["id"],
                subject="Driver documents",
                message="Hi, we need one clearer photo of your driver licence.",
            ),
            user=self.cs_ops,
        )
        created = response["data"]
        self.assertEqual(created["user_id"], self.customer["id"])
        self.assertEqual(created["status"], "open")

        stored = await database.find_one("support_messages", {"id": created["id"]})
        self.assertEqual(stored["initial_sender_type"], "staff")
        self.assertTrue(stored["initiated_by_ops"])
        self.assertEqual(stored["message"], "Hi, we need one clearer photo of your driver licence.")

        customer_thread = await customer_support_thread(created["id"], user=self.customer)
        items = customer_thread["data"]["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["sender_type"], "staff")
        self.assertEqual(items[0]["sender_name"], "LetsGoRide Support")
        self.assertEqual(items[0]["message"], "Hi, we need one clearer photo of your driver licence.")

        notifications = await database.find_many("app_notifications", {"user_id": self.customer["id"]})
        self.assertTrue(any(item.get("data", {}).get("support_message_id") == created["id"] for item in notifications))

        audit = await database.find_many("audit_logs", {"target_id": created["id"]})
        self.assertTrue(any(item.get("action") == "ops_support_conversation_started" for item in audit))

        self.realtime_publish.assert_awaited_once()
        published = self.realtime_publish.await_args.args[0]
        self.assertEqual(published.envelope.type, "support_message.staff_started")
        self.assertEqual(published.envelope.resource_id, created["id"])
        self.assertNotIn("message", published.envelope.payload)

    async def test_customer_can_reply_to_staff_initiated_conversation(self):
        created = (await ops_start_support_conversation(
            OpsSupportStartBody(
                user_id=self.customer["id"],
                subject="Account check",
                message="Please confirm the city shown on your profile.",
            ),
            user=self.cs_ops,
        ))["data"]
        self.realtime_publish.reset_mock()

        reply = await customer_support_reply(
            created["id"],
            CustomerSupportReplyBody(message="I am in Harare."),
            user=self.customer,
        )
        self.assertEqual(reply["data"]["sender_type"], "customer")

        thread = await ops_support_thread(created["id"], user=self.cs_ops)
        self.assertEqual(
            [item["sender_type"] for item in thread["data"]["items"]],
            ["staff", "customer"],
        )
        self.assertEqual(thread["data"]["items"][-1]["message"], "I am in Harare.")

    async def test_ops_cannot_start_conversation_for_deleted_or_unknown_user(self):
        await database.update_one("users", self.other_customer["id"], {"status": "deleted"})
        for user_id in (self.other_customer["id"], "missing-user"):
            with self.assertRaises(HTTPException) as error:
                await ops_start_support_conversation(
                    OpsSupportStartBody(
                        user_id=user_id,
                        subject="Account support",
                        message="Please contact LetsGoRide Support.",
                    ),
                    user=self.cs_ops,
                )
            self.assertEqual(error.exception.status_code, 404)

    async def test_ops_reply_persists_thread_and_publishes_scoped_realtime_signal(self):
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
        self.assertEqual(stored.get("realtime_version"), 1)

        self.realtime_publish.assert_awaited_once()
        published = self.realtime_publish.await_args.args[0]
        self.assertEqual(published.envelope.type, "support_message.staff_replied")
        self.assertEqual(published.envelope.resource_type, "support_message")
        self.assertEqual(published.envelope.resource_id, "support-1")
        self.assertEqual(published.envelope.version, 1)
        self.assertEqual(published.envelope.payload.get("status"), "in_review")
        self.assertNotIn("message", published.envelope.payload)
        self.assertIn(self.customer["id"], published.audience.user_ids)
        self.assertIn(self.cs_user["id"], published.audience.user_ids)
        self.assertIn("admin", published.audience.roles)

        thread = await customer_support_thread("support-1", user=self.customer)
        items = thread["data"]["items"]
        self.assertEqual([item["sender_type"] for item in items], ["customer", "staff"])
        self.assertEqual(items[-1]["message"], "We are checking this for you.")

    async def test_internal_note_is_ops_only_and_does_not_publish_customer_realtime(self):
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
        stored = await database.find_one("support_messages", {"id": "support-1"})
        self.assertIsNone(stored.get("realtime_version"))
        self.realtime_publish.assert_not_awaited()

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
        self.realtime_publish.assert_not_awaited()

    async def test_customer_reply_reopens_closed_ticket_and_notifies_support_realtime(self):
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
        self.assertEqual(stored.get("realtime_version"), 1)
        published = self.realtime_publish.await_args.args[0]
        self.assertEqual(published.envelope.type, "support_message.customer_replied")
        self.assertEqual(published.envelope.resource_id, "support-1")
        self.assertNotIn("message", published.envelope.payload)


if __name__ == "__main__":
    unittest.main()
