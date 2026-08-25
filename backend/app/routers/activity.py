from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.services.activity_service import get_customer_activity
from app.utils import api_success


router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("")
async def customer_activity(user=Depends(get_current_user)):
    return api_success(await get_customer_activity(user))
