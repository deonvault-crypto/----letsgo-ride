from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.auth import get_current_user
from app.config import get_settings
from app.database import database
from app.models.hailing import HailingCardTripCreateBody, HailingStripeIntentBody
from app.services.hailing_trip_service import public_trip
from app.services.rate_limit_service import RateLimit, rate_limit_service
from app.services.stripe_payment_service import (
    create_authorized_hailing_trip,
    create_hailing_authorization,
    handle_stripe_webhook,
)
from app.services.stripe_runtime_guard import ensure_stripe_runtime_binding, stripe_runtime_ready
from app.utils import api_error, api_success


router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("/config")
async def payment_config():
    settings = get_settings()
    if settings.stripe_configured and not stripe_runtime_ready():
        try:
            await ensure_stripe_runtime_binding()
        except RuntimeError:
            # Configuration is a capability endpoint, not a reason to make the
            # entire customer app error. Degraded payment features are hidden.
            pass
    ready = bool(settings.stripe_configured and stripe_runtime_ready())
    return api_success(
        {
            "card_enabled": bool(ready and settings.passenger_card_payments_enabled),
            "driver_settlement_enabled": ready,
            "provider": "stripe" if ready else None,
            "currency": settings.stripe_currency.upper() if ready else "USD",
        }
    )


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
        await ensure_stripe_runtime_binding()
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
        await ensure_stripe_runtime_binding()
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
        # Incoming webhooks remain processable during a transient outbound Stripe
        # outage; their signature is verified locally with the production secret.
        return api_success(await handle_stripe_webhook(payload, signature))
    except PermissionError as exc:
        api_error(str(exc), 503)
    except (ValueError, UnicodeDecodeError) as exc:
        api_error(str(exc), 400)
