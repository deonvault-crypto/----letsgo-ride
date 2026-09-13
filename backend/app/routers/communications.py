from datetime import datetime, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.auth import get_current_user
from app.database import database
from app.models.communications import AppReleaseBody, CampaignBody, CampaignRevision
from app.ops_auth import effective_ops_role, get_ops_admin, get_ops_manager, get_ops_user
from app.services.audit_service import write_audit_log
from app.services.communications_service import STORE_URLS, audience_filter, campaign_metrics
from app.utils import api_error, api_success, new_id, now_iso

router = APIRouter(tags=["communications"])

HARARE_TZ = ZoneInfo("Africa/Harare")
ENGAGEMENT_OFFSETS_DAYS = (0, 3, 7, 12)
ENGAGEMENT_MESSAGES = (
    (
        "Keep LetsGoRide close 🚗",
        "Need to move, send, order or earn? Open LetsGoRide and see what’s available when you need it.",
    ),
    (
        "Where are you headed next? 📍",
        "LetsGoRide is ready when you are. Open the app and keep moving.",
    ),
    (
        "Your next move starts here",
        "Rides, deliveries and more are waiting when you need them. Open LetsGoRide anytime.",
    ),
    (
        "Still going places? 🚗",
        "LetsGoRide is here for your next trip, delivery or order whenever you’re ready.",
    ),
)


class EngagementSeriesBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    roles: list[Literal["passenger", "driver", "courier", "merchant"]] = Field(
        default_factory=lambda: ["passenger"], min_length=1, max_length=4
    )
    send_hour: int = Field(default=17, ge=8, le=20)


def public_campaign(row):
    return {key: value for key, value in row.items() if key not in {"_id", "lease", "cursor"}}


async def audit(actor, action, target, metadata=None):
    await write_audit_log(actor_user_id=actor["id"], actor_role="ops:" + effective_ops_role(actor),
        action="ops_communications_" + action, target_type="communication", target_id=target, metadata=metadata or {})


def campaign_data(payload):
    data = payload.model_dump(mode="json")
    data["expires_at"] = payload.expires_at.isoformat()
    data["scheduled_at"] = payload.scheduled_at.isoformat() if payload.scheduled_at else None
    return data


async def campaign_or_404(campaign_id):
    row = await database.find_one("ops_campaigns", {"id": campaign_id})
    if not row:
        api_error("Announcement not found.", 404)
    return row


def _next_harare_send(hour: int) -> datetime:
    now_local = datetime.now(timezone.utc).astimezone(HARARE_TZ)
    candidate = now_local.replace(hour=hour, minute=0, second=0, microsecond=0)
    if candidate <= now_local + timedelta(minutes=15):
        candidate += timedelta(days=1)
    return candidate.astimezone(timezone.utc)


@router.get("/ops/communications")
async def list_campaigns(limit: int = Query(default=50, ge=1, le=100), user=Depends(get_ops_user)):
    rows = await database.find_many("ops_campaigns", sort=[("created_at", -1)], limit=limit)
    return api_success([public_campaign(row) for row in rows])


@router.post("/ops/communications")
async def create_campaign(payload: CampaignBody, user=Depends(get_ops_manager)):
    stamp = now_iso()
    row = {**campaign_data(payload), "id": new_id(), "revision": 1, "status": "draft",
           "created_at": stamp, "updated_at": stamp, "created_by": user["id"], "processed_count": 0, "skipped_count": 0}
    await audit(user, "draft_created", row["id"], {"kind": row["kind"], "revision": 1})
    return api_success(public_campaign(await database.insert_one("ops_campaigns", row)))


@router.post("/ops/communications/engagement-series")
async def schedule_engagement_series(payload: EngagementSeriesBody, user=Depends(get_ops_admin)):
    active = await database.find_many(
        "ops_campaigns",
        {"status": {"$in": ["queued", "sending"]}},
        sort=[("created_at", -1)],
        limit=100,
    )
    if any(row.get("engagement_series_id") for row in active):
        api_error("A re-engagement series is already scheduled. Cancel it before creating another one.", 409)

    stamp = now_iso()
    series_id = new_id()
    start = _next_harare_send(payload.send_hour)
    roles = sorted(set(payload.roles))
    created = []

    for sequence, (offset_days, copy) in enumerate(zip(ENGAGEMENT_OFFSETS_DAYS, ENGAGEMENT_MESSAGES), start=1):
        scheduled = start + timedelta(days=offset_days)
        campaign_id = new_id()
        row = {
            "id": campaign_id,
            "revision": 1,
            "status": "queued",
            "kind": "marketing",
            "roles": roles,
            "user_ids": [],
            "title": copy[0],
            "body": copy[1],
            "action": "none",
            "push": True,
            "scheduled_at": scheduled.isoformat(),
            "expires_at": (scheduled + timedelta(hours=36)).isoformat(),
            "created_at": stamp,
            "updated_at": stamp,
            "created_by": user["id"],
            "published_by": user["id"],
            "published_at": stamp,
            "audience_cutoff": scheduled.isoformat(),
            "priority": 0,
            "next_attempt_at": scheduled.isoformat(),
            "processed_count": 0,
            "skipped_count": 0,
            "engagement_series_id": series_id,
            "engagement_sequence": sequence,
        }
        created.append(public_campaign(await database.insert_one("ops_campaigns", row)))

    await audit(user, "engagement_series_scheduled", series_id, {
        "roles": roles,
        "send_hour_harare": payload.send_hour,
        "campaign_ids": [row["id"] for row in created],
        "marketing_requires_consent": True,
    })
    return api_success({
        "series_id": series_id,
        "timezone": "Africa/Harare",
        "marketing_requires_consent": True,
        "campaigns": created,
    })


