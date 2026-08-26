from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Dict

from app.database import database
from app.services.profile_photo_service import STORAGE_ROOT as PROFILE_PHOTO_STORAGE_ROOT
from app.utils import now_iso


DELETION_POLICY_VERSION = "2026-08-26"
FINAL_RIDE_STATUSES = {"COMPLETED", "CANCELLED", "EXPIRED"}
ACTIVE_REQUEST_STATUSES = {"pending", "confirmed", "checked_in"}
FINAL_FOOD_STATUSES = {"DELIVERED", "CANCELLED", "REJECTED"}
FINAL_COURIER_STATUSES = {"DELIVERED", "CANCELLED", "FAILED"}


class AccountDeletionBlockedError(ValueError):
    pass


def _upper(value: Any) -> str:
    return str(value or "").strip().upper()


def _restricted_documents(documents: Any, timestamp: str) -> list[Dict[str, Any]]:
    if not isinstance(documents, (list, tuple)):
        return []
    restricted: list[Dict[str, Any]] = []
    for original in documents:
        if not isinstance(original, dict):
            continue
        document = dict(original)
        # Storage location is always server-owned. Historical permanent URLs are
        # not retained as a second access path.
        document.pop("file_url", None)
        document.pop("storage_path", None)
        document["retention_state"] = "restricted_after_account_deletion"
        document["account_deleted_at"] = timestamp
        restricted.append(document)
    return restricted


async def _active_service_blockers(user: Dict[str, Any]) -> list[str]:
    user_id = str(user.get("id") or "")
    blockers: set[str] = set()

    for ride in await database.find_many("rides", {"user_id": user_id}):
        if _upper(ride.get("status") or ride.get("legacy_status")) not in FINAL_RIDE_STATUSES:
            blockers.add("an active Driver trip")

    for request in await database.find_many("ride_requests", {"user_id": user_id}):
        if str(request.get("status") or "").strip().lower() in ACTIVE_REQUEST_STATUSES:
            blockers.add("an active Ride booking")

    for order in await database.find_many("food_orders", {"customer_user_id": user_id}):
        if _upper(order.get("status")) not in FINAL_FOOD_STATUSES:
            blockers.add("an active Food order")

    deliveries = await database.find_many("courier_deliveries")
    for delivery in deliveries:
        if user_id not in {str(delivery.get("sender_user_id") or ""), str(delivery.get("courier_user_id") or "")}:
            continue
        if _upper(delivery.get("status")) not in FINAL_COURIER_STATUSES:
            blockers.add("an active Courier delivery")

    restaurant_ids = {
        str(restaurant.get("id") or "")
        for restaurant in await database.find_many("restaurants", {"owner_user_id": user_id})
        if restaurant.get("id")
    }
    if restaurant_ids:
        for order in await database.find_many("food_orders", {"restaurant_id": {"$in": sorted(restaurant_ids)}}):
            if _upper(order.get("status")) not in FINAL_FOOD_STATUSES:
                blockers.add("an active Merchant order")
                break

    return sorted(blockers)


def _remove_local_profile_photos(user_id: str) -> None:
    root = Path(PROFILE_PHOTO_STORAGE_ROOT).resolve()
    candidate = (root / user_id).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return
    if candidate != root and candidate.is_dir():
        shutil.rmtree(candidate)


