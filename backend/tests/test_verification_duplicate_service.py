import unittest

from app.database import COLLECTION_NAMES, database
from app.services.verification_duplicate_service import detect_duplicate_flags
from app.services.verification_service import manual_verification_documents


class FakeAsyncCursor:
    def __init__(self, rows):
        self.rows = list(rows)
        self.index = 0

    def __aiter__(self):
        self.index = 0
        return self

    async def __anext__(self):
        if self.index >= len(self.rows):
            raise StopAsyncIteration
        row = self.rows[self.index]
        self.index += 1
        return dict(row)


class FakeCollection:
    def __init__(self, rows):
        self.rows = list(rows)
        self.find_calls = []

    def find(self, filters, projection):
        self.find_calls.append((filters, projection))
        return FakeAsyncCursor(self.rows)


class FakeMongo:
    def __init__(self, collections):
        self.collections = {
            name: FakeCollection(rows) for name, rows in collections.items()
        }

    def __getitem__(self, name):
        return self.collections[name]


class VerificationDuplicateServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def asyncTearDown(self):
        database.db = None

    async def test_memory_mode_preserves_legacy_duplicate_semantics(self):
        await database.insert_one(
            "users",
            {"id": "other-user", "phone": " +263700000001 ", "email": "DUPLICATE@EXAMPLE.COM"},
        )
        await database.insert_one(
            "drivers",
            {
                "id": "other-driver",
                "phone": "+263700000001",
                "email": "duplicate@example.com",
                "documents": [
                    {
                        "document_type": "identity_document",
                        "cloudinary_public_id": "shared-public-id",
                        "ocr": {
                            "extracted_fields": {
                                "document_number": "ID-123",
                                "licence_number": "LIC-123",
                                "plate_number": "ABC123",
                            }
                        },
                    }
                ],
            },
        )

        flags = await detect_duplicate_flags(
            user={"id": "current-user", "phone": "+263700000001", "email": "duplicate@example.com"},
            driver={"id": "current-driver"},
            documents=[
                {
                    "document_type": "identity_document",
                    "cloudinary_public_id": "shared-public-id",
                }
            ],
            extracted_fields={
                "document_number": "id-123",
                "licence_number": "lic-123",
                "plate_number": "abc123",
            },
            normalize_documents=manual_verification_documents,
        )

        self.assertEqual(
            set(flags),
            {
                "duplicate_phone",
                "duplicate_email",
                "duplicate_cloudinary_public_id",
                "duplicate_identity_document_number",
                "duplicate_driver_licence_number",
                "duplicate_vehicle_plate",
            },
        )

    async def test_mongo_mode_queries_only_matching_candidates(self):
        fake = FakeMongo(
            {
                "users": [
                    {"id": "other-user", "phone": "+263700000001", "email": "duplicate@example.com"}
                ],
                "drivers": [
                    {
                        "id": "other-driver",
                        "phone": "+263700000001",
                        "email": "duplicate@example.com",
                        "documents": [
                            {
                                "document_type": "identity_document",
                                "cloudinary_public_id": "shared-public-id",
                                "ocr": {
                                    "extracted_fields": {
                                        "document_number": "ID-123",
                                        "licence_number": "LIC-123",
                                        "plate_number": "ABC123",
                                    }
                                },
                            }
                        ],
                    }
                ],
            }
        )
        database.db = fake

        flags = await detect_duplicate_flags(
            user={"id": "current-user", "phone": "+263700000001", "email": "duplicate@example.com"},
            driver={"id": "current-driver"},
            documents=[
                {
                    "document_type": "identity_document",
                    "cloudinary_public_id": "shared-public-id",
                }
            ],
            extracted_fields={
                "document_number": "id-123",
                "licence_number": "lic-123",
                "plate_number": "abc123",
            },
            normalize_documents=manual_verification_documents,
        )

        user_filter, user_projection = fake.collections["users"].find_calls[0]
        driver_filter, driver_projection = fake.collections["drivers"].find_calls[0]
        self.assertEqual(user_filter["id"], {"$ne": "current-user"})
        self.assertTrue(user_filter["$or"])
        self.assertEqual(user_projection["_id"], 0)
        self.assertEqual(driver_filter["id"], {"$ne": "current-driver"})
        self.assertIn(
            {"documents.cloudinary_public_id": {"$in": ["shared-public-id"]}},
            driver_filter["$or"],
        )
        self.assertIn({"documents": {"$type": "object"}}, driver_filter["$or"])
        self.assertEqual(driver_projection["documents"], 1)
        self.assertIn("duplicate_identity_document_number", flags)
        self.assertIn("duplicate_vehicle_plate", flags)


if __name__ == "__main__":
    unittest.main()
