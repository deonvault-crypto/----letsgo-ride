import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.database import COLLECTION_NAMES, database
from scripts.audit_identity_documents import validate_runtime
from scripts.identity_document_inventory import (
    PROVIDER_AUTHENTICATED,
    PROVIDER_UPLOAD,
    ProviderAssetMissing,
    inspect_identity_documents,
)
from scripts.migrate_identity_documents_private import (
    APPLY_CONFIRMATION,
    PARTIAL_APPLY_CONFIRMATION,
    DocumentPlan,
    _apply_plan,
    active_blocking_actions,
    validate_apply_authorization,
)


class IdentityDocumentMigrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_inventory_classifies_without_exposing_or_mutating_documents(self):
        documents = [
            {
                "id": "doc-clean",
                "cloudinary_public_id": "private-clean",
                "delivery_type": "authenticated",
                "resource_type": "image",
            },
            {
                "id": "doc-cleanup",
                "cloudinary_public_id": "private-cleanup",
                "delivery_type": "authenticated",
                "resource_type": "image",
                "file_url": "https://historical.invalid/permanent",
            },
            {
                "id": "doc-migrate",
                "cloudinary_public_id": "legacy-provider-id",
                "delivery_type": "upload",
                "resource_type": "raw",
            },
            {
                "id": "doc-missing",
                "cloudinary_public_id": "missing-provider-id",
                "delivery_type": "authenticated",
                "resource_type": "image",
            },
            {
                "id": "doc-url-only",
                "file_url": "https://untrusted.invalid/document",
                "resource_type": "image",
            },
        ]
        await database.insert_one(
            "worker_applications",
            {"id": "application", "user_id": "applicant", "documents": documents},
        )

        async def provider_lookup(public_id: str, _resource_type: str, _declared: str) -> str:
            if public_id == "missing-provider-id":
                raise ProviderAssetMissing
            if public_id == "legacy-provider-id":
                return PROVIDER_UPLOAD
            return PROVIDER_AUTHENTICATED

        plans, counts = await inspect_identity_documents(provider_lookup)

        self.assertEqual(counts["scanned"], 5)
        self.assertEqual(counts["already_compliant"], 1)
        self.assertEqual(counts["cleanup_only"], 1)
        self.assertEqual(counts["authenticated_migration"], 1)
        self.assertEqual(counts["eligible"], 2)
        self.assertEqual(counts["missing_provider_asset"], 1)
        self.assertEqual(counts["requires_reupload"], 1)
        self.assertEqual(counts["invalid_external_url"], 1)
        self.assertEqual(counts["blocked"], 2)
        self.assertEqual(len(plans), 5)
        stored = await database.find_one("worker_applications", {"id": "application"})
        self.assertEqual(stored["documents"], documents)

    async def test_inventory_blocks_missing_owner_and_local_path(self):
        await database.insert_one(
            "drivers",
            {
                "id": "driver-owner-missing",
                "documents": [
                    {
                        "id": "local-doc",
                        "storage_path": "legacy/document.pdf",
                    }
                ],
            },
        )
        _, counts = await inspect_identity_documents(AsyncMock())
        self.assertEqual(counts["ownership_error"], 1)
        self.assertEqual(counts["blocked"], 1)

        await database.update_one(
            "drivers",
            "driver-owner-missing",
            {"user_id": "driver-user"},
        )
        _, counts = await inspect_identity_documents(AsyncMock())
        self.assertEqual(counts["unsafe_path"], 1)
        self.assertEqual(counts["requires_reupload"], 1)
        self.assertEqual(counts["blocked"], 1)

    async def test_cleanup_apply_removes_historical_locator_without_provider_write(self):
        await database.insert_one(
            "drivers",
            {
                "id": "driver",
                "user_id": "driver-user",
                "documents": [
                    {
                        "id": "document",
                        "cloudinary_public_id": "private-provider-id",
                        "delivery_type": "authenticated",
                        "file_url": "https://historical.invalid/permanent",
                    }
                ],
            },
        )
        plans = [DocumentPlan("drivers", "driver", 0, "cleanup_only", "authenticated")]
        with patch("scripts.migrate_identity_documents_private.cloudinary.uploader.rename") as rename:
            updated = await _apply_plan(plans)
        self.assertEqual(updated, 1)
        rename.assert_not_called()
        saved = await database.find_one("drivers", {"id": "driver"})
        self.assertEqual(saved["documents"][0]["delivery_type"], "authenticated")
        self.assertNotIn("file_url", saved["documents"][0])

    async def test_partial_apply_migrates_eligible_and_preserves_local_document_exactly(self):
        local_document = {
            "id": "local-document",
            "document_type": "identity_document",
            "storage_path": "legacy/identity.pdf",
            "status": "accepted",
        }
        provider_document = {
            "id": "provider-document",
            "document_type": "driver_license",
            "cloudinary_public_id": "legacy-provider-id",
            "delivery_type": "upload",
            "resource_type": "image",
            "file_url": "https://historical.invalid/provider",
            "status": "accepted",
        }
        await database.insert_one(
            "drivers",
            {
                "id": "driver",
                "user_id": "driver-user",
                "verification_status": "approved",
                "documents": [local_document, provider_document],
            },
        )
        plans = [
            DocumentPlan("drivers", "driver", 0, "unsafe_path"),
            DocumentPlan("drivers", "driver", 1, "authenticated_migration", "upload"),
        ]
        with patch("scripts.migrate_identity_documents_private.cloudinary.uploader.rename") as rename:
            updated = await _apply_plan(plans)

        self.assertEqual(updated, 1)
        rename.assert_called_once()
        saved = await database.find_one("drivers", {"id": "driver"})
        self.assertEqual(saved["verification_status"], "approved")
        self.assertEqual(saved["documents"][0], local_document)
        self.assertEqual(saved["documents"][1]["delivery_type"], "authenticated")
        self.assertNotIn("file_url", saved["documents"][1])
        self.assertEqual(saved["documents"][1]["status"], "accepted")

    def test_partial_mode_defers_only_reupload_blockers(self):
        reupload_only = {
            "requires_reupload": 3,
            "unsafe_path": 3,
            "missing_provider_asset": 0,
            "ownership_error": 0,
            "malformed": 0,
            "provider_lookup_error": 0,
        }
        self.assertTrue(
            active_blocking_actions(reupload_only, allow_reupload_blockers=False)
        )
        self.assertEqual(
            active_blocking_actions(reupload_only, allow_reupload_blockers=True),
            (),
        )

        for hard_blocker in (
            "missing_provider_asset",
            "ownership_error",
            "malformed",
            "provider_lookup_error",
        ):
            counts = dict(reupload_only)
            counts[hard_blocker] = 1
            self.assertIn(
                hard_blocker,
                active_blocking_actions(counts, allow_reupload_blockers=True),
            )

    def test_runtime_identity_and_apply_gates_fail_closed(self):
        staging = SimpleNamespace(app_env="staging", mongodb_db_name="letsgoride_staging")
        with patch("scripts.audit_identity_documents.get_settings", return_value=staging):
            validate_runtime("staging", "letsgoride_staging")
            with self.assertRaises(RuntimeError):
                validate_runtime("production", "letsgoride_staging")
            with self.assertRaises(RuntimeError):
                validate_runtime("staging", "letsgoride")

        validate_apply_authorization(apply=False, confirmation=None, backup_reference=None)
        with self.assertRaises(RuntimeError):
            validate_apply_authorization(
                apply=True,
                confirmation="wrong",
                backup_reference="backup-123",
            )
        with self.assertRaises(RuntimeError):
            validate_apply_authorization(
                apply=True,
                confirmation=APPLY_CONFIRMATION,
                backup_reference=None,
            )
        validate_apply_authorization(
            apply=True,
            confirmation=APPLY_CONFIRMATION,
            backup_reference="backup-20260826",
        )

        # Partial apply requires a distinct phrase so the normal confirmation
        # cannot accidentally bypass local/re-upload blockers.
        with self.assertRaises(RuntimeError):
            validate_apply_authorization(
                apply=True,
                confirmation=APPLY_CONFIRMATION,
                backup_reference="backup-20260826",
                allow_reupload_blockers=True,
            )
        validate_apply_authorization(
            apply=True,
            confirmation=PARTIAL_APPLY_CONFIRMATION,
            backup_reference="backup-20260826",
            allow_reupload_blockers=True,
        )


if __name__ == "__main__":
    unittest.main()
