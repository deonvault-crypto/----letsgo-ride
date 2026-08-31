from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import database
from app.services.event_service import realtime_event_service
from app.services.stripe_runtime_guard import stripe_runtime_ready
from app.utils import api_success


router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check():
    return api_success(
        {
            "service": "LetsGoRide API",
            "status": "ok",
            "database_status": database.status,
        }
    )


@router.get("/live")
async def liveness_check():
    """Process-level liveness probe. It must not depend on external services."""
    return api_success({"service": "LetsGoRide API", "status": "alive"})


@router.get("/ready")
async def readiness_check():
    """Core traffic depends on Mongo + realtime, while Stripe degrades independently."""
    settings = get_settings()
    database_ready = database.status == "connected"
    realtime_required = bool(str(settings.realtime_redis_url or "").strip())
    realtime_ready = not realtime_required or realtime_event_service.transport.available
    payments_ready = stripe_runtime_ready()
    core_ready = database_ready and realtime_ready
    payload = {
        "success": core_ready,
        "data": {
            "service": "LetsGoRide API",
            "status": "ready" if core_ready else "degraded",
            "database_status": database.status,
            "realtime_status": "ready" if realtime_ready else "degraded",
            "payments_status": "ready" if payments_ready else "degraded",
        },
    }
    return JSONResponse(status_code=200 if core_ready else 503, content=payload)


@router.get("/email-config")
async def email_config_check():
    settings = get_settings()
    # Production health endpoints should prove readiness without exposing
    # sender addresses, key shape, or other configuration metadata.
    if settings.is_production:
        return {
            "provider": "resend",
            "configured": settings.resend_configured,
        }
    return {
        "provider": "resend",
        "configured": settings.resend_configured,
        "api_key_present": settings.resend_api_key_present,
        "api_key_prefix_ok": settings.resend_api_key_prefix_ok,
        "api_key_length": settings.resend_api_key_length,
        "from_email": settings.resend_from_email,
        "reply_to_email": settings.resend_reply_to,
    }
