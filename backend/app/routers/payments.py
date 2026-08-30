from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.auth import get_current_user
from app.config import get_settings
from app.models.hailing import HailingCardTripCreateBody, HailingStripeIntentBody
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
            "card_enabled": bool(settings.stripe_configured),
            "provider": "stripe" if settings.stripe_configured else None,
            "currency": settings.stripe_currency.upper() if settings.stripe_configured else "USD",
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
        return api_success(await handle_stripe_webhook(payload, signature))
    except PermissionError as exc:
        api_error(str(exc), 503)
    except (ValueError, UnicodeDecodeError) as exc:
        api_error(str(exc), 400)
