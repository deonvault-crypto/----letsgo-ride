import unittest

from app.database import COLLECTION_NAMES, database


class DatabaseIdentifierIntegrityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.client = None
        database.status = "not_configured"
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_memory_database_enforces_unique_user_app_ids(self):
        await database.insert_one("users", {"id": "user-a", "email": "a@example.invalid"})
        with self.assertRaises(ValueError):
            await database.insert_one("users", {"id": "user-a", "email": "b@example.invalid"})

    async def test_memory_database_requires_user_app_id(self):
        with self.assertRaises(ValueError):
            await database.insert_one("users", {"email": "missing@example.invalid"})


if __name__ == "__main__":
    unittest.main()
