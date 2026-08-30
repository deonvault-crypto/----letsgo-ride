from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.models.worker_finance import PayoutMethodCreateBody, PayoutMethodDefaultBody, PayoutMethodUpdateBody
from app.services.worker_finance_service import (
    create_payout_method,
    delete_payout_method,
    list_payout_methods,
    set_default_payout_method,
    update_payout_method,
    wallet_summary,
)
from app.utils import api_error, api_success


router = APIRouter(prefix="/worker/finance", tags=["worker-finance"])


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
        return api_success(await update_payout_method(method_id, payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)
    except RuntimeError as exc:
        api_error(str(exc), 503)


@router.post("/payout-methods/default")
async def payout_method_default(payload: PayoutMethodDefaultBody, user=Depends(get_current_user)):
    try:
        return api_success(await set_default_payout_method(payload.method_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)
    except RuntimeError as exc:
        api_error(str(exc), 503)


@router.delete("/payout-methods/{method_id}")
async def payout_method_delete(method_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await delete_payout_method(method_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)
