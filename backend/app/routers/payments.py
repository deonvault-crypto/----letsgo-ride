from __future__ import annotations

from fastapi import APIRouter, Request

from app.services.stripe_payment_service import process_stripe_webhook_event, verify_stripe_webhook
from app.utils import api_error, api_success


router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        event = verify_stripe_webhook(raw_body, signature)
        result = await process_stripe_webhook_event(event)
        return api_success(result)
    except PermissionError:
        api_error("Invalid webhook signature.", 400)
    except ValueError:
        api_error("Invalid webhook payload.", 400)
