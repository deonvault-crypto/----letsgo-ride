import unittest

from app.database import COLLECTION_NAMES, database
from app.services.hailing_city_service import nationwide_city_ids
from app.services.workforce_review_service import review_worker_application


class VerifiedDriverRideNowDefaultsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.client = None
        database.status = "not_configured"
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def _insert_user(self, user_id: str, role: str = "passenger") -> dict:
        return await database.insert_one(
            "users",
            {
                "id": user_id,
                "role": role,
                "name": user_id,
                "email": f"{user_id}@example.com",
                "phone": "+263770000001",
                "city": "Harare",
            },
        )

    async def _insert_driver_application(self, application_id: str, user_id: str, status: str = "SUBMITTED") -> dict:
        return await database.insert_one(
            "worker_applications",
            {
                "id": application_id,
                "user_id": user_id,
                "product": "driver",
                "status": status,
                "full_name": "Verified Driver",
                "phone": "+263770000001",
                "service_area": "Harare",
                "vehicle": "Toyota Aqua AAB1234",
                "documents": [],
                "accepted_terms": True,
                "created_at": "2026-09-16T00:00:00+00:00",
                "updated_at": "2026-09-16T00:00:00+00:00",
            },
        )

    async def test_newly_approved_driver_is_nationwide_ride_now_economy_by_default(self):
        applicant = await self._insert_user("new-driver")
        admin = await self._insert_user("admin", "admin")
        application = await self._insert_driver_application("application-new", applicant["id"])

        reviewed = await review_worker_application(application["id"], "APPROVED", "Documents checked", admin)

        self.assertEqual(reviewed["status"], "APPROVED")
        driver = await database.find_one("drivers", {"user_id": applicant["id"]})
        self.assertIsNotNone(driver)
        self.assertTrue(driver["verified"])
        self.assertEqual(driver["verification_status"], "approved")
        self.assertTrue(driver["hailing_enabled"])
        self.assertEqual(driver["approved_hailing_city_ids"], nationwide_city_ids())
        self.assertEqual(driver["approved_hailing_classes"], ["ECONOMY"])

    async def test_reapproval_preserves_existing_explicit_ride_classes(self):
        applicant = await self._insert_user("existing-driver", "driver")
        admin = await self._insert_user("admin", "admin")
        application = await self._insert_driver_application("application-existing", applicant["id"], "APPROVED")
        await database.insert_one(
            "drivers",
            {
                "id": "driver-existing",
                "user_id": applicant["id"],
                "name": "Existing Driver",
                "verified": True,
                "verification_status": "approved",
                "status": "approved",
                "hailing_enabled": False,
                "approved_hailing_city_ids": ["zw-harare"],
                "approved_hailing_classes": ["COMFORT", "XL"],
            },
        )

        await review_worker_application(application["id"], "APPROVED", "Reconfirmed", admin)

        driver = await database.find_one("drivers", {"id": "driver-existing"})
        self.assertTrue(driver["hailing_enabled"])
        self.assertEqual(driver["approved_hailing_city_ids"], nationwide_city_ids())
        self.assertEqual(driver["approved_hailing_classes"], ["COMFORT", "XL"])


if __name__ == "__main__":
    unittest.main()
