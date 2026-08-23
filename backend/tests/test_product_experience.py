import unittest
from datetime import datetime, timedelta, timezone

from app.database import COLLECTION_NAMES, database
from app.services.courier_earnings_service import courier_earnings_summary
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
        self.assertEqual((await database.find_one("users", {"id": customer["id"]}))["role"], "courier")
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
        await database.insert_one("courier_profiles", {"id": "profile", "user_id": courier["id"], "status": "APPROVED", "online": True})
        await database.insert_one("courier_deliveries", {"id": "terminal", "courier_user_id": courier["id"], "status": "DELIVERED", "created_at": "2027-01-01T09:00:00+00:00"})
        self.assertIsNone(await active_courier_delivery(courier))

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


if __name__ == "__main__":
    unittest.main()
