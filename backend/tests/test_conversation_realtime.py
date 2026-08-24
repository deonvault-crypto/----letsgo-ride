import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.database import COLLECTION_NAMES, database
from app.routers.conversations import mark_conversation_read as mark_conversation_read_route
from app.services.conversation_realtime_service import (
    conversation_realtime_version,
    update_versioned_conversation,
)
from app.services.conversation_service import (
    enrich_conversation,
    ensure_conversation_for_request,
    get_conversation_for_user,
    mark_conversation_read,
    send_message,
)
from app.services.event_service import realtime_event_service
from app.services.realtime_connection_manager import RealtimePrincipal, principal_can_receive


class ConversationRealtimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        self.driver = {"id": "driver-chat-1", "role": "driver", "name": "Tawanda", "phone": "+263770000001"}
        self.passenger = {"id": "passenger-chat-1", "role": "passenger", "name": "Rudo", "email": "rudo@example.com"}
        self.other = {"id": "passenger-chat-2", "role": "passenger", "name": "Other"}
        for user in (self.driver, self.passenger, self.other):
            await database.insert_one("users", user)
        self.ride = {
            "id": "ride-chat-1",
            "user_id": self.driver["id"],
            "driver_id": "driver-profile-1",
            "origin": "Harare",
            "destination": "Bulawayo",
        }
        self.request = {"id": "request-chat-1", "ride_id": self.ride["id"], "user_id": self.passenger["id"]}
        await database.insert_one("rides", self.ride)
        await database.insert_one("ride_requests", self.request)
        self.publish = AsyncMock(return_value=True)
        self.publish_patch = patch.object(realtime_event_service, "publish", self.publish)
        self.publish_patch.start()

    async def asyncTearDown(self):
        self.publish_patch.stop()

    async def conversation(self):
        return await ensure_conversation_for_request(self.request, self.ride)

    async def test_creation_version_audience_and_idempotency(self):
        created = await self.conversation()
        same = await self.conversation()
        self.assertEqual(created["id"], same["id"])
        self.assertEqual(created["realtime_version"], 1)
        self.assertEqual(await database.count("conversations"), 1)
        self.assertEqual(self.publish.await_count, 1)
        published = self.publish.await_args.args[0]
        self.assertEqual(published.envelope.type, "conversation.created")
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.driver["id"], "driver"), published.audience))
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.passenger["id"], "passenger"), published.audience))
        self.assertFalse(principal_can_receive(RealtimePrincipal(self.other["id"], "passenger"), published.audience))

    async def test_legacy_and_concurrent_versions_are_monotonic(self):
        self.assertEqual(conversation_realtime_version({"id": "legacy"}), 0)
        await database.insert_one("conversations", {"id": "legacy", "status": "active"})
        first, second = await asyncio.gather(
            update_versioned_conversation({"id": "legacy"}, {"last_message": "one"}),
            update_versioned_conversation({"id": "legacy"}, {"last_message": "two"}),
        )
        self.assertEqual(sorted([first["realtime_version"], second["realtime_version"]]), [1, 2])

    async def test_messages_increment_summary_and_publish_safe_participant_events(self):
        conversation = await self.conversation()
        first, second = await asyncio.gather(
            send_message(conversation, self.passenger, "First"),
            send_message(conversation, self.driver, "Second"),
        )
        self.assertEqual(sorted([first["conversation_realtime_version"], second["conversation_realtime_version"]]), [2, 3])
        committed = await database.find_one("conversations", {"id": conversation["id"]})
        self.assertEqual(committed["realtime_version"], 3)
        self.assertIn(committed["last_message"], {"First", "Second"})
        events = [call.args[0] for call in self.publish.await_args_list if call.args[0].envelope.type == "conversation.message_created"]
        self.assertEqual(len(events), 2)
        for published in events:
            self.assertTrue(principal_can_receive(RealtimePrincipal(self.driver["id"], "driver"), published.audience))
            self.assertTrue(principal_can_receive(RealtimePrincipal(self.passenger["id"], "passenger"), published.audience))
            self.assertFalse(principal_can_receive(RealtimePrincipal(self.other["id"], "passenger"), published.audience))
            encoded = json.dumps(published.envelope.payload).lower()
            for protected in ("phone", "email", "token", "password", "document_url"):
                self.assertNotIn(protected, encoded)

    async def test_enriched_list_uses_stored_summary_without_message_history_scan(self):
        conversation = await self.conversation()
        await send_message(conversation, self.passenger, "Stored preview")
        committed = await database.find_one("conversations", {"id": conversation["id"]})
        original_find_many = database.find_many
        find_many = AsyncMock(side_effect=original_find_many)
        with patch.object(database, "find_many", find_many):
            enriched = await enrich_conversation(committed, self.driver)
        self.assertEqual(enriched["last_message"], "Stored preview")
        self.assertFalse(any(call.args and call.args[0] == "messages" for call in find_many.await_args_list))

    async def test_publish_failure_does_not_fail_committed_send(self):
        conversation = await self.conversation()
        self.publish.side_effect = RuntimeError("redis unavailable")
        created = await send_message(conversation, self.passenger, "Still committed")
        self.assertEqual(created["conversation_realtime_version"], 2)
        self.assertIsNotNone(await database.find_one("messages", {"id": created["id"]}))

    async def test_mark_read_bulk_updates_once_and_noop_does_not_advance(self):
        conversation = await self.conversation()
        first = await send_message(conversation, self.driver, "One")
        await send_message(conversation, self.driver, "Two")
        committed = await database.find_one("conversations", {"id": conversation["id"]})
        calls_before = self.publish.await_count
        original_update_many = database.update_many
        bulk = AsyncMock(side_effect=original_update_many)
        with patch.object(database, "update_many", bulk):
            result = await mark_conversation_read(committed, self.passenger)
        self.assertEqual(result["changed"], 2)
        self.assertEqual(result["conversation_realtime_version"], 4)
        bulk.assert_awaited_once()
        self.assertEqual(self.publish.await_count, calls_before + 1)
        read_event = self.publish.await_args.args[0]
        self.assertEqual(read_event.envelope.type, "conversation.read_updated")
        self.assertEqual(read_event.envelope.payload["reader_user_id"], self.passenger["id"])
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.driver["id"], "driver"), read_event.audience))
        refreshed = await database.find_one("conversations", {"id": conversation["id"]})
        noop = await mark_conversation_read(refreshed, self.passenger)
        self.assertEqual(noop["changed"], 0)
        self.assertEqual(noop["conversation_realtime_version"], 4)
        self.assertEqual(self.publish.await_count, calls_before + 1)
        self.assertTrue((await database.find_one("messages", {"id": first["id"]}))["read_by_passenger"])

    async def test_read_route_delegates_to_canonical_service(self):
        conversation = await self.conversation()
        await send_message(conversation, self.driver, "Route read")
        response = await mark_conversation_read_route(conversation["id"], self.passenger)
        self.assertTrue(response["success"])
        self.assertEqual(response["data"]["changed"], 1)

    async def test_access_and_message_validation_remain_enforced(self):
        conversation = await self.conversation()
        with self.assertRaises(HTTPException) as denied:
            await get_conversation_for_user(conversation["id"], self.other)
        self.assertEqual(denied.exception.status_code, 403)
        with self.assertRaises(HTTPException):
            await send_message(conversation, self.passenger, "   ")
        with self.assertRaises(HTTPException):
            await send_message(conversation, self.passenger, "x" * 1001)


if __name__ == "__main__":
    unittest.main()
