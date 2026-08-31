from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import get_admin_user, get_current_user
from app.database import database
from app.models.worker_finance import PayoutMethodCreateBody, PayoutMethodDefaultBody, PayoutMethodUpdateBody

# MongoDB creates collections lazily. Keep development/test memory behavior equivalent
# without expanding the core database module with domain-specific bootstrap logic.
database.memory.setdefault("worker_payout_methods", [])
database.memory.setdefault("worker_payouts", [])
database.memory.setdefault("driver_fee_statements", [])

from app.services.driver_fee_settlement_service import admin_driver_settlement_summary
from app.services.worker_finance_service import (
    create_payout_method,
    delete_payout_method,
    list_payout_methods,
    set_default_payout_method,
    update_payout_method,
)
from app.services.worker_wallet_service import wallet_summary
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


@router.get("/admin/driver-settlements")
async def admin_driver_settlements(user=Depends(get_admin_user)):
    _ = user
    return api_success(await admin_driver_settlement_summary())


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
