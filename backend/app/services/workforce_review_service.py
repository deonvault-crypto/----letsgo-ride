from __future__ import annotations

from typing import Any, Dict

from app.database import database
from app.services.audit_service import write_audit_log
from app.services.notification_service import create_app_notification
from app.services.work_product_service import approved_work_products, with_approved_work_product
from app.services.workforce_application_service import public_application
from app.utils import new_id, now_iso


def _user_id(user: Dict[str, Any]) -> str:
    return str(user.get("id") or "")


async def review_worker_application(
    application_id: str,
    status: str,
    note: str | None,
    admin: Dict[str, Any],
) -> Dict[str, Any]:
    if admin.get("role") != "admin":
        raise PermissionError("Administrator access is required.")
    application = await database.find_one("worker_applications", {"id": application_id})
    if not application:
        raise ValueError("Application not found.")
    current = str(application.get("status") or "")
    if current not in {"SUBMITTED", "UNDER_REVIEW"} and not (
        current == "APPROVED" and status == "APPROVED"
    ):
        raise ValueError("Only submitted applications can be reviewed.")
    if status == "REJECTED" and not str(note or "").strip():
        raise ValueError("A rejection reason is required.")

    now = now_iso()
    updates: Dict[str, Any] = {
        "status": status,
        "review_note": str(note or "").strip() or None,
        "reviewed_by_user_id": _user_id(admin),
        "reviewed_at": now,
        "updated_at": now,
    }
    if status == "APPROVED":
        applicant = await database.find_one("users", {"id": application.get("user_id")})
        if not applicant:
            raise ValueError("Applicant account not found.")
        product = str(application.get("product") or "")
        current_role = str(applicant.get("role") or "passenger").strip().lower()
        approved_products = set(approved_work_products(applicant))
        if product in {"driver", "courier"}:
            if current_role not in {"passenger", "driver", "courier"}:
                raise ValueError("Applicant already belongs to an incompatible work product.")
            approved_products = set(with_approved_work_product(applicant, product))
            next_role = product if current_role == "passenger" else current_role
        else:
            if current_role not in {"passenger", product}:
                raise ValueError("Applicant already belongs to another work product.")
            next_role = product
        await database.update_one(
            "users",
            applicant["id"],
            {
                "role": next_role,
                "work_products": sorted(approved_products),
                "name": application.get("full_name") or applicant.get("name"),
                "phone": application.get("phone") or applicant.get("phone"),
                "city": application.get("service_area") or applicant.get("city"),
                "verification_status": (
                    "approved"
                    if product == "driver"
                    else applicant.get("verification_status", "not_started")
                ),
                "updated_at": now,
            },
        )
        if product == "courier":
            profile = await database.find_one("courier_profiles", {"user_id": applicant["id"]})
            vehicle_type = str(application.get("vehicle_type") or "motorbike")
            transport_mode = (
                "bicycle"
                if vehicle_type == "bicycle"
                else "van"
                if vehicle_type == "van"
                else "car"
                if vehicle_type in {"car", "pickup"}
                else "motorbike"
            )
            profile_updates = {
                "name": application.get("full_name") or applicant.get("name"),
                "transport_mode": transport_mode,
                "vehicle_description": application.get("vehicle"),
                "service_area": application.get("service_area"),
                "status": "APPROVED",
                "online": False,
                "approved_at": now,
                "updated_at": now,
            }
            if profile:
                await database.update_one("courier_profiles", profile["id"], profile_updates)
            else:
                await database.insert_one(
                    "courier_profiles",
                    {
                        "id": new_id(),
                        "user_id": applicant["id"],
                        "completed_deliveries": 0,
                        "rating": None,
                        "created_at": now,
                        **profile_updates,
                    },
                )
        elif product == "driver":
            driver = await database.find_one("drivers", {"user_id": applicant["id"]})
            driver_updates = {
                "name": application.get("full_name") or applicant.get("name"),
                "phone": application.get("phone") or applicant.get("phone"),
                "email": applicant.get("email"),
                "city": application.get("service_area") or applicant.get("city"),
                "vehicle": application.get("vehicle"),
                "documents": application.get("documents", []),
                "status": "approved",
                "verified": True,
                "verification_status": "approved",
                "identity_verification_state": "active",
                "verification_provider": "manual",
                "verification_checked_at": now,
                "updated_at": now,
            }
            if driver:
                await database.update_one("drivers", driver["id"], driver_updates)
            else:
                await database.insert_one(
                    "drivers",
                    {
                        "id": new_id(),
                        "user_id": applicant["id"],
                        "rating": 0,
                        "created_at": now,
                        **driver_updates,
                    },
                )
        updates["approved_at"] = now

    updated = await database.update_one("worker_applications", application_id, updates)
    await write_audit_log(
        actor_user_id=_user_id(admin),
        actor_role=admin.get("role"),
        action="worker_application_reviewed",
        target_type="worker_application",
        target_id=application_id,
        metadata={
            "product": application.get("product"),
            "from_status": current,
            "to_status": status,
            "note": note,
        },
    )
    await create_app_notification(
        str(application.get("user_id") or ""),
        "worker_application",
        "Application update",
        (
            "Your application was approved. Open Account to use your approved work mode."
            if status == "APPROVED"
            else "Your application status changed. Open Work with LetsGoRide for details."
        ),
        {
            "application_id": application_id,
            "application_status": status,
            "product": application.get("product"),
        },
    )
    return public_application(updated or application)