async def delete_account(user: Dict[str, Any]) -> Dict[str, Any]:
    """Deactivate an account and de-identify data that is not retained.

    Completed service, safety, support, verification and audit records keep a
    server-only account reference where needed for legal, fraud, dispute and
    safety handling. They are no longer attached to an active public profile.
    """

    if user.get("status") == "deleted":
        return {
            "deleted": True,
            "retention_policy": "limited_legal_safety_security_records",
        }

    blockers = await _active_service_blockers(user)
    if blockers:
        joined = ", ".join(blockers)
        raise AccountDeletionBlockedError(
            f"Finish or cancel {joined} before deleting this account."
        )

    user_id = str(user.get("id") or "")
    timestamp = now_iso()

    _remove_local_profile_photos(user_id)

    # Device/session-adjacent state and convenience data have no retention need.
    await database.delete_many("device_push_tokens", {"user_id": user_id})
    await database.delete_many("notification_preferences", {"user_id": user_id})
    await database.delete_many("app_notifications", {"user_id": user_id})
    await database.delete_many("work_availability", {"user_id": user_id})
    await database.delete_many("courier_shift_bookings", {"courier_user_id": user_id})
    await database.delete_many("courier_online_sessions", {"courier_user_id": user_id})
    await database.delete_many("courier_location_snapshots", {"courier_user_id": user_id})

    # User-authored conversation content is removed while the other participant's
    # copy of the conversation remains structurally valid.
    await database.update_many(
        "messages",
        {"sender_id": user_id},
        {
            "body": "Message removed after account deletion.",
            "sender_deleted": True,
            "account_deleted_at": timestamp,
            "updated_at": timestamp,
        },
    )
    await database.update_many(
        "conversations",
        {"last_message_sender_id": user_id},
        {
            "last_message": "Message removed after account deletion.",
            "updated_at": timestamp,
        },
    )

    # Retained safety/support records keep their case content, but not redundant
    # contact snapshots. The internal user ID remains for restricted audit lookup.
    contact_redaction = {
        "user_name": "Deleted account",
        "user_email": "",
        "user_phone": "",
        "account_deleted_at": timestamp,
        "retention_state": "restricted_case_record",
        "updated_at": timestamp,
    }
    await database.update_many("support_messages", {"user_id": user_id}, contact_redaction)
    await database.update_many("reports", {"user_id": user_id}, contact_redaction)

    await database.update_many(
        "ride_requests",
        {"user_id": user_id},
        {
            "passenger_name": "Deleted account",
            "passenger_phone": "",
            "passenger_profile_photo_url": None,
            "notes": None,
            "account_deleted_at": timestamp,
            "updated_at": timestamp,
        },
    )
    await database.update_many(
        "rides",
        {"user_id": user_id},
        {
            "driver_name": "Deleted account",
            "driver_phone": "",
            "driver_email": "",
            "last_driver_location": None,
            "live_tracking_active": False,
            "live_tracking_enabled": False,
            "account_deleted_at": timestamp,
            "updated_at": timestamp,
        },
    )
    await database.update_many(
        "food_orders",
        {"customer_user_id": user_id},
        {
            "customer_name": "Deleted account",
            "recipient_name": "Deleted account",
            "recipient_phone": "",
            "delivery_address": None,
            "delivery_location": None,
            "notes": None,
            "account_deleted_at": timestamp,
            "updated_at": timestamp,
        },
    )

    linked_delivery_ids: list[str] = []
    for delivery in await database.find_many("courier_deliveries"):
        sender = str(delivery.get("sender_user_id") or "") == user_id
        courier = str(delivery.get("courier_user_id") or "") == user_id
        if not (sender or courier) or not delivery.get("id"):
            continue
        linked_delivery_ids.append(str(delivery["id"]))
        updates: Dict[str, Any] = {
            "account_deleted_at": timestamp,
            "last_courier_location": None,
            "live_tracking_active": False,
            "updated_at": timestamp,
        }
        if sender:
            updates.update(
                {
                    "sender_name": "Deleted account",
                    "sender_phone": "",
                    "recipient_name": "Deleted account",
                    "recipient_phone": "",
                    "pickup_address": None,
                    "pickup_location": None,
                    "dropoff_address": None,
                    "dropoff_location": None,
                    "notes": None,
                }
            )
        if courier:
            updates["courier_name"] = "Deleted account"
        await database.update_one("courier_deliveries", str(delivery["id"]), updates)
    for delivery_id in linked_delivery_ids:
        await database.delete_many("delivery_handoffs", {"delivery_id": delivery_id})

    driver_rows = await database.find_many("drivers", {"user_id": user_id})
    for driver in driver_rows:
        await database.update_one(
            "drivers",
            str(driver["id"]),
            {
                "name": "Deleted account",
                "phone": "",
                "email": "",
                "city": "",
                "status": "deleted",
                "verified": False,
                "documents": _restricted_documents(driver.get("documents"), timestamp),
                "account_deleted_at": timestamp,
                "retention_state": "restricted_verification_record",
                "updated_at": timestamp,
            },
        )
        await database.update_many(
            "vehicles",
            {"driver_id": str(driver["id"])},
            {
                "owner_name": "",
                "registration_number": "",
                "license_plate": "",
                "plate_number": "",
                "status": "deleted",
                "account_deleted_at": timestamp,
                "updated_at": timestamp,
            },
        )

    await database.update_many(
        "driver_applications",
        {"user_id": user_id},
        {
            "name": "Deleted account",
            "phone": "",
            "city": "",
            "status": "withdrawn",
            "account_deleted_at": timestamp,
            "retention_state": "restricted_application_record",
            "updated_at": timestamp,
        },
    )

    for application in await database.find_many("worker_applications", {"user_id": user_id}):
        await database.update_one(
            "worker_applications",
            str(application["id"]),
            {
                "full_name": "Deleted account",
                "account_email": "",
                "email": "",
                "phone": "",
                "city": "",
                "service_area": "",
                "status": "WITHDRAWN",
                "documents": _restricted_documents(application.get("documents"), timestamp),
                "account_deleted_at": timestamp,
                "retention_state": "restricted_application_record",
                "updated_at": timestamp,
            },
        )

    await database.update_many(
        "courier_profiles",
        {"user_id": user_id},
        {
            "name": "Deleted account",
            "phone": "",
            "email": "",
            "service_area": "",
            "online": False,
            "active_delivery_id": None,
            "status": "DELETED",
            "account_deleted_at": timestamp,
            "updated_at": timestamp,
        },
    )

    await database.update_many(
        "restaurants",
        {"owner_user_id": user_id},
        {
            "status": "INACTIVE",
            "is_accepting_orders": False,
            "owner_name": "Deleted account",
            "owner_email": "",
            "owner_phone": "",
            "registration_number": "",
            "legal_address": "",
            "account_deleted_at": timestamp,
            "updated_at": timestamp,
        },
    )

    deleted_user = await database.update_one(
        "users",
        user_id,
        {
            "name": "Deleted account",
            "phone": "",
            "email": "",
            "pending_email": None,
            "normalized_email": None,
            "city": None,
            "bio": None,
            "travel_preferences": None,
            "profile_photo_url": None,
            "profile_photo_name": None,
            "email_verified": False,
            "password_hash": "",
            "password_salt": "",
            "password_scheme": None,
            "password_iterations": None,
            "email_verification_code_hash": "",
            "email_verification_salt": "",
            "reset_code_hash": "",
            "reset_salt": "",
            "token": "",
            "token_issued_at": None,
            "token_expires_at": None,
            "sessions_revoked_at": timestamp,
            "notification_trip_updates": False,
            "notification_booking_requests": False,
            "notification_support_replies": False,
            "notification_safety_alerts": False,
            "notification_marketing": False,
            "status": "deleted",
            "account_deletion_state": "deidentified_with_limited_retention",
            "deletion_policy_version": DELETION_POLICY_VERSION,
            "deleted_at": timestamp,
            "updated_at": timestamp,
        },
    )
    if not deleted_user:
        raise RuntimeError("Account deletion could not be completed.")

    return {
        "deleted": True,
        "retention_policy": "limited_legal_safety_security_records",
    }
