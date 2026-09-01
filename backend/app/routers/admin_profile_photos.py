from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.auth import get_admin_user
from app.database import database
from app.services.audit_service import write_audit_log
from app.services.notification_service import create_app_notification
from app.services.profile_photo_service import delete_profile_photo_asset
from app.utils import api_error, api_success, now_iso


router = APIRouter(prefix="/admin/profile-photos", tags=["admin-profile-photos"])
WORKER_ROLES = {"driver", "courier"}


class ProfilePhotoReviewBody(BaseModel):
    status: Literal["approved", "rejected"]
    reason: Optional[str] = None


def _review_candidate(user):
    pending_url = user.get("profile_photo_pending_url")
    if pending_url:
        return {
            "candidate_url": pending_url,
            "candidate_name": user.get("profile_photo_pending_name"),
            "cloudinary_public_id": user.get("profile_photo_pending_cloudinary_public_id"),
            "resource_type": user.get("profile_photo_pending_resource_type"),
            "delivery_type": user.get("profile_photo_pending_delivery_type"),
            "version": user.get("profile_photo_pending_version"),
            "review_status": user.get("profile_photo_review_status") or "pending",
            "is_replacement": user.get("profile_photo_verified") is True and bool(user.get("profile_photo_url")),
        }

    # Existing worker photos created before moderation are treated as legacy
    # unreviewed candidates rather than silently trusted.
    if user.get("profile_photo_url") and user.get("profile_photo_verified") is not True:
        return {
            "candidate_url": user.get("profile_photo_url"),
            "candidate_name": user.get("profile_photo_name"),
            "cloudinary_public_id": user.get("profile_photo_cloudinary_public_id"),
            "resource_type": user.get("profile_photo_resource_type"),
            "delivery_type": user.get("profile_photo_delivery_type"),
            "version": user.get("profile_photo_version"),
            "review_status": user.get("profile_photo_review_status") or "pending",
            "is_replacement": False,
        }
    return None


def _public_candidate(user, candidate):
    return {
        "user_id": user.get("id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
        "city": user.get("city"),
        "candidate_url": candidate.get("candidate_url"),
        "current_approved_url": user.get("profile_photo_url") if user.get("profile_photo_verified") is True else None,
        "profile_photo_verified": user.get("profile_photo_verified") is True,
        "review_status": candidate.get("review_status"),
        "rejection_reason": user.get("profile_photo_rejection_reason"),
        "submitted_at": user.get("profile_photo_submitted_at") or user.get("updated_at"),
        "is_replacement": bool(candidate.get("is_replacement")),
    }


@router.get("")
async def list_worker_profile_photos(
    status: str = Query(default="pending"),
    limit: int = Query(default=80, ge=1, le=200),
    admin=Depends(get_admin_user),
):
    candidate_filter = {
        "role": {"$in": sorted(WORKER_ROLES)},
        "$or": [
            {"profile_photo_pending_url": {"$exists": True, "$ne": None}},
            {
                "profile_photo_url": {"$exists": True, "$ne": None},
                "profile_photo_verified": {"$ne": True},
            },
        ],
    }
    rows = await database.find_many(
        "users",
        candidate_filter,
        sort=[("profile_photo_submitted_at", -1), ("updated_at", -1)],
        limit=min(200, max(limit * 3, 80)),
    )
    items = []
    for user in rows:
        candidate = _review_candidate(user)
        if not candidate:
            continue
        review_status = str(candidate.get("review_status") or "pending")
        if status and review_status != status:
            continue
        items.append(_public_candidate(user, candidate))
    items.sort(key=lambda item: item.get("submitted_at") or "", reverse=True)
    return api_success({"count": len(items[:limit]), "items": items[:limit]})


@router.patch("/{user_id}")
async def review_worker_profile_photo(
    user_id: str,
    payload: ProfilePhotoReviewBody,
    admin=Depends(get_admin_user),
):
    user = await database.find_one("users", {"id": user_id})
    if not user or user.get("role") not in WORKER_ROLES:
        api_error("Worker profile photo submission not found.", 404)

    candidate = _review_candidate(user)
    if not candidate:
        api_error("No profile photo is waiting for review.", 409)
    if payload.status == "rejected" and not (payload.reason or "").strip():
        api_error("A rejection reason is required.", 400)

    timestamp = now_iso()
    replacement = bool(candidate.get("is_replacement"))
    updates = {
        "profile_photo_review_status": payload.status,
        "profile_photo_reviewed_at": timestamp,
        "profile_photo_reviewed_by": admin.get("id"),
        "profile_photo_rejection_reason": (payload.reason or "").strip() or None,
        "profile_photo_pending_url": None,
        "profile_photo_pending_name": None,
        "profile_photo_pending_cloudinary_public_id": None,
        "profile_photo_pending_resource_type": None,
        "profile_photo_pending_delivery_type": None,
        "profile_photo_pending_version": None,
        "updated_at": timestamp,
    }

    if payload.status == "approved":
        updates.update(
            {
                "profile_photo_url": candidate["candidate_url"],
                "profile_photo_name": candidate.get("candidate_name") or user.get("profile_photo_name"),
                "profile_photo_cloudinary_public_id": candidate.get("cloudinary_public_id"),
                "profile_photo_resource_type": candidate.get("resource_type"),
                "profile_photo_delivery_type": candidate.get("delivery_type"),
                "profile_photo_version": candidate.get("version"),
                "profile_photo_verified": True,
                "profile_photo_rejection_reason": None,
            }
        )
    elif not replacement:
        updates.update(
            {
                "profile_photo_url": None,
                "profile_photo_name": None,
                "profile_photo_verified": False,
            }
        )

    updated = await database.update_one("users", user_id, updates) or {**user, **updates}
    candidate_public_id = candidate.get("cloudinary_public_id")
    previous_public_id = user.get("profile_photo_cloudinary_public_id")
    if payload.status == "rejected" and candidate_public_id:
        await delete_profile_photo_asset(str(candidate_public_id))
    elif payload.status == "approved" and replacement and previous_public_id and previous_public_id != candidate_public_id:
        await delete_profile_photo_asset(str(previous_public_id))
    role_label = "Driver" if user.get("role") == "driver" else "Courier"
    if payload.status == "approved":
        title = "Profile photo approved"
        body = f"Your {role_label} profile photo is approved."
    else:
        title = "Profile photo needs another try"
        body = f"Your {role_label} profile photo was not approved: {(payload.reason or '').strip()}"

    await create_app_notification(
        user_id,
        "profile_photo_review",
        title,
        body,
        {
            "notification_target": "worker_profile_photo",
            "profile_photo_review_status": payload.status,
            "worker_role": user.get("role"),
        },
    )
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action=f"worker_profile_photo_{payload.status}",
        target_type="user",
        target_id=user_id,
        metadata={"role": user.get("role"), "reason": (payload.reason or "").strip() or None},
    )

    return api_success(
        {
            "user_id": user_id,
            "role": updated.get("role"),
            "profile_photo_url": updated.get("profile_photo_url"),
            "profile_photo_verified": updated.get("profile_photo_verified") is True,
            "review_status": updated.get("profile_photo_review_status"),
            "rejection_reason": updated.get("profile_photo_rejection_reason"),
        }
    )
