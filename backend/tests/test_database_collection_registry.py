import unittest

from app.database import COLLECTION_NAMES, Database


class DatabaseCollectionRegistryTests(unittest.TestCase):
    def test_worker_finance_collections_are_bootstrapped_centrally(self):
        instance = Database()

        for collection in ("worker_payout_methods", "worker_payouts"):
            self.assertIn(collection, COLLECTION_NAMES)
            self.assertIn(collection, instance.memory)
            self.assertEqual(instance.memory[collection], [])


if __name__ == "__main__":
    unittest.main()
