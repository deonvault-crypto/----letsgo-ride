from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request

from app.auth import get_current_user
from app.config import get_settings
from app.database import database
from app.models.hailing import HailingCardTripCreateBody, HailingStripeIntentBody
from app.services.driver_fee_settlement_service import (
    DRIVER_FEE_PRODUCT,
    confirm_driver_fee_payment,
    create_driver_fee_payment_intent,
    handle_driver_fee_stripe_webhook,
)
from app.services.hailing_trip_service import public_trip
from app.services.rate_limit_service import RateLimit, rate_limit_service
from app.services.stripe_payment_service import (
    create_authorized_hailing_trip,
    create_hailing_authorization,
    handle_stripe_webhook,
)
from app.utils import api_error, api_success


router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("/config")
async def payment_config():
    settings = get_settings()
    return api_success(
        {
            # Ride Now launch is passenger-to-driver direct payment. Stripe is reserved
            # for collecting LetsGoRide's weekly postpaid service fee from drivers.
            "card_enabled": False,
            "provider": "stripe" if settings.stripe_configured else None,
            "currency": settings.stripe_currency.upper() if settings.stripe_configured else "USD",
            "driver_fee_settlement_enabled": bool(settings.stripe_configured),
        }
    )


@router.post("/driver-fees/stripe/intent")
async def create_driver_fee_stripe_intent(request: Request, user=Depends(get_current_user)):
    await rate_limit_service.enforce(
        request,
        "driver-weekly-fee-payment",
        RateLimit(8, 300),
        identity=str(user.get("id") or ""),
    )
    try:
        return api_success(await create_driver_fee_payment_intent(user))
    except PermissionError as exc:
        api_error(str(exc), 503 if "Card payments" in str(exc) else 403)
    except ValueError as exc:
        api_error(str(exc), 400)
    except RuntimeError as exc:
        api_error(str(exc), 502)


@router.post("/driver-fees/stripe/confirm")
async def confirm_driver_fee_stripe_payment(request: Request, user=Depends(get_current_user)):
    await rate_limit_service.enforce(
        request,
        "driver-weekly-fee-confirm",
        RateLimit(20, 300),
        identity=str(user.get("id") or ""),
    )
    try:
        return api_success(await confirm_driver_fee_payment(user))
    except PermissionError as exc:
        api_error(str(exc), 503 if "Card payments" in str(exc) else 403)
    except ValueError as exc:
        api_error(str(exc), 400)
    except RuntimeError as exc:
        api_error(str(exc), 502)


@router.post("/hailing/stripe/intent")
async def create_hailing_stripe_intent(
    payload: HailingStripeIntentBody,
    request: Request,
    user=Depends(get_current_user),
):
    await rate_limit_service.enforce(
        request,
        "hailing-card-authorization",
        RateLimit(8, 300),
        identity=str(user.get("id") or ""),
    )
    try:
        return api_success(
            await create_hailing_authorization(
                payload.quote_id,
                payload.client_request_id,
                user,
            )
        )
    except PermissionError as exc:
        api_error(str(exc), 503)
    except ValueError as exc:
        api_error(str(exc), 400)
    except RuntimeError as exc:
        api_error(str(exc), 502)


@router.post("/hailing/stripe/trips")
async def create_hailing_card_trip(
    payload: HailingCardTripCreateBody,
    request: Request,
    user=Depends(get_current_user),
):
    await rate_limit_service.enforce(
        request,
        "hailing-card-trip-create",
        RateLimit(8, 300),
        identity=str(user.get("id") or ""),
    )
    existing = await database.find_one(
        "hailing_trips",
        {"stripe_payment_intent_id": payload.stripe_payment_intent_id},
    )
    if existing:
        if existing.get("passenger_user_id") != user.get("id"):
            api_error("This card authorization belongs to another account.", 403)
        return api_success(public_trip(existing, user))
    try:
        return api_success(await create_authorized_hailing_trip(payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)
    except RuntimeError as exc:
        api_error(str(exc), 502)


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    if not signature:
        api_error("Stripe signature is required.", 400)
    try:
        # Inspect only to choose the domain handler. The selected handler still verifies
        # the Stripe signature before mutating any state.
        event_hint = json.loads(payload.decode("utf-8"))
        intent_hint = (((event_hint.get("data") or {}).get("object")) or {})
        metadata = intent_hint.get("metadata") or {} if isinstance(intent_hint, dict) else {}
        if str(metadata.get("product") or "") == DRIVER_FEE_PRODUCT:
            return api_success(await handle_driver_fee_stripe_webhook(payload, signature))
        return api_success(await handle_stripe_webhook(payload, signature))
    except PermissionError as exc:
        api_error(str(exc), 503)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        api_error(str(exc), 400)
