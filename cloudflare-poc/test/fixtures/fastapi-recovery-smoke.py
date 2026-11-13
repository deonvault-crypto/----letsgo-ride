"""Run against disposable MongoDB and Redis over loopback, with synthetic users only."""

import asyncio
import os
import secrets
from unittest.mock import AsyncMock, patch
from urllib.parse import urlsplit

from fastapi.testclient import TestClient
from pymongo import MongoClient


def check_local_configuration():
    if os.environ.get("APP_ENV") != "test" or os.environ.get("MONGODB_DB_NAME") != "letsgoride":
        raise RuntimeError("Expected APP_ENV=test and a disposable letsgoride database")
    for name, scheme in (("MONGODB_URI", "mongodb"), ("REALTIME_REDIS_URL", "redis"), ("RATE_LIMIT_REDIS_URL", "redis")):
        endpoint = urlsplit(os.environ.get(name, ""))
        if endpoint.scheme != scheme or endpoint.hostname != "127.0.0.1" or not endpoint.port or endpoint.query:
            raise RuntimeError(f"{name} must be a dedicated loopback service")
    for name in ("STRIPE_ENABLED", "PASSENGER_CARD_PAYMENTS_ENABLED", "ADMIN_AUTO_CREATE"):
        if os.environ.get(name) != "false":
            raise RuntimeError(f"Set {name}=false for the recovery smoke")


check_local_configuration()

from app.main import app  # noqa: E402
from app.services.auth_service import create_password_record  # noqa: E402
from app.services.event_service import realtime_event_service  # noqa: E402
from app.utils import now_iso  # noqa: E402


PICKUP = {"latitude": -17.8248, "longitude": 31.053}
DROPOFF = {"latitude": -17.78, "longitude": 31.08}
ROUTE = {
    "provider": "synthetic", "distance_meters": 6500, "distance_km": 6.5, "duration_seconds": 900,
    "estimated_duration_minutes": 15, "encoded_polyline": "synthetic", "origin": PICKUP, "destination": DROPOFF,
    "origin_address": "Synthetic pickup", "destination_address": "Synthetic dropoff",
}
PASSWORD = "SyntheticOnly7!" + secrets.token_hex(12)


def success(response):
    assert response.is_success, (response.request.url.path, response.status_code, response.json().get("error"))
    return response.json()["data"]


def credentials(role):
    return {"email": f"{role}@example.invalid", "password": PASSWORD}


def login(client, role):
    return success(client.post("/auth/email-login", json=credentials(role)))


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


async def confirm_redis_delivery(user_id):
    return await realtime_event_service.publish_user_event(
        event_type="test.recovery.completed", resource_type="hailing_trip", resource_id="synthetic-trip",
        version=1, user_ids=[user_id],
    )


