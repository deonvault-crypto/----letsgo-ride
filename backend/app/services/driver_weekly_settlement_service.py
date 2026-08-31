from __future__ import annotations

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
