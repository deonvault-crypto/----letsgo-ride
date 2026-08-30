from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional

import requests

from app.config import Settings, get_settings
from app.database import database
from app.services.hailing_fare_service import quote_expired
from app.utils import new_id, now_iso


logger = logging.getLogger(__name__)
STRIPE_API_BASE = "https://api.stripe.com/v1"
STRIPE_TIMEOUT_SECONDS = 12
STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300


class StripePaymentError(RuntimeError):
    pass


def _environment_mode(settings: Settings) -> str:
    return "live" if bool(getattr(settings, "is_production", False)) else "test"


def stripe_card_payments_available(settings: Optional[Settings] = None) -> bool:
    settings = settings or get_settings()
    if not bool(getattr(settings, "stripe_card_payments_enabled", False)):
        return False
    secret_key = str(getattr(settings, "stripe_secret_key", "") or "")
    publishable_key = str(getattr(settings, "stripe_publishable_key", "") or "")
    if not secret_key or not publishable_key:
        return False
    if bool(getattr(settings, "is_production", False)):
        return secret_key.startswith("sk_live_") and publishable_key.startswith("pk_live_")
    return secret_key.startswith("sk_test_") and publishable_key.startswith("pk_test_")


def stripe_configuration_issue(settings: Optional[Settings] = None) -> Optional[str]:
    settings = settings or get_settings()
    if not bool(getattr(settings, "stripe_card_payments_enabled", False)):
        return "disabled"
    secret_key = str(getattr(settings, "stripe_secret_key", "") or "")
    publishable_key = str(getattr(settings, "stripe_publishable_key", "") or "")
    is_production = bool(getattr(settings, "is_production", False))
    if not secret_key or not publishable_key:
        return "missing_keys"
    if is_production and not (
        secret_key.startswith("sk_live_")
        and publishable_key.startswith("pk_live_")
    ):
        return "production_requires_live_keys"
    if not is_production and not (
        secret_key.startswith("sk_test_")
        and publishable_key.startswith("pk_test_")
    ):
        return "nonproduction_requires_test_keys"
    return None


