from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import requests

from app.config import get_settings
from app.database import database
from app.services.hailing_city_service import get_city
from app.services.hailing_dispatch_service import dispatch_policy
from app.services.hailing_fare_service import quote_expired
from app.services.hailing_realtime_service import (
    publish_hailing_admin_realtime,
    publish_hailing_trip_realtime,
    update_versioned_hailing_trip,
)
from app.utils import new_id, now_iso


logger = logging.getLogger(__name__)
STRIPE_API_BASE = "https://api.stripe.com/v1"
WEBHOOK_TOLERANCE_SECONDS = 300
CARD_CANCEL_STATUSES = {
    "CANCELLED_BY_PASSENGER",
    "CANCELLED_BY_DRIVER",
    "CANCELLED_BY_ADMIN",
    "NO_DRIVER_FOUND",
}


def _settings():
    settings = get_settings()
    if not settings.stripe_configured:
        raise PermissionError("Card payments are not available right now.")
    return settings


def _amount_minor(total: Any) -> int:
    amount = int(round(float(total or 0) * 100))
    if amount <= 0:
        raise ValueError("The fare cannot be charged by card.")
    return amount


async def _stripe_request(
    method: str,
    path: str,
    *,
    data: Optional[Dict[str, Any]] = None,
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    settings = _settings()
    headers = {
        "Authorization": f"Bearer {settings.stripe_secret_key}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key[:255]

    def send():
        return requests.request(
            method.upper(),
            f"{STRIPE_API_BASE}{path}",
            headers=headers,
            data=urlencode(data or {}),
            timeout=settings.stripe_timeout_seconds,
        )

    try:
        response = await asyncio.to_thread(send)
    except requests.RequestException as exc:
        logger.warning("stripe_request_failed path=%s error_type=%s", path, exc.__class__.__name__)
        raise RuntimeError("The card processor is temporarily unavailable. Please try again.") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        logger.warning("stripe_invalid_response path=%s status=%s", path, response.status_code)
        raise RuntimeError("The card processor returned an invalid response.") from exc

    if response.status_code >= 400:
        error = payload.get("error") or {}
        logger.warning(
            "stripe_api_error path=%s status=%s type=%s request_id=%s",
            path,
            response.status_code,
            str(error.get("type") or "unknown")[:80],
            response.headers.get("Request-Id", ""),
        )
        message = str(error.get("message") or "Card payment could not be prepared.")
        if response.status_code >= 500:
            message = "The card processor is temporarily unavailable. Please try again."
        raise RuntimeError(message[:240])
    return payload


async def retrieve_payment_intent(payment_intent_id: str) -> Dict[str, Any]:
    if not payment_intent_id.startswith("pi_"):
        raise ValueError("Invalid card payment reference.")
    return await _stripe_request("GET", f"/payment_intents/{payment_intent_id}")


async def create_hailing_authorization(
    quote_id: str,
    client_request_id: str,
    user: Dict[str, Any],
) -> Dict[str, Any]:
    settings = _settings()
    if not settings.passenger_card_payments_enabled:
        raise PermissionError("Passenger card payments are not enabled for Ride Now.")
    quote = await database.find_one("hailing_quotes", {"id": quote_id, "user_id": user["id"]})
    if not quote or quote_expired(quote):
        raise ValueError("This Ride Now quote has expired. Please request a new fare.")

    amount = _amount_minor((quote.get("fare") or {}).get("total_fare"))
    currency = settings.stripe_currency
    existing_id = str(quote.get("stripe_payment_intent_id") or "")
    if existing_id:
        existing = await retrieve_payment_intent(existing_id)
        if (
            existing.get("status") not in {"canceled"}
            and int(existing.get("amount") or 0) == amount
            and str(existing.get("currency") or "").lower() == currency
        ):
            return _intent_client_payload(existing, settings.stripe_publishable_key)

    intent = await _stripe_request(
        "POST",
        "/payment_intents",
        data={
            "amount": amount,
            "currency": currency,
            "capture_method": "manual",
            "automatic_payment_methods[enabled]": "true",
            "description": "LetsGoRide Ride Now",
            "metadata[product]": "ride_now",
            "metadata[quote_id]": quote_id,
            "metadata[user_id]": str(user["id"]),
            "metadata[client_request_id]": client_request_id,
        },
        idempotency_key=f"hail-auth:{user['id']}:{quote_id}:{client_request_id}",
    )
    await database.update_one(
        "hailing_quotes",
        quote_id,
        {
            "stripe_payment_intent_id": intent.get("id"),
            "stripe_payment_status": intent.get("status"),
            "stripe_amount_minor": amount,
            "stripe_currency": currency,
            "updated_at": now_iso(),
        },
    )
    return _intent_client_payload(intent, settings.stripe_publishable_key)


def _intent_client_payload(intent: Dict[str, Any], publishable_key: str) -> Dict[str, Any]:
    client_secret = str(intent.get("client_secret") or "")
    if not client_secret:
        raise RuntimeError("Card payment could not be initialized.")
    return {
        "payment_intent_id": intent.get("id"),
        "client_secret": client_secret,
        "publishable_key": publishable_key,
        "status": intent.get("status"),
        "amount": int(intent.get("amount") or 0),
        "currency": str(intent.get("currency") or "usd").upper(),
    }


async def verify_hailing_authorization(
    payment_intent_id: str,
    quote: Dict[str, Any],
    user: Dict[str, Any],
) -> Dict[str, Any]:
    settings = _settings()
    intent = await retrieve_payment_intent(payment_intent_id)
    metadata = intent.get("metadata") or {}
    expected_amount = _amount_minor((quote.get("fare") or {}).get("total_fare"))
    if metadata.get("product") != "ride_now":
        raise ValueError("This card authorization is not for Ride Now.")
    if str(metadata.get("quote_id") or "") != str(quote.get("id") or ""):
        raise ValueError("This card authorization belongs to a different fare quote.")
    if str(metadata.get("user_id") or "") != str(user.get("id") or ""):
        raise PermissionError("This card authorization belongs to another account.")
    if int(intent.get("amount") or 0) != expected_amount:
        raise ValueError("The card authorization amount no longer matches this fare.")
    if str(intent.get("currency") or "").lower() != settings.stripe_currency:
        raise ValueError("The card authorization currency does not match this fare.")
    if intent.get("status") not in {"requires_capture", "succeeded"}:
        raise ValueError("Card authorization is not complete yet.")
    return intent


async def create_authorized_hailing_trip(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    """Create/dispatch a card trip only after Stripe confirms the server-priced authorization."""
    from app.services.hailing_trip_service import (
        active_trip_for_user,
        create_dispatch_offer,
        public_trip,
        record_trip_event,
    )

    if not _settings().passenger_card_payments_enabled:
        raise PermissionError("Passenger card payments are not enabled for Ride Now.")
    existing = await active_trip_for_user(user)
    if existing:
        return public_trip(existing, user)

    quote = await database.find_one("hailing_quotes", {"id": payload["quote_id"], "user_id": user["id"]})
    if not quote or quote_expired(quote):
        raise ValueError("This Ride Now quote has expired. Please request a new fare.")

    client_request_id = str(payload.get("client_request_id") or "")
    prior = await database.find_one(
        "hailing_trips",
        {"passenger_user_id": user["id"], "client_request_id": client_request_id},
    )
    if prior:
        return public_trip(prior, user)

    payment_intent_id = str(payload.get("stripe_payment_intent_id") or "")
    intent = await verify_hailing_authorization(payment_intent_id, quote, user)
    payment_status = "paid" if intent.get("status") == "succeeded" else "authorized"

    timestamp = now_iso()
    city = await get_city(quote["city_id"])
    policy = dispatch_policy(city)
    search_expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=policy.search_timeout_seconds)
    ).isoformat()
    trip = {
        "id": new_id(),
        "quote_id": quote["id"],
        "passenger_user_id": user["id"],
        "passenger_snapshot": {
            "user_id": user["id"],
            "name": user.get("name") or "Passenger",
            "rating": user.get("rating"),
        },
        "driver_user_id": None,
        "driver_id": None,
        "vehicle_id": None,
        "city_id": quote["city_id"],
        "ride_class": quote["fare"]["ride_class"],
        "pickup": quote["pickup"],
        "dropoff": quote["dropoff"],
        "route": quote["route"],
        "fare": quote["fare"],
        "payment_method": "card",
        "payment_status": payment_status,
        "stripe_payment_intent_id": payment_intent_id,
        "stripe_payment_status": intent.get("status"),
        "stripe_amount_minor": int(intent.get("amount") or 0),
        "stripe_currency": intent.get("currency"),
        "status": "SEARCHING",
        "verify_ride_with_pin": bool(payload.get("verify_ride_with_pin")),
        "search_started_at": timestamp,
        "search_expires_at": search_expires_at,
        "next_dispatch_at": timestamp,
        "current_dispatch_radius_km": policy.initial_radius_km,
        "dispatch_attempt_count": 0,
        "dispatch_claim_token": None,
        "dispatch_claim_expires_at": timestamp,
        "client_request_id": client_request_id,
        "realtime_version": 1,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    created = await database.insert_one("hailing_trips", trip)
    logger.info(
        "hailing_card_request_created trip_id=%s city_id=%s ride_class=%s payment_intent_id=%s",
        created["id"],
        created["city_id"],
        created["ride_class"],
        payment_intent_id,
    )
    await record_trip_event(created, "hailing_request_created", {"payment_method": "card"})
    await publish_hailing_trip_realtime(created, "hailing.trip.created")
    await publish_hailing_admin_realtime(created, "hailing.trip.created")
    await create_dispatch_offer(created)
    stored = await database.find_one("hailing_trips", {"id": created["id"]}) or created
    return public_trip(stored, user)


async def capture_hailing_trip_payment(trip: Dict[str, Any]) -> str:
    if trip.get("payment_method") != "card":
        return str(trip.get("payment_status") or "pending")
    payment_intent_id = str(trip.get("stripe_payment_intent_id") or "")
    if not payment_intent_id:
        logger.error("hailing_card_capture_missing_intent trip_id=%s", trip.get("id"))
        return "failed"
    try:
        intent = await retrieve_payment_intent(payment_intent_id)
        if intent.get("status") == "succeeded":
            return "paid"
        if intent.get("status") != "requires_capture":
            logger.warning(
                "hailing_card_capture_not_ready trip_id=%s intent_status=%s",
                trip.get("id"),
                intent.get("status"),
            )
            return "capture_pending"
        captured = await _stripe_request(
            "POST",
            f"/payment_intents/{payment_intent_id}/capture",
            idempotency_key=f"hail-capture:{trip['id']}",
        )
        return "paid" if captured.get("status") == "succeeded" else "capture_pending"
    except Exception as exc:
        logger.warning(
            "hailing_card_capture_deferred trip_id=%s error_type=%s",
            trip.get("id"),
            exc.__class__.__name__,
        )
        return "capture_pending"


async def cancel_hailing_card_authorization(trip: Dict[str, Any], reason: str) -> str:
    if trip.get("payment_method") != "card":
        return str(trip.get("payment_status") or "pending")
    payment_intent_id = str(trip.get("stripe_payment_intent_id") or "")
    if not payment_intent_id:
        return "failed"
    try:
        intent = await retrieve_payment_intent(payment_intent_id)
        if intent.get("status") == "succeeded":
            return "paid"
        if intent.get("status") == "canceled":
            return "cancelled"
        if intent.get("status") in {
            "requires_capture",
            "requires_payment_method",
            "requires_confirmation",
            "requires_action",
            "processing",
        }:
            cancelled = await _stripe_request(
                "POST",
                f"/payment_intents/{payment_intent_id}/cancel",
                data={"cancellation_reason": "requested_by_customer"},
                idempotency_key=f"hail-cancel:{trip['id']}:{reason}",
            )
            return "cancelled" if cancelled.get("status") == "canceled" else "cancel_pending"
        return "cancel_pending"
    except Exception as exc:
        logger.warning(
            "hailing_card_cancel_deferred trip_id=%s error_type=%s",
            trip.get("id"),
            exc.__class__.__name__,
        )
        return "cancel_pending"


async def reconcile_hailing_card_payments() -> Dict[str, int]:
    """Reconcile terminal trips so a processor hiccup never blocks the driver UI."""
    trips = await database.find_many("hailing_trips", {"payment_method": "card"})
    captured = 0
    released = 0
    deferred = 0
    for trip in trips:
        status = str(trip.get("status") or "")
        payment_status = str(trip.get("payment_status") or "")
        if status == "COMPLETED" and payment_status not in {"paid", "refunded"}:
            next_payment_status = await capture_hailing_trip_payment(trip)
            if next_payment_status == payment_status:
                continue
            updated = await update_versioned_hailing_trip(
                {"id": trip["id"]},
                {"payment_status": next_payment_status, "updated_at": now_iso()},
            )
            if updated:
                await publish_hailing_trip_realtime(updated, "hailing.trip.payment_updated")
            if next_payment_status == "paid":
                captured += 1
            else:
                deferred += 1
        elif status in CARD_CANCEL_STATUSES and payment_status not in {"cancelled", "paid", "refunded"}:
            next_payment_status = await cancel_hailing_card_authorization(trip, status.lower())
            if next_payment_status == payment_status:
                continue
            updated = await update_versioned_hailing_trip(
                {"id": trip["id"]},
                {"payment_status": next_payment_status, "updated_at": now_iso()},
            )
            if updated:
                await publish_hailing_trip_realtime(updated, "hailing.trip.payment_updated")
            if next_payment_status == "cancelled":
                released += 1
            else:
                deferred += 1
    return {"captured": captured, "released": released, "deferred": deferred}


async def stripe_payment_reconciliation_sweeper(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await reconcile_hailing_card_payments()
        except Exception as exc:
            logger.warning("stripe_payment_reconciliation_failed error_type=%s", exc.__class__.__name__)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=5)
        except asyncio.TimeoutError:
            continue


def verify_webhook_signature(payload: bytes, signature_header: str, secret: str) -> None:
    timestamp = None
    signatures: list[str] = []
    for item in signature_header.split(","):
        key, _, value = item.partition("=")
        if key == "t":
            try:
                timestamp = int(value)
            except ValueError:
                timestamp = None
        elif key == "v1" and value:
            signatures.append(value)
    if timestamp is None or not signatures:
        raise ValueError("Invalid Stripe signature.")
    if abs(int(time.time()) - timestamp) > WEBHOOK_TOLERANCE_SECONDS:
        raise ValueError("Expired Stripe signature.")
    signed = f"{timestamp}.".encode("utf-8") + payload
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, candidate) for candidate in signatures):
        raise ValueError("Invalid Stripe signature.")


