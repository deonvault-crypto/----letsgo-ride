"""Durable, bounded campaign fan-out. No request starts a bulk send."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import NAMESPACE_URL, uuid5

from pymongo.errors import DuplicateKeyError

from app.database import database
from app.models.event import RealtimeAudience
from app.services.event_service import realtime_event_service
from app.services.notification_service import _send_push_for_notification, get_or_create_preferences
from app.utils import new_id, now_iso

logger = logging.getLogger(__name__)
for collection in ("ops_campaigns", "app_releases"):
    database.memory.setdefault(collection, [])

STORE_URLS = {
    "ios": "https://apps.apple.com/app/id6772862281",
    "android": "https://play.google.com/store/apps/details?id=com.letsgo.ride",
}


async def ensure_communications_indexes():
    if database.db is None:
        return
    await database.db["ops_campaigns"].create_index([("id", 1)], unique=True, name="campaign_id_unique")
    await database.db["ops_campaigns"].create_index([("status", 1), ("priority", -1), ("next_attempt_at", 1)], name="campaign_due_work")
    await database.db["app_notifications"].create_index(
        [("campaign_delivery_id", 1)], unique=True, name="campaign_delivery_unique",
        partialFilterExpression={"campaign_delivery_id": {"$type": "string"}},
    )
    await database.db["app_notifications"].create_index([("campaign_id", 1), ("push_status", 1)], name="campaign_delivery_status")
    await database.db["app_releases"].create_index([("id", 1)], unique=True, name="app_release_platform_unique")


def audience_filter(campaign, *, cursor=False):
    query = {"role": {"$in": campaign["roles"]}, "status": {"$nin": ["suspended", "deleted"]}}
    if campaign.get("user_ids"):
        query["id"] = {"$in": campaign["user_ids"]}
    if cursor and campaign.get("cursor"):
        query.setdefault("id", {})["$gt"] = campaign["cursor"]
    if campaign.get("audience_cutoff"):
        query["$or"] = [{"created_at": {"$lte": campaign["audience_cutoff"]}}, {"created_at": {"$exists": False}}]
    return query


def marketing_allowed(prefs):
    return prefs.get("marketing_messages") is True and prefs.get("marketing_consent_version") == 1


async def publish_notification_signal(notification):
    try:
        await realtime_event_service.publish(realtime_event_service.build_event(
            event_type="notification.created", resource_type="notification", resource_id=notification["id"], version=1,
            audience=RealtimeAudience(user_ids=frozenset({notification["user_id"]})),
            payload={"notification_id": notification["id"]},
        ))
    except Exception:
        logger.warning("notification_realtime_unavailable notification_id=%s", notification["id"])


async def publish_campaign_signal(campaign_id):
    try:
        staff = await database.find_many("ops_staff", {"enabled": {"$ne": False}}, limit=500)
        await realtime_event_service.publish(realtime_event_service.build_event(
            event_type="communications.changed", resource_type="campaign", resource_id=campaign_id,
            version=int(datetime.now(timezone.utc).timestamp() * 1000000),
            audience=RealtimeAudience(roles=frozenset({"admin"}), user_ids=frozenset(row["user_id"] for row in staff if row.get("user_id"))),
            payload={"campaign_id": campaign_id},
        ))
    except Exception:
        logger.warning("campaign_realtime_unavailable campaign_id=%s", campaign_id)


async def deliver_campaign_recipient(campaign, user):
    # Recheck consent at delivery, not just in the draft preview.
    prefs = await get_or_create_preferences(user["id"])
    if campaign["kind"] == "marketing" and not marketing_allowed(prefs):
        return "skipped"
    delivery_id = str(uuid5(NAMESPACE_URL, "letsgoride:campaign:" + campaign["id"] + ":" + user["id"]))
    existing = await database.find_one("app_notifications", {"campaign_delivery_id": delivery_id})
    if existing:
        # Never repeat a push whose outcome could have been lost after provider acceptance.
        await database.update_one_if("app_notifications", {"id": delivery_id, "push_status": "sending"}, {"push_status": "unknown"})
        return "existing"
    stamp = now_iso()
    item = {
        "_id": delivery_id, "id": delivery_id, "campaign_delivery_id": delivery_id,
        "campaign_id": campaign["id"], "user_id": user["id"], "type": campaign["kind"],
        "title": campaign["title"], "body": campaign["body"], "read": False,
        "created_at": stamp, "updated_at": stamp, "expires_at": campaign["expires_at"],
        "delivered_push": False, "push_status": "sending" if campaign["push"] else "inbox_only",
        "data": {"notification_target": "announcement", "notification_id": delivery_id,
                 "recipient_user_id": user["id"], "action": campaign["action"]},
    }
    try:
        await database.insert_one("app_notifications", item)
    except DuplicateKeyError:
        return "existing"
    await publish_notification_signal(item)
    if campaign["push"]:
        try:
            # Push payload remains small; the protected inbox holds the full text.
            result = await _send_push_for_notification({**item, "body": item["body"][:220]})
        except Exception:
            result = {"delivered_push": False, "push_status": "unknown"}
        await database.update_one("app_notifications", delivery_id, {**result, "updated_at": now_iso()})
    return "created"


async def process_campaign_batch():
    stamp = now_iso()
    lease = new_id()
    deadline = (datetime.now(timezone.utc) + timedelta(seconds=90)).isoformat()
    due = await database.find_many("ops_campaigns",
        {"status": {"$in": ["queued", "sending"]}, "next_attempt_at": {"$lte": stamp}},
        sort=[("priority", -1), ("next_attempt_at", 1)], limit=1)
    if not due:
        return False
    campaign = await database.update_one_if(
        "ops_campaigns", {"id": due[0]["id"], "status": {"$in": ["queued", "sending"]}, "next_attempt_at": {"$lte": stamp}},
        {"status": "sending", "lease": lease, "next_attempt_at": deadline, "updated_at": stamp},
    )
    if not campaign:
        return False
    guard = {"id": campaign["id"], "lease": lease, "status": "sending"}
    if campaign["expires_at"] <= stamp:
        await database.update_one_if("ops_campaigns", guard, {"status": "expired", "updated_at": stamp})
        await publish_campaign_signal(campaign["id"])
        return True
    users = await database.find_many("users", audience_filter(campaign, cursor=True), sort=[("id", 1)], limit=5)
    if not users:
        await database.update_one_if("ops_campaigns", guard, {"status": "completed", "completed_at": stamp, "updated_at": stamp})
        await publish_campaign_signal(campaign["id"])
        return True
    for user in users:
        current = await database.find_one("ops_campaigns", guard)
        if not current or current["expires_at"] <= now_iso():
            break
        # A profile may have been suspended after this batch was selected.
        fresh = await database.find_one("users", {**audience_filter(campaign), "id": user["id"]})
        outcome = await deliver_campaign_recipient(campaign, fresh) if fresh else "skipped"
        updated = await database.update_one_atomic("ops_campaigns", guard,
            {"cursor": user["id"], "updated_at": now_iso()},
            {"processed_count": 1, "skipped_count": int(outcome == "skipped")})
        if not updated:
            return True
    await database.update_one_if("ops_campaigns", guard, {"next_attempt_at": now_iso(), "updated_at": now_iso()})
    await publish_campaign_signal(campaign["id"])
    return True


async def communications_worker(stop_event):
    while not stop_event.is_set():
        try:
            await process_campaign_batch()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("communications_batch_failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=2)
        except asyncio.TimeoutError:
            pass


async def campaign_metrics(campaign_id):
    query = {"campaign_id": campaign_id}
    if database.db is None:
        counts = await asyncio.gather(
            database.count("app_notifications", query),
            database.count("app_notifications", {**query, "delivered_push": True}),
            database.count("app_notifications", {**query, "read": True}),
            database.count("app_notifications", {**query, "push_status": {"$in": ["unknown", "sending"]}}),
            database.count("app_notifications", {**query, "push_status": {"$nin": ["inbox_only", "disabled_by_preference", "no_active_tokens", "expo_ticket_success", "expo_partial_failure", "sending", "unknown"]}}),
        )
        return dict(zip(("inbox_created", "push_accepted", "read", "push_unknown", "push_failed"), counts))

    rows = await database.db["app_notifications"].aggregate([
        {"$match": query},
        {"$group": {
            "_id": None,
            "inbox_created": {"$sum": 1},
            "push_accepted": {"$sum": {"$cond": [{"$eq": ["$delivered_push", True]}, 1, 0]}},
            "read": {"$sum": {"$cond": [{"$eq": ["$read", True]}, 1, 0]}},
            "push_unknown": {"$sum": {"$cond": [{"$in": ["$push_status", ["unknown", "sending"]]}, 1, 0]}},
            "push_failed": {"$sum": {"$cond": [{"$not": [{"$in": ["$push_status", ["inbox_only", "disabled_by_preference", "no_active_tokens", "expo_ticket_success", "expo_partial_failure", "sending", "unknown"]]}]}, 1, 0]}},
        }},
        {"$project": {"_id": 0}},
    ]).to_list(length=1)
    if rows:
        return rows[0]
    return {"inbox_created": 0, "push_accepted": 0, "read": 0, "push_unknown": 0, "push_failed": 0}
