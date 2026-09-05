import asyncio
import logging
from typing import Any, Dict, Optional

from fastapi import Header, Request

from app.database import database
from app.services.auth_service import find_user_by_token
from app.utils import api_error, now_iso


logger = logging.getLogger(__name__)
INACTIVE_ACCOUNT_STATUSES = {"deleted", "suspended"}
OPEN_WORKER_APPLICATION_STATUSES = {"DRAFT", "SUBMITTED", "UNDER_REVIEW"}


async def get_optional_current_user(
    authorization: str = Header(default=""),
) -> Optional[Dict[str, Any]]:
    token = authorization.replace("Bearer", "").strip()
    if not token:
        return None
    return await find_user_by_token(token)


async def reconcile_inactive_account_access(user_id: str) -> None:
    """Revoke session/push access after an administrator disables an account.

    Admin account-status changes intentionally remain a small status mutation in
    the admin router. This reconciliation closes the security-adjacent state that
    must never survive a suspend/delete action. Deleted applicants keep their
    historical application record, but open applications are withdrawn so they
    cannot remain actionable in Operations.
    """
    user = await database.find_one("users", {"id": user_id})
    if not user:
        return

    status = str(user.get("status") or "active").strip().lower()
    if status not in INACTIVE_ACCOUNT_STATUSES:
        return

    timestamp = now_iso()
    if (
        user.get("token")
        or user.get("token_issued_at") is not None
        or user.get("token_expires_at") is not None
        or not user.get("sessions_revoked_at")
    ):
        await database.update_one(
            "users",
            user_id,
            {
                "token": "",
                "token_issued_at": None,
                "token_expires_at": None,
                "sessions_revoked_at": timestamp,
                "updated_at": timestamp,
            },
        )

    await database.update_many(
        "device_push_tokens",
        {"user_id": user_id, "active": True},
        {"active": False, "updated_at": timestamp},
    )

    if status == "deleted":
        await database.update_many(
            "worker_applications",
            {
                "user_id": user_id,
                "status": {"$in": sorted(OPEN_WORKER_APPLICATION_STATUSES)},
            },
            {
                "status": "WITHDRAWN",
                "review_note": "Application withdrawn because the applicant account was deleted.",
                "retention_state": "restricted_application_record",
                "updated_at": timestamp,
            },
        )


async def _reconcile_after_admin_status_change(user_id: str, intended_status: str) -> None:
    """Wait for the status route to commit, then reconcile related access state."""
    try:
        for delay in (0.05, 0.15, 0.40, 0.80):
            await asyncio.sleep(delay)
            user = await database.find_one("users", {"id": user_id})
            if not user:
                return
            actual_status = str(user.get("status") or "active").strip().lower()
            if actual_status == intended_status:
                await reconcile_inactive_account_access(user_id)
                return
            if actual_status in INACTIVE_ACCOUNT_STATUSES:
                # Another administrator may have changed the inactive state while
                # this request was completing. Reconcile the state that actually
                # won rather than forcing the requested state.
                await reconcile_inactive_account_access(user_id)
                return
    except Exception as exc:
        logger.warning(
            "admin_account_access_reconciliation status=failed user_id=%s error_type=%s",
            user_id,
            type(exc).__name__,
        )


async def _enforce_worker_photo_for_new_work(request: Optional[Request], user: Dict[str, Any]) -> None:
    if request is None or user.get("profile_photo_verified") is True:
        return

    path = request.url.path.rstrip("/")
    if user.get("role") == "driver" and path == "/hailing/driver/online":
        api_error("An approved Driver profile photo is required before going online for Ride Now.", 403)

    if user.get("role") == "courier" and path == "/operations/courier/online":
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        # Never block an unverified worker from going offline. The requirement
        # applies only when starting a new online work session.
        if payload.get("online") is True:
            api_error("An approved Courier profile photo is required before going online for deliveries.", 403)


async def get_current_user(
    authorization: str = Header(default=""),
    request: Request = None,
) -> Dict[str, Any]:
    user = await get_optional_current_user(authorization)
    if not user:
        api_error("Sign in before continuing.", 401)
    await _enforce_worker_photo_for_new_work(request, user)
    return user


async def get_admin_user(
    authorization: str = Header(default=""),
    request: Request = None,
) -> Dict[str, Any]:
    user = await get_current_user(authorization, request)
    if user.get("role") != "admin":
        api_error("Admin access is required.", 403)

    # A protected administrator must never be able to invalidate the same
    # credential that authorizes this request. The People workspace can manage
    # other accounts, but self-suspension/self-deletion would immediately lock
    # the only active operator out of Ops. Keep this guard at the auth boundary
    # so it remains effective even if a future UI accidentally exposes the action.
    if request is not None and request.method.upper() == "PATCH":
        path = request.url.path.rstrip("/")
        own_status_path = f"/admin/users/{user.get('id')}/status"
        if path == own_status_path:
            api_error("You cannot suspend or delete your own administrator account.", 400)

        parts = path.split("/")
        if len(parts) == 5 and parts[1:3] == ["admin", "users"] and parts[4] == "status":
            intended_status = str(request.query_params.get("status") or "").strip().lower()
            target_user_id = parts[3]
            if target_user_id and intended_status in INACTIVE_ACCOUNT_STATUSES:
                # The dependency runs before the status mutation. Reconcile just
                # after the route commits instead of duplicating the admin route.
                asyncio.create_task(
                    _reconcile_after_admin_status_change(target_user_id, intended_status)
                )

    return user
