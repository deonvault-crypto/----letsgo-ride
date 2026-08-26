import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException, UploadFile
from pydantic import ValidationError
from starlette.datastructures import Headers
from starlette.requests import Request

from app.auth import get_admin_user
from app.database import COLLECTION_NAMES, database
from app.models.ride import RideUpdateBody
from app.models.user import UserUpdate
from app.models.verification import VerificationSubmitBody
from app.routers.admin import verification_document_view
from app.routers.courier import preview_courier_quote
from app.routers.rides import update_ride
from app.routers.requests import _cancel_by_passenger
from app.routers.waitlist import driver_application, passenger_interest, waitlist
from app.models.courier import CourierQuotePreviewBody
from app.models.report import WaitlistBody
from app.services.auth_service import (
    CURRENT_PASSWORD_SCHEME,
    CURRENT_PBKDF2_ITERATIONS,
    LEGACY_PBKDF2_ITERATIONS,
    create_session_record,
    hash_password,
    verify_email_user,
)
from app.services.conversation_service import get_conversation_for_user
from app.services.courier_service import get_delivery, get_delivery_pin, update_delivery_status
from app.services.food_service import get_customer_order
from app.services.merchant_service import update_menu_item, update_restaurant_order_status
from app.services.private_document_service import (
    contained_legacy_document_path,
    private_document_service,
)
from app.services.profile_photo_service import save_profile_photo
from app.services.rate_limit_service import RateLimitService
from app.services.verification_service import resolve_submission_documents


def request(path: str) -> Request:
    return Request({
        "type": "http", "method": "POST", "path": path, "headers": [],
        "client": ("203.0.113.44", 4123), "scheme": "https",
        "server": ("test", 443), "query_string": b"",
    })


