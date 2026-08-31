from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    if new in content:
        return
    if old not in content:
        raise RuntimeError(f"Expected patch anchor missing in {path}: {old[:100]!r}")
    write(path, content.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Backend: weekly post-paid driver settlement ledger
# ---------------------------------------------------------------------------
write(
    "backend/app/services/driver_weekly_settlement_service.py",
    '''from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.database import database
from app.services.email_service import send_driver_weekly_statement_email
from app.services.notification_service import create_app_notification
from app.utils import new_id, now_iso


HARARE_TZ = ZoneInfo("Africa/Harare")
FEE_LEDGER_COLLECTION = "driver_fee_ledger"
STATEMENT_COLLECTION = "driver_fee_statements"
PAYMENT_COLLECTION = "driver_settlement_payments"
OPEN_STATUSES = {"due", "overdue"}


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _parse_time(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        parsed = value
    elif value:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def weekly_period_for(moment: Optional[datetime] = None) -> tuple[str, str]:
    current = (moment or datetime.now(timezone.utc)).astimezone(HARARE_TZ)
    start_local = current.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=current.weekday())
    end_local = start_local + timedelta(days=7)
    return _iso(start_local), _iso(end_local)


def _period_for_trip(trip: Dict[str, Any]) -> tuple[str, str]:
    completed = _parse_time(trip.get("completed_at")) or datetime.now(timezone.utc)
    return weekly_period_for(completed)


def _statement_id(user_id: str, period_start: str) -> str:
    date_key = period_start[:10].replace("-", "")
    return f"driver-statement-{user_id}-{date_key}"


async def record_completed_ride_fee(trip: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Record exactly one platform-fee receivable from a completed cash Ride Now trip.

    The fee comes from the immutable fare snapshot stored on the trip. This prevents
    later pricing changes from rewriting what a driver owes for historical work.
    Passenger card trips are deliberately excluded from this post-paid launch model.
    """

    if str(trip.get("status") or "") != "COMPLETED":
        return None
    if str(trip.get("payment_method") or "cash").lower() != "cash":
        return None
    driver_user_id = str(trip.get("driver_user_id") or "")
    driver_id = str(trip.get("driver_id") or "")
    trip_id = str(trip.get("id") or "")
    if not driver_user_id or not driver_id or not trip_id:
        return None

    fare = trip.get("fare") or {}
    fee = _money(fare.get("platform_commission"))
    if fee <= 0:
        return None
    existing = await database.find_one(FEE_LEDGER_COLLECTION, {"id": f"driver-fee:{trip_id}"})
    if existing:
        return existing

    period_start, period_end = _period_for_trip(trip)
    row = {
        "id": f"driver-fee:{trip_id}",
        "driver_id": driver_id,
        "driver_user_id": driver_user_id,
        "trip_id": trip_id,
        "period_start": period_start,
        "period_end": period_end,
        "gross_fare_usd": _money(fare.get("total_fare")),
        "fee_usd": fee,
        "fee_percent": _money(fare.get("platform_commission_percent")),
        "statement_id": None,
        "status": "accrued",
        "completed_at": trip.get("completed_at") or now_iso(),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    try:
        return await database.insert_one(FEE_LEDGER_COLLECTION, row)
    except Exception:
        # The deterministic ID + unique index makes completion retries idempotent.
        return await database.find_one(FEE_LEDGER_COLLECTION, {"id": row["id"]})


async def _notify_statement(statement: Dict[str, Any], stage: str) -> None:
    user = await database.find_one("users", {"id": statement.get("driver_user_id")})
    if not user:
        return
    amount = _money(statement.get("amount_due_usd"))
    due_at = str(statement.get("due_at") or "")
    if stage == "ready":
        title = "Your weekly statement is ready"
        body = f"Your LetsGoRide service fee is ${amount:.2f}. Settle it before the deadline to keep receiving Ride Now requests."
    elif stage == "reminder":
        title = "Weekly balance reminder"
        body = f"${amount:.2f} is still due to LetsGoRide. Settle your balance before the deadline."
    else:
        title = "Ride Now paused — settle balance"
        body = f"Your ${amount:.2f} weekly LetsGoRide balance is overdue. Settle it to receive new Ride Now requests again."
    await create_app_notification(
        user_id=str(user["id"]),
        notification_type="driver_settlement",
        title=title,
        body=body,
        data={"notification_target": "worker_wallet", "statement_id": statement.get("id")},
    )
    email = str(user.get("email") or "").strip()
    if email:
        await send_driver_weekly_statement_email(
            email,
            amount_usd=amount,
            period_start=str(statement.get("period_start") or ""),
            period_end=str(statement.get("period_end") or ""),
            due_at=due_at,
            overdue=stage == "overdue",
        )


async def _create_or_update_statement(driver_user_id: str, period_start: str, period_end: str) -> Optional[Dict[str, Any]]:
    rows = await database.find_many(
        FEE_LEDGER_COLLECTION,
        {
            "driver_user_id": driver_user_id,
            "period_start": period_start,
            "period_end": period_end,
            "statement_id": None,
        },
        sort=[("completed_at", 1)],
        limit=1000,
    )
    if not rows:
        return await database.find_one(STATEMENT_COLLECTION, {"id": _statement_id(driver_user_id, period_start)})

    driver_id = str(rows[0].get("driver_id") or "")
    amount = _money(sum(_money(row.get("fee_usd")) for row in rows))
    gross = _money(sum(_money(row.get("gross_fare_usd")) for row in rows))
    if amount <= 0:
        return None
    settings = get_settings()
    period_end_dt = _parse_time(period_end) or datetime.now(timezone.utc)
    due_at = period_end_dt + timedelta(hours=settings.driver_settlement_grace_hours)
    statement_id = _statement_id(driver_user_id, period_start)
    statement = await database.find_one(STATEMENT_COLLECTION, {"id": statement_id})
    if not statement:
        statement = {
            "id": statement_id,
            "driver_user_id": driver_user_id,
            "driver_id": driver_id,
            "period_start": period_start,
            "period_end": period_end,
            "ride_count": len(rows),
            "gross_fares_usd": gross,
            "amount_due_usd": amount,
            "status": "due",
            "due_at": _iso(due_at),
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "ready_notified_at": None,
            "reminder_notified_at": None,
            "overdue_notified_at": None,
            "paid_at": None,
        }
        try:
            statement = await database.insert_one(STATEMENT_COLLECTION, statement)
        except Exception:
            statement = await database.find_one(STATEMENT_COLLECTION, {"id": statement_id}) or statement

    await database.update_many(
        FEE_LEDGER_COLLECTION,
        {
            "driver_user_id": driver_user_id,
            "period_start": period_start,
            "period_end": period_end,
            "statement_id": None,
        },
        {"statement_id": statement_id, "status": "billed", "updated_at": now_iso()},
    )
    if not statement.get("ready_notified_at"):
        await database.update_one(STATEMENT_COLLECTION, statement_id, {"ready_notified_at": now_iso(), "updated_at": now_iso()})
        await _notify_statement(statement, "ready")
        statement = await database.find_one(STATEMENT_COLLECTION, {"id": statement_id}) or statement
    return statement


async def finalize_due_fee_entries(limit: int = 500) -> int:
    now_text = now_iso()
    rows = await database.find_many(
        FEE_LEDGER_COLLECTION,
        {"statement_id": None, "period_end": {"$lte": now_text}},
        sort=[("period_end", 1), ("driver_user_id", 1)],
        limit=max(1, min(limit, 1000)),
    )
    keys: list[tuple[str, str, str]] = []
    seen = set()
    for row in rows:
        key = (str(row.get("driver_user_id") or ""), str(row.get("period_start") or ""), str(row.get("period_end") or ""))
        if not all(key) or key in seen:
            continue
        seen.add(key)
        keys.append(key)
    for user_id, start, end in keys:
        await _create_or_update_statement(user_id, start, end)
    return len(keys)


async def finalize_due_fee_entries_for_user(user_id: str) -> None:
    now_text = now_iso()
    rows = await database.find_many(
        FEE_LEDGER_COLLECTION,
        {"driver_user_id": user_id, "statement_id": None, "period_end": {"$lte": now_text}},
        sort=[("period_end", 1)],
        limit=500,
    )
    seen = set()
    for row in rows:
        key = (str(row.get("period_start") or ""), str(row.get("period_end") or ""))
        if not all(key) or key in seen:
            continue
        seen.add(key)
        await _create_or_update_statement(user_id, key[0], key[1])


async def refresh_due_statements(user_id: Optional[str] = None, limit: int = 200) -> int:
    filters: Dict[str, Any] = {"status": {"$in": ["due", "overdue"]}}
    if user_id:
        filters["driver_user_id"] = user_id
    statements = await database.find_many(
        STATEMENT_COLLECTION,
        filters,
        sort=[("due_at", 1)],
        limit=max(1, min(limit, 500)),
    )
    now = datetime.now(timezone.utc)
    changed = 0
    for statement in statements:
        due_at = _parse_time(statement.get("due_at"))
        if not due_at:
            continue
        if now >= due_at and statement.get("status") != "overdue":
            updated = await database.update_one(
                STATEMENT_COLLECTION,
                statement["id"],
                {"status": "overdue", "overdue_at": now_iso(), "updated_at": now_iso()},
            )
            statement = updated or {**statement, "status": "overdue"}
            changed += 1
        stage: Optional[str] = None
        marker: Optional[str] = None
        if statement.get("status") == "overdue" and not statement.get("overdue_notified_at"):
            stage, marker = "overdue", "overdue_notified_at"
        elif statement.get("status") == "due" and now >= due_at - timedelta(hours=24) and not statement.get("reminder_notified_at"):
            stage, marker = "reminder", "reminder_notified_at"
        if stage and marker:
            await database.update_one(STATEMENT_COLLECTION, statement["id"], {marker: now_iso(), "updated_at": now_iso()})
            await _notify_statement(statement, stage)
    return changed


async def settlement_summary(user: Dict[str, Any]) -> Dict[str, Any]:
    if str(user.get("role") or "").lower() != "driver":
        raise PermissionError("A Driver account is required.")
    user_id = str(user.get("id") or "")
    await finalize_due_fee_entries_for_user(user_id)
    await refresh_due_statements(user_id=user_id)

    current_start, current_end = weekly_period_for()
    current_rows = await database.find_many(
        FEE_LEDGER_COLLECTION,
        {"driver_user_id": user_id, "period_start": current_start, "period_end": current_end},
        sort=[("completed_at", -1)],
        limit=1000,
    )
    open_statements = await database.find_many(
        STATEMENT_COLLECTION,
        {"driver_user_id": user_id, "status": {"$in": ["due", "overdue"]}},
        sort=[("period_start", 1)],
        limit=52,
    )
    recent_statements = await database.find_many(
        STATEMENT_COLLECTION,
        {"driver_user_id": user_id},
        sort=[("period_start", -1)],
        limit=12,
    )
    amount_due = _money(sum(_money(item.get("amount_due_usd")) for item in open_statements))
    overdue = [item for item in open_statements if item.get("status") == "overdue"]
    earliest_due = min((str(item.get("due_at") or "") for item in open_statements if item.get("due_at")), default=None)
    current_fares = _money(sum(_money(row.get("gross_fare_usd")) for row in current_rows))
    current_fees = _money(sum(_money(row.get("fee_usd")) for row in current_rows))
    status = "overdue" if overdue else "due" if open_statements else "current" if current_fees > 0 else "clear"
    return {
        "status": status,
        "current_period_start": current_start,
        "current_period_end": current_end,
        "current_week_ride_count": len(current_rows),
        "current_week_cash_fares_usd": current_fares,
        "current_week_platform_fees_usd": current_fees,
        "amount_due_usd": amount_due,
        "outstanding_statement_count": len(open_statements),
        "earliest_due_at": earliest_due,
        "can_settle": amount_due > 0,
        "ride_now_blocked": bool(overdue),
        "recent_statements": recent_statements,
    }


async def enforce_driver_settlement_standing(user: Dict[str, Any]) -> None:
    summary = await settlement_summary(user)
    if summary["ride_now_blocked"]:
        raise PermissionError(
            f"Your weekly LetsGoRide balance of ${summary['amount_due_usd']:.2f} is overdue. Settle it in Wallet to receive new Ride Now requests."
        )


async def prepare_settlement_payment(user: Dict[str, Any]) -> Dict[str, Any]:
    summary = await settlement_summary(user)
    if not summary["can_settle"]:
        raise ValueError("There is no weekly LetsGoRide balance to settle right now.")
    statements = await database.find_many(
        STATEMENT_COLLECTION,
        {"driver_user_id": user["id"], "status": {"$in": ["due", "overdue"]}},
        sort=[("period_start", 1)],
        limit=52,
    )
    statement_ids = [str(item["id"]) for item in statements]
    amount = _money(sum(_money(item.get("amount_due_usd")) for item in statements))
    existing = await database.find_many(
        PAYMENT_COLLECTION,
        {"driver_user_id": user["id"], "status": {"$in": ["prepared", "processing"]}},
        sort=[("created_at", -1)],
        limit=5,
    )
    for row in existing:
        if row.get("statement_ids") == statement_ids and _money(row.get("amount_usd")) == amount:
            return row
    driver = await database.find_one("drivers", {"user_id": user["id"]})
    if not driver:
        raise PermissionError("Complete your Driver profile before settling a weekly balance.")
    return await database.insert_one(
        PAYMENT_COLLECTION,
        {
            "id": new_id(),
            "driver_user_id": user["id"],
            "driver_id": driver["id"],
            "statement_ids": statement_ids,
            "amount_usd": amount,
            "currency": "USD",
            "status": "prepared",
            "stripe_payment_intent_id": None,
            "stripe_payment_status": None,
            "stripe_last_event_id": None,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        },
    )


async def apply_settlement_intent(intent: Dict[str, Any], event_id: str = "", event_type: str = "") -> Dict[str, Any]:
    metadata = intent.get("metadata") or {}
    payment_id = str(metadata.get("settlement_payment_id") or "")
    payment = await database.find_one(PAYMENT_COLLECTION, {"id": payment_id}) if payment_id else None
    if not payment:
        payment = await database.find_one(PAYMENT_COLLECTION, {"stripe_payment_intent_id": intent.get("id")})
    if not payment:
        return {"received": True, "event_id": event_id}
    if event_id and payment.get("stripe_last_event_id") == event_id:
        return {"received": True, "event_id": event_id}

    expected_minor = int(round(_money(payment.get("amount_usd")) * 100))
    if int(intent.get("amount") or 0) != expected_minor or str(intent.get("currency") or "").lower() != "usd":
        raise ValueError("Stripe settlement amount does not match the weekly statement.")
    status = str(intent.get("status") or "")
    payment_updates = {
        "stripe_payment_status": status,
        "stripe_last_event_id": event_id or payment.get("stripe_last_event_id"),
        "stripe_last_event_type": event_type or payment.get("stripe_last_event_type"),
        "updated_at": now_iso(),
    }
    if status == "succeeded":
        payment_updates.update({"status": "paid", "paid_at": now_iso()})
    elif status in {"canceled", "requires_payment_method"}:
        payment_updates["status"] = "failed"
    else:
        payment_updates["status"] = "processing"
    payment = await database.update_one(PAYMENT_COLLECTION, payment["id"], payment_updates) or {**payment, **payment_updates}

    if payment.get("status") == "paid":
        for statement_id in payment.get("statement_ids") or []:
            statement = await database.find_one(STATEMENT_COLLECTION, {"id": statement_id, "driver_user_id": payment["driver_user_id"]})
            if not statement or statement.get("status") == "paid":
                continue
            await database.update_one(
                STATEMENT_COLLECTION,
                statement_id,
                {
                    "status": "paid",
                    "paid_at": payment.get("paid_at") or now_iso(),
                    "stripe_payment_intent_id": intent.get("id"),
                    "settlement_payment_id": payment["id"],
                    "updated_at": now_iso(),
                },
            )
        await create_app_notification(
            user_id=str(payment["driver_user_id"]),
            notification_type="driver_settlement",
            title="Weekly balance settled",
            body=f"We received your ${_money(payment.get('amount_usd')):.2f} LetsGoRide settlement. You're clear to keep driving.",
            data={"notification_target": "worker_wallet", "settlement_payment_id": payment["id"]},
        )
    return {"received": True, "event_id": event_id, "payment": payment}


async def driver_settlement_sweeper(stop_event: asyncio.Event) -> None:
    settings = get_settings()
    while not stop_event.is_set():
        try:
            await finalize_due_fee_entries()
            await refresh_due_statements()
        except Exception:
            # Keep one bad statement from stopping ride-hailing runtime.
            pass
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=settings.driver_settlement_sweep_seconds)
        except asyncio.TimeoutError:
            continue


async def admin_settlement_dashboard() -> Dict[str, Any]:
    await finalize_due_fee_entries()
    await refresh_due_statements()
    statements = await database.find_many(
        STATEMENT_COLLECTION,
        {},
        sort=[("period_end", -1)],
        limit=100,
    )
    items: List[Dict[str, Any]] = []
    for statement in statements:
        user = await database.find_one("users", {"id": statement.get("driver_user_id")}) or {}
        items.append(
            {
                **statement,
                "driver_name": user.get("name") or "Driver",
                "driver_email": user.get("email"),
            }
        )
    if database.db is not None:
        grouped = await database.db[STATEMENT_COLLECTION].aggregate(
            [{"$group": {"_id": "$status", "amount": {"$sum": {"$ifNull": ["$amount_due_usd", 0]}}, "count": {"$sum": 1}}}]
        ).to_list(length=20)
        totals = {str(row.get("_id")): {"amount": _money(row.get("amount")), "count": int(row.get("count") or 0)} for row in grouped}
    else:
        all_rows = await database.find_many(STATEMENT_COLLECTION, {})
        totals: Dict[str, Dict[str, Any]] = {}
        for row in all_rows:
            key = str(row.get("status") or "unknown")
            bucket = totals.setdefault(key, {"amount": 0.0, "count": 0})
            bucket["amount"] = _money(bucket["amount"] + _money(row.get("amount_due_usd")))
            bucket["count"] += 1
    outstanding = _money(sum((totals.get(status) or {}).get("amount", 0) for status in OPEN_STATUSES))
    collected = _money((totals.get("paid") or {}).get("amount", 0))
    overdue_count = int((totals.get("overdue") or {}).get("count", 0))
    return {
        "summary": {
            "outstanding_usd": outstanding,
            "collected_usd": collected,
            "overdue_count": overdue_count,
            "statement_count": sum(int((bucket or {}).get("count", 0)) for bucket in totals.values()),
        },
        "items": items,
    }
''',
)

write(
    "backend/app/services/driver_settlement_payment_service.py",
    '''from __future__ import annotations

from typing import Any, Dict

from app.database import database
from app.services.driver_weekly_settlement_service import (
    PAYMENT_COLLECTION,
    apply_settlement_intent,
    prepare_settlement_payment,
)
from app.services.stripe_payment_service import _intent_client_payload, _settings, _stripe_request, retrieve_payment_intent
from app.utils import now_iso


async def create_driver_settlement_intent(user: Dict[str, Any]) -> Dict[str, Any]:
    settings = _settings()
    payment = await prepare_settlement_payment(user)
    amount_minor = int(round(float(payment["amount_usd"]) * 100))
    existing_id = str(payment.get("stripe_payment_intent_id") or "")
    if existing_id:
        existing = await retrieve_payment_intent(existing_id)
        if (
            existing.get("status") not in {"canceled"}
            and int(existing.get("amount") or 0) == amount_minor
            and str(existing.get("currency") or "").lower() == settings.stripe_currency
        ):
            return _intent_client_payload(existing, settings.stripe_publishable_key)

    intent = await _stripe_request(
        "POST",
        "/payment_intents",
        data={
            "amount": amount_minor,
            "currency": settings.stripe_currency,
            "automatic_payment_methods[enabled]": "true",
            "description": "LetsGoRide weekly driver settlement",
            "metadata[product]": "driver_weekly_settlement",
            "metadata[settlement_payment_id]": payment["id"],
            "metadata[user_id]": str(user["id"]),
            "metadata[driver_id]": str(payment["driver_id"]),
        },
        idempotency_key=f"driver-weekly-settlement:{payment['id']}",
    )
    await database.update_one(
        PAYMENT_COLLECTION,
        payment["id"],
        {
            "stripe_payment_intent_id": intent.get("id"),
            "stripe_payment_status": intent.get("status"),
            "status": "processing",
            "updated_at": now_iso(),
        },
    )
    payload = _intent_client_payload(intent, settings.stripe_publishable_key)
    payload["settlement_payment_id"] = payment["id"]
    return payload


async def confirm_driver_settlement_intent(payment_intent_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    payment = await database.find_one(
        PAYMENT_COLLECTION,
        {"driver_user_id": user.get("id"), "stripe_payment_intent_id": payment_intent_id},
    )
    if not payment:
        raise PermissionError("This weekly settlement belongs to another account or no longer exists.")
    intent = await retrieve_payment_intent(payment_intent_id)
    metadata = intent.get("metadata") or {}
    if metadata.get("product") != "driver_weekly_settlement" or str(metadata.get("user_id") or "") != str(user.get("id") or ""):
        raise PermissionError("This Stripe payment is not your LetsGoRide weekly settlement.")
    result = await apply_settlement_intent(intent, event_type="client_confirmation")
    return result.get("payment") or payment
''',
)

# Config: weekly settlement policy + separate passenger-card rollout switch.
replace_once(
    "backend/app/config.py",
    '        self.stripe_timeout_seconds = self._parse_float(os.getenv("STRIPE_TIMEOUT_SECONDS", "10"), 10.0)\n        if self.stripe_enabled:\n',
    '        self.stripe_timeout_seconds = self._parse_float(os.getenv("STRIPE_TIMEOUT_SECONDS", "10"), 10.0)\n        # Stripe is used for driver weekly settlements in the Zimbabwe launch model.\n        # Passenger card rides stay fail-closed until deliberately enabled later.\n        self.passenger_card_payments_enabled = self._parse_bool(os.getenv("PASSENGER_CARD_PAYMENTS_ENABLED", "false"))\n        self.driver_settlement_grace_hours = max(1, int(os.getenv("DRIVER_SETTLEMENT_GRACE_HOURS", "48")))\n        self.driver_settlement_sweep_seconds = max(300, int(os.getenv("DRIVER_SETTLEMENT_SWEEP_SECONDS", "900")))\n        if self.stripe_enabled:\n',
)

# Email: weekly statement/reminder message.
email_path = "backend/app/services/email_service.py"
email = read(email_path)
if "send_driver_weekly_statement_email" not in email:
    email += '''\n\nasync def send_driver_weekly_statement_email(\n    to_email: str,\n    *,\n    amount_usd: float,\n    period_start: str,\n    period_end: str,\n    due_at: str,\n    overdue: bool = False,\n) -> bool:\n    amount = f"${float(amount_usd or 0):.2f}"\n    title = "LetsGoRide weekly balance overdue" if overdue else "Your LetsGoRide weekly statement is ready"\n    message = (\n        f"Your LetsGoRide service fee for the completed week is {amount}. "\n        + ("Settle the balance to receive new Ride Now requests again." if overdue else "Please settle it before the deadline to keep receiving Ride Now requests.")\n    )\n    text = (\n        f"{title}\\n\\n{message}\\n\\n"\n        f"Statement period: {period_start} to {period_end}\\n"\n        f"Amount due: {amount}\\nDue: {due_at}\\n\\n"\n        "Open LetsGoRide Wallet and tap Settle balance.\\n\\nLetsGoRide Driver Support"\n    )\n    html = branded_notice_email(\n        title=title,\n        preheader=message,\n        message=message,\n        security_note=f"Statement period: {period_start} to {period_end}. Amount due: {amount}. Due: {due_at}.",\n        footer="LetsGoRide Driver Support",\n    )\n    try:\n        return await asyncio.to_thread(_send_resend_email, to_email, title, html, text, "send_driver_weekly_statement_email")\n    except Exception:\n        logger.warning("Driver weekly statement email failed %s", _resend_log_context("send_driver_weekly_statement_email", message="unexpected email service error"))\n        return False\n'''
    write(email_path, email)

# Finance indexes.
write(
    "backend/app/services/worker_finance_index_service.py",
    '''from __future__ import annotations

from app.database import database


async def ensure_worker_finance_indexes() -> None:
    """Indexes for courier payout data and weekly post-paid driver settlements."""

    if database.db is None:
        return
    await database.db["worker_payouts"].create_index(
        [("user_id", 1), ("worker_role", 1), ("status", 1), ("created_at", -1)],
        name="worker_payouts_by_user_status_time",
    )
    await database.db["worker_payout_methods"].create_index(
        [("user_id", 1), ("worker_role", 1), ("status", 1), ("is_default", -1), ("created_at", 1)],
        name="worker_payout_methods_by_user",
    )
    await database.db["driver_fee_ledger"].create_index("id", unique=True, name="driver_fee_id_unique")
    await database.db["driver_fee_ledger"].create_index(
        [("statement_id", 1), ("period_end", 1), ("driver_user_id", 1)],
        name="driver_fee_unbilled_period",
    )
    await database.db["driver_fee_ledger"].create_index(
        [("driver_user_id", 1), ("period_start", 1), ("completed_at", -1)],
        name="driver_fee_by_user_period",
    )
    await database.db["driver_fee_statements"].create_index("id", unique=True, name="driver_statement_id_unique")
    await database.db["driver_fee_statements"].create_index(
        [("driver_user_id", 1), ("period_start", -1)],
        unique=True,
        name="driver_statement_user_period_unique",
    )
    await database.db["driver_fee_statements"].create_index(
        [("status", 1), ("due_at", 1)],
        name="driver_statement_status_due",
    )
    await database.db["driver_settlement_payments"].create_index("id", unique=True, name="driver_settlement_payment_id_unique")
    await database.db["driver_settlement_payments"].create_index(
        [("driver_user_id", 1), ("status", 1), ("created_at", -1)],
        name="driver_settlement_payment_by_user",
    )
    await database.db["driver_settlement_payments"].create_index(
        "stripe_payment_intent_id",
        sparse=True,
        name="driver_settlement_payment_intent",
    )
''',
)

# Driver wallet: switch from payout accounting to weekly post-paid fee accounting.
write(
    "backend/app/services/worker_wallet_service.py",
    '''from __future__ import annotations

from typing import Any, Dict, List

from app.database import database
from app.services.driver_weekly_settlement_service import settlement_summary
from app.services.worker_finance_service import wallet_summary as legacy_wallet_summary


DRIVER_LEDGER_LIMIT = 100


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


async def _driver_lifetime_totals(user_id: str) -> Dict[str, float]:
    filters = {"driver_user_id": user_id, "status": "COMPLETED", "payment_method": "cash"}
    if database.db is None:
        trips = await database.find_many("hailing_trips", filters)
        gross = _money(sum(_money((trip.get("fare") or {}).get("total_fare")) for trip in trips))
        fees = _money(sum(_money((trip.get("fare") or {}).get("platform_commission")) for trip in trips))
        return {"gross": gross, "fees": fees, "net": _money(max(0.0, gross - fees))}
    rows = await database.db["hailing_trips"].aggregate(
        [
            {"$match": filters},
            {"$group": {"_id": None, "gross": {"$sum": {"$ifNull": ["$fare.total_fare", 0]}}, "fees": {"$sum": {"$ifNull": ["$fare.platform_commission", 0]}}}},
        ]
    ).to_list(length=1)
    row = rows[0] if rows else {}
    gross = _money(row.get("gross"))
    fees = _money(row.get("fees"))
    return {"gross": gross, "fees": fees, "net": _money(max(0.0, gross - fees))}


async def _driver_wallet(user: Dict[str, Any]) -> Dict[str, Any]:
    driver = await database.find_one("drivers", {"user_id": user["id"]})
    if not driver:
        raise PermissionError("Complete your Driver profile before opening the wallet.")
    settlement = await settlement_summary(user)
    totals = await _driver_lifetime_totals(str(user["id"]))
    recent = await database.find_many(
        "hailing_trips",
        {"driver_user_id": user["id"], "status": "COMPLETED", "payment_method": "cash"},
        sort=[("completed_at", -1), ("created_at", -1)],
        limit=DRIVER_LEDGER_LIMIT,
    )
    entries: List[Dict[str, Any]] = []
    for trip in recent:
        fare = trip.get("fare") or {}
        gross = _money(fare.get("total_fare"))
        fee = _money(fare.get("platform_commission"))
        entries.append(
            {
                "id": f"hailing:{trip['id']}",
                "source_type": "RIDE_NOW",
                "source_id": trip["id"],
                "label": f"Ride Now · {(trip.get('dropoff') or {}).get('formatted_address') or 'completed trip'}",
                "gross_usd": gross,
                "platform_commission_usd": fee,
                "worker_earnings_usd": _money(max(0.0, gross - fee)),
                "payment_method": "cash",
                "settlement_state": "weekly_fee_accrued",
                "occurred_at": trip.get("completed_at") or trip.get("updated_at"),
            }
        )
    return {
        "currency": "USD",
        "worker_role": "driver",
        "available_balance_usd": 0.0,
        "gross_earnings_usd": totals["gross"],
        "net_earnings_usd": totals["net"],
        "cash_collected_usd": totals["gross"],
        "digital_earnings_usd": 0.0,
        "amount_due_to_platform_usd": settlement["amount_due_usd"],
        "platform_commission_usd": totals["fees"],
        "paid_out_usd": 0.0,
        "ledger": entries,
        "payout_history": [],
        "payout_methods": [],
        "settlement_integrated": True,
        "cash_policy": "driver_collects_fare_directly",
        "platform_fee_policy": "weekly_postpaid",
        "driver_settlement": settlement,
    }


async def wallet_summary(user: Dict[str, Any]) -> Dict[str, Any]:
    role = str(user.get("role") or "").strip().lower()
    if role == "driver":
        return await _driver_wallet(user)
    return await legacy_wallet_summary(user)
''',
)

# Legacy finance service should not require encrypted payout destinations for drivers.
replace_once(
    "backend/app/services/worker_finance_service.py",
    '    summary = await (_driver_wallet(user) if role == "driver" else _courier_wallet(user))\n    summary["payout_methods"] = await list_payout_methods(user)\n    return summary\n',
    '    summary = await (_driver_wallet(user) if role == "driver" else _courier_wallet(user))\n    if role == "courier":\n        summary["payout_methods"] = await list_payout_methods(user)\n    else:\n        summary.setdefault("payout_methods", [])\n    return summary\n',
)

# Ride completion accrues the fee; overdue standing blocks only new Ride Now work.
replace_once(
    "backend/app/services/hailing_trip_service.py",
    'async def driver_go_online(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:\n    _require_hailing_enabled()\n    driver = await approved_driver_for_hailing(user, payload["city_id"], payload["ride_class"])\n',
    'async def driver_go_online(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:\n    _require_hailing_enabled()\n    from app.services.driver_weekly_settlement_service import enforce_driver_settlement_standing\n    await enforce_driver_settlement_standing(user)\n    driver = await approved_driver_for_hailing(user, payload["city_id"], payload["ride_class"])\n',
)
replace_once(
    "backend/app/services/hailing_trip_service.py",
    'async def accept_offer(offer_id: str, user: Dict[str, Any]) -> Dict[str, Any]:\n    _require_hailing_enabled()\n    driver = await driver_profile_for_user(user)\n',
    'async def accept_offer(offer_id: str, user: Dict[str, Any]) -> Dict[str, Any]:\n    _require_hailing_enabled()\n    from app.services.driver_weekly_settlement_service import enforce_driver_settlement_standing\n    await enforce_driver_settlement_standing(user)\n    driver = await driver_profile_for_user(user)\n',
)
replace_once(
    "backend/app/services/hailing_trip_service.py",
    '    updated = await transition_trip(trip, "COMPLETED", {"completed_at": now_iso(), "payment_status": "cash_collected" if trip.get("payment_method") == "cash" else trip.get("payment_status")})\n    if trip.get("driver_id"):\n',
    '    updated = await transition_trip(trip, "COMPLETED", {"completed_at": now_iso(), "payment_status": "cash_collected" if trip.get("payment_method") == "cash" else trip.get("payment_status")})\n    from app.services.driver_weekly_settlement_service import record_completed_ride_fee\n    await record_completed_ride_fee(updated)\n    if trip.get("driver_id"):\n',
)

# Payments: passenger cards remain off; live Stripe powers driver settlement only.
replace_once(
    "backend/app/routers/payments.py",
    '            "card_enabled": bool(settings.stripe_configured),\n            "provider": "stripe" if settings.stripe_configured else None,\n            "currency": settings.stripe_currency.upper() if settings.stripe_configured else "USD",\n',
    '            "card_enabled": bool(settings.stripe_configured and settings.passenger_card_payments_enabled),\n            "driver_settlement_enabled": bool(settings.stripe_configured),\n            "provider": "stripe" if settings.stripe_configured else None,\n            "currency": settings.stripe_currency.upper() if settings.stripe_configured else "USD",\n',
)
replace_once(
    "backend/app/services/stripe_payment_service.py",
    '    settings = _settings()\n    quote = await database.find_one("hailing_quotes", {"id": quote_id, "user_id": user["id"]})\n',
    '    settings = _settings()\n    if not settings.passenger_card_payments_enabled:\n        raise PermissionError("Passenger card payments are not enabled for Ride Now.")\n    quote = await database.find_one("hailing_quotes", {"id": quote_id, "user_id": user["id"]})\n',
)
replace_once(
    "backend/app/services/stripe_payment_service.py",
    '    existing = await active_trip_for_user(user)\n',
    '    if not _settings().passenger_card_payments_enabled:\n        raise PermissionError("Passenger card payments are not enabled for Ride Now.")\n    existing = await active_trip_for_user(user)\n',
)
replace_once(
    "backend/app/services/stripe_payment_service.py",
    '    intent = (((event.get("data") or {}).get("object")) or {})\n    if not isinstance(intent, dict) or not str(intent.get("id") or "").startswith("pi_"):\n        return {"received": True, "event_id": event_id}\n\n    trip = await database.find_one("hailing_trips", {"stripe_payment_intent_id": intent.get("id")})\n',
    '    intent = (((event.get("data") or {}).get("object")) or {})\n    if not isinstance(intent, dict) or not str(intent.get("id") or "").startswith("pi_"):\n        return {"received": True, "event_id": event_id}\n\n    metadata = intent.get("metadata") or {}\n    if metadata.get("product") == "driver_weekly_settlement":\n        from app.services.driver_weekly_settlement_service import apply_settlement_intent\n        return await apply_settlement_intent(intent, event_id=event_id, event_type=event_type)\n\n    trip = await database.find_one("hailing_trips", {"stripe_payment_intent_id": intent.get("id")})\n',
)

# Worker-finance API endpoints for exact server-calculated weekly settlement.
replace_once(
    "backend/app/routers/worker_finance.py",
    'from fastapi import APIRouter, Depends\n',
    'from fastapi import APIRouter, Depends, Request\n',
)
replace_once(
    "backend/app/routers/worker_finance.py",
    'from app.utils import api_error, api_success\n',
    'from app.services.driver_settlement_payment_service import create_driver_settlement_intent, confirm_driver_settlement_intent\nfrom app.services.driver_weekly_settlement_service import admin_settlement_dashboard\nfrom app.services.rate_limit_service import RateLimit, rate_limit_service\nfrom app.utils import api_error, api_success\n',
)
router_path = "backend/app/routers/worker_finance.py"
router_content = read(router_path)
if "driver/settlements/intent" not in router_content:
    router_content += '''\n\n@router.post("/driver/settlements/intent")\nasync def driver_settlement_intent(request: Request, user=Depends(get_current_user)):\n    await rate_limit_service.enforce(request, "driver-weekly-settlement", RateLimit(6, 300), identity=str(user.get("id") or ""))\n    try:\n        return api_success(await create_driver_settlement_intent(user))\n    except PermissionError as exc:\n        api_error(str(exc), 403)\n    except ValueError as exc:\n        api_error(str(exc), 400)\n    except RuntimeError as exc:\n        api_error(str(exc), 502)\n\n\n@router.post("/driver/settlements/confirm/{payment_intent_id}")\nasync def driver_settlement_confirm(payment_intent_id: str, request: Request, user=Depends(get_current_user)):\n    await rate_limit_service.enforce(request, "driver-weekly-settlement-confirm", RateLimit(10, 300), identity=str(user.get("id") or ""))\n    try:\n        return api_success(await confirm_driver_settlement_intent(payment_intent_id, user))\n    except PermissionError as exc:\n        api_error(str(exc), 403)\n    except ValueError as exc:\n        api_error(str(exc), 400)\n    except RuntimeError as exc:\n        api_error(str(exc), 502)\n\n\nadmin_router = APIRouter(prefix="/admin/finance", tags=["admin-finance"])\n\n\n@admin_router.get("/driver-settlements")\nasync def admin_driver_settlements(user=Depends(get_current_user)):\n    if user.get("role") != "admin":\n        api_error("Admin access required.", 403)\n    return api_success(await admin_settlement_dashboard())\n'''
    write(router_path, router_content)

# Main: bounded low-frequency statement finalizer/reminder worker + admin finance router.
replace_once(
    "backend/app/main.py",
    'from app.services.hailing_trip_service import hailing_dispatch_sweeper\n',
    'from app.services.hailing_trip_service import hailing_dispatch_sweeper\nfrom app.services.driver_weekly_settlement_service import driver_settlement_sweeper\n',
)
replace_once(
    "backend/app/main.py",
    'stripe_payment_task: asyncio.Task | None = None\n',
    'stripe_payment_task: asyncio.Task | None = None\ndriver_settlement_stop_event: asyncio.Event | None = None\ndriver_settlement_task: asyncio.Task | None = None\n',
)
replace_once(
    "backend/app/main.py",
    '    global ride_lifecycle_stop_event, ride_lifecycle_task, hailing_dispatch_stop_event, hailing_dispatch_task, stripe_payment_stop_event, stripe_payment_task, staging_routing_smoke_task, staging_courier_dispatch_smoke_task\n',
    '    global ride_lifecycle_stop_event, ride_lifecycle_task, hailing_dispatch_stop_event, hailing_dispatch_task, stripe_payment_stop_event, stripe_payment_task, driver_settlement_stop_event, driver_settlement_task, staging_routing_smoke_task, staging_courier_dispatch_smoke_task\n',
)
replace_once(
    "backend/app/main.py",
    '    await ensure_admin_seed_user()\n',
    '    await ensure_admin_seed_user()\n    driver_settlement_stop_event = asyncio.Event()\n    driver_settlement_task = asyncio.create_task(driver_settlement_sweeper(driver_settlement_stop_event))\n',
)
# Patch shutdown global separately; same exact string no longer exists after startup replacement, so target second occurrence manually.
main = read("backend/app/main.py")
shutdown_old = 'async def on_shutdown():\n    global ride_lifecycle_stop_event, ride_lifecycle_task, hailing_dispatch_stop_event, hailing_dispatch_task, stripe_payment_stop_event, stripe_payment_task, staging_routing_smoke_task, staging_courier_dispatch_smoke_task\n'
shutdown_new = 'async def on_shutdown():\n    global ride_lifecycle_stop_event, ride_lifecycle_task, hailing_dispatch_stop_event, hailing_dispatch_task, stripe_payment_stop_event, stripe_payment_task, driver_settlement_stop_event, driver_settlement_task, staging_routing_smoke_task, staging_courier_dispatch_smoke_task\n'
if shutdown_new not in main:
    if shutdown_old not in main:
        raise RuntimeError("Shutdown global anchor missing")
    main = main.replace(shutdown_old, shutdown_new, 1)
if '    if driver_settlement_stop_event:\n' not in main:
    anchor = '    if stripe_payment_task:\n        stripe_payment_task.cancel()\n'
    main = main.replace(anchor, anchor + '    if driver_settlement_stop_event:\n        driver_settlement_stop_event.set()\n    if driver_settlement_task:\n        driver_settlement_task.cancel()\n', 1)
if 'app.include_router(worker_finance.admin_router)' not in main:
    main = main.replace('app.include_router(worker_finance.router)\n', 'app.include_router(worker_finance.router)\napp.include_router(worker_finance.admin_router)\n', 1)
write("backend/app/main.py", main)

# ---------------------------------------------------------------------------
# Mobile: driver wallet settlement button; courier payout UI remains unchanged.
# ---------------------------------------------------------------------------
write(
    "mobile/types/workerFinance.types.ts",
    '''export type WorkerRole = "driver" | "courier";
export type PayoutMethodType = "ECOCASH" | "BANK";

export type WorkerPayoutMethod = {
  id: string;
  method_type: PayoutMethodType;
  account_holder_name: string;
  bank_name?: string | null;
  branch_name?: string | null;
  branch_code?: string | null;
  currency: string;
  masked_reference: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
};

export type WorkerLedgerEntry = {
  id: string;
  source_type: string;
  source_id: string;
  label: string;
  gross_usd: number;
  platform_commission_usd?: number | null;
  worker_earnings_usd: number;
  payment_method?: string | null;
  settlement_state: string;
  occurred_at?: string;
};

export type WorkerPayout = {
  id: string;
  amount_usd: number;
  status: string;
  payout_method_id?: string;
  provider_reference?: string;
  created_at?: string;
  paid_at?: string;
};

export type DriverSettlementStatement = {
  id: string;
  period_start: string;
  period_end: string;
  ride_count: number;
  gross_fares_usd: number;
  amount_due_usd: number;
  status: "due" | "overdue" | "paid";
  due_at?: string | null;
  paid_at?: string | null;
};

export type DriverSettlementSummary = {
  status: "clear" | "current" | "due" | "overdue";
  current_period_start: string;
  current_period_end: string;
  current_week_ride_count: number;
  current_week_cash_fares_usd: number;
  current_week_platform_fees_usd: number;
  amount_due_usd: number;
  outstanding_statement_count: number;
  earliest_due_at?: string | null;
  can_settle: boolean;
  ride_now_blocked: boolean;
  recent_statements: DriverSettlementStatement[];
};

export type WorkerWallet = {
  currency: string;
  worker_role: WorkerRole;
  available_balance_usd: number;
  gross_earnings_usd: number;
  net_earnings_usd: number;
  cash_collected_usd: number;
  digital_earnings_usd: number;
  amount_due_to_platform_usd: number;
  platform_commission_usd: number;
  paid_out_usd: number;
  ledger: WorkerLedgerEntry[];
  payout_history: WorkerPayout[];
  payout_methods: WorkerPayoutMethod[];
  settlement_integrated: boolean;
  cash_policy?: string;
  platform_fee_policy?: string;
  driver_settlement?: DriverSettlementSummary;
};

export type DriverSettlementIntent = {
  payment_intent_id: string;
  settlement_payment_id: string;
  client_secret: string;
  publishable_key: string;
  status: string;
  amount: number;
  currency: string;
};

export type PayoutMethodCreatePayload = {
  method_type: PayoutMethodType;
  account_holder_name: string;
  mobile_number?: string;
  bank_name?: string;
  account_number?: string;
  branch_name?: string;
  branch_code?: string;
  currency?: string;
  make_default?: boolean;
};

export type PayoutMethodUpdatePayload = {
  account_holder_name?: string;
  mobile_number?: string;
  bank_name?: string;
  account_number?: string;
  branch_name?: string | null;
  branch_code?: string | null;
  currency?: string;
  make_default?: boolean;
};
''',
)

write(
    "mobile/services/workerFinanceService.ts",
    '''import { requestData } from "./api";
import {
  DriverSettlementIntent,
  PayoutMethodCreatePayload,
  PayoutMethodUpdatePayload,
  WorkerPayoutMethod,
  WorkerWallet,
} from "../types/workerFinance.types";

export async function getWorkerWallet() {
  return requestData<WorkerWallet>({ method: "GET", url: "/worker/finance/wallet" });
}

export async function createDriverSettlementIntent() {
  return requestData<DriverSettlementIntent>({ method: "POST", url: "/worker/finance/driver/settlements/intent" });
}

export async function confirmDriverSettlementPayment(paymentIntentId: string) {
  return requestData<Record<string, unknown>>({
    method: "POST",
    url: `/worker/finance/driver/settlements/confirm/${encodeURIComponent(paymentIntentId)}`,
  });
}

export async function createWorkerPayoutMethod(payload: PayoutMethodCreatePayload) {
  return requestData<WorkerPayoutMethod>({ method: "POST", url: "/worker/finance/payout-methods", data: payload });
}

export async function updateWorkerPayoutMethod(methodId: string, payload: PayoutMethodUpdatePayload) {
  return requestData<WorkerPayoutMethod>({ method: "PATCH", url: `/worker/finance/payout-methods/${methodId}`, data: payload });
}

export async function setDefaultWorkerPayoutMethod(methodId: string) {
  return requestData<WorkerPayoutMethod>({ method: "POST", url: "/worker/finance/payout-methods/default", data: { method_id: methodId } });
}

export async function deleteWorkerPayoutMethod(methodId: string) {
  return requestData<{ deleted: boolean; id: string }>({ method: "DELETE", url: `/worker/finance/payout-methods/${methodId}` });
}
''',
)

# Wallet imports + state + settlement action.
replace_once(
    "mobile/app/(shared)/wallet.tsx",
    'import { MaterialCommunityIcons } from "@expo/vector-icons";\n',
    'import { MaterialCommunityIcons } from "@expo/vector-icons";\nimport { initPaymentSheet, initStripe, presentPaymentSheet } from "@stripe/stripe-react-native";\n',
)
replace_once(
    "mobile/app/(shared)/wallet.tsx",
    '  createWorkerPayoutMethod,\n',
    '  createDriverSettlementIntent,\n  confirmDriverSettlementPayment,\n  createWorkerPayoutMethod,\n',
)
replace_once(
    "mobile/app/(shared)/wallet.tsx",
    '  const [saving, setSaving] = useState(false);\n',
    '  const [saving, setSaving] = useState(false);\n  const [settling, setSettling] = useState(false);\n',
)
wallet_path = "mobile/app/(shared)/wallet.tsx"
wallet = read(wallet_path)
if "async function settleDriverBalance" not in wallet:
    anchor = '  async function makeDefault(method: WorkerPayoutMethod) {\n'
    method = '''  async function settleDriverBalance() {\n    const settlement = wallet?.driver_settlement;\n    if (!wallet || wallet.worker_role !== "driver" || !settlement?.can_settle || settling) return;\n    try {\n      setSettling(true);\n      setError(null);\n      const intent = await createDriverSettlementIntent();\n      await initStripe({ publishableKey: intent.publishable_key });\n      const initialized = await initPaymentSheet({\n        merchantDisplayName: "LetsGoRide",\n        paymentIntentClientSecret: intent.client_secret,\n        allowsDelayedPaymentMethods: false,\n        returnURL: "letsgoride://stripe-redirect",\n      });\n      if (initialized.error) throw new Error(initialized.error.message);\n      const presented = await presentPaymentSheet();\n      if (presented.error) {\n        if (presented.error.code === "Canceled") return;\n        throw new Error(presented.error.message);\n      }\n      await confirmDriverSettlementPayment(intent.payment_intent_id);\n      await load();\n      Alert.alert("Balance settled", "Your weekly LetsGoRide balance is clear. You can keep receiving Ride Now requests.");\n    } catch (err) {\n      setError(err instanceof Error ? err.message : "Unable to settle your weekly balance.");\n    } finally {\n      setSettling(false);\n    }\n  }\n\n'''
    if anchor not in wallet:
        raise RuntimeError("Wallet action anchor missing")
    wallet = wallet.replace(anchor, method + anchor, 1)

old_driver_policy = '''        {wallet.worker_role === "driver" ? (\n          <View style={styles.driverPolicyCard}>\n            <View style={styles.driverPolicyIcon}><MaterialCommunityIcons name="cash-check" size={22} color="#111111" /></View>\n            <View style={styles.driverPolicyCopy}>\n              <Text style={styles.driverPolicyTitle}>Cash fares are 100% yours</Text>\n              <Text style={styles.driverPolicyBody}>When a passenger pays cash, you keep the full fare. LetsGoRide only takes its platform fee from successfully settled card rides.</Text>\n            </View>\n          </View>\n        ) : null}\n'''
new_driver_policy = '''        {wallet.worker_role === "driver" && wallet.driver_settlement ? (\n          <View style={styles.driverPolicyCard}>\n            <View style={styles.driverPolicyIcon}><MaterialCommunityIcons name={wallet.driver_settlement.ride_now_blocked ? "alert-circle-outline" : "calendar-check-outline"} size={22} color="#111111" /></View>\n            <View style={styles.driverPolicyCopy}>\n              <Text style={styles.driverPolicyTitle}>{wallet.driver_settlement.can_settle ? `Weekly balance · ${money(wallet.driver_settlement.amount_due_usd)}` : "Earn first. Settle weekly."}</Text>\n              <Text style={styles.driverPolicyBody}>\n                {wallet.driver_settlement.can_settle\n                  ? `${wallet.driver_settlement.outstanding_statement_count} statement${wallet.driver_settlement.outstanding_statement_count === 1 ? "" : "s"} ready to settle${wallet.driver_settlement.earliest_due_at ? ` · due ${formatDate(wallet.driver_settlement.earliest_due_at)}` : ""}.`\n                  : `This week: ${wallet.driver_settlement.current_week_ride_count} rides · ${money(wallet.driver_settlement.current_week_cash_fares_usd)} collected · ${money(wallet.driver_settlement.current_week_platform_fees_usd)} LetsGoRide fees accrued.`}\n              </Text>\n              {wallet.driver_settlement.can_settle ? (\n                <Pressable accessibilityRole="button" disabled={settling} onPress={() => void settleDriverBalance()} style={({ pressed }) => [styles.settleButton, pressed && styles.settleButtonPressed, settling && styles.settleButtonDisabled]}>\n                  <MaterialCommunityIcons name="credit-card-check-outline" size={19} color="#FFFFFF" />\n                  <Text style={styles.settleButtonText}>{settling ? "Opening secure payment…" : `Settle balance · ${money(wallet.driver_settlement.amount_due_usd)}`}</Text>\n                </Pressable>\n              ) : null}\n            </View>\n          </View>\n        ) : null}\n'''
if new_driver_policy not in wallet:
    if old_driver_policy not in wallet:
        raise RuntimeError("Wallet driver policy anchor missing")
    wallet = wallet.replace(old_driver_policy, new_driver_policy, 1)

wallet = wallet.replace(
    '          <Text style={styles.balance}>{money(wallet.available_balance_usd)}</Text>\n          <Text style={styles.balanceLabel}>Available digital earnings</Text>',
    '          <Text style={styles.balance}>{money(wallet.worker_role === "driver" ? wallet.cash_collected_usd : wallet.available_balance_usd)}</Text>\n          <Text style={styles.balanceLabel}>{wallet.worker_role === "driver" ? "Cash fares collected" : "Available digital earnings"}</Text>',
    1,
)
wallet = wallet.replace(
    '            <Metric label="Net earnings" value={money(wallet.net_earnings_usd)} />\n            <Metric label="Paid out" value={money(wallet.paid_out_usd)} />',
    '            <Metric label={wallet.worker_role === "driver" ? "After LGR fees" : "Net earnings"} value={money(wallet.net_earnings_usd)} />\n            <Metric label={wallet.worker_role === "driver" ? "Weekly fees" : "Paid out"} value={money(wallet.worker_role === "driver" ? wallet.driver_settlement?.current_week_platform_fees_usd || 0 : wallet.paid_out_usd)} />',
    1,
)
wallet = wallet.replace(
    '<MoneyCard icon="cash-multiple" label={wallet.worker_role === "driver" ? "Cash kept by you" : "Cash collected"} value={money(wallet.cash_collected_usd)} body={wallet.worker_role === "driver" ? "Full cash fare kept directly by the driver." : "Cash collected directly on completed work."} />\n          <MoneyCard icon="credit-card-outline" label="Digital earnings" value={money(wallet.digital_earnings_usd)} body="Settled digital worker earnings before payouts." />\n          <MoneyCard icon="percent-outline" label={wallet.worker_role === "driver" ? "Card platform fee" : "Platform commission"} value={money(wallet.platform_commission_usd)} body={wallet.worker_role === "driver" ? "LetsGoRide fee from settled card rides only." : "Platform commission recorded across completed work."} />',
    '<MoneyCard icon="cash-multiple" label={wallet.worker_role === "driver" ? "Cash collected" : "Cash collected"} value={money(wallet.cash_collected_usd)} body={wallet.worker_role === "driver" ? "Passenger pays you directly. You keep the cash and settle LetsGoRide weekly." : "Cash collected directly on completed work."} />\n          <MoneyCard icon={wallet.worker_role === "driver" ? "calendar-week" : "credit-card-outline"} label={wallet.worker_role === "driver" ? "Due now" : "Digital earnings"} value={money(wallet.worker_role === "driver" ? wallet.amount_due_to_platform_usd : wallet.digital_earnings_usd)} body={wallet.worker_role === "driver" ? "Only completed weekly statements become payable." : "Settled digital worker earnings before payouts."} />\n          <MoneyCard icon="percent-outline" label={wallet.worker_role === "driver" ? "Lifetime LetsGoRide fees" : "Platform commission"} value={money(wallet.platform_commission_usd)} body={wallet.worker_role === "driver" ? "Calculated automatically from each completed ride fare snapshot." : "Platform commission recorded across completed work."} />',
    1,
)
# Courier-only payout-method section.
section_anchor = '        <View style={styles.section}>\n          <View style={styles.sectionHeader}>\n            <View>\n              <Text style={styles.sectionTitle}>Payout methods</Text>'
if '{wallet.worker_role === "courier" ? (\n        <View style={styles.section}>' not in wallet:
    if section_anchor not in wallet:
        raise RuntimeError("Payout section anchor missing")
    wallet = wallet.replace(section_anchor, '{wallet.worker_role === "courier" ? (\n        <View style={styles.section}>\n          <View style={styles.sectionHeader}>\n            <View>\n              <Text style={styles.sectionTitle}>Payout methods</Text>', 1)
    # Close the first payout-method section before the next section. Use the unique "Recent activity" title as boundary.
    recent_anchor = '        <View style={styles.section}>\n          <Text style={styles.sectionTitle}>Recent activity</Text>'
    if recent_anchor not in wallet:
        raise RuntimeError("Recent activity anchor missing")
    wallet = wallet.replace(recent_anchor, '        </View>\n        ) : null}\n\n        <View style={styles.section}>\n          <Text style={styles.sectionTitle}>Recent activity</Text>', 1)

if 'function formatDate(' not in wallet:
    wallet += '\n\nfunction formatDate(value: string) {\n  const date = new Date(value);\n  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });\n}\n'
# Add settlement styles if missing.
if 'settleButton:' not in wallet:
    style_anchor = '  driverPolicyBody: {'
    idx = wallet.find(style_anchor)
    if idx == -1:
        raise RuntimeError("Wallet style anchor missing")
    # Inject before driverPolicyBody style to avoid parsing the StyleSheet object.
    wallet = wallet[:idx] + '  settleButton: { marginTop: 14, minHeight: 48, borderRadius: 16, backgroundColor: "#111111", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },\n  settleButtonPressed: { opacity: 0.86 },\n  settleButtonDisabled: { opacity: 0.55 },\n  settleButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },\n' + wallet[idx:]
write(wallet_path, wallet)

# Driver Account copy: no payout destination required in the weekly post-paid model.
account_path = "mobile/app/(driver)/account.tsx"
account = read(account_path)
account = account.replace('subtitle="Balance, cash ledger and payout methods"', 'subtitle="Weekly fees, statements and settlements"')
write(account_path, account)

# Admin service types + endpoint.
admin_service = read("mobile/services/adminService.ts")
if "AdminDriverSettlementDashboard" not in admin_service:
    admin_service += '''\n\nexport type AdminDriverSettlement = {\n  id: string;\n  driver_user_id: string;\n  driver_id: string;\n  driver_name: string;\n  driver_email?: string | null;\n  period_start: string;\n  period_end: string;\n  ride_count: number;\n  gross_fares_usd: number;\n  amount_due_usd: number;\n  status: "due" | "overdue" | "paid";\n  due_at?: string | null;\n  paid_at?: string | null;\n};\n\nexport type AdminDriverSettlementDashboard = {\n  summary: { outstanding_usd: number; collected_usd: number; overdue_count: number; statement_count: number };\n  items: AdminDriverSettlement[];\n};\n\nexport async function getAdminDriverSettlements() {\n  return requestData<AdminDriverSettlementDashboard>({ method: "GET", url: "/admin/finance/driver-settlements" });\n}\n'''
    write("mobile/services/adminService.ts", admin_service)

write(
    "mobile/app/(admin)/settlements.tsx",
    '''import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Screen } from "../../components/ui/Screen";
import { getAdminDriverSettlements, AdminDriverSettlementDashboard } from "../../services/adminService";
import { v2Theme } from "../../constants/v2Theme";

export default function AdminDriverSettlementsScreen() {
  const [data, setData] = useState<AdminDriverSettlementDashboard | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setData(await getAdminDriverSettlements()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load driver settlements."); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <Screen showBack fallbackRoute="/(admin)/dashboard" title="Driver settlements" showNotifications={false} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }}>
      {error ? <View style={styles.notice}><Text style={styles.noticeText}>{error}</Text></View> : null}
      {data ? <>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>WEEKLY RECEIVABLES</Text>
          <Text style={styles.heroValue}>${data.summary.outstanding_usd.toFixed(2)}</Text>
          <Text style={styles.heroLabel}>Outstanding from drivers</Text>
          <View style={styles.metrics}>
            <Metric label="Collected" value={`$${data.summary.collected_usd.toFixed(2)}`} />
            <Metric label="Overdue" value={String(data.summary.overdue_count)} />
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.title}>Statements</Text>
          <Text style={styles.sub}>Every amount is calculated from completed Ride Now fare snapshots. No manual subtraction.</Text>
          {data.items.length ? data.items.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.name}>{item.driver_name}</Text>
                <Text style={styles.meta}>{item.ride_count} rides · ${item.gross_fares_usd.toFixed(2)} cash fares</Text>
                <Text style={styles.meta}>{item.period_start.slice(0, 10)} → {item.period_end.slice(0, 10)}</Text>
              </View>
              <View style={styles.amountCol}>
                <Text style={styles.amount}>${item.amount_due_usd.toFixed(2)}</Text>
                <View style={[styles.status, item.status === "overdue" && styles.statusDanger, item.status === "paid" && styles.statusPaid]}>
                  <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
                </View>
              </View>
            </View>
          )) : <View style={styles.empty}><MaterialCommunityIcons name="check-circle-outline" size={28} color={v2Theme.colors.success} /><Text style={styles.emptyText}>No weekly statements yet.</Text></View>}
        </View>
      </> : null}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, padding: 22, backgroundColor: "#111111" },
  eyebrow: { color: "#AAB0B6", fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  heroValue: { color: "#FFFFFF", fontSize: 38, fontWeight: "900", marginTop: 10 },
  heroLabel: { color: "#C9CDD1", fontSize: 14, marginTop: 2 },
  metrics: { flexDirection: "row", gap: 10, marginTop: 18 },
  metric: { flex: 1, padding: 13, borderRadius: 18, backgroundColor: "#202124" },
  metricValue: { color: "#FFFFFF", fontWeight: "900", fontSize: 18 },
  metricLabel: { color: "#AAB0B6", fontSize: 12, marginTop: 3 },
  section: { marginTop: 22 },
  title: { color: "#111111", fontSize: 22, fontWeight: "900" },
  sub: { color: "#687078", fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 12 },
  row: { flexDirection: "row", gap: 12, alignItems: "center", padding: 16, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#ECE8E1", marginBottom: 10 },
  flex: { flex: 1 },
  name: { color: "#111111", fontWeight: "900", fontSize: 15 },
  meta: { color: "#747A80", fontSize: 12, marginTop: 3 },
  amountCol: { alignItems: "flex-end" },
  amount: { color: "#111111", fontSize: 18, fontWeight: "900" },
  status: { marginTop: 6, borderRadius: 999, backgroundColor: "#F3E7B7", paddingHorizontal: 9, paddingVertical: 4 },
  statusDanger: { backgroundColor: "#FAD9D6" },
  statusPaid: { backgroundColor: "#DDF3E5" },
  statusText: { color: "#34383C", fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  empty: { alignItems: "center", padding: 26, borderRadius: 22, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#ECE8E1" },
  emptyText: { marginTop: 8, color: "#687078", fontWeight: "700" },
  notice: { padding: 14, borderRadius: 16, backgroundColor: "#FDE8E7" },
  noticeText: { color: v2Theme.colors.danger, fontWeight: "700" },
});
''',
)

# Admin Control Center: add Settlements card without changing the live-control architecture.
control_path = "mobile/components/admin/AdminControlCenter.tsx"
control = read(control_path)
if 'title="Settlements"' not in control:
    anchor = '<ManageCard icon="calendar-account-outline" title="Workforce" subtitle="Workers & shifts" onPress={onOpenWorkforce} />'
    if anchor not in control:
        raise RuntimeError("Admin manage-card anchor missing")
    control = control.replace(anchor, anchor + '\n          <ManageCard icon="cash-sync" title="Settlements" subtitle="Weekly driver fees" onPress={() => router.push("/(admin)/settlements" as never)} />', 1)
write(control_path, control)

print("Weekly driver settlement patch applied successfully")
