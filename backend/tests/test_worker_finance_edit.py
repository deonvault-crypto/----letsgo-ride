import unittest
from types import SimpleNamespace
from unittest.mock import patch

from cryptography.fernet import Fernet
from pydantic import ValidationError

from app.database import database
from app.models.worker_finance import PayoutMethodUpdateBody
from app.services.worker_finance_service import (
    _decrypt_payload,
    create_payout_method,
    update_payout_method,
)


class WorkerFinanceEditTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        await database.replace_collection("worker_payout_methods", [])
        await database.replace_collection("worker_payouts", [])
        self.key = Fernet.generate_key().decode("utf-8")
        self.settings_patch = patch(
            "app.services.worker_finance_service.get_settings",
            return_value=SimpleNamespace(payout_data_encryption_key=self.key),
        )
        self.settings_patch.start()
        self.addCleanup(self.settings_patch.stop)
        self.user = {"id": "worker-edit", "role": "driver"}

    async def test_ecocash_metadata_edit_preserves_encrypted_destination(self):
        created = await create_payout_method(
            {
                "method_type": "ECOCASH",
                "account_holder_name": "Original Name",
                "mobile_number": "+263771234567",
                "currency": "USD",
                "make_default": True,
            },
            self.user,
        )
        updated = await update_payout_method(
            created["id"],
            {"account_holder_name": "Updated Name"},
            self.user,
        )

        self.assertEqual(updated["account_holder_name"], "Updated Name")
        self.assertEqual(updated["masked_reference"], created["masked_reference"])
        self.assertNotIn("mobile_number", updated)
        stored = await database.find_one("worker_payout_methods", {"id": created["id"]})
        decrypted = _decrypt_payload(stored["encrypted_payload"])
        self.assertEqual(decrypted["mobile_number"], "+263771234567")
        self.assertEqual(decrypted["account_holder_name"], "Updated Name")

    async def test_bank_edit_can_change_safe_metadata_without_reentering_account_number(self):
        created = await create_payout_method(
            {
                "method_type": "BANK",
                "account_holder_name": "Worker Name",
                "bank_name": "First Bank",
                "account_number": "001234567890",
                "branch_name": "Harare",
                "branch_code": "001",
                "currency": "USD",
                "make_default": True,
            },
            self.user,
        )
        updated = await update_payout_method(
            created["id"],
            {"bank_name": "Better Bank", "branch_name": "Borrowdale", "branch_code": None},
            self.user,
        )

        self.assertEqual(updated["bank_name"], "Better Bank")
        self.assertEqual(updated["branch_name"], "Borrowdale")
        self.assertIsNone(updated["branch_code"])
        self.assertEqual(updated["masked_reference"], created["masked_reference"])
        stored = await database.find_one("worker_payout_methods", {"id": created["id"]})
        decrypted = _decrypt_payload(stored["encrypted_payload"])
        self.assertEqual(decrypted["account_number"], "001234567890")
        self.assertEqual(decrypted["bank_name"], "Better Bank")

    async def test_edit_rejects_cross_method_secret_fields(self):
        created = await create_payout_method(
            {
                "method_type": "ECOCASH",
                "account_holder_name": "Worker Name",
                "mobile_number": "+263771234567",
                "currency": "USD",
                "make_default": True,
            },
            self.user,
        )
        with self.assertRaises(ValueError):
            await update_payout_method(created["id"], {"bank_name": "Wrong Bank"}, self.user)

    def test_patch_schema_does_not_allow_method_type_switches_or_empty_updates(self):
        with self.assertRaises(ValidationError):
            PayoutMethodUpdateBody.model_validate({"method_type": "BANK", "bank_name": "Bank"})
        with self.assertRaises(ValidationError):
            PayoutMethodUpdateBody.model_validate({})


if __name__ == "__main__":
    unittest.main()
