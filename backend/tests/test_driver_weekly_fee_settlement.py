from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.database import database
from app.services import driver_fee_settlement_service as settlement


@pytest.fixture(autouse=True)
def reset_finance_memory():
    names = [
        "users",
        "drivers",
        "hailing_trips",
        "driver_fee_statements",
        "hailing_driver_presence",
        "hailing_dispatch_offers",
        "app_notifications",
        "device_push_tokens",
        "notification_preferences",
    ]
    for name in names:
        database.memory.setdefault(name, [])
        database.memory[name].clear()
    yield
    for name in names:
        database.memory[name].clear()


@pytest.mark.asyncio
async def test_day_seven_statement_uses_immutable_trip_fee_and_excludes_old_card_flow(monkeypatch):
    async def no_notice(statement, kind):
        return None

    monkeypatch.setattr(settlement, "_send_statement_notice", no_notice)
    now = datetime(2026, 8, 31, 12, tzinfo=timezone.utc)
    first = now - timedelta(days=7, minutes=1)
    database.memory["users"].append({"id": "driver-user", "role": "driver", "email": "driver@example.com"})
    database.memory["drivers"].append({"id": "driver-1", "user_id": "driver-user"})
    database.memory["hailing_trips"].extend([
        {
            "id": "cash-1",
            "driver_user_id": "driver-user",
            "status": "COMPLETED",
            "payment_method": "cash",
            "completed_at": first.isoformat(),
            "fare": {"total_fare": 10.0, "platform_commission": 0.60},
        },
        {
            "id": "cash-2",
            "driver_user_id": "driver-user",
            "status": "COMPLETED",
            "payment_method": "cash",
            "completed_at": (first + timedelta(days=2)).isoformat(),
            "fare": {"total_fare": 20.0, "platform_commission": 1.20},
        },
        {
            "id": "legacy-card",
            "driver_user_id": "driver-user",
            "status": "COMPLETED",
            "payment_method": "card",
            "payment_status": "paid",
            "completed_at": (first + timedelta(days=3)).isoformat(),
            "fare": {"total_fare": 30.0, "platform_commission": 1.80},
        },
    ])

    statement = await settlement.issue_due_statement_for_driver("driver-user", now=now)
    assert statement is not None
    assert statement["ride_count"] == 2
    assert statement["gross_fares_usd"] == 30.0
    assert statement["platform_fee_usd"] == 1.80
    assert set(statement["trip_ids"]) == {"cash-1", "cash-2"}
    assert database.memory["hailing_trips"][2].get("weekly_fee_statement_id") is None


@pytest.mark.asyncio
async def test_no_settle_button_before_day_seven(monkeypatch):
    now = datetime(2026, 8, 31, 12, tzinfo=timezone.utc)
    database.memory["drivers"].append({"id": "driver-1", "user_id": "driver-user"})
    database.memory["hailing_trips"].append({
        "id": "cash-1",
        "driver_user_id": "driver-user",
        "status": "COMPLETED",
        "payment_method": "cash",
        "completed_at": (now - timedelta(days=2)).isoformat(),
        "fare": {"total_fare": 10.0, "platform_commission": 0.60},
    })
    wallet = await settlement.driver_settlement_wallet("driver-user")
    assert wallet["settlement_required"] is False
    assert wallet["settlement_button_visible"] is False
    assert wallet["current_week"]["platform_fee_accrued_usd"] == 0.60