class SecurityHardeningPart2Tests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        private_document_service._memory.clear()

    def test_manual_submission_accepts_only_strict_document_references(self):
        safe = {
            "consent": True,
            "documents": [{"document_id": "document-selfie", "document_type": "selfie"}],
        }
        VerificationSubmitBody.model_validate(safe)
        for forbidden in ("file_url", "storage_path", "cloudinary_public_id", "content_type", "file_name"):
            with self.subTest(forbidden=forbidden), self.assertRaises(ValidationError):
                VerificationSubmitBody.model_validate({
                    "consent": True,
                    "documents": [{**safe["documents"][0], forbidden: "attacker-controlled"}],
                })

    def test_submission_rejects_missing_foreign_wrong_type_and_insecure_documents(self):
        driver = {
            "id": "driver-owner",
            "user_id": "owner",
            "documents": [
                {"id": "document-selfie", "document_type": "selfie", "cloudinary_public_id": "private/selfie", "delivery_type": "authenticated"},
            ],
        }
        with self.assertRaisesRegex(ValueError, "not uploaded by this account"):
            resolve_submission_documents(driver, [{"document_id": "foreign-document", "document_type": "selfie"}])
        with self.assertRaisesRegex(ValueError, "does not match"):
            resolve_submission_documents(driver, [{"document_id": "document-selfie", "document_type": "driver_license"}])
        insecure = {**driver, "documents": [{"id": "document-selfie", "document_type": "selfie", "file_url": "https://example.invalid/id"}]}
        with self.assertRaises(ValueError):
            resolve_submission_documents(insecure, [{"document_id": "document-selfie", "document_type": "selfie"}])
        with self.assertRaisesRegex(ValueError, "once"):
            resolve_submission_documents(driver, [
                {"document_id": "document-selfie", "document_type": "selfie"},
                {"document_id": "document-selfie", "document_type": "selfie"},
            ])

    def test_legacy_local_paths_are_contained_under_fixed_root(self):
        with tempfile.TemporaryDirectory() as root_text, tempfile.TemporaryDirectory() as outside_text:
            root = Path(root_text).resolve()
            inside = root / "legacy" / "document.pdf"
            inside.parent.mkdir(parents=True)
            inside.write_bytes(b"%PDF-1.4\n%%EOF")
            outside = Path(outside_text).resolve() / "outside.pdf"
            outside.write_bytes(b"%PDF-1.4\n%%EOF")
            with patch("app.services.private_document_service.VERIFICATION_STORAGE_ROOT", root):
                self.assertEqual(
                    contained_legacy_document_path({"legacy_local_document": True, "storage_path": "legacy/document.pdf"}),
                    inside,
                )
                for unsafe in (str(outside), "../outside.pdf"):
                    with self.subTest(path=unsafe), self.assertRaises(FileNotFoundError):
                        contained_legacy_document_path({"legacy_local_document": True, "storage_path": unsafe})
                with self.assertRaises(FileNotFoundError):
                    contained_legacy_document_path({"storage_path": "legacy/document.pdf"})

    async def test_document_ticket_is_one_use_resource_bound_and_actor_bound(self):
        settings = SimpleNamespace(rate_limit_redis_url="", is_production=False)
        await database.insert_one("users", {"id": "admin", "role": "admin"})
        with patch("app.services.private_document_service.get_settings", return_value=settings), patch(
            "app.routers.admin.verification_document", new=AsyncMock(return_value={"ok": True})
        ) as protected_view:
            token = await private_document_service.issue(actor_id="admin", collection="drivers", owner_id="driver-a", document_id="doc-a")
            self.assertEqual(await verification_document_view("driver-a", "doc-a", token), {"ok": True})
            protected_view.assert_awaited_once()
            with self.assertRaises(HTTPException) as reused:
                await verification_document_view("driver-a", "doc-a", token)
            self.assertEqual(reused.exception.status_code, 401)

            wrong_resource = await private_document_service.issue(actor_id="admin", collection="drivers", owner_id="driver-a", document_id="doc-a")
            with self.assertRaises(HTTPException) as mismatch:
                await verification_document_view("driver-a", "doc-b", wrong_resource)
            self.assertEqual(mismatch.exception.status_code, 401)

            await database.insert_one("users", {"id": "customer", "role": "passenger"})
            wrong_actor = await private_document_service.issue(actor_id="customer", collection="drivers", owner_id="driver-a", document_id="doc-a")
            with self.assertRaises(HTTPException) as actor:
                await verification_document_view("driver-a", "doc-a", wrong_actor)
            self.assertEqual(actor.exception.status_code, 403)

    async def test_ride_status_and_profile_storage_are_server_owned(self):
        for status in ("IN_PROGRESS", "COMPLETED", "UNKNOWN"):
            with self.subTest(status=status), self.assertRaises(ValidationError):
                RideUpdateBody.model_validate({"status": status})
        for field in ("profile_photo_url", "profile_photo_name", "role", "token", "verification_status"):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                UserUpdate.model_validate({field: "attacker-controlled"})

        ride = await database.insert_one("rides", {
            "id": "ride-owner", "user_id": "driver-a", "driver_id": "profile-a", "status": "SCHEDULED",
            "origin": "Harare", "destination": "Chitungwiza", "pickup_note": "Joina City", "dropoff_note": "Town Centre",
            "date": "2099-08-25", "time": "10:00", "price_usd": 10, "available_seats": 3,
            "vehicle": "Toyota", "is_demo": False, "realtime_version": 1,
        })
        with patch("app.routers.rides.publish_ride_realtime", new=AsyncMock(return_value=True)):
            result = await update_ride(ride["id"], RideUpdateBody(origin="Harare CBD"), {"id": "driver-a", "role": "driver"})
        self.assertEqual(result["data"]["origin"], "Harare CBD")
        with self.assertRaises(HTTPException) as foreign:
            await update_ride(ride["id"], RideUpdateBody(origin="Mutare"), {"id": "driver-b", "role": "driver"})
        self.assertEqual(foreign.exception.status_code, 403)

    async def test_validated_profile_photo_upload_remains_canonical(self):
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        user = await database.insert_one("users", {"id": "photo-owner", "role": "passenger"})
        upload = UploadFile(file=io.BytesIO(png), filename="spoofed-name.png", headers=Headers({"content-type": "image/png"}))
        with tempfile.TemporaryDirectory() as root, patch("app.services.profile_photo_service.STORAGE_ROOT", Path(root)):
            updated = await save_profile_photo(user, upload)
            self.assertTrue(updated["profile_photo_url"].endswith("_profile-photo.jpg"))
            stored = list((Path(root) / "photo-owner").iterdir())
            self.assertEqual(len(stored), 1)
            self.assertTrue(stored[0].read_bytes().startswith(b"\xff\xd8\xff"))

    async def test_public_expensive_routes_use_separate_shared_limit_buckets(self):
        limiter = AsyncMock()
        with patch("app.routers.courier.rate_limit_service.enforce", limiter), patch(
            "app.routers.courier.customer_quote_preview", new=AsyncMock(return_value={"price_usd": 5})
        ):
            await preview_courier_quote(CourierQuotePreviewBody(pickup_address="Joina City", dropoff_address="Avondale"), request("/courier/quote-preview"))
        self.assertEqual(limiter.await_args.args[1], "courier_quote_preview")
        self.assertEqual(limiter.await_args.args[2].requests, 12)

        body = WaitlistBody(name="Person Name", phone="+263771234567", city="Harare")
        for route, path, bucket, quota in (
            (waitlist, "/waitlist", "waitlist_general", 5),
            (passenger_interest, "/waitlist/passenger-interest", "waitlist_passenger", 5),
            (driver_application, "/waitlist/driver-application", "waitlist_driver", 3),
        ):
            limiter.reset_mock()
            with patch("app.routers.waitlist.rate_limit_service.enforce", limiter):
                await route(body, request(path))
            self.assertEqual(limiter.await_args.args[1], bucket)
            self.assertEqual(limiter.await_args.args[2].requests, quota)

    async def test_production_rate_limit_fails_closed_without_redis(self):
        limiter = RateLimitService()
        with patch("app.services.rate_limit_service.get_settings", return_value=SimpleNamespace(rate_limit_redis_url="", is_production=True)):
            with self.assertRaises(HTTPException) as blocked:
                await limiter.enforce(request("/courier/quote-preview"), "quote", SimpleNamespace(requests=1, window_seconds=60))
        self.assertEqual(blocked.exception.status_code, 503)

    async def test_legacy_password_login_transparently_upgrades_hash(self):
        salt = "legacy-salt"
        legacy_hash = hash_password("CorrectPassword!2026", salt, LEGACY_PBKDF2_ITERATIONS)
        await database.insert_one("users", {
            "id": "legacy-user", "email": "legacy@example.com", "normalized_email": "legacy@example.com",
            "password_salt": salt, "password_hash": legacy_hash, "email_verified": True, "status": "active",
        })
        logged_in = await verify_email_user("legacy@example.com", "CorrectPassword!2026")
        self.assertIsNotNone(logged_in)
        upgraded = await database.find_one("users", {"id": "legacy-user"})
        self.assertEqual(upgraded["password_scheme"], CURRENT_PASSWORD_SCHEME)
        self.assertEqual(upgraded["password_iterations"], CURRENT_PBKDF2_ITERATIONS)
        self.assertNotEqual(upgraded["password_hash"], legacy_hash)
        self.assertIsNone(await verify_email_user("legacy@example.com", "WrongPassword!2026"))

    async def test_high_value_cross_account_access_is_rejected(self):
        customer_a = {"id": "customer-a", "role": "passenger"}
        customer_b = {"id": "customer-b", "role": "passenger"}
        courier_a = {"id": "courier-a", "role": "courier"}
        merchant_b = {"id": "merchant-b", "role": "merchant"}

        await database.insert_one("food_orders", {"id": "food-a", "customer_user_id": "customer-a", "restaurant_id": "restaurant-a"})
        with self.assertRaises(PermissionError):
            await get_customer_order("food-a", customer_b)

        await database.insert_one("courier_deliveries", {"id": "delivery-a", "sender_user_id": "customer-a", "courier_user_id": "courier-b", "status": "COURIER_TO_PICKUP"})
        with self.assertRaises(PermissionError):
            await get_delivery("delivery-a", customer_b)
        with self.assertRaises(PermissionError):
            await get_delivery_pin("delivery-a", customer_b)
        with self.assertRaises(PermissionError):
            await update_delivery_status("delivery-a", "PICKED_UP", courier_a)

        await database.insert_one("restaurants", {"id": "restaurant-a", "owner_user_id": "merchant-a"})
        await database.insert_one("menu_items", {"id": "item-a", "restaurant_id": "restaurant-a", "name": "Meal"})
        with self.assertRaises(PermissionError):
            await update_menu_item("item-a", {"name": "Hijacked"}, merchant_b)
        with self.assertRaises(PermissionError):
            await update_restaurant_order_status("food-a", "PREPARING", None, merchant_b)

        with self.assertRaises(HTTPException) as request_outsider:
            await _cancel_by_passenger(
                {"id": "request-a", "user_id": "customer-a", "status": "pending"},
                {"id": "ride-a", "user_id": "driver-a"},
                customer_b,
                "Not my booking",
            )
        self.assertEqual(request_outsider.exception.status_code, 403)

        await database.insert_one("conversations", {"id": "conversation-a", "driver_user_id": "driver-a", "passenger_id": "customer-a"})
        with self.assertRaises(HTTPException) as outsider:
            await get_conversation_for_user("conversation-a", customer_b)
        self.assertEqual(outsider.exception.status_code, 403)

    async def test_non_admin_session_cannot_use_admin_dependency(self):
        session = create_session_record("customer")
        await database.insert_one("users", {"id": "customer", "role": "passenger", "status": "active", **session})
        with self.assertRaises(HTTPException) as denied:
            await get_admin_user(f"Bearer {session['token']}")
        self.assertEqual(denied.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
import base64
import io
