import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.database import database
from app.ops_auth import get_ops_user
from app.routers.support_message_management import (
    OpsSupportThreadMessageEditBody,
    ops_delete_support_thread_message,
    ops_edit_support_thread_message,
)


class SupportMessageManagementTests(unittest.IsolatedAsyncioTestCase):
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
        self.other_cs_user = {
            "id": "cs-2",
            "role": "passenger",
            "name": "Other Agent",
            "email": "other-support@example.com",
            "status": "active",
        }
        self.customer = {
            "id": "customer-1",
            "role": "passenger",
            "name": "Customer",
            "email": "customer@example.com",
            "status": "active",
        }
        for user in (self.admin, self.cs_user, self.other_cs_user, self.customer):
            await database.insert_one("users", user)
        for index, user in enumerate((self.cs_user, self.other_cs_user), start=1):
            await database.insert_one("ops_staff", {
                "id": f"ops-cs-{index}",
                "user_id": user["id"],
                "role": "cs",
                "enabled": True,
            })

        self.admin_ops = await get_ops_user(self.admin)
        self.cs_ops = await get_ops_user(self.cs_user)
        self.other_cs_ops = await get_ops_user(self.other_cs_user)

        await database.insert_one("support_messages", {
            "id": "support-1",
            "user_id": self.customer["id"],
            "user_name": self.customer["name"],
            "user_email": self.customer["email"],
            "subject": "Courier application",
            "message": "Please help with my application.",
            "status": "open",
            "realtime_version": 1,
            "admin_notes": "First reply",
            "last_staff_reply_at": "2026-09-06T10:00:00+00:00",
            "created_at": "2026-09-06T09:00:00+00:00",
            "updated_at": "2026-09-06T10:00:00+00:00",
        })
        await database.insert_one("support_thread_messages", {
            "id": "reply-1",
            "support_message_id": "support-1",
            "sender_type": "staff",
            "sender_user_id": self.cs_user["id"],
            "sender_name": self.cs_user["name"],
            "sender_ops_role": "cs",
            "message": "First reply",
            "is_internal": False,
            "created_at": "2026-09-06T10:00:00+00:00",
        })

    async def test_staff_can_edit_own_public_reply_and_ticket_summary_tracks_edit(self):
        response = await ops_edit_support_thread_message(
            "support-1",
            "reply-1",
            OpsSupportThreadMessageEditBody(message="Corrected support reply"),
            user=self.cs_ops,
        )
        self.assertEqual(response["data"]["message"], "Corrected support reply")

        stored = await database.find_one("support_thread_messages", {"id": "reply-1"})
        self.assertEqual(stored["message"], "Corrected support reply")
        self.assertTrue(stored.get("edited_at"))
        self.assertEqual(stored.get("edited_by_user_id"), self.cs_user["id"])

        ticket = await database.find_one("support_messages", {"id": "support-1"})
        self.assertEqual(ticket.get("admin_notes"), "Corrected support reply")
        self.assertEqual(ticket.get("last_staff_reply_at"), "2026-09-06T10:00:00+00:00")
        self.assertEqual(ticket.get("realtime_version"), 2)

        published = self.realtime_publish.await_args.args[0]
        self.assertEqual(published.envelope.type, "support_message.staff_message_edited")
        self.assertEqual(published.envelope.resource_id, "support-1")
        self.assertNotIn("message", published.envelope.payload)

        audit = await database.find_many("audit_logs", {"target_id": "reply-1"})
        self.assertTrue(any(row.get("action") == "ops_support_reply_edited" for row in audit))

    async def test_non_admin_cannot_edit_another_staff_members_reply(self):
        with self.assertRaises(HTTPException) as error:
            await ops_edit_support_thread_message(
                "support-1",
                "reply-1",
                OpsSupportThreadMessageEditBody(message="Should not be allowed"),
                user=self.other_cs_ops,
            )
        self.assertEqual(error.exception.status_code, 403)
        stored = await database.find_one("support_thread_messages", {"id": "reply-1"})
        self.assertEqual(stored["message"], "First reply")
        self.realtime_publish.assert_not_awaited()

    async def test_admin_can_delete_staff_reply_and_summary_falls_back_to_previous_reply(self):
        await database.insert_one("support_thread_messages", {
            "id": "reply-2",
            "support_message_id": "support-1",
            "sender_type": "staff",
            "sender_user_id": self.other_cs_user["id"],
            "sender_name": self.other_cs_user["name"],
            "sender_ops_role": "cs",
            "message": "Second reply",
            "is_internal": False,
            "created_at": "2026-09-06T11:00:00+00:00",
        })
        await database.update_one("support_messages", "support-1", {
            "admin_notes": "Second reply",
            "last_staff_reply_at": "2026-09-06T11:00:00+00:00",
        })

        response = await ops_delete_support_thread_message(
            "support-1",
            "reply-2",
            user=self.admin_ops,
        )
        self.assertTrue(response["data"]["deleted"])
        self.assertIsNone(await database.find_one("support_thread_messages", {"id": "reply-2"}))

        ticket = await database.find_one("support_messages", {"id": "support-1"})
        self.assertEqual(ticket.get("admin_notes"), "First reply")
        self.assertEqual(ticket.get("last_staff_reply_at"), "2026-09-06T10:00:00+00:00")

        published = self.realtime_publish.await_args.args[0]
        self.assertEqual(published.envelope.type, "support_message.staff_message_deleted")
        self.assertEqual(published.envelope.resource_id, "support-1")

        audit = await database.find_many("audit_logs", {"target_id": "reply-2"})
        self.assertTrue(any(row.get("action") == "ops_support_reply_deleted" for row in audit))

    async def test_customer_and_internal_messages_cannot_be_changed_by_reply_management_routes(self):
        for message_id, sender_type, internal in (
            ("customer-reply", "customer", False),
            ("internal-note", "staff", True),
        ):
            await database.insert_one("support_thread_messages", {
                "id": message_id,
                "support_message_id": "support-1",
                "sender_type": sender_type,
                "sender_user_id": self.cs_user["id"] if sender_type == "staff" else self.customer["id"],
                "sender_name": "Sender",
                "sender_ops_role": "cs" if sender_type == "staff" else None,
                "message": "Protected message",
                "is_internal": internal,
                "created_at": "2026-09-06T12:00:00+00:00",
            })
            with self.assertRaises(HTTPException) as error:
                await ops_edit_support_thread_message(
                    "support-1",
                    message_id,
                    OpsSupportThreadMessageEditBody(message="Changed"),
                    user=self.admin_ops,
                )
            self.assertEqual(error.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
