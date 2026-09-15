from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from pymongo.errors import DuplicateKeyError

from app.database import database
from app.services.audit_service import write_audit_log
from app.utils import new_id, now_iso


def _user_id(user: Dict[str, Any]) -> str:
    return str(user.get("id") or "")


def _parse_datetime(value: Any) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("A valid date and time is required.")
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Use a valid ISO date and time.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _shift_status(shift: Dict[str, Any], now: datetime) -> str:
    if not shift.get("active"):
        return "INACTIVE"
    if _parse_datetime(shift.get("ends_at")) <= now:
        return "COMPLETED"
    if _parse_datetime(shift.get("starts_at")) <= now:
        return "IN_PROGRESS"
    return "UPCOMING"


def public_shift(shift: Dict[str, Any], now: datetime | None = None) -> Dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    result = dict(shift)
    capacity = max(0, int(shift.get("capacity") or 0))
    booked = max(0, int(shift.get("booked_count") or 0))
    result["remaining_places"] = max(0, capacity - booked)
    result["status"] = _shift_status(shift, now)
    result["booking_open"] = (
        result["status"] == "UPCOMING"
        and result["remaining_places"] > 0
        and now < _parse_datetime(shift.get("starts_at")) - timedelta(minutes=int(shift.get("booking_cutoff_minutes") or 0))
    )
    return result


async def create_courier_shift(payload: Dict[str, Any], admin: Dict[str, Any]) -> Dict[str, Any]:
    if admin.get("role") != "admin":
        raise PermissionError("Administrator access is required.")
    starts_at = _parse_datetime(payload.get("starts_at"))
    ends_at = _parse_datetime(payload.get("ends_at"))
    if ends_at <= starts_at:
        raise ValueError("Shift end must be later than shift start.")
    if starts_at <= datetime.now(timezone.utc):
        raise ValueError("New shifts must start in the future.")
    now = now_iso()
    shift = {
        "id": new_id(),
        "booked_count": 0,
        "created_by_user_id": _user_id(admin),
        "created_at": now,
        "updated_at": now,
        **payload,
        "starts_at": starts_at.isoformat(),
        "ends_at": ends_at.isoformat(),
        "incentive_usd": round(float(payload["incentive_usd"]), 2) if payload.get("incentive_usd") is not None else None,
    }
    saved = await database.insert_one("courier_shifts", shift)
    await write_audit_log(actor_user_id=_user_id(admin), actor_role="admin", action="courier_shift_created", target_type="courier_shift", target_id=saved["id"], metadata={"zone": saved.get("zone")})
    return public_shift(saved)


async def update_courier_shift(shift_id: str, payload: Dict[str, Any], admin: Dict[str, Any]) -> Dict[str, Any]:
    if admin.get("role") != "admin":
        raise PermissionError("Administrator access is required.")
    shift = await database.find_one("courier_shifts", {"id": shift_id})
    if not shift:
        raise ValueError("Shift not found.")
    updates = dict(payload)
    starts_at = _parse_datetime(updates.get("starts_at") or shift.get("starts_at"))
    ends_at = _parse_datetime(updates.get("ends_at") or shift.get("ends_at"))
    if ends_at <= starts_at:
        raise ValueError("Shift end must be later than shift start.")
    capacity = int(updates.get("capacity") or shift.get("capacity") or 0)
    if capacity < int(shift.get("booked_count") or 0):
        raise ValueError("Capacity cannot be lower than existing bookings.")
    updates.update({"starts_at": starts_at.isoformat(), "ends_at": ends_at.isoformat(), "updated_at": now_iso()})
    updated = await database.update_one("courier_shifts", shift_id, updates)
    await write_audit_log(actor_user_id=_user_id(admin), actor_role="admin", action="courier_shift_updated", target_type="courier_shift", target_id=shift_id, metadata={"fields": sorted(updates.keys())})
    return public_shift(updated or shift)


async def list_courier_shifts(*, include_inactive: bool = False) -> List[Dict[str, Any]]:
    filters = {} if include_inactive else {"active": True}
    rows = await database.find_many("courier_shifts", filters)
    now = datetime.now(timezone.utc)
    return [public_shift(row, now) for row in sorted(rows, key=lambda item: str(item.get("starts_at") or ""))]


async def _require_approved_courier(user: Dict[str, Any]) -> Dict[str, Any]:
    if user.get("role") != "courier":
        raise PermissionError("A Courier account is required for shifts.")
    profile = await database.find_one("courier_profiles", {"user_id": _user_id(user)})
    if not profile or profile.get("status") != "APPROVED":
        raise PermissionError("Courier approval is required before booking shifts.")
    return profile