def main():
    with MongoClient(os.environ["MONGODB_URI"], serverSelectionTimeoutMS=3000) as client:
        db = client.letsgoride
        if db.list_collection_names():
            raise RuntimeError("Expected a fresh disposable MongoDB process")
        for role in ("passenger", "driver", "merchant", "admin"):
            db.users.insert_one({"id": f"synthetic-{role}", "role": role, "name": f"Synthetic {role}",
                                 "email": credentials(role)["email"], "email_verified": True, "status": "active",
                                 "profile_photo_verified": role == "driver",
                                 **create_password_record(PASSWORD)})
        db.drivers.insert_one({"id": "synthetic-driver-profile", "user_id": "synthetic-driver", "verified": True,
                               "verification_status": "approved", "status": "active", "hailing_enabled": True,
                               "approved_hailing_classes": ["ECONOMY"], "approved_hailing_city_ids": ["zw-harare"]})
        db.vehicles.insert_one({"id": "synthetic-vehicle", "driver_id": "synthetic-driver-profile", "make": "Test",
                                "model": "Test", "color": "White", "plate_number": "SYNTHETIC", "seats": 4,
                                "created_at": now_iso()})
        db.restaurants.insert_one({"id": "synthetic-restaurant", "owner_user_id": "synthetic-merchant",
                                   "name": "Synthetic Kitchen", "address": "Synthetic Kitchen Harare", "location": PICKUP,
                                   "status": "ACTIVE", "is_accepting_orders": True})
        db.menu_items.insert_one({"id": "synthetic-meal", "restaurant_id": "synthetic-restaurant", "name": "Synthetic Meal",
                                  "category_id": "synthetic-menu", "price_usd": 8.5, "is_available": True})

        with (
            patch("app.services.auth_service.send_verification_email", new_callable=AsyncMock, return_value=True) as mail,
            patch("app.services.hailing_fare_service.compute_route", new_callable=AsyncMock, return_value=ROUTE),
            patch("app.services.delivery_quote_service.routing_status", return_value={"configured": True}),
            patch("app.services.delivery_quote_service.resolve_route", new_callable=AsyncMock, return_value=ROUTE),
            TestClient(app) as api,
        ):
            for _ in range(40):
                ready = api.get("/health/ready")
                if ready.is_success:
                    break
                api.portal.call(asyncio.sleep, 0.05)
            ready_data = success(ready)
            assert ready_data["database_status"] == "connected" and ready_data["realtime_status"] == "ready"

            passenger = login(api, "passenger")
            assert passenger["user"]["id"] == "synthetic-passenger"
            assert "password_hash" not in passenger["user"]
            assert api.post("/auth/email-login", json={**credentials("passenger"), "password": "WrongSynthetic7!"}).status_code == 401
            passenger_headers = bearer(passenger["token"])
            assert success(api.get("/auth/me", headers=passenger_headers))["id"] == "synthetic-passenger"
            assert api.post("/auth/request-otp", json={"phone": "+263000000000"}).status_code == 503
            assert api.post("/auth/verify-otp", json={"phone": "+263000000000", "otp": "123456"}).status_code == 503

            signup = {**credentials("signup"), "name": "Synthetic Signup", "confirm_password": PASSWORD}
            success(api.post("/auth/email-register", json=signup))
            assert mail.await_count == 1
            sent_to, code = mail.await_args.args
            assert sent_to == signup["email"]
            verification = success(api.post("/auth/verify-email", json={"email": sent_to, "code": code}))
            assert verification["email_verified"] is True

            driver_headers = bearer(login(api, "driver")["token"])
            success(api.post("/hailing/driver/online", headers=driver_headers, json={"city_id": "zw-harare", "location": PICKUP}))
            quote = success(api.post("/hailing/quotes", headers=passenger_headers, json={
                "pickup": {**PICKUP, "formatted_address": "Synthetic pickup"},
                "dropoff": {**DROPOFF, "formatted_address": "Synthetic dropoff"},
            }))
            trip_body = {"quote_id": quote["quote_id"], "client_request_id": "synthetic-request", "verify_ride_with_pin": True}
            trip = success(api.post("/hailing/trips", headers=passenger_headers, json=trip_body))
            assert success(api.post("/hailing/trips", headers=passenger_headers, json=trip_body))["id"] == trip["id"]
            offer = success(api.get("/hailing/driver/offer", headers=driver_headers))["offer"]
            assert offer["trip_id"] == trip["id"]
            assigned = success(api.post(f"/hailing/offers/{offer['id']}/accept", headers=driver_headers))
            assert assigned["status"] == "DRIVER_ASSIGNED"
            trip_path = f"/hailing/trips/{trip['id']}"
            assert success(api.post(f"{trip_path}/arrived", headers=driver_headers))["status"] == "DRIVER_ARRIVED"
            boarding = success(api.post(f"{trip_path}/confirm-boarding", headers=passenger_headers))
            assert boarding["status"] == "PASSENGER_CONFIRMED_BOARDING"
            assert api.post(f"{trip_path}/start", headers=driver_headers).status_code == 400
            success(api.post(f"{trip_path}/verify-pin", headers=driver_headers, json={"pin": boarding["trip_pin"]}))
            assert success(api.post(f"{trip_path}/start", headers=driver_headers))["status"] == "IN_PROGRESS"
            assert success(api.post(f"{trip_path}/complete", headers=driver_headers))["status"] == "COMPLETED"

            parcel = success(api.post("/courier/deliveries", headers=passenger_headers, json={
                "pickup_address": "Synthetic pickup", "dropoff_address": "Synthetic dropoff",
                "pickup_location": PICKUP, "dropoff_location": DROPOFF, "recipient_name": "Synthetic Receiver",
                "recipient_phone": "+263000000000", "package_type": "parcel",
            }))
            assert success(api.get(f"/courier/deliveries/{parcel['id']}", headers=passenger_headers))["id"] == parcel["id"]
            order = success(api.post("/food/orders", headers=passenger_headers, json={
                "restaurant_id": "synthetic-restaurant", "delivery_address": "Synthetic dropoff", "delivery_location": DROPOFF,
                "recipient_name": "Synthetic Receiver", "recipient_phone": "+263000000000",
                "items": [{"menu_item_id": "synthetic-meal", "quantity": 1}],
            }))
            merchant_headers = bearer(login(api, "merchant")["token"])
            preparing = success(api.post(f"/merchant/orders/{order['id']}/status", headers=merchant_headers, json={"status": "PREPARING"}))
            assert preparing["status"] == "PREPARING" and preparing["courier_delivery_id"]

            assert success(api.get("/payments/config"))["driver_settlement_enabled"] is False
            assert db.app_notifications.count_documents({"user_id": "synthetic-passenger"}) > 0
            success(api.get("/notifications", headers=passenger_headers))
            support = success(api.post("/support/messages", headers=passenger_headers,
                                       json={"subject": "Synthetic request", "message": "Local recovery smoke."}))
            assert support["user_id"] == "synthetic-passenger"
            assert api.get("/ops/overview", headers=passenger_headers).status_code == 403
            admin_headers = bearer(login(api, "admin")["token"])
            success(api.get("/ops/overview", headers=admin_headers))
            ops_case = success(api.post("/ops/cases", headers=admin_headers, json={
                "subject": "Synthetic recovery case", "description": "Verify the local audit trail.",
            }))
            success(api.get(f"/ops/cases/{ops_case['id']}", headers=admin_headers))

            with api.websocket_connect("/realtime", subprotocols=["letsgoride.realtime.v1", f"letsgoride.auth.{passenger['token']}"]) as socket:
                assert socket.receive_json()["type"] == "realtime.ready"
                assert api.portal.call(confirm_redis_delivery, "synthetic-passenger")
                assert socket.receive_json()["type"] == "test.recovery.completed"
        assert db.hailing_trips.count_documents({"status": "COMPLETED"}) == 1
        assert db.food_orders.count_documents({"status": "PREPARING"}) == 1
        assert db.ops_cases.count_documents({"id": ops_case["id"]}) == 1
        print("FastAPI recovery smoke passed on MongoDB and Redis using synthetic records")


if __name__ == "__main__":
    main()
