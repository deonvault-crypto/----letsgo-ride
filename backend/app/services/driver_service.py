from typing import Any, Dict

from app.database import database
from app.utils import new_id, now_iso


async def create_driver_application(payload: Dict[str, Any]) -> Dict[str, Any]:
    timestamp = now_iso()
    application = {
        "id": new_id(),
        "status": "pending",
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload,
    }
    await database.insert_one("driver_applications", application)

    driver = {
        "id": new_id(),
        "application_id": application["id"],
        "name": payload["name"],
        "phone": payload["phone"],
        "city": payload["city"],
        "status": "pending_review",
        "verified": False,
        "rating": 0,
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    return await database.insert_one("drivers", driver)
