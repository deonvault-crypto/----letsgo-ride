from typing import Any, Dict

from app.database import database
from app.services.audit_service import write_audit_log
from app.services.verification_service import default_verification_fields
from app.utils import new_id, now_iso


async def create_driver_application(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    timestamp = now_iso()
    existing = await database.find_one("drivers", {"user_id": user["id"]})
    if existing:
        raise PermissionError(
            "Contact LetsGoRide Support to change saved Driver identity details."
        )

    application = {
        "id": new_id(),
        "user_id": user["id"],
        "status": "pending",
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload,
    }
    await database.insert_one("driver_applications", application)

    driver = {
        "id": new_id(),
        "user_id": user["id"],
        "application_id": application["id"],
        "name": payload["name"],
        "phone": payload["phone"],
        "email": user.get("email") or "",
        "city": payload["city"],
        "status": "pending_review",
        "verified": False,
        "rating": 0,
        "created_at": timestamp,
        "updated_at": timestamp,
        **default_verification_fields(),
    }
    created = await database.insert_one("drivers", driver)
    await write_audit_log(
        actor_user_id=user["id"],
        actor_role=user.get("role"),
        action="driver_application_submitted",
        target_type="driver",
        target_id=created["id"],
        metadata={},
    )
    return created