def _amount_cents(value: Any) -> int:
    amount = Decimal(str(value or "0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    cents = int(amount * 100)
    if cents <= 0:
        raise ValueError("Card payment amount must be greater than zero.")
    return cents


def _idempotency_key(*parts: str) -> str:
    digest = hashlib.sha256(":".join(parts).encode("utf-8")).hexdigest()
    return f"letsgoride-{digest[:48]}"


def _safe_stripe_message(payload: Any, fallback: str) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            code = str(error.get("code") or "").strip()
            decline_code = str(error.get("decline_code") or "").strip()
            if decline_code:
                return f"Card payment was declined ({decline_code})."
            if code in {"payment_intent_unexpected_state", "payment_intent_authentication_failure"}:
                return "Card authorization is no longer valid. Please try the card again."
    return fallback


def _sync_stripe_request(
    method: str,
    path: str,
    *,
    data: Optional[Dict[str, Any]] = None,
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    settings = get_settings()
    if not stripe_card_payments_available(settings):
        raise StripePaymentError("Card payments are not configured for this environment.")
    headers = {"Accept": "application/json"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    try:
        response = requests.request(
            method,
            f"{STRIPE_API_BASE}{path}",
            data=data,
            headers=headers,
            auth=(settings.stripe_secret_key, ""),
            timeout=STRIPE_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.warning("stripe_request_unavailable method=%s path=%s error_type=%s", method, path, type(exc).__name__)
        raise StripePaymentError("Card payment service is temporarily unavailable. Please try again.") from exc
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if response.status_code >= 400:
        logger.warning("stripe_request_failed method=%s path=%s status=%s", method, path, response.status_code)
        raise StripePaymentError(_safe_stripe_message(payload, "Card payment could not be completed. Please try again."))
    if not isinstance(payload, dict):
        raise StripePaymentError("Card payment service returned an invalid response.")
    return payload


async def _stripe_request(
    method: str,
    path: str,
    *,
    data: Optional[Dict[str, Any]] = None,
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    return await asyncio.to_thread(
        _sync_stripe_request,
        method,
        path,
        data=data,
        idempotency_key=idempotency_key,
    )


async def _quote_for_user(quote_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    quote = await database.find_one("hailing_quotes", {"id": quote_id, "user_id": user["id"]})
    if not quote or quote_expired(quote):
        raise ValueError("This Ride Now quote has expired. Please request a new fare.")
    return quote


async def prepare_hailing_card_authorization(
    quote_id: str,
    client_request_id: str,
    user: Dict[str, Any],
) -> Dict[str, Any]:
    settings = get_settings()
    if not stripe_card_payments_available(settings):
        raise StripePaymentError("Card payments are not available right now.")
    quote = await _quote_for_user(quote_id, user)
    amount = _amount_cents((quote.get("fare") or {}).get("total_fare"))
    existing = await database.find_one(
        "stripe_payment_intents",
        {
            "user_id": user["id"],
            "product": "hailing",
            "quote_id": quote_id,
            "client_request_id": client_request_id,
        },
    )
    if existing and existing.get("payment_intent_id"):
        intent = await _stripe_request("GET", f"/payment_intents/{existing['payment_intent_id']}")
    else:
        intent = await _stripe_request(
            "POST",
            "/payment_intents",
            data={
                "amount": amount,
                "currency": "usd",
                "capture_method": "manual",
                "payment_method_types[]": "card",
                "description": "LetsGoRide Ride Now",
                "metadata[platform]": "letsgoride",
                "metadata[product]": "hailing",
                "metadata[quote_id]": quote_id,
                "metadata[passenger_user_id]": str(user["id"]),
                "metadata[client_request_id]": client_request_id,
                "metadata[environment]": settings.app_env.strip().lower(),
            },
            idempotency_key=_idempotency_key(
                "hailing-card-setup",
                settings.app_env.strip().lower(),
                str(user["id"]),
                quote_id,
                client_request_id,
            ),
        )
        record = {
            "id": f"stripe-pi-{intent['id']}",
            "payment_intent_id": intent["id"],
            "user_id": user["id"],
            "product": "hailing",
            "quote_id": quote_id,
            "client_request_id": client_request_id,
            "amount": amount,
            "currency": "usd",
            "mode": _environment_mode(settings),
            "trip_id": None,
            "status": str(intent.get("status") or "requires_payment_method"),
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await database.insert_one("stripe_payment_intents", record)
    if int(intent.get("amount") or 0) != amount or str(intent.get("currency") or "").lower() != "usd":
        raise StripePaymentError("Card authorization amount no longer matches this fare. Please request a new fare.")
    client_secret = str(intent.get("client_secret") or "")
    if not client_secret:
        raise StripePaymentError("Card authorization could not be prepared. Please try again.")
    await database.update_one(
        "stripe_payment_intents",
        f"stripe-pi-{intent['id']}",
        {"status": intent.get("status"), "updated_at": now_iso()},
    )
    return {
        "payment_intent_id": intent["id"],
        "client_secret": client_secret,
        "publishable_key": settings.stripe_publishable_key,
        "status": intent.get("status"),
        "amount": amount,
        "currency": "usd",
    }


async def validate_hailing_card_authorization(
    quote: Dict[str, Any],
    payment_intent_id: str,
    user: Dict[str, Any],
) -> Dict[str, Any]:
    if not stripe_card_payments_available():
        raise StripePaymentError("Card payments are not available right now.")
    intent = await _stripe_request("GET", f"/payment_intents/{payment_intent_id}")
    metadata = intent.get("metadata") or {}
    expected_amount = _amount_cents((quote.get("fare") or {}).get("total_fare"))
    if str(metadata.get("platform") or "") != "letsgoride" or str(metadata.get("product") or "") != "hailing":
        raise PermissionError("This card authorization does not belong to LetsGoRide Ride Now.")
    if str(metadata.get("quote_id") or "") != str(quote["id"]):
        raise PermissionError("This card authorization does not match the selected Ride Now fare.")
    if str(metadata.get("passenger_user_id") or "") != str(user["id"]):
        raise PermissionError("This card authorization belongs to another account.")
    if int(intent.get("amount") or 0) != expected_amount or str(intent.get("currency") or "").lower() != "usd":
        raise ValueError("Card authorization amount does not match this Ride Now fare.")
    if str(intent.get("status") or "") != "requires_capture":
        raise ValueError("Card authorization is not complete yet. Please finish the card payment sheet and try again.")
    record = await database.find_one("stripe_payment_intents", {"payment_intent_id": payment_intent_id})
    if record and record.get("trip_id"):
        existing_trip = await database.find_one("hailing_trips", {"id": record["trip_id"]})
        if existing_trip:
            return intent
        raise ValueError("This card authorization has already been used.")
    return intent


async def bind_hailing_card_authorization(trip_id: str, payment_intent_id: str) -> Dict[str, Any]:
    trip = await database.find_one("hailing_trips", {"id": trip_id})
    if not trip:
        raise ValueError("Ride Now trip not found while binding card authorization.")
    updated = await database.update_one(
        "hailing_trips",
        trip_id,
        {
            "payment_intent_id": payment_intent_id,
            "payment_status": "authorized",
            "payment_authorized_at": now_iso(),
            "updated_at": now_iso(),
        },
    )
    record = await database.find_one("stripe_payment_intents", {"payment_intent_id": payment_intent_id})
    if record:
        await database.update_one(
            "stripe_payment_intents",
            record["id"],
            {"trip_id": trip_id, "status": "requires_capture", "updated_at": now_iso()},
        )
    return updated or trip


async def capture_hailing_card_payment(trip: Dict[str, Any]) -> Dict[str, Any]:
    if trip.get("payment_method") != "card" or not trip.get("payment_intent_id"):
        return trip
    payment_intent_id = str(trip["payment_intent_id"])
    try:
        intent = await _stripe_request("GET", f"/payment_intents/{payment_intent_id}")
        status = str(intent.get("status") or "")
        if status == "succeeded":
            captured = intent
        elif status == "requires_capture":
            captured = await _stripe_request(
                "POST",
                f"/payment_intents/{payment_intent_id}/capture",
                idempotency_key=_idempotency_key("hailing-card-capture", str(trip["id"]), payment_intent_id),
            )
        else:
            raise StripePaymentError("Card authorization is no longer capturable.")
        updated = await database.update_one(
            "hailing_trips",
            trip["id"],
            {
                "payment_status": "paid",
                "payment_captured_at": now_iso(),
                "payment_failure_reason": None,
                "updated_at": now_iso(),
            },
        )
        record = await database.find_one("stripe_payment_intents", {"payment_intent_id": payment_intent_id})
        if record:
            await database.update_one(
                "stripe_payment_intents",
                record["id"],
                {"status": captured.get("status") or "succeeded", "updated_at": now_iso()},
            )
        return updated or trip
    except (StripePaymentError, ValueError) as exc:
        logger.error("stripe_capture_failed trip_id=%s payment_intent_id=%s error_type=%s", trip.get("id"), payment_intent_id, type(exc).__name__)
        updated = await database.update_one(
            "hailing_trips",
            trip["id"],
            {
                "payment_status": "failed",
                "payment_failure_reason": "capture_failed",
                "payment_reconciliation_required": True,
                "updated_at": now_iso(),
            },
        )
        return updated or trip


async def release_hailing_card_authorization(trip: Dict[str, Any], reason: str) -> Dict[str, Any]:
    if trip.get("payment_method") != "card" or not trip.get("payment_intent_id"):
        return trip
    payment_intent_id = str(trip["payment_intent_id"])
    try:
        intent = await _stripe_request("GET", f"/payment_intents/{payment_intent_id}")
        status = str(intent.get("status") or "")
        if status == "canceled":
            cancelled = intent
        elif status == "succeeded":
            logger.error("stripe_release_skipped_already_captured trip_id=%s payment_intent_id=%s", trip.get("id"), payment_intent_id)
            updated = await database.update_one(
                "hailing_trips",
                trip["id"],
                {"payment_status": "paid", "payment_reconciliation_required": True, "updated_at": now_iso()},
            )
            return updated or trip
        else:
            cancelled = await _stripe_request(
                "POST",
                f"/payment_intents/{payment_intent_id}/cancel",
                data={"cancellation_reason": "requested_by_customer"},
                idempotency_key=_idempotency_key("hailing-card-release", str(trip["id"]), payment_intent_id),
            )
        updated = await database.update_one(
            "hailing_trips",
            trip["id"],
            {
                "payment_status": "authorization_released",
                "payment_authorization_released_at": now_iso(),
                "payment_release_reason": reason,
                "updated_at": now_iso(),
            },
        )
        record = await database.find_one("stripe_payment_intents", {"payment_intent_id": payment_intent_id})
        if record:
            await database.update_one(
                "stripe_payment_intents",
                record["id"],
                {"status": cancelled.get("status") or "canceled", "updated_at": now_iso()},
            )
        return updated or trip
    except StripePaymentError as exc:
        logger.error("stripe_release_failed trip_id=%s payment_intent_id=%s error_type=%s", trip.get("id"), payment_intent_id, type(exc).__name__)
        updated = await database.update_one(
            "hailing_trips",
            trip["id"],
            {"payment_reconciliation_required": True, "payment_release_reason": reason, "updated_at": now_iso()},
        )
        return updated or trip


def verify_stripe_webhook(raw_body: bytes, signature_header: str) -> Dict[str, Any]:
    settings = get_settings()
    secret = settings.stripe_webhook_secret
    if not secret:
        raise PermissionError("Stripe webhook is not configured.")
    timestamp: Optional[int] = None
    signatures: list[str] = []
    for item in signature_header.split(","):
        key, separator, value = item.strip().partition("=")
        if not separator:
            continue
        if key == "t":
            try:
                timestamp = int(value)
            except ValueError:
                timestamp = None
        elif key == "v1" and value:
            signatures.append(value)
    if timestamp is None or not signatures:
        raise PermissionError("Invalid Stripe webhook signature.")
    if abs(int(time.time()) - timestamp) > STRIPE_WEBHOOK_TOLERANCE_SECONDS:
        raise PermissionError("Expired Stripe webhook signature.")
    signed_payload = str(timestamp).encode("utf-8") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, signature) for signature in signatures):
        raise PermissionError("Invalid Stripe webhook signature.")
    try:
        event = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid Stripe webhook payload.") from exc
    if not isinstance(event, dict) or not event.get("id") or not event.get("type"):
        raise ValueError("Invalid Stripe webhook event.")
    return event


async def process_stripe_webhook_event(event: Dict[str, Any]) -> Dict[str, Any]:
    event_id = str(event["id"])
    prior = await database.find_one("stripe_webhook_events", {"stripe_event_id": event_id})
    if prior:
        return {"processed": False, "duplicate": True}
    obj = (((event.get("data") or {}).get("object")) or {})
    if not isinstance(obj, dict):
        obj = {}
    metadata = obj.get("metadata") or {}
    payment_intent_id = str(obj.get("id") or "")
    event_type = str(event.get("type") or "")
    platform_event = (
        obj.get("object") == "payment_intent"
        and metadata.get("platform") == "letsgoride"
        and metadata.get("product") == "hailing"
        and bool(payment_intent_id)
    )
    await database.insert_one(
        "stripe_webhook_events",
        {
            "id": new_id(),
            "stripe_event_id": event_id,
            "event_type": event_type,
            "payment_intent_id": payment_intent_id or None,
            "platform_event": platform_event,
            "created_at": now_iso(),
        },
    )
    if not platform_event:
        return {"processed": False, "ignored": True}
    trip = await database.find_one("hailing_trips", {"payment_intent_id": payment_intent_id})
    record = await database.find_one("stripe_payment_intents", {"payment_intent_id": payment_intent_id})
    status = str(obj.get("status") or "")
    if record:
        await database.update_one(record["id"], record["id"], {}) if False else None
        await database.update_one(
            "stripe_payment_intents",
            record["id"],
            {"status": status or record.get("status"), "updated_at": now_iso()},
        )
    if not trip:
        return {"processed": True, "trip_found": False}
    updates: Dict[str, Any] = {"updated_at": now_iso()}
    if event_type == "payment_intent.amount_capturable_updated" or status == "requires_capture":
        updates.update({"payment_status": "authorized", "payment_authorized_at": trip.get("payment_authorized_at") or now_iso()})
    elif event_type == "payment_intent.succeeded" or status == "succeeded":
        updates.update({"payment_status": "paid", "payment_captured_at": trip.get("payment_captured_at") or now_iso(), "payment_reconciliation_required": False})
    elif event_type == "payment_intent.canceled" or status == "canceled":
        updates.update({"payment_status": "authorization_released", "payment_authorization_released_at": trip.get("payment_authorization_released_at") or now_iso()})
    elif event_type == "payment_intent.payment_failed":
        updates.update({"payment_status": "failed", "payment_failure_reason": "payment_failed", "payment_reconciliation_required": True})
    else:
        return {"processed": True, "trip_found": True, "changed": False}
    await database.update_one("hailing_trips", trip["id"], updates)
    return {"processed": True, "trip_found": True, "changed": True}
