from fastapi import APIRouter

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
