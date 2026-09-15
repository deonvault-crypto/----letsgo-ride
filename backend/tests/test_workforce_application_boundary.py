import unittest
from unittest.mock import patch

from app.database import COLLECTION_NAMES, database
from app.services import workforce_application_service
from app.services import workforce_service


class WorkforceApplicationBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    def test_workforce_service_preserves_application_compatibility_exports(self):
        self.assertIs(
            workforce_service.list_my_applications,
            workforce_application_service.list_my_applications,
        )
        self.assertIs(
            workforce_service.save_worker_application,
            workforce_application_service.save_worker_application,
        )
        self.assertIs(
            workforce_service.submit_worker_application,
            workforce_application_service.submit_worker_application,
        )
        self.assertIs(
            workforce_service.list_worker_applications_for_admin,
            workforce_application_service.list_worker_applications_for_admin,
        )
        self.assertIs(
            workforce_service.public_application,
            workforce_application_service.public_application,
        )
        self.assertIs(
            workforce_service.APPLICATION_STATUSES,
            workforce_application_service.APPLICATION_STATUSES,
        )
        self.assertIs(
            workforce_service.REQUIRED_DOCUMENTS,
            workforce_application_service.REQUIRED_DOCUMENTS,
        )

    async def test_my_application_ordering_is_pushed_to_database(self):
        user = {"id": "worker-app-order", "role": "passenger"}
        await database.insert_one(
            "worker_applications",
            {
                "id": "older",
                "user_id": user["id"],
                "product": "courier",
                "documents": [],
                "updated_at": "2026-09-14T08:00:00+00:00",
            },
        )
        await database.insert_one(
            "worker_applications",
            {
                "id": "newer",
                "user_id": user["id"],
                "product": "driver",
                "documents": [],
                "updated_at": "2026-09-15T09:00:00+00:00",
            },
        )

        with patch.object(database, "find_many", wraps=database.find_many) as find_many:
            rows = await workforce_service.list_my_applications(user)

        self.assertEqual([row["id"] for row in rows], ["newer", "older"])
        self.assertEqual(find_many.await_args.kwargs["sort"], [("updated_at", -1)])


if __name__ == "__main__":
    unittest.main()
