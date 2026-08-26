import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from app.database import COLLECTION_NAMES, database
from app.models.user import UserUpdate
from app.models.driver import VehicleBody
from app.routers.auth import update_me
from app.routers.drivers import add_vehicle
from app.services.auth_service import verify_email_code
from app.services.auth_service import create_or_update_user
from app.services.driver_service import create_driver_application
from app.services.merchant_service import update_restaurant


def request() -> Request:
    return Request({
        "type": "http",
        "method": "PATCH",
        "path": "/auth/me",
        "headers": [],
        "client": ("203.0.113.25", 4123),
        "scheme": "https",
        "server": ("test", 443),
        "query_string": b"",
    })


class AccountIntegrityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_customer_legal_name_is_schema_locked_but_contact_details_remain_self_service(self):
        with self.assertRaises(ValidationError):
            UserUpdate.model_validate({"name": "A different legal name"})

        customer = await database.insert_one("users", {
            "id": "customer-a",
            "role": "passenger",
            "name": "Original Legal Name",
            "email": "verified@example.com",
            "normalized_email": "verified@example.com",
            "email_verified": True,
            "phone": "+263770000001",
            "city": "Harare",
        })
        payload = UserUpdate(
            email="replacement@example.com",
            phone="+263770000009",
            city="Mutare",
        )
        with patch("app.routers.auth.rate_limit_service.enforce", new=AsyncMock()), patch(
            "app.routers.auth.start_email_verification", new=AsyncMock()
        ) as verification:
            response = await update_me(payload, request(), customer)

        saved = await database.find_one("users", {"id": customer["id"]})
        self.assertEqual(response["data"]["name"], "Original Legal Name")
        self.assertEqual(saved["phone"], "+263770000009")
        self.assertEqual(saved["city"], "Mutare")
        self.assertEqual(saved["email"], "verified@example.com")
        self.assertTrue(saved["email_verified"])
        self.assertEqual(saved["pending_email"], "replacement@example.com")
        verification.assert_awaited_once()

    async def test_verified_email_is_replaced_only_after_pending_address_verification(self):
        await database.insert_one("users", {
            "id": "customer-a",
            "role": "passenger",
            "email": "verified@example.com",
            "normalized_email": "verified@example.com",
            "pending_email": "replacement@example.com",
            "email_verified": True,
            "email_verification_attempts": 0,
        })
        with patch("app.services.auth_service.code_not_expired", return_value=True), patch(
            "app.services.auth_service.code_matches", return_value=True
        ), patch(
            "app.services.auth_service.get_settings",
            return_value=SimpleNamespace(mock_otp_allowed=False, mock_otp="", session_lifetime_days=30),
        ):
            verified = await verify_email_code("replacement@example.com", "123456")

        self.assertEqual(verified["email"], "replacement@example.com")
        self.assertEqual(verified["normalized_email"], "replacement@example.com")
        self.assertIsNone(verified["pending_email"])
        self.assertTrue(verified["email_verified"])

    async def test_workforce_roles_cannot_change_verified_contact_identity(self):
        for role in ("courier", "driver", "merchant"):
            user = await database.insert_one("users", {
                "id": f"{role}-a",
                "role": role,
                "name": f"Saved {role.title()}",
                "email": f"{role}@example.com",
                "phone": "+263770000001",
                "city": "Harare",
            })
            for field, value in (
                ("email", f"new-{role}@example.com"),
                ("phone", "+263770000009"),
                ("city", "Mutare"),
                ("bio", "Replacement service identity"),
                ("travel_preferences", "Replacement service preferences"),
            ):
                with self.subTest(role=role, field=field), self.assertRaises(HTTPException) as denied:
                    await update_me(UserUpdate.model_validate({field: value}), request(), user)
                self.assertEqual(denied.exception.status_code, 403)
            saved = await database.find_one("users", {"id": user["id"]})
            self.assertEqual(saved["email"], f"{role}@example.com")
            self.assertEqual(saved["phone"], "+263770000001")
            self.assertEqual(saved["city"], "Harare")

    async def test_existing_driver_cannot_overwrite_identity_through_compatibility_apply(self):
        user = await database.insert_one("users", {"id": "driver-a", "role": "driver"})
        await database.insert_one("drivers", {
            "id": "driver-profile-a",
            "user_id": user["id"],
            "name": "Approved Driver",
            "phone": "+263770000001",
            "city": "Harare",
            "status": "approved",
        })
        with self.assertRaises(PermissionError):
            await create_driver_application({
                "name": "Replacement Name",
                "phone": "+263770000009",
                "city": "Mutare",
                "vehicle": "Replacement vehicle",
            }, user)
        saved = await database.find_one("drivers", {"id": "driver-profile-a"})
        self.assertEqual(saved["name"], "Approved Driver")
        self.assertEqual(saved["phone"], "+263770000001")

    async def test_legacy_phone_session_refresh_cannot_change_saved_legal_name(self):
        await database.insert_one("users", {
            "id": "customer-existing",
            "role": "passenger",
            "phone": "+263770000001",
            "name": "Saved Legal Name",
        })
        refreshed = await create_or_update_user(
            "+263770000001",
            "passenger",
            "Attacker Supplied Name",
        )
        self.assertEqual(refreshed["name"], "Saved Legal Name")

    async def test_verified_driver_cannot_replace_reviewed_vehicle_through_legacy_endpoint(self):
        user = await database.insert_one("users", {"id": "driver-a", "role": "driver"})
        await database.insert_one("drivers", {
            "id": "driver-profile-a",
            "user_id": user["id"],
            "status": "approved",
            "verified": True,
            "vehicle": "Reviewed Toyota Aqua AAB1234",
        })
        with self.assertRaises(HTTPException) as denied:
            await add_vehicle(VehicleBody(
                make="Other",
                model="Vehicle",
                color="Grey",
                plate_number="NEW123",
                seats=4,
            ), user)
        self.assertEqual(denied.exception.status_code, 403)
        self.assertEqual(await database.find_many("vehicles"), [])

    async def test_reviewed_merchant_identity_is_locked_while_store_operations_remain_editable(self):
        merchant = {"id": "merchant-a", "role": "merchant"}
        restaurant = await database.insert_one("restaurants", {
            "id": "restaurant-a",
            "owner_user_id": merchant["id"],
            "status": "ACTIVE",
            "name": "Verified Business",
            "phone": "+263770000001",
            "address": "12 Legal Road",
            "contact_person_name": "Owner Name",
            "contact_email": "owner@example.com",
            "business_registration_number": "REG-001",
            "opening_hours": {"daily": "08:00-20:00"},
            "is_accepting_orders": False,
        })
        for field, value in (
            ("name", "Different Business"),
            ("phone", "+263770000009"),
            ("address", "99 Different Road"),
            ("contact_person_name", "Different Owner"),
            ("contact_email", "different@example.com"),
            ("business_registration_number", "REG-999"),
        ):
            with self.subTest(field=field), self.assertRaises(PermissionError):
                await update_restaurant(restaurant["id"], {field: value}, merchant)

        updated = await update_restaurant(restaurant["id"], {
            "description": "Updated daily store description",
            "opening_hours": {"daily": "09:00-21:00"},
            "is_accepting_orders": True,
        }, merchant)
        self.assertEqual(updated["name"], "Verified Business")
        self.assertEqual(updated["opening_hours"], {"daily": "09:00-21:00"})
        self.assertTrue(updated["is_accepting_orders"])

    async def test_draft_merchant_identity_can_be_corrected_before_submission(self):
        merchant = {"id": "merchant-a", "role": "merchant"}
        restaurant = await database.insert_one("restaurants", {
            "id": "restaurant-draft",
            "owner_user_id": merchant["id"],
            "status": "DRAFT",
            "name": "Draft Business",
        })
        updated = await update_restaurant(restaurant["id"], {
            "name": "Corrected Draft Business",
            "address": "12 Draft Road",
        }, merchant)
        self.assertEqual(updated["name"], "Corrected Draft Business")
        self.assertEqual(updated["address"], "12 Draft Road")


if __name__ == "__main__":
    unittest.main()
