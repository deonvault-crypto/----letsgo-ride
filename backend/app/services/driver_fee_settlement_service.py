from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Any, Dict, Optional

from pymongo.errors import DuplicateKeyError

from app.config import get_settings
from app.database import database
from app.services.email_service import _send_resend_email
from app.services.notification_service import create_app_notification
from app.services.stripe_payment_service import (
    _intent_client_payload,
    _settings as stripe_settings,
    _stripe_request,
    retrieve_payment_intent,
    verify_webhook_signature,
)
from app.utils import new_id, now_iso


logger = logging.getLogger(__name__)
DRIVER_FEE_PRODUCT = "driver_weekly_platform_fee"
OPEN_STATUSES = {"due", "overdue"}
TERMINAL_STRIPE_STATUSES = {"canceled", "succeeded"}
SWEEP_INTERVAL_SECONDS = 15 * 60
SWEEP_TRIP_LIMIT = 500
SWEEP_STATEMENT_LIMIT = 250


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _parse_time(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _now(value: Optional[datetime] = None) -> datetime:
    current = value or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return current.astimezone(timezone.utc)


def _fee_for_trip(trip: Dict[str, Any]) -> float:
    """Return the immutable LetsGoRide fee for a passenger-to-driver cash ride.

    Weekly postpaid settlement applies only when the driver actually collected the
    passenger fare. Historical card rides paid to LetsGoRide are deliberately excluded
    so a driver can never be charged a platform fee twice.
    """
    method = str(trip.get("payment_method") or "cash").strip().lower()
    if method not in {"cash", "direct"}:
        return 0.0
    fare = trip.get("fare") or {}
    gross = _money(fare.get("total_fare"))
    return _money(min(gross, _money(fare.get("platform_commission"))))


def _gross_for_trip(trip: Dict[str, Any]) -> float:
    return _money((trip.get("fare") or {}).get("total_fare"))


def _statement_public(statement: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not statement:
        return None
    return {
        "id": statement.get("id"),
        "status": statement.get("status"),
        "currency": statement.get("currency") or "USD",
        "ride_count": int(statement.get("ride_count") or 0),
        "gross_fares_usd": _money(statement.get("gross_fares_usd")),
        "platform_fee_usd": _money(statement.get("platform_fee_usd")),
        "amount_due_usd": 0.0 if statement.get("status") == "paid" else _money(statement.get("platform_fee_usd")),
        "period_start": statement.get("period_start"),
        "period_end": statement.get("period_end"),
        "issued_at": statement.get("issued_at"),
        "due_at": statement.get("due_at"),
        "grace_ends_at": statement.get("grace_ends_at"),
        "paid_at": statement.get("paid_at"),
        "stripe_payment_status": statement.get("stripe_payment_status"),
    }


async def _unstatemented_driver_trips(driver_user_id: str, *, limit: int = 500) -> list[Dict[str, Any]]:
    return await database.find_many(
        "hailing_trips",
        {
            "driver_user_id": driver_user_id,
            "status": "COMPLETED",
            "payment_method": {"$in": ["cash", "direct"]},
            "weekly_fee_statement_id": {"$exists": False},
        },
        sort=[("completed_at", 1)],
        limit=limit,
    )


async def get_open_statement(driver_user_id: str) -> Optional[Dict[str, Any]]:
    rows = await database.find_many(
        "driver_fee_statements",
        {"driver_user_id": driver_user_id, "status": {"$in": sorted(OPEN_STATUSES)}},
        sort=[("issued_at", 1)],
        limit=1,
    )
    return rows[0] if rows else None


async def get_recent_statements(driver_user_id: str, *, limit: int = 12) -> list[Dict[str, Any]]:
    rows = await database.find_many(
        "driver_fee_statements",
        {"driver_user_id": driver_user_id},
        sort=[("period_end", -1)],
        limit=limit,
    )
    return [_statement_public(row) for row in rows if row]


async def current_week_preview(driver_user_id: str, *, now: Optional[datetime] = None) -> Dict[str, Any]:
    trips = await _unstatemented_driver_trips(driver_user_id)
    eligible = [trip for trip in trips if _fee_for_trip(trip) > 0]
    if not eligible:
        return {
            "ride_count": 0,
            "gross_fares_usd": 0.0,
            "platform_fee_accrued_usd": 0.0,
            "period_start": None,
            "period_end": None,
        }
    first_at = _parse_time(eligible[0].get("completed_at") or eligible[0].get("updated_at")) or _now(now)
    period_end = first_at + timedelta(days=7)
    period_trips = [
        trip for trip in eligible
        if (_parse_time(trip.get("completed_at") or trip.get("updated_at")) or _now(now)) <= period_end
    ]
    return {
        "ride_count": len(period_trips),
        "gross_fares_usd": _money(sum(_gross_for_trip(trip) for trip in period_trips)),
        "platform_fee_accrued_usd": _money(sum(_fee_for_trip(trip) for trip in period_trips)),
        "period_start": first_at.isoformat(),
        "period_end": period_end.isoformat(),
    }


async def issue_due_statement_for_driver(
    driver_user_id: str,
    *,
    now: Optional[datetime] = None,
) -> Optional[Dict[str, Any]]:
    current_time = _now(now)
    existing = await get_open_statement(driver_user_id)
    if existing:
        return await refresh_statement_status(existing, now=current_time)

    trips = await _unstatemented_driver_trips(driver_user_id)
    eligible = [trip for trip in trips if _fee_for_trip(trip) > 0]
    if not eligible:
        return None

    first_at = _parse_time(eligible[0].get("completed_at") or eligible[0].get("updated_at"))
    if not first_at:
        return None
    period_end = first_at + timedelta(days=7)
    if current_time < period_end:
        return None

    period_trips = [
        trip for trip in eligible
        if (_parse_time(trip.get("completed_at") or trip.get("updated_at")) or current_time) <= period_end
    ]
    amount = _money(sum(_fee_for_trip(trip) for trip in period_trips))
    if amount <= 0:
        return None

    settings = get_settings()
    grace_days = max(1, int(settings.driver_fee_grace_days))
    issued_at = current_time
    grace_ends = issued_at + timedelta(days=grace_days)
    statement_key = f"{driver_user_id}:{first_at.isoformat()}:{period_end.isoformat()}"
    statement = {
        "id": new_id(),
        "statement_key": statement_key,
        "driver_user_id": driver_user_id,
        "status": "due",
        "currency": "USD",
        "ride_count": len(period_trips),
        "gross_fares_usd": _money(sum(_gross_for_trip(trip) for trip in period_trips)),
        "platform_fee_usd": amount,
        "trip_ids": [str(trip.get("id")) for trip in period_trips if trip.get("id")],
        "period_start": first_at.isoformat(),
        "period_end": period_end.isoformat(),
        "issued_at": issued_at.isoformat(),
        "due_at": issued_at.isoformat(),
        "grace_ends_at": grace_ends.isoformat(),
        "stripe_payment_intent_id": None,
        "stripe_payment_status": None,
        "stripe_last_event_id": None,
        "issued_notification_at": None,
        "reminder_notification_at": None,
        "final_notification_at": None,
        "created_at": issued_at.isoformat(),
        "updated_at": issued_at.isoformat(),
    }
    try:
        created = await database.insert_one("driver_fee_statements", statement)
    except DuplicateKeyError:
        created = await database.find_one("driver_fee_statements", {"statement_key": statement_key})
        if not created:
            raise

    await database.update_many(
        "hailing_trips",
        {
            "id": {"$in": created.get("trip_ids") or []},
            "weekly_fee_statement_id": {"$exists": False},
        },
        {
            "weekly_fee_statement_id": created["id"],
            "weekly_fee_assigned_at": issued_at.isoformat(),
        },
    )
    if not created.get("issued_notification_at"):
        await _send_statement_notice(created, "issued")
        created = await database.find_one("driver_fee_statements", {"id": created["id"]}) or created
    return created


async def _send_statement_email(statement: Dict[str, Any], kind: str) -> bool:
    user = await database.find_one("users", {"id": statement.get("driver_user_id")})
    email = str((user or {}).get("email") or "").strip()
    if not email:
        return False
    amount = _money(statement.get("platform_fee_usd"))
    grace = str(statement.get("grace_ends_at") or "")
    if kind == "issued":
        subject = "Your LetsGoRide weekly statement is ready"
        message = f"You earned first. Your weekly LetsGoRide service fee is ${amount:.2f}. Settle it from your Driver Wallet before the grace deadline to keep receiving new Ride Now requests."
    elif kind == "reminder":
        subject = "Reminder: settle your LetsGoRide balance"
        message = f"Your LetsGoRide balance of ${amount:.2f} is still due. Open Driver Wallet and tap Settle balance."
    else:
        subject = "Final reminder: LetsGoRide balance due"
        message = f"Your LetsGoRide balance of ${amount:.2f} is still unpaid. Ride Now will pause after the grace deadline until this balance is settled."
    html = (
        "<!doctype html><html><body style='margin:0;background:#FAF7F0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;color:#15191D;'>"
        "<table width='100%' cellspacing='0' cellpadding='0' style='padding:28px 12px'><tr><td align='center'>"
        "<table width='100%' cellspacing='0' cellpadding='0' style='max-width:520px;background:#fff;border:1px solid #E5DED4;border-radius:28px'>"
        "<tr><td style='padding:30px 28px'><div style='font-size:28px;font-weight:900'>Lets<span style='color:#118B44'>Go</span>Ride</div>"
        f"<h1 style='font-size:24px;margin:24px 0 10px'>{escape(subject)}</h1>"
        f"<p style='font-size:15px;line-height:1.55;color:#64707D'>{escape(message)}</p>"
        f"<div style='margin:24px 0;padding:20px;border-radius:20px;background:#111;color:#fff'><div style='font-size:12px;letter-spacing:2px'>AMOUNT DUE</div><div style='font-size:36px;font-weight:900;margin-top:5px'>${amount:.2f}</div></div>"
        f"<p style='font-size:13px;color:#64707D'>Grace deadline: {escape(grace)}</p>"
        "<p style='font-size:13px;color:#64707D'>Open LetsGoRide → Wallet to settle securely with Stripe. The payment amount is calculated by LetsGoRide and cannot be edited.</p>"
        "</td></tr></table></td></tr></table></body></html>"
    )
    text = f"{subject}\n\n{message}\n\nAmount due: ${amount:.2f}\nGrace deadline: {grace}\n\nOpen LetsGoRide Wallet to settle securely."
    return await asyncio.to_thread(_send_resend_email, email, subject, html, text, f"driver_fee_{kind}")


async def _send_statement_notice(statement: Dict[str, Any], kind: str) -> None:
    amount = _money(statement.get("platform_fee_usd"))
    if kind == "issued":
        title = "Your weekly statement is ready"
        body = f"You earned first. ${amount:.2f} in LetsGoRide service fees is now due."
        field = "issued_notification_at"
    elif kind == "reminder":
        title = "Weekly balance reminder"
        body = f"${amount:.2f} is still due. Settle your balance to keep Ride Now uninterrupted."
        field = "reminder_notification_at"
    else:
        title = "Final balance reminder"
        body = f"${amount:.2f} is due. Ride Now pauses after the grace deadline until it is settled."
        field = "final_notification_at"
    await create_app_notification(
        str(statement.get("driver_user_id")),
        "driver_fee_statement",
        title,
        body,
        {
            "notification_target": "worker_wallet",
            "statement_id": statement.get("id"),
        },
    )
    await _send_statement_email(statement, kind)
    await database.update_one(
        "driver_fee_statements",
        str(statement["id"]),
        {field: now_iso(), "updated_at": now_iso()},
    )


async def _set_driver_finance_pause(driver_user_id: str, statement_id: str, paused: bool) -> None:
    driver = await database.find_one("drivers", {"user_id": driver_user_id})
    if driver:
        await database.update_one(
            "drivers",
            driver["id"],
            {
                "ride_now_finance_paused": bool(paused),
                "ride_now_finance_pause_statement_id": statement_id if paused else None,
                "ride_now_finance_updated_at": now_iso(),
                "updated_at": now_iso(),
            },
        )
        if paused:
            presence = await database.find_one("hailing_driver_presence", {"driver_id": driver["id"]})
            if presence and presence.get("status") not in {"en_route", "arrived", "on_trip"}:
                await database.update_one(
                    "hailing_driver_presence",
                    presence["id"],
                    {"status": "offline", "offered_trip_id": None, "offered_at": None, "updated_at": now_iso()},
                )
            await database.update_many(
                "hailing_dispatch_offers",
                {"driver_user_id": driver_user_id, "status": "pending"},
                {"status": "cancelled", "cancelled_at": now_iso(), "updated_at": now_iso()},
            )


async def refresh_statement_status(statement: Dict[str, Any], *, now: Optional[datetime] = None) -> Dict[str, Any]:
    if statement.get("status") == "paid":
        return statement
    current_time = _now(now)
    issued = _parse_time(statement.get("issued_at")) or current_time
    grace_end = _parse_time(statement.get("grace_ends_at")) or issued
    current = statement
    if current_time >= grace_end and statement.get("status") != "overdue":
        current = await database.update_one_if(
            "driver_fee_statements",
            {"id": statement["id"], "status": {"$in": ["due", "overdue"]}},
            {"status": "overdue", "overdue_at": current_time.isoformat(), "updated_at": current_time.isoformat()},
        ) or statement
        await _set_driver_finance_pause(str(statement.get("driver_user_id")), str(statement.get("id")), True)
    elif statement.get("status") == "overdue":
        await _set_driver_finance_pause(str(statement.get("driver_user_id")), str(statement.get("id")), True)

    age = current_time - issued
    if age >= timedelta(days=1) and not current.get("reminder_notification_at"):
        await _send_statement_notice(current, "reminder")
        current = await database.find_one("driver_fee_statements", {"id": current["id"]}) or current
    if age >= timedelta(days=max(1, int(get_settings().driver_fee_grace_days))) and not current.get("final_notification_at"):
        await _send_statement_notice(current, "final")
        current = await database.find_one("driver_fee_statements", {"id": current["id"]}) or current
    return current


async def assert_driver_settlement_clear(driver_user_id: str) -> None:
    statement = await issue_due_statement_for_driver(driver_user_id)
    if statement:
        statement = await refresh_statement_status(statement)
    if statement and statement.get("status") == "overdue":
        amount = _money(statement.get("platform_fee_usd"))
        raise PermissionError(
            f"Your weekly LetsGoRide balance of ${amount:.2f} is overdue. Settle it in Wallet to receive new Ride Now requests again."
        )


async def driver_settlement_wallet(driver_user_id: str) -> Dict[str, Any]:
    statement = await issue_due_statement_for_driver(driver_user_id)
    if statement:
        statement = await refresh_statement_status(statement)
    preview = await current_week_preview(driver_user_id)
    history = await get_recent_statements(driver_user_id)
    due = _money(statement.get("platform_fee_usd")) if statement and statement.get("status") in OPEN_STATUSES else 0.0
    driver = await database.find_one("drivers", {"user_id": driver_user_id})
    return {
        "current_week": preview,
        "current_statement": _statement_public(statement),
        "statement_history": history,
        "amount_due_to_platform_usd": due,
        "settlement_required": due > 0,
        "settlement_button_visible": due > 0,
        "settlement_payment_enabled": bool(get_settings().stripe_configured),
        "ride_now_finance_paused": bool((driver or {}).get("ride_now_finance_paused")),
        "settlement_policy": "weekly_postpaid",
        "grace_days": max(1, int(get_settings().driver_fee_grace_days)),
    }


async def create_driver_fee_payment_intent(user: Dict[str, Any]) -> Dict[str, Any]:
    if str(user.get("role") or "").lower() != "driver":
        raise PermissionError("A Driver account is required.")
    statement = await issue_due_statement_for_driver(str(user["id"]))
    if not statement or statement.get("status") not in OPEN_STATUSES:
        raise ValueError("You do not have a LetsGoRide balance to settle right now.")
    settings = stripe_settings()
    amount_minor = int(round(_money(statement.get("platform_fee_usd")) * 100))
    if amount_minor <= 0:
        raise ValueError("You do not have a LetsGoRide balance to settle right now.")

    existing_id = str(statement.get("stripe_payment_intent_id") or "")
    if existing_id:
        existing = await retrieve_payment_intent(existing_id)
        metadata = existing.get("metadata") or {}
        if (
            existing.get("status") not in TERMINAL_STRIPE_STATUSES
            and int(existing.get("amount") or 0) == amount_minor
            and str(existing.get("currency") or "").lower() == settings.stripe_currency
            and str(metadata.get("statement_id") or "") == str(statement["id"])
        ):
            return {**_intent_client_payload(existing, settings.stripe_publishable_key), "statement": _statement_public(statement)}
        if existing.get("status") == "succeeded":
            await _mark_statement_paid(statement, existing, "confirm-existing")
            raise ValueError("This weekly LetsGoRide balance is already settled.")

    intent = await _stripe_request(
        "POST",
        "/payment_intents",
        data={
            "amount": amount_minor,
            "currency": settings.stripe_currency,
            "automatic_payment_methods[enabled]": "true",
            "description": "LetsGoRide weekly driver service fee",
            "metadata[product]": DRIVER_FEE_PRODUCT,
            "metadata[purpose]": DRIVER_FEE_PRODUCT,
            "metadata[statement_id]": str(statement["id"]),
            "metadata[driver_user_id]": str(user["id"]),
            "metadata[amount_minor]": str(amount_minor),
            "metadata[currency]": settings.stripe_currency,
        },
        idempotency_key=f"driver-weekly-fee:{statement['id']}:{amount_minor}",
    )
    updated = await database.update_one_if(
        "driver_fee_statements",
        {"id": statement["id"], "status": {"$in": ["due", "overdue"]}},
        {
            "stripe_payment_intent_id": intent.get("id"),
            "stripe_payment_status": intent.get("status"),
            "stripe_amount_minor": amount_minor,
            "stripe_currency": settings.stripe_currency,
            "payment_attempted_at": now_iso(),
            "updated_at": now_iso(),
        },
    )
    statement = updated or statement
    return {**_intent_client_payload(intent, settings.stripe_publishable_key), "statement": _statement_public(statement)}


async def _mark_statement_paid(statement: Dict[str, Any], intent: Dict[str, Any], event_id: str) -> Dict[str, Any]:
    amount_minor = int(round(_money(statement.get("platform_fee_usd")) * 100))
    metadata = intent.get("metadata") or {}
    if str(metadata.get("product") or "") != DRIVER_FEE_PRODUCT:
        raise ValueError("This Stripe payment is not a LetsGoRide driver settlement.")
    if str(metadata.get("statement_id") or "") != str(statement.get("id") or ""):
        raise ValueError("Stripe settlement statement mismatch.")
    if str(metadata.get("driver_user_id") or "") != str(statement.get("driver_user_id") or ""):
        raise ValueError("Stripe settlement driver mismatch.")
    if int(intent.get("amount") or 0) != amount_minor:
        raise ValueError("Stripe settlement amount mismatch.")
    if str(intent.get("currency") or "").lower() != get_settings().stripe_currency:
        raise ValueError("Stripe settlement currency mismatch.")

    paid = await database.update_one_if(
        "driver_fee_statements",
        {"id": statement["id"], "status": {"$in": ["due", "overdue"]}},
        {
            "status": "paid",
            "paid_at": now_iso(),
            "paid_amount_usd": _money(statement.get("platform_fee_usd")),
            "stripe_payment_status": intent.get("status"),
            "stripe_last_event_id": event_id,
            "stripe_last_event_type": "payment_intent.succeeded",
            "updated_at": now_iso(),
        },
    )
    result = paid or await database.find_one("driver_fee_statements", {"id": statement["id"]}) or statement
    if result.get("status") == "paid":
        await _set_driver_finance_pause(str(statement.get("driver_user_id")), str(statement["id"]), False)
        if paid:
            await create_app_notification(
                str(statement.get("driver_user_id")),
                "driver_fee_statement",
                "Balance settled",
                f"Payment received. Your ${_money(statement.get('platform_fee_usd')):.2f} weekly LetsGoRide balance is clear.",
                {"notification_target": "worker_wallet", "statement_id": statement.get("id")},
            )
    return result


async def confirm_driver_fee_payment(user: Dict[str, Any]) -> Dict[str, Any]:
    if str(user.get("role") or "").lower() != "driver":
        raise PermissionError("A Driver account is required.")
    statement = await get_open_statement(str(user["id"]))
    if not statement:
        return {"settled": True, "statement": None}
    intent_id = str(statement.get("stripe_payment_intent_id") or "")
    if not intent_id:
        return {"settled": False, "statement": _statement_public(statement)}
    intent = await retrieve_payment_intent(intent_id)
    if intent.get("status") == "succeeded":
        statement = await _mark_statement_paid(statement, intent, "client-confirm")
        return {"settled": True, "statement": _statement_public(statement)}
    await database.update_one(
        "driver_fee_statements",
        statement["id"],
        {"stripe_payment_status": intent.get("status"), "updated_at": now_iso()},
    )
    return {"settled": False, "statement": _statement_public(statement), "stripe_status": intent.get("status")}


async def handle_driver_fee_stripe_webhook(payload: bytes, signature_header: str) -> Dict[str, Any]:
    settings = stripe_settings()
    verify_webhook_signature(payload, signature_header, settings.stripe_webhook_secret)
    import json
    event = json.loads(payload.decode("utf-8"))
    event_id = str(event.get("id") or "")
    event_type = str(event.get("type") or "")
    intent = (((event.get("data") or {}).get("object")) or {})
    metadata = intent.get("metadata") or {} if isinstance(intent, dict) else {}
    if str(metadata.get("product") or "") != DRIVER_FEE_PRODUCT:
        return {"received": True, "event_id": event_id, "handled": False}
    statement_id = str(metadata.get("statement_id") or "")
    statement = await database.find_one("driver_fee_statements", {"id": statement_id})
    if not statement or statement.get("stripe_last_event_id") == event_id:
        return {"received": True, "event_id": event_id, "handled": True}
    if str(statement.get("stripe_payment_intent_id") or "") != str(intent.get("id") or ""):
        raise ValueError("Stripe settlement payment reference mismatch.")
    if event_type == "payment_intent.succeeded":
        await _mark_statement_paid(statement, intent, event_id)
    elif event_type in {"payment_intent.payment_failed", "payment_intent.canceled"}:
        await database.update_one_if(
            "driver_fee_statements",
            {"id": statement["id"], "status": {"$in": ["due", "overdue"]}},
            {
                "stripe_payment_status": intent.get("status"),
                "stripe_last_event_id": event_id,
                "stripe_last_event_type": event_type,
                "updated_at": now_iso(),
            },
        )
    return {"received": True, "event_id": event_id, "handled": True}


async def settlement_sweep_once(*, now: Optional[datetime] = None) -> Dict[str, int]:
    current_time = _now(now)
    recent = await database.find_many(
        "hailing_trips",
        {
            "status": "COMPLETED",
            "payment_method": {"$in": ["cash", "direct"]},
            "weekly_fee_statement_id": {"$exists": False},
        },
        sort=[("completed_at", 1)],
        limit=SWEEP_TRIP_LIMIT,
    )
    issued = 0
    seen: set[str] = set()
    for trip in recent:
        user_id = str(trip.get("driver_user_id") or "")
        if not user_id or user_id in seen:
            continue
        seen.add(user_id)
        before = await get_open_statement(user_id)
        after = await issue_due_statement_for_driver(user_id, now=current_time)
        if after and not before and after.get("issued_at"):
            issued += 1

    active = await database.find_many(
        "driver_fee_statements",
        {"status": {"$in": ["due", "overdue"]}},
        sort=[("grace_ends_at", 1)],
        limit=SWEEP_STATEMENT_LIMIT,
    )
    overdue = 0
    for statement in active:
        refreshed = await refresh_statement_status(statement, now=current_time)
        if refreshed.get("status") == "overdue":
            overdue += 1
    return {"issued": issued, "overdue": overdue}


async def driver_fee_settlement_sweeper(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            result = await settlement_sweep_once()
            if result["issued"] or result["overdue"]:
                logger.info("driver_fee_settlement_sweep issued=%s overdue=%s", result["issued"], result["overdue"])
        except Exception as exc:
            logger.warning("driver_fee_settlement_sweep_failed error_type=%s", exc.__class__.__name__)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=SWEEP_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue


async def admin_driver_settlement_summary() -> Dict[str, Any]:
    rows = await database.find_many(
        "driver_fee_statements",
        {},
        sort=[("issued_at", -1)],
        limit=250,
    )
    due = [row for row in rows if row.get("status") in OPEN_STATUSES]
    paid = [row for row in rows if row.get("status") == "paid"]
    return {
        "outstanding_usd": _money(sum(_money(row.get("platform_fee_usd")) for row in due)),
        "collected_usd": _money(sum(_money(row.get("paid_amount_usd") or row.get("platform_fee_usd")) for row in paid)),
        "due_count": len(due),
        "overdue_count": sum(1 for row in due if row.get("status") == "overdue"),
        "statements": [_statement_public(row) | {"driver_user_id": row.get("driver_user_id")} for row in rows[:100]],
    }
