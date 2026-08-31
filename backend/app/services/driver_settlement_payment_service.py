from __future__ import annotations

from typing import Any, Dict

from app.database import database
from app.services.driver_weekly_settlement_service import (
    PAYMENT_COLLECTION,
    apply_settlement_intent,
    prepare_settlement_payment,
)
from app.services.stripe_payment_service import _intent_client_payload, _settings, _stripe_request, retrieve_payment_intent
from app.utils import now_iso


SETTLEMENT_CURRENCY = "usd"


async def create_driver_settlement_intent(user: Dict[str, Any]) -> Dict[str, Any]:
    settings = _settings()
    if str(settings.stripe_currency or "").strip().lower() != SETTLEMENT_CURRENCY:
        raise RuntimeError("Driver weekly settlements require Stripe USD currency configuration.")
    payment = await prepare_settlement_payment(user)
    amount_minor = int(round(float(payment["amount_usd"]) * 100))
    existing_id = str(payment.get("stripe_payment_intent_id") or "")
    if existing_id:
        existing = await retrieve_payment_intent(existing_id)
        if (
            existing.get("status") not in {"canceled"}
            and int(existing.get("amount") or 0) == amount_minor
            and str(existing.get("currency") or "").lower() == SETTLEMENT_CURRENCY
        ):
            return _intent_client_payload(existing, settings.stripe_publishable_key)

    intent = await _stripe_request(
        "POST",
        "/payment_intents",
        data={
            "amount": amount_minor,
            "currency": SETTLEMENT_CURRENCY,
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
    if str(intent.get("currency") or "").lower() != SETTLEMENT_CURRENCY:
        raise ValueError("This Stripe payment is not a USD LetsGoRide weekly settlement.")
    result = await apply_settlement_intent(intent, event_type="client_confirmation")
    return result.get("payment") or payment