@pytest.mark.asyncio
async def test_overdue_statement_pauses_only_ride_now(monkeypatch):
    now = datetime(2026, 8, 31, 12, tzinfo=timezone.utc)
    database.memory["drivers"].append({"id": "driver-1", "user_id": "driver-user", "status": "approved"})
    database.memory["hailing_driver_presence"].append({"id": "hailing-presence-driver-1", "driver_id": "driver-1", "status": "available"})
    statement = {
        "id": "statement-1",
        "driver_user_id": "driver-user",
        "status": "due",
        "platform_fee_usd": 4.20,
        "issued_at": (now - timedelta(days=3)).isoformat(),
        "grace_ends_at": (now - timedelta(hours=1)).isoformat(),
        "created_at": (now - timedelta(days=3)).isoformat(),
        "updated_at": (now - timedelta(days=3)).isoformat(),
        "reminder_notification_at": "done",
        "final_notification_at": "done",
    }
    database.memory["driver_fee_statements"].append(statement)

    refreshed = await settlement.refresh_statement_status(statement, now=now)
    assert refreshed["status"] == "overdue"
    driver = database.memory["drivers"][0]
    assert driver["ride_now_finance_paused"] is True
    assert driver["status"] == "approved"
    assert database.memory["hailing_driver_presence"][0]["status"] == "offline"


@pytest.mark.asyncio
async def test_stripe_intent_amount_is_server_owned(monkeypatch):
    database.memory["driver_fee_statements"].append({
        "id": "statement-1",
        "statement_key": "x",
        "driver_user_id": "driver-user",
        "status": "due",
        "currency": "USD",
        "ride_count": 3,
        "gross_fares_usd": 50.0,
        "platform_fee_usd": 3.25,
        "period_start": "2026-08-20T00:00:00+00:00",
        "period_end": "2026-08-27T00:00:00+00:00",
        "issued_at": "2026-08-27T00:00:00+00:00",
        "grace_ends_at": "2099-08-29T00:00:00+00:00",
        "created_at": "2026-08-27T00:00:00+00:00",
        "updated_at": "2026-08-27T00:00:00+00:00",
    })
    monkeypatch.setattr(
        settlement,
        "stripe_settings",
        lambda: SimpleNamespace(stripe_currency="usd", stripe_publishable_key="pk_live_example"),
    )
    captured = {}

    async def fake_stripe_request(method, path, *, data=None, idempotency_key=None):
        captured.update({"method": method, "path": path, "data": data, "idempotency_key": idempotency_key})
        return {
            "id": "pi_driver_fee",
            "client_secret": "pi_driver_fee_secret_example",
            "status": "requires_payment_method",
            "amount": data["amount"],
            "currency": data["currency"],
            "metadata": {
                "product": settlement.DRIVER_FEE_PRODUCT,
                "statement_id": "statement-1",
                "driver_user_id": "driver-user",
            },
        }

    monkeypatch.setattr(settlement, "_stripe_request", fake_stripe_request)
    result = await settlement.create_driver_fee_payment_intent({"id": "driver-user", "role": "driver"})
    assert captured["data"]["amount"] == 325
    assert result["amount"] == 325
    assert captured["idempotency_key"].startswith("driver-weekly-fee:statement-1:325")


@pytest.mark.asyncio
async def test_successful_settlement_clears_only_finance_pause(monkeypatch):
    database.memory["drivers"].append({
        "id": "driver-1",
        "user_id": "driver-user",
        "status": "approved",
        "ride_now_finance_paused": True,
        "ride_now_finance_pause_statement_id": "statement-1",
    })
    statement = {
        "id": "statement-1",
        "driver_user_id": "driver-user",
        "status": "overdue",
        "platform_fee_usd": 2.50,
        "stripe_payment_intent_id": "pi_driver_fee",
    }
    database.memory["driver_fee_statements"].append(statement)

    async def no_notification(*args, **kwargs):
        return {}
    monkeypatch.setattr(settlement, "create_app_notification", no_notification)
    intent = {
        "id": "pi_driver_fee",
        "status": "succeeded",
        "amount": 250,
        "currency": "usd",
        "metadata": {
            "product": settlement.DRIVER_FEE_PRODUCT,
            "statement_id": "statement-1",
            "driver_user_id": "driver-user",
        },
    }
    monkeypatch.setattr(settlement, "get_settings", lambda: SimpleNamespace(stripe_currency="usd"))
    paid = await settlement._mark_statement_paid(statement, intent, "evt_1")
    assert paid["status"] == "paid"
    driver = database.memory["drivers"][0]
    assert driver["ride_now_finance_paused"] is False
    assert driver["status"] == "approved"
