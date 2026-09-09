import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.database import COLLECTION_NAMES, database
from app.routers.operations_private_documents import admin_worker_document


class OpsPrivateDocumentAccessTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_non_admin_cannot_fetch_worker_document(self):
        with self.assertRaises(HTTPException) as denied:
            await admin_worker_document(
                "application-a",
                "document-a",
                {"id": "customer-a", "role": "passenger"},
            )
        self.assertEqual(denied.exception.status_code, 403)

    async def test_admin_fetches_private_worker_document_without_url_ticket(self):
        await database.insert_one(
            "worker_applications",
            {
                "id": "application-a",
                "documents": [
                    {
                        "id": "document-a",
                        "document_type": "identity_document",
                        "cloudinary_public_id": "private/application-a/document-a",
                        "delivery_type": "authenticated",
                        "content_type": "image/jpeg",
                    }
                ],
            },
        )
        with patch(
            "app.routers.operations_private_documents.private_provider_document_bytes",
            return_value=(b"private-document", "image/jpeg"),
        ):
            response = await admin_worker_document(
                "application-a",
                "document-a",
                {"id": "admin-a", "role": "admin"},
            )
        self.assertEqual(response.body, b"private-document")
        self.assertEqual(response.media_type, "image/jpeg")
        self.assertEqual(response.headers.get("cache-control"), "no-store")


if __name__ == "__main__":
    unittest.main()