async def available_courier_shifts(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await _require_approved_courier(user)
    bookings = await database.find_many("courier_shift_bookings", {"courier_user_id": _user_id(user)})
    booked_shift_ids = {item.get("shift_id") for item in bookings if item.get("status") == "BOOKED"}
    return [shift for shift in await list_courier_shifts() if shift.get("status") in {"UPCOMING", "IN_PROGRESS"} and shift.get("id") not in booked_shift_ids]


async def book_courier_shift(shift_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    await _require_approved_courier(user)
    shift = await database.find_one("courier_shifts", {"id": shift_id})
    if not shift:
        raise ValueError("Shift not found.")
    public = public_shift(shift)
    if not public.get("booking_open"):
        raise ValueError("This shift is full or no longer open for booking.")
    existing = await database.find_one("courier_shift_bookings", {"shift_id": shift_id, "courier_user_id": _user_id(user)})
    if existing and existing.get("status") == "BOOKED":
        return {**existing, "shift": public}

    booked_count = int(shift.get("booked_count") or 0)
    reserved = await database.update_one_if(
        "courier_shifts",
        {"id": shift_id, "active": True, "booked_count": booked_count},
        {"booked_count": booked_count + 1, "updated_at": now_iso()},
    )
    if not reserved:
        raise ValueError("Shift availability changed. Refresh and try again.")
    now = now_iso()
    try:
        if existing:
            booking = await database.update_one("courier_shift_bookings", existing["id"], {"status": "BOOKED", "booked_at": now, "cancelled_at": None, "updated_at": now})
        else:
            booking = await database.insert_one(
                "courier_shift_bookings",
                {"id": new_id(), "shift_id": shift_id, "courier_user_id": _user_id(user), "status": "BOOKED", "booked_at": now, "cancelled_at": None, "created_at": now, "updated_at": now},
            )
    except DuplicateKeyError as exc:
        await _decrement_shift_booking_count(shift_id)
        raise ValueError("This shift is already booked.") from exc
    return {**booking, "shift": public_shift(reserved)}


async def cancel_courier_shift_booking(booking_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    await _require_approved_courier(user)
    booking = await database.find_one("courier_shift_bookings", {"id": booking_id})
    if not booking:
        raise ValueError("Shift booking not found.")
    if booking.get("courier_user_id") != _user_id(user):
        raise PermissionError("You cannot cancel another courier's shift.")
    if booking.get("status") != "BOOKED":
        raise ValueError("Only an upcoming booked shift can be cancelled.")
    shift = await database.find_one("courier_shifts", {"id": booking.get("shift_id")})
    if not shift or _parse_datetime(shift.get("starts_at")) <= datetime.now(timezone.utc):
        raise ValueError("A shift cannot be cancelled after it starts.")
    now = now_iso()
    updated = await database.update_one_if(
        "courier_shift_bookings",
        {"id": booking_id, "status": "BOOKED"},
        {"status": "CANCELLED", "cancelled_at": now, "updated_at": now},
    )
    if not updated:
        raise ValueError("Shift booking status changed. Refresh and try again.")
    count = await _decrement_shift_booking_count(shift["id"])
    return {**updated, "shift": public_shift({**shift, "booked_count": count})}


async def _decrement_shift_booking_count(shift_id: str) -> int:
    for _ in range(6):
        current = await database.find_one("courier_shifts", {"id": shift_id})
        if not current:
            return 0
        booked_count = max(0, int(current.get("booked_count") or 0))
        if booked_count == 0:
            return 0
        updated = await database.update_one_if(
            "courier_shifts",
            {"id": shift_id, "booked_count": booked_count},
            {"booked_count": booked_count - 1, "updated_at": now_iso()},
        )
        if updated:
            return int(updated.get("booked_count") or 0)
    raise ValueError("Shift capacity changed. Refresh and try again.")


async def my_courier_shift_bookings(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await _require_approved_courier(user)
    rows = await database.find_many("courier_shift_bookings", {"courier_user_id": _user_id(user)})
    now = datetime.now(timezone.utc)
    result = []
    for booking in rows:
        shift = await database.find_one("courier_shifts", {"id": booking.get("shift_id")})
        if not shift:
            continue
        status = str(booking.get("status") or "")
        if status == "BOOKED" and _parse_datetime(shift.get("ends_at")) <= now:
            status = "COMPLETED"
        result.append({**booking, "status": status, "shift": public_shift(shift, now)})
    return sorted(result, key=lambda item: str((item.get("shift") or {}).get("starts_at") or ""), reverse=True)
