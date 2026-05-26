from fastapi import APIRouter, Depends, Request

from app.auth import get_current_user
from app.models.verification import FaceTecVerifyUserBody
from app.services.facetec_service import (
    FaceTecConfigurationError,
    FaceTecProviderError,
    create_facetec_session_token,
    facetec_rate_limiter,
    process_facetec_verification,
)
from app.utils import api_error, api_success


router = APIRouter(prefix="/api", tags=["facetec"])


def _rate_limit_key(request: Request, user: dict) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    client_host = request.client.host if request.client else "unknown"
    return f"{user.get('id')}:{forwarded or client_host}"


@router.get("/facetec/session-token")
async def facetec_session_token(request: Request, user=Depends(get_current_user)):
    if not facetec_rate_limiter.check(_rate_limit_key(request, user)):
        api_error("Too many verification attempts. Please wait a few minutes and try again.", 429)
    try:
        return api_success(await create_facetec_session_token(user))
    except FaceTecConfigurationError:
        api_error("Biometric verification is not available right now. Please use manual verification.", 503)
    except FaceTecProviderError:
        api_error("Could not start biometric verification. Please try again or use manual verification.", 503)


@router.post("/verify-user")
async def verify_user(payload: FaceTecVerifyUserBody, request: Request, user=Depends(get_current_user)):
    if not facetec_rate_limiter.check(_rate_limit_key(request, user)):
        api_error("Too many verification attempts. Please wait a few minutes and try again.", 429)
    try:
        return api_success(await process_facetec_verification(user, payload.model_dump()))
    except FaceTecConfigurationError:
        api_error("Biometric verification is not available right now. Please use manual verification.", 503)
    except FaceTecProviderError:
        api_error("Could not complete biometric verification. Your account can still be reviewed manually.", 503)