async def handle_stripe_webhook(payload: bytes, signature_header: str) -> Dict[str, Any]:
    settings = _settings()
    verify_webhook_signature(payload, signature_header, settings.stripe_webhook_secret)
    event = json.loads(payload.decode("utf-8"))
    event_id = str(event.get("id") or "")
    event_type = str(event.get("type") or "")
    intent = (((event.get("data") or {}).get("object")) or {})
    if not isinstance(intent, dict) or not str(intent.get("id") or "").startswith("pi_"):
        return {"received": True, "event_id": event_id}

    metadata = intent.get("metadata") or {}
    if metadata.get("product") == "driver_weekly_settlement":
        from app.services.driver_weekly_settlement_service import apply_settlement_intent
        return await apply_settlement_intent(intent, event_id=event_id, event_type=event_type)

    trip = await database.find_one("hailing_trips", {"stripe_payment_intent_id": intent.get("id")})
    if not trip or trip.get("stripe_last_event_id") == event_id:
        return {"received": True, "event_id": event_id}

    status_map = {
        "payment_intent.amount_capturable_updated": "authorized",
        "payment_intent.succeeded": "paid",
        "payment_intent.payment_failed": "failed",
        "payment_intent.canceled": "cancelled",
    }
    payment_status = status_map.get(event_type)
    if payment_status:
        updated = await update_versioned_hailing_trip(
            {"id": trip["id"]},
            {
                "payment_status": payment_status,
                "stripe_payment_status": intent.get("status"),
                "stripe_last_event_id": event_id,
                "stripe_last_event_type": event_type,
                "updated_at": now_iso(),
            },
        )
        if updated:
            await publish_hailing_trip_realtime(updated, "hailing.trip.payment_updated")
    return {"received": True, "event_id": event_id}
