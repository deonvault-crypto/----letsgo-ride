import unittest
from unittest.mock import AsyncMock, Mock, patch

from app.services.legacy_media_migration_service import (
    LEGACY_PROFILE_PHOTO_PREFIX,
    _download_legacy_profile_photo,
    migrate_legacy_profile_photos,
)


class LegacyMediaMigrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_migrates_live_legacy_photo_without_changing_verification_state(self):
        user = {
            "id": "user-1",
            "status": "active",
            "role": "passenger",
            "profile_photo_url": f"{LEGACY_PROFILE_PHOTO_PREFIX}user-1/photo.jpg",
            "profile_photo_verified": False,
            "profile_photo_review_status": "not_required",
        }
        stored = {
            "secure_url": "https://res.cloudinary.com/demo/image/upload/profile.jpg",
            "public_id": "letsgoride/profile-photos/user-1/new-photo",
            "resource_type": "image",
            "type": "upload",
            "version": 123,
        }
        with (
            patch("app.services.legacy_media_migration_service.database.find_many", new=AsyncMock(return_value=[user])),
            patch("app.services.legacy_media_migration_service.database.update_one", new=AsyncMock(return_value={**user, **stored})) as update_user,
            patch("app.services.legacy_media_migration_service._download_legacy_profile_photo", new=Mock(return_value=(b"image-bytes", "image/jpeg"))),
            patch("app.services.legacy_media_migration_service._upload_profile_photo", new=Mock(return_value=stored)),
        ):
            result = await migrate_legacy_profile_photos()

        self.assertEqual(result, {"candidates": 1, "migrated": 1, "failed": 0})
        update_user.assert_awaited_once()
        updates = update_user.await_args.args[2]
        self.assertEqual(updates["profile_photo_url"], stored["secure_url"])
        self.assertEqual(updates["profile_photo_cloudinary_public_id"], stored["public_id"])
        self.assertEqual(updates["profile_photo_migrated_from_legacy_url"], user["profile_photo_url"])
        self.assertNotIn("profile_photo_verified", updates)
        self.assertNotIn("profile_photo_review_status", updates)

    def test_rejects_non_legacy_host_before_network_access(self):
        with self.assertRaises(ValueError):
            _download_legacy_profile_photo("https://example.com/media/profile-photos/user/photo.jpg")


if __name__ == "__main__":
    unittest.main()
