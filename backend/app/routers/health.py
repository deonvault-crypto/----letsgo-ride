from fastapi import APIRouter

from app.config import get_settings
from app.database import database
from app.utils import api_success


router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check():
    return api_success(
        {
            "service": "LetsGo Ride API",
            "status": "ok",
            "database_status": database.status,
        }
    )


@router.get("/email-config")
async def email_config_check():
    settings = get_settings()
    return {
        "provider": "resend",
        "configured": settings.resend_configured,
        "api_key_present": settings.resend_api_key_present,
        "api_key_prefix_ok": settings.resend_api_key_prefix_ok,
        "api_key_length": settings.resend_api_key_length,
        "from_email": settings.resend_from_email,
        "reply_to_email": settings.resend_reply_to,
    }
