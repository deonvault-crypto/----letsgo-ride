import unittest
import base64
import io
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import UploadFile
from starlette.datastructures import Headers

from app.database import COLLECTION_NAMES, database
from app.services.courier_earnings_service import courier_earnings_summary
from app.services.courier_service import cancel_delivery, update_courier_location
from app.services.merchant_workspace_service import get_restaurant_insights
from app.services.operations_service import active_courier_delivery, create_availability, list_courier_offers
from app.services.workforce_service import (
    book_courier_shift,
    cancel_courier_shift_booking,
    create_courier_shift,
    list_my_applications,
    my_courier_shift_bookings,
    review_worker_application,
    save_worker_application,
    submit_worker_application,
    update_courier_shift,
    upload_worker_document,
)


class FinalProductExperienceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def _insert_user(self, user_id: str, role: str = "passenger"):
        user = {"id": user_id, "role": role, "name": user_id.title(), "email": f"{user_id}@example.com", "phone": "+263770000001", "city": "Harare"}
        await database.insert_one("users", user)
        return user

    async def test_worker_application_requires_documents_and_admin_review_for_role_access(self):
        customer = await self._insert_user("applicant")
        admin = await self._insert_user("admin", "admin")
        application = await save_worker_application(
            {
                "product": "courier",
                "full_name": "Applicant Courier",
                "phone": "+263770000001",
                "service_area": "Harare North",
                "vehicle": "Honda motorbike ABC123",
                "experience": "Local delivery work",
                "business_name": None,
                "business_address": None,
                "business_registration_number": None,
                "accepted_terms": True,
            },
            customer,
        )
        self.assertEqual(application["status"], "DRAFT")
        self.assertEqual(set(application["missing_document_types"]), {"identity_document", "selfie"})
        with self.assertRaises(ValueError):
            await submit_worker_application(application["id"], customer)

        documents = [
            {"id": "identity", "document_type": "identity_document", "file_name": "id.jpg", "file_url": "https://files.example/id.jpg", "status": "PENDING"},
            {"id": "selfie", "document_type": "selfie", "file_name": "selfie.jpg", "file_url": "https://files.example/selfie.jpg", "status": "PENDING"},
        ]
        await database.update_one("worker_applications", application["id"], {"documents": documents})
        submitted = await submit_worker_application(application["id"], customer)
        self.assertEqual(submitted["status"], "SUBMITTED")
        self.assertEqual((await database.find_one("users", {"id": customer["id"]}))["role"], "passenger")
        with self.assertRaises(PermissionError):
            await review_worker_application(application["id"], "APPROVED", None, customer)

        approved = await review_worker_application(application["id"], "APPROVED", "Documents checked", admin)
        self.assertEqual(approved["status"], "APPROVED")
        approved_user = await database.find_one("users", {"id": customer["id"]})
        self.assertEqual(approved_user["role"], "courier")
        self.assertEqual(approved_user["name"], "Applicant Courier")
        self.assertEqual(approved_user["phone"], "+263770000001")
        self.assertEqual(approved_user["city"], "Harare")
        profile = await database.find_one("courier_profiles", {"user_id": customer["id"]})
        self.assertEqual(profile["status"], "APPROVED")
        self.assertFalse(profile["online"])
        self.assertEqual((await list_my_applications({**customer, "role": "courier"}))[0]["status"], "APPROVED")

    async def test_admin_approved_driver_application_provisions_verified_driver_without_public_escalation(self):
        customer = await self._insert_user("driver-applicant")
        admin = await self._insert_user("admin", "admin")
        application = await save_worker_application(
            {"product": "driver", "full_name": "Driver Applicant", "phone": "+263770000002", "service_area": "Harare", "vehicle": "Toyota Aqua AAB1234", "experience": None, "business_name": None, "business_address": None, "business_registration_number": None, "accepted_terms": True},
            customer,
        )
        required = ["identity_document", "selfie", "driver_licence", "vehicle_registration"]
        await database.update_one("worker_applications", application["id"], {"documents": [{"id": value, "document_type": value, "file_name": f"{value}.jpg", "file_url": f"https://files.example/{value}.jpg", "status": "PENDING"} for value in required]})
        await submit_worker_application(application["id"], customer)
        await review_worker_application(application["id"], "APPROVED", "Manual review complete", admin)
        driver = await database.find_one("drivers", {"user_id": customer["id"]})
        self.assertTrue(driver["verified"])
        self.assertEqual(driver["verification_status"], "approved")
        self.assertEqual((await database.find_one("users", {"id": customer["id"]}))["role"], "driver")

    async def test_submitted_application_is_locked_until_admin_requests_changes(self):
        customer = await self._insert_user("changes-applicant")
        admin = await self._insert_user("changes-admin", "admin")
        payload = {
            "product": "courier",
            "full_name": "Changes Applicant",
            "phone": "+263770000019",
            "service_area": "Harare",
            "service_area_id": "harare",
            "vehicle_type": "motorbike",
            "vehicle_details": "Honda CB125",
            "accepted_terms": True,
        }
        application = await save_worker_application(payload, customer)
        documents = [
            {"id": value, "document_type": value, "file_name": f"{value}.jpg", "file_url": f"https://files.example/{value}.jpg", "status": "PENDING"}
            for value in ("identity_document", "selfie")
        ]
        await database.update_one("worker_applications", application["id"], {"documents": documents})
        submitted = await submit_worker_application(application["id"], customer)
        self.assertEqual(submitted["status"], "SUBMITTED")

        with self.assertRaises(ValueError):
            await save_worker_application({**payload, "vehicle_details": "Changed while submitted"}, customer)

        changes_requested = await review_worker_application(
            application["id"], "REJECTED", "Please provide clearer vehicle details.", admin
        )
        self.assertEqual(changes_requested["status"], "REJECTED")
        reopened = await save_worker_application({**payload, "vehicle_details": "Honda CB125, red"}, customer)
        self.assertEqual(reopened["status"], "DRAFT")
        self.assertIsNone(reopened["review_note"])
        self.assertIn("Honda CB125, red", reopened["vehicle"])

    async def test_worker_document_upload_is_persisted_before_success_returns(self):
        customer = await self._insert_user("document-applicant")
        application = await save_worker_application(
            {"product": "courier", "full_name": "Document Applicant", "phone": "+263770000010", "service_area": "Harare", "service_area_id": "harare", "vehicle_type": "motorbike", "vehicle_details": "Honda CB125", "accepted_terms": True},
            customer,
        )
        valid_png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        upload = UploadFile(file=io.BytesIO(valid_png), filename="identity.png", headers=Headers({"content-type": "image/png"}))
        cloudinary_result = {"secure_url": "https://res.cloudinary.com/example/authenticated/image/upload/v1/identity.jpg", "public_id": "letsgoride/applications/courier/identity", "resource_type": "image", "format": "jpg", "version": 1}
        with patch("app.services.workforce_service.cloudinary.config", return_value=SimpleNamespace(cloud_name="cloud", api_key="key", api_secret="secret")), patch("app.services.workforce_service.cloudinary.uploader.upload", return_value=cloudinary_result):
            persisted = await upload_worker_document(application["id"], "identity_document", upload, customer)

        reopened = (await list_my_applications(customer))[0]
        self.assertEqual(persisted["documents"][0]["document_type"], "identity_document")
        self.assertEqual(reopened["documents"][0]["file_name"], "identity.jpg")
        stored = await database.find_one("worker_applications", {"id": application["id"]})
        self.assertEqual(stored["documents"][0]["cloudinary_public_id"], cloudinary_result["public_id"])

    async def test_courier_shift_capacity_booking_and_cancellation_rules(self):
        admin = await self._insert_user("admin", "admin")
        courier = await self._insert_user("courier", "courier")
        second = await self._insert_user("courier-two", "courier")
        for user in (courier, second):
            await database.insert_one("courier_profiles", {"id": f"profile-{user['id']}", "user_id": user["id"], "status": "APPROVED", "online": False})
        starts = datetime.now(timezone.utc) + timedelta(days=2)
        shift = await create_courier_shift(
            {"zone": "Harare Central", "starts_at": starts.isoformat(), "ends_at": (starts + timedelta(hours=5)).isoformat(), "capacity": 1, "booking_cutoff_minutes": 60, "incentive_usd": 4.5, "active": True},
            admin,
        )
        shift = await update_courier_shift(shift["id"], {"incentive_usd": None}, admin)
        self.assertIsNone(shift["incentive_usd"])
        booking = await book_courier_shift(shift["id"], courier)
        self.assertEqual(booking["status"], "BOOKED")
        self.assertEqual(booking["shift"]["remaining_places"], 0)
        with self.assertRaises(ValueError):
            await book_courier_shift(shift["id"], second)
        cancelled = await cancel_courier_shift_booking(booking["id"], courier)
        self.assertEqual(cancelled["status"], "CANCELLED")
        with self.assertRaises(ValueError):
            await cancel_courier_shift_booking(booking["id"], courier)
        second_booking = await book_courier_shift(shift["id"], second)
        self.assertEqual(second_booking["status"], "BOOKED")
        self.assertEqual((await my_courier_shift_bookings(second))[0]["shift"]["zone"], "Harare Central")

    async def test_product_availability_does_not_cross_worker_products(self):
        with self.assertRaises(ValueError):
            await create_availability({"mode": "courier", "date": "2027-01-01", "start_time": "08:00", "end_time": "10:00", "note": None}, {"id": "driver", "role": "driver"})

    async def test_terminal_deliveries_never_return_as_active_and_offers_pause_for_single_active_job(self):
        courier = await self._insert_user("courier", "courier")
        await database.insert_one("courier_profiles", {"id": "profile", "user_id": courier["id"], "status": "APPROVED", "online": True, "active_delivery_id": "terminal"})
        await database.insert_one("courier_deliveries", {"id": "terminal", "courier_user_id": courier["id"], "status": "DELIVERED", "live_tracking_active": True, "created_at": "2027-01-01T09:00:00+00:00"})
        self.assertIsNone(await active_courier_delivery(courier))
        self.assertIsNone((await database.find_one("courier_profiles", {"id": "profile"}))["active_delivery_id"])
        terminal = await update_courier_location("terminal", {"latitude": -17.825, "longitude": 31.053}, courier)
        self.assertEqual(terminal["status"], "DELIVERED")
        self.assertFalse(terminal["live_tracking_active"])
        self.assertEqual(await database.find_many("courier_location_snapshots", {"delivery_id": "terminal"}), [])

        await database.insert_one("courier_deliveries", {"id": "active", "courier_user_id": courier["id"], "status": "IN_TRANSIT", "created_at": "2027-01-01T10:00:00+00:00"})
        await database.insert_one("courier_deliveries", {"id": "offer", "courier_user_id": None, "status": "MATCHING", "created_at": "2027-01-01T11:00:00+00:00"})
        self.assertEqual((await active_courier_delivery(courier))["id"], "active")
        self.assertEqual(await list_courier_offers(courier), [])

    async def test_earnings_and_merchant_insights_never_invent_settlement(self):
        now = datetime.now(timezone.utc)
        await database.insert_one("courier_deliveries", {"id": "delivered", "courier_user_id": "courier", "status": "DELIVERED", "courier_payout_usd": 6.25, "pickup_address": "A", "dropoff_address": "B", "assigned_at": (now - timedelta(minutes=40)).isoformat(), "delivered_at": now.isoformat()})
        await database.insert_one("courier_location_snapshots", {"id": "one", "delivery_id": "delivered", "latitude": -17.825, "longitude": 31.03, "recorded_at": (now - timedelta(minutes=30)).isoformat()})
        await database.insert_one("courier_location_snapshots", {"id": "two", "delivery_id": "delivered", "latitude": -17.82, "longitude": 31.04, "recorded_at": now.isoformat()})
        courier = await courier_earnings_summary({"id": "courier"})
        self.assertEqual(courier["periods"]["today"]["accrued_earnings_usd"], 6.25)
        self.assertGreater(courier["periods"]["today"]["distance_km"], 0)
        self.assertFalse(courier["settlement_integrated"])
        self.assertEqual(courier["payout_history"], [])
        self.assertIsNone(courier["latest_payouts"][0]["payout_status"])

        merchant = {"id": "merchant", "role": "merchant"}
        await database.insert_one("restaurants", {"id": "restaurant", "owner_user_id": "merchant", "name": "Kitchen"})
        await database.insert_one("food_orders", {"id": "complete", "restaurant_id": "restaurant", "status": "DELIVERED", "total_usd": 18.5, "created_at": now.isoformat(), "delivered_at": now.isoformat()})
        await database.insert_one("food_orders", {"id": "rejected", "restaurant_id": "restaurant", "status": "REJECTED", "total_usd": 99, "created_at": now.isoformat()})
        insights = await get_restaurant_insights("restaurant", merchant)
        self.assertEqual(insights["recorded_sales_usd"], 18.5)
        self.assertFalse(insights["settlement_integrated"])
        self.assertEqual(insights["payout_history"], [])

    async def test_admin_food_delivery_cancellation_synchronizes_every_product(self):
        admin = await self._insert_user("support-admin", "admin")
        customer = await self._insert_user("food-customer")
        courier = await self._insert_user("food-courier", "courier")
        await database.insert_one("courier_profiles", {"id": "food-profile", "user_id": courier["id"], "status": "APPROVED", "online": True, "active_delivery_id": "food-delivery"})
        await database.insert_one("food_orders", {"id": "food-order", "customer_user_id": customer["id"], "restaurant_status": "READY_FOR_PICKUP", "fulfillment_status": "PICKED_UP", "status": "PICKED_UP"})
        await database.insert_one("courier_deliveries", {"id": "food-delivery", "food_order_id": "food-order", "source_type": "FOOD_ORDER", "sender_user_id": customer["id"], "courier_user_id": courier["id"], "status": "PICKED_UP", "live_tracking_active": True})

        with self.assertRaises(ValueError):
            await cancel_delivery("food-delivery", courier, "Courier tried to cancel after pickup")
        cancelled = await cancel_delivery("food-delivery", admin, "Cancelled by support after customer report")
        order = await database.find_one("food_orders", {"id": "food-order"})
        profile = await database.find_one("courier_profiles", {"id": "food-profile"})
        self.assertEqual(cancelled["status"], "CANCELLED")
        self.assertEqual(order["status"], "CANCELLED")
        self.assertEqual(order["fulfillment_status"], "CANCELLED")
        self.assertIsNone(profile["active_delivery_id"])


if __name__ == "__main__":
    unittest.main()
