import unittest

from fastapi import HTTPException

from app.database import COLLECTION_NAMES, database
from app.models.user import WorkModeBody
from app.routers.auth import switch_work_mode
from app.services.workforce_service import review_worker_application, save_worker_application, submit_worker_application


class MultiWorkProductTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def _user(self, user_id: str, role: str = "passenger", **extra):
        user = {
            "id": user_id,
            "role": role,
            "name": user_id.title(),
            "email": f"{user_id}@example.com",
            "phone": "+263770000001",
            "city": "Harare",
            **extra,
        }
        await database.insert_one("users", user)
        return user

    async def _submitted_application(self, user, product: str):
        payload = {
            "product": product,
            "full_name": "Dual Worker",
            "phone": "+263770000001",
            "service_area": "Harare",
            "service_area_id": "harare",
            "vehicle_type": "sedan" if product == "driver" else "motorbike",
            "vehicle_details": "Approved work vehicle",
            "accepted_terms": True,
        }
        application = await save_worker_application(payload, user)
        required = ("identity_document", "selfie", "driver_licence", "vehicle_registration") if product == "driver" else ("identity_document", "selfie")
        await database.update_one(
            "worker_applications",
            application["id"],
            {"documents": [{"id": value, "document_type": value, "file_name": f"{value}.jpg", "status": "PENDING"} for value in required]},
        )
        return await submit_worker_application(application["id"], user)

    async def test_driver_and_courier_can_be_approved_on_one_account_and_switched(self):
        applicant = await self._user("dual-worker")
        admin = await self._user("admin", "admin")

        driver_application = await self._submitted_application(applicant, "driver")
        await review_worker_application(driver_application["id"], "APPROVED", "Driver approved", admin)
        after_driver = await database.find_one("users", {"id": applicant["id"]})
        self.assertEqual(after_driver["role"], "driver")
        self.assertEqual(after_driver["work_products"], ["driver"])

        courier_application = await self._submitted_application(after_driver, "courier")
        await review_worker_application(courier_application["id"], "APPROVED", "Courier approved", admin)
        dual = await database.find_one("users", {"id": applicant["id"]})
        self.assertEqual(dual["role"], "driver")
        self.assertEqual(set(dual["work_products"]), {"driver", "courier"})
        self.assertIsNotNone(await database.find_one("drivers", {"user_id": applicant["id"]}))
        self.assertIsNotNone(await database.find_one("courier_profiles", {"user_id": applicant["id"]}))

        switched = await switch_work_mode(WorkModeBody(role="courier"), dual)
        self.assertTrue(switched["success"])
        self.assertEqual(switched["data"]["role"], "courier")
        courier_user = await database.find_one("users", {"id": applicant["id"]})
        self.assertEqual(courier_user["role"], "courier")

        switched_back = await switch_work_mode(WorkModeBody(role="driver"), courier_user)
        self.assertEqual(switched_back["data"]["role"], "driver")

    async def test_switching_is_blocked_while_current_work_mode_is_online(self):
        user = await self._user("busy-driver", "driver", work_products=["driver", "courier"])
        await database.insert_one("drivers", {"id": "driver-profile", "user_id": user["id"], "verified": True, "verification_status": "approved"})
        await database.insert_one("hailing_driver_presence", {"id": "presence", "driver_id": "driver-profile", "status": "available"})

        with self.assertRaises(HTTPException) as raised:
            await switch_work_mode(WorkModeBody(role="courier"), user)
        self.assertEqual(raised.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
