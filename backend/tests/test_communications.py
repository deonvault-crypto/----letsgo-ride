import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from pydantic import ValidationError

from app.auth import get_current_user
from app.database import database
from app.models.communications import CampaignBody, CampaignRevision
from app.routers import communications, notifications
from app.services import communications_service as service
from app.services.notification_service import _push_allowed
from app.utils import now_iso


class CommunicationsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for name in database.memory:
            database.memory[name] = []
        self.admin = {"id": "admin", "role": "admin", "status": "active"}
        self.customer = {"id": "customer", "role": "passenger", "status": "active"}
        self.other = {"id": "other", "role": "passenger", "status": "active"}
        self.manager = {"id": "manager", "role": "driver", "status": "active"}
        for user in [self.admin, self.customer, self.other, self.manager]:
            await database.insert_one("users", user)
        await database.insert_one("ops_staff", {"id": "staff", "user_id": "manager", "role": "manager", "enabled": True})
        self.push = AsyncMock(return_value={"delivered_push": True, "push_status": "expo_ticket_success"})
        self.push_patch = patch.object(service, "_send_push_for_notification", self.push)
        self.event_patch = patch.object(service.realtime_event_service, "publish", AsyncMock(return_value=True))
        self.push_patch.start(); self.event_patch.start()
        self.addCleanup(self.push_patch.stop); self.addCleanup(self.event_patch.stop)
        app = FastAPI()
        app.include_router(communications.router); app.include_router(notifications.router)
        self.actor = self.customer
        async def current_user(): return self.actor
        app.dependency_overrides[get_current_user] = current_user
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        self.addAsyncCleanup(self.client.aclose)

    def body(self, **changes):
        return CampaignBody(title="Service notice", body="Pickup access has changed.", kind="service_update",
            roles=["passenger"], expires_at=datetime.now(timezone.utc) + timedelta(days=1), **changes)

    async def queued(self, payload=None):
        result = await communications.create_campaign(payload or self.body(), user=self.admin)
        row = result["data"]
        return (await communications.publish_campaign(row["id"], CampaignRevision(revision=1), user=self.admin))["data"]

    async def test_roles_are_enforced_over_http_and_revoked_staff_cannot_publish(self):
        self.assertEqual((await self.client.get("/ops/communications")).status_code, 403)
        self.actor = self.manager
        draft = await self.client.post("/ops/communications", json=self.body().model_dump(mode="json"))
        self.assertEqual(draft.status_code, 200)
        ident = draft.json()["data"]["id"]
        self.assertEqual((await self.client.post(f"/ops/communications/{ident}/publish", json={"revision": 1})).status_code, 403)
        await database.update_one("ops_staff", "staff", {"enabled": False})
        self.assertEqual((await self.client.get("/ops/communications")).status_code, 403)

    async def test_marketing_requires_explicit_new_consent_and_rechecks_at_delivery(self):
        payload = self.body().model_copy(update={"kind": "marketing", "push": True})
        await database.insert_one("notification_preferences", {"id": "old", "user_id": "customer", "marketing_messages": True})
        await self.queued(payload)
        await service.process_campaign_batch()
        self.assertEqual(await database.count("app_notifications"), 0)
        self.push.assert_not_awaited()
        await database.update_one("notification_preferences", "old", {"marketing_consent_version": 1})
        await self.queued(payload)
        # Consent withdrawn after approval is respected.
        await database.update_one("notification_preferences", "old", {"marketing_messages": False})
        await service.process_campaign_batch(); await service.process_campaign_batch()
        self.assertEqual(await database.count("app_notifications"), 0)
        self.assertFalse(_push_allowed("marketing", {"trip_updates": True, "marketing_messages": True}))

    async def test_repeated_publish_and_competing_workers_create_one_item_per_recipient(self):
        row = await self.queued(self.body(push=True))
        await communications.publish_campaign(row["id"], CampaignRevision(revision=1), user=self.admin)
        await asyncio.gather(service.process_campaign_batch(), service.process_campaign_batch())
        await service.process_campaign_batch()
        self.assertEqual(await database.count("app_notifications"), 2)
        self.assertEqual(self.push.await_count, 2)
        metrics = await service.campaign_metrics(row["id"])
        self.assertEqual(metrics["push_accepted"], 2)
        self.assertEqual(metrics["read"], 0)
        events = service.realtime_event_service.publish.await_args_list
        customer_events = [call.args[0] for call in events if call.args[0].envelope.type == "notification.created"]
        self.assertEqual(len(customer_events), 2)
        self.assertEqual(customer_events[0].envelope.payload.keys(), {"notification_id"})
        self.assertFalse(customer_events[0].audience.roles)

    async def test_crash_recovery_does_not_repeat_unknown_push(self):
        row = await self.queued(self.body(push=True))
        await service.deliver_campaign_recipient(row, self.customer)
        notice = await database.find_one("app_notifications", {"user_id": "customer"})
        await database.update_one("app_notifications", notice["id"], {"push_status": "sending", "delivered_push": False})
        await service.deliver_campaign_recipient(row, self.customer)
        self.assertEqual(self.push.await_count, 1)
        self.assertEqual((await service.campaign_metrics(row["id"]))["push_unknown"], 1)

    async def test_another_worker_cannot_claim_a_batch_during_provider_io(self):
        await self.queued(self.body(push=True))
        entered, release = asyncio.Event(), asyncio.Event()
        async def slow_push(_):
            entered.set()
            await release.wait()
            return {"delivered_push": True, "push_status": "expo_ticket_success"}
        self.push.side_effect = slow_push
        first = asyncio.create_task(service.process_campaign_batch())
        await asyncio.wait_for(entered.wait(), 1)
        self.assertFalse(await service.process_campaign_batch())
        release.set()
        await first
        self.assertEqual(self.push.await_count, 2)

    async def test_safety_notice_takes_priority_over_an_older_campaign(self):
        ordinary = await self.queued()
        safety = await self.queued(self.body().model_copy(update={"kind": "safety_alert"}))
        await service.process_campaign_batch()
        self.assertEqual(await database.count("app_notifications", {"campaign_id": safety["id"]}), 2)
        self.assertEqual(await database.count("app_notifications", {"campaign_id": ordinary["id"]}), 0)

    async def test_valid_opt_in_receives_full_inbox_text_and_bounded_push(self):
        await database.insert_one("notification_preferences", {"id": "consent", "user_id": "customer", "marketing_messages": True, "marketing_consent_version": 1})
        row = await self.queued(self.body().model_copy(update={"kind": "marketing", "body": "A" * 2000, "push": True}))
        await service.process_campaign_batch()
        self.assertEqual(await database.count("app_notifications", {"campaign_id": row["id"]}), 1)
        self.assertEqual(len(self.push.await_args.args[0]["body"]), 220)
        item = await database.find_one("app_notifications", {"user_id": "customer"})
        self.assertEqual(len(item["body"]), 2000)

    async def test_removed_accounts_and_new_signups_are_outside_the_send(self):
        await database.update_one("users", "other", {"status": "suspended"})
        row = await self.queued()
        await database.insert_one("users", {"id": "new-user", "role": "passenger", "status": "active", "created_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()})
        await service.process_campaign_batch()
        self.assertEqual(await database.count("app_notifications", {"campaign_id": row["id"]}), 1)

    async def test_schedule_expiry_and_cancellation_stop_new_delivery(self):
        row = await self.queued(self.body(scheduled_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        self.assertFalse(await service.process_campaign_batch())
        await database.update_one("ops_campaigns", row["id"], {"next_attempt_at": now_iso(), "expires_at": "2000-01-01T00:00:00+00:00"})
        await service.process_campaign_batch()
        self.assertEqual((await database.find_one("ops_campaigns", {"id": row["id"]}))["status"], "expired")
        row = await self.queued()
        await communications.cancel_campaign(row["id"], user=self.admin)
        self.assertFalse(await service.process_campaign_batch())
        self.assertEqual(await database.count("app_notifications"), 0)

    async def test_foreign_account_and_expired_action_are_protected(self):
        row = await self.queued(self.body(action="support"))
        await service.deliver_campaign_recipient(row, self.customer)
        notice = await database.find_one("app_notifications", {"user_id": "customer"})
        self.actor = self.other
        self.assertEqual((await self.client.get("/notifications/" + notice["id"])).status_code, 404)
        self.actor = self.customer
        await database.update_one("app_notifications", notice["id"], {"expires_at": "2000-01-01T00:00:00+00:00"})
        result = (await self.client.get("/notifications/" + notice["id"])).json()["data"]
        self.assertTrue(result["expired"])
        self.assertEqual(result["data"]["action"], "none")

    async def test_opt_in_is_explicit_and_old_client_cannot_create_marketing_consent(self):
        self.actor = self.customer
        old = await self.client.put("/notifications/preferences", json={"marketing_messages": True})
        self.assertFalse(old.json()["data"]["marketing_messages"])
        new = await self.client.put("/notifications/preferences", json={"marketing_messages": True, "marketing_consent_version": 1})
        self.assertTrue(new.json()["data"]["marketing_messages"])
        off = await self.client.put("/notifications/preferences", json={"marketing_messages": False})
        self.assertFalse(off.json()["data"]["marketing_messages"])

    async def test_account_switch_deactivates_previous_owners_push_token(self):
        await database.insert_one("device_push_tokens", {"id": "old-token", "user_id": "other", "expo_push_token": "ExpoPushToken[test]", "active": True})
        result = await self.client.post("/notifications/register-token", json={"expo_push_token": "ExpoPushToken[test]", "platform": "ios"})
        self.assertEqual(result.status_code, 200)
        self.assertFalse((await database.find_one("device_push_tokens", {"id": "old-token"}))["active"])

    async def test_store_information_is_admin_controlled_and_urls_cannot_be_injected(self):
        payload = {"platform": "ios", "version": "2.0.3", "notes": "Support conversations", "available_in_store": False, "reason": "Prepare release"}
        self.assertEqual((await self.client.post("/ops/app-updates", json=payload)).status_code, 403)
        self.actor = self.admin
        self.assertEqual((await self.client.post("/ops/app-updates", json={**payload, "store_url": "https://evil.invalid"})).status_code, 422)
        await self.client.post("/ops/app-updates", json=payload)
        self.assertEqual((await self.client.get("/app-updates")).json()["data"], [])
        await self.client.post("/ops/app-updates", json={**payload, "available_in_store": True})
        row = (await self.client.get("/app-updates")).json()["data"][0]
        self.assertEqual(row["store_url"], service.STORE_URLS["ios"])

    async def test_stale_draft_revision_cannot_be_published(self):
        row = (await communications.create_campaign(self.body(), user=self.admin))["data"]
        await communications.edit_campaign(row["id"], self.body(), revision=1, user=self.admin)
        self.actor = self.admin
        response = await self.client.post(f'/ops/communications/{row["id"]}/publish', json={"revision": 1})
        self.assertEqual(response.status_code, 409)

    def test_payload_validation_rejects_arbitrary_links_and_wrong_role_actions(self):
        with self.assertRaises(ValidationError):
            self.body(action="https://evil.invalid")
        with self.assertRaises(ValidationError):
            CampaignBody(title="Ride", body="Book", kind="service_update", roles=["driver"], action="ride", expires_at=datetime.now(timezone.utc) + timedelta(days=1))
