from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.auth import get_current_user
from app.database import database
from app.models.worker_finance import PayoutMethodCreateBody, PayoutMethodDefaultBody, PayoutMethodUpdateBody

# MongoDB creates collections lazily. Keep development/test memory behavior equivalent
# without expanding the core database module with domain-specific bootstrap logic.
database.memory.setdefault("worker_payout_methods", [])
database.memory.setdefault("worker_payouts", [])

from app.services.worker_finance_service import (
    create_payout_method,
    delete_payout_method,
    list_payout_methods,
    set_default_payout_method,
    update_payout_method,
)
from app.services.worker_wallet_service import wallet_summary
from app.services.driver_settlement_payment_service import create_driver_settlement_intent, confirm_driver_settlement_intent
from app.services.driver_weekly_settlement_service import admin_settlement_dashboard
from app.services.rate_limit_service import RateLimit, rate_limit_service
from app.utils import api_error, api_success


router = APIRouter(prefix="/worker/finance", tags=["worker-finance"])


def _payout_method_value_error(exc: ValueError) -> None:
    message = str(exc)
    api_error(message, 404 if message == "Payout method not found." else 400)


@router.get("/wallet")
async def wallet(user=Depends(get_current_user)):
    try:
        return api_success(await wallet_summary(user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except RuntimeError as exc:
        api_error(str(exc), 503)


@router.get("/payout-methods")
async def payout_methods(user=Depends(get_current_user)):
    try:
        return api_success(await list_payout_methods(user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except RuntimeError as exc:
        api_error(str(exc), 503)


@router.post("/payout-methods")
async def payout_method_create(payload: PayoutMethodCreateBody, user=Depends(get_current_user)):
    try:
        return api_success(await create_payout_method(payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except RuntimeError as exc:
        api_error(str(exc), 503)


@router.patch("/payout-methods/{method_id}")
async def payout_method_update(method_id: str, payload: PayoutMethodUpdateBody, user=Depends(get_current_user)):
    try:
        return api_success(await update_payout_method(method_id, payload.model_dump(exclude_unset=True), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        _payout_method_value_error(exc)
    except RuntimeError as exc:
        api_error(str(exc), 503)


@router.post("/payout-methods/default")
async def payout_method_default(payload: PayoutMethodDefaultBody, user=Depends(get_current_user)):
    try:
        return api_success(await set_default_payout_method(payload.method_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        _payout_method_value_error(exc)
    except RuntimeError as exc:
        api_error(str(exc), 503)


@router.delete("/payout-methods/{method_id}")
async def payout_method_delete(method_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await delete_payout_method(method_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        _payout_method_value_error(exc)


@router.post("/driver/settlements/intent")
async def driver_settlement_intent(request: Request, user=Depends(get_current_user)):
    await rate_limit_service.enforce(request, "driver-weekly-settlement", RateLimit(6, 300), identity=str(user.get("id") or ""))
    try:
        return api_success(await create_driver_settlement_intent(user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)
    except RuntimeError as exc:
        api_error(str(exc), 502)


@router.post("/driver/settlements/confirm/{payment_intent_id}")
async def driver_settlement_confirm(payment_intent_id: str, request: Request, user=Depends(get_current_user)):
    await rate_limit_service.enforce(request, "driver-weekly-settlement-confirm", RateLimit(10, 300), identity=str(user.get("id") or ""))
    try:
        return api_success(await confirm_driver_settlement_intent(payment_intent_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)
    except RuntimeError as exc:
        api_error(str(exc), 502)


admin_router = APIRouter(prefix="/admin/finance", tags=["admin-finance"])


@admin_router.get("/driver-settlements")
async def admin_driver_settlements(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        api_error("Admin access required.", 403)
    return api_success(await admin_settlement_dashboard())