@router.post("/ops/communications/engagement-series/{series_id}/cancel")
async def cancel_engagement_series(series_id: str, user=Depends(get_ops_admin)):
    rows = await database.find_many("ops_campaigns", {"engagement_series_id": series_id}, limit=20)
    if not rows:
        api_error("Re-engagement series not found.", 404)
    cancelled = 0
    for row in rows:
        if row.get("status") not in {"draft", "queued", "sending"}:
            continue
        updated = await database.update_one_if(
            "ops_campaigns",
            {"id": row["id"], "status": {"$in": ["draft", "queued", "sending"]}},
            {"status": "cancelled", "updated_at": now_iso(), "cancelled_by": user["id"]},
        )
        cancelled += int(updated is not None)
    await audit(user, "engagement_series_cancelled", series_id, {"cancelled_campaigns": cancelled})
    return api_success({"series_id": series_id, "cancelled_campaigns": cancelled})


@router.patch("/ops/communications/{campaign_id}")
async def edit_campaign(campaign_id: str, payload: CampaignBody, revision: int = Query(ge=1), user=Depends(get_ops_manager)):
    await campaign_or_404(campaign_id)
    row = await database.update_one_if("ops_campaigns", {"id": campaign_id, "status": "draft", "revision": revision},
        {**campaign_data(payload), "revision": revision + 1, "updated_at": now_iso(), "updated_by": user["id"]})
    if not row:
        api_error("This draft changed or was already queued. Refresh before editing.", 409)
    await audit(user, "draft_edited", campaign_id, {"revision": row["revision"]})
    return api_success(public_campaign(row))


@router.get("/ops/communications/{campaign_id}")
async def campaign_detail(campaign_id: str, user=Depends(get_ops_user)):
    row = await campaign_or_404(campaign_id)
    return api_success({"campaign": public_campaign(row), "metrics": await campaign_metrics(campaign_id)})


@router.get("/ops/communications/{campaign_id}/preview")
async def preview_campaign(campaign_id: str, user=Depends(get_ops_manager)):
    row = await campaign_or_404(campaign_id)
    count = await database.count("users", audience_filter(row))
    return api_success({"campaign": public_campaign(row), "matching_accounts": count,
        "marketing_requires_consent": row["kind"] == "marketing",
        "push_requires_device_permission": row["push"]})


@router.post("/ops/communications/{campaign_id}/publish")
async def publish_campaign(campaign_id: str, payload: CampaignRevision, user=Depends(get_ops_admin)):
    current = await campaign_or_404(campaign_id)
    if current["revision"] != payload.revision:
        api_error("The draft changed. Preview the current version before publishing.", 409)
    if current["status"] != "draft":
        return api_success(public_campaign(current))
    stamp = now_iso()
    if current["expires_at"] <= stamp:
        api_error("This announcement has expired.", 409)
    # Approval is recorded before the durable queue becomes visible to a worker.
    await audit(user, "publish_requested", campaign_id, {"revision": payload.revision, "kind": current["kind"]})
    row = await database.update_one_if("ops_campaigns", {"id": campaign_id, "status": "draft", "revision": payload.revision},
        {"status": "queued", "published_by": user["id"], "published_at": stamp, "audience_cutoff": stamp,
         "priority": 100 if current["kind"] == "safety_alert" else 0,
         "next_attempt_at": max(current.get("scheduled_at") or stamp, stamp), "updated_at": stamp})
    if row is None:
        row = await campaign_or_404(campaign_id)
        if row["status"] == "draft":
            api_error("The draft changed. Preview the current version before publishing.", 409)
    return api_success(public_campaign(row))


@router.post("/ops/communications/{campaign_id}/cancel")
async def cancel_campaign(campaign_id: str, user=Depends(get_ops_admin)):
    await campaign_or_404(campaign_id)
    await audit(user, "cancel_requested", campaign_id)
    row = await database.update_one_if("ops_campaigns", {"id": campaign_id, "status": {"$in": ["draft", "queued", "sending"]}},
        {"status": "cancelled", "updated_at": now_iso(), "cancelled_by": user["id"]})
    return api_success(public_campaign(row or await campaign_or_404(campaign_id)))


@router.get("/app-updates")
async def app_updates(user=Depends(get_current_user)):
    rows = await database.find_many("app_releases", {"available_in_store": True}, limit=2)
    return api_success([{key: row[key] for key in ("platform", "version", "notes", "store_url", "updated_at")} for row in rows])


@router.get("/ops/app-updates")
async def ops_app_updates(user=Depends(get_ops_manager)):
    return api_success(await database.find_many("app_releases", limit=2))


@router.post("/ops/app-updates")
async def save_app_release(payload: AppReleaseBody, user=Depends(get_ops_admin)):
    row = {**payload.model_dump(), "id": payload.platform, "store_url": STORE_URLS[payload.platform],
           "updated_at": now_iso(), "updated_by": user["id"]}
    await audit(user, "store_release_updated", payload.platform,
        {"version": payload.version, "available_in_store": payload.available_in_store, "reason": payload.reason})
    if database.db is not None:
        await database.db["app_releases"].update_one({"id": payload.platform}, {"$set": row}, upsert=True)
    elif await database.find_one("app_releases", {"id": payload.platform}):
        await database.update_one("app_releases", payload.platform, row)
    else:
        await database.insert_one("app_releases", row)
    return api_success(row)