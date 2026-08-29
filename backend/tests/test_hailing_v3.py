import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.database import COLLECTION_NAMES, database
from app.models.hailing import HailingQuoteBody, HailingTripCreateBody, ServiceAreaResolveBody
from app.routers.hailing import admin_update_hailing_driver, admin_upsert_city, quote, resolve_area
from app.routers.rides import list_rides
from app.models.hailing import HailingCityUpsertBody, HailingDriverEligibilityBody
from app.services.auth_service import create_session_record
from app.services.hailing_city_service import (
    get_city,
    resolve_service_area,
    seed_zimbabwe_service_areas,
)
from app.services.hailing_fare_service import calculate_fare, create_quote
from app.services.hailing_trip_service import (
    accept_offer,
    active_trip_for_user,
    cancel_trip,
    confirm_passenger_boarding,
    complete_trip,
    create_trip_from_quote,
    current_driver_offer,
    driver_go_online,
    eligible_drivers,
    mark_arrived,
    start_trip,
    sweep_hailing_dispatch,
    update_trip_location,
    verify_trip_pin,
)
from app.utils import now_iso


def request_stub():
    return type("Request", (), {"client": ("203.0.113.88", 4000), "headers": {}, "url": type("Url", (), {"path": "/hailing"})()})()


ROUTE = {
    "provider": "test",
    "distance_meters": 6500,
    "distance_km": 6.5,
    "duration_seconds": 900,
    "estimated_duration_minutes": 15,
    "encoded_polyline": "encoded",
    "origin": {"latitude": -17.82, "longitude": 31.05},
    "destination": {"latitude": -17.78, "longitude": 31.08},
}


class HailingV3Tests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.client = None
        database.status = "not_configured"
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        await seed_zimbabwe_service_areas()
        self.customer = await database.insert_one("users", {"id": "customer-a", "role": "passenger", "name": "Customer A", **create_session_record("cust")})
        self.driver_user = await database.insert_one("users", {"id": "driver-a", "role": "driver", "name": "Driver A", **create_session_record("drv")})
        self.driver = await database.insert_one("drivers", {
            "id": "driver-profile-a",
            "user_id": "driver-a",
            "name": "Driver A",
            "city": "Harare",
            "verified": True,
            "verification_status": "approved",
            "status": "active",
            "approved_hailing_city_ids": ["zw-harare"],
            "approved_hailing_classes": ["ECONOMY"],
        })
        await database.insert_one("vehicles", {"id": "vehicle-a", "driver_id": "driver-profile-a", "user_id": "driver-a", "make": "Toyota", "model": "Aqua", "color": "White", "plate_number": "ABC 123", "seats": 4, "created_at": now_iso()})

    async def test_city_resolution_enabled_disabled_and_outside_zimbabwe(self):
        harare = await resolve_service_area(-17.8248, 31.053)
        self.assertTrue(harare["supported"])
        self.assertTrue(harare["enabled"])
        self.assertEqual(harare["service_area"]["id"], "zw-harare")
        outside = await resolve_service_area(52.2297, 21.0122)
        self.assertFalse(outside["supported"])
        self.assertEqual(outside["reason"], "outside_zimbabwe")
        await database.update_one("hailing_cities", "zw-harare", {"ride_hailing_enabled": False})
        disabled = await resolve_service_area(-17.8248, 31.053)
        self.assertTrue(disabled["supported"])
        self.assertFalse(disabled["enabled"])

    async def test_quote_calculation_minimum_surge_and_expiration(self):
        city = await get_city("zw-harare")
        fare = calculate_fare(city, "ECONOMY", 0, 0)
        self.assertEqual(fare["total_fare"], 3.0)
        city["pricing"]["ECONOMY"]["surge_multiplier"] = 1.5
        surge = calculate_fare(city, "ECONOMY", 10, 20)
        self.assertTrue(surge["high_demand"])
        self.assertEqual(surge["surge_multiplier"], 1.5)

        body = {
            "pickup": {"formatted_address": "Joina City", "latitude": -17.8248, "longitude": 31.053},
            "dropoff": {"formatted_address": "Avondale", "latitude": -17.78, "longitude": 31.08},
            "ride_class": "ECONOMY",
        }
        with patch("app.services.hailing_fare_service.compute_route", new=AsyncMock(return_value=ROUTE)):
            quote_doc = await create_quote(body, self.customer)
        self.assertEqual(quote_doc["currency"], "USD")
        stored = await database.find_one("hailing_quotes", {"id": quote_doc["quote_id"]})
        self.assertEqual(stored["route"]["distance_km"], 6.5)

    async def test_invalid_quote_and_duplicate_active_trip_prevention(self):
        with self.assertRaisesRegex(ValueError, "expired"):
            await create_trip_from_quote({"quote_id": "missing", "payment_method": "cash", "client_request_id": "same-request"}, self.customer)
        await database.insert_one("hailing_quotes", {
            "id": "quote-a",
            "user_id": self.customer["id"],
            "city_id": "zw-harare",
            "pickup": {"formatted_address": "A", "latitude": -17.8248, "longitude": 31.053},
            "dropoff": {"formatted_address": "B", "latitude": -17.78, "longitude": 31.08},
            "route": ROUTE,
            "fare": calculate_fare(await get_city("zw-harare"), "ECONOMY", 6.5, 15),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat(),
        })
        trip_a = await create_trip_from_quote({"quote_id": "quote-a", "payment_method": "cash", "client_request_id": "same-request"}, self.customer)
        trip_b = await create_trip_from_quote({"quote_id": "quote-a", "payment_method": "cash", "client_request_id": "same-request"}, self.customer)
        self.assertEqual(trip_a["id"], trip_b["id"])

    async def test_driver_online_eligibility_and_candidate_filtering(self):
        unverified_user = await database.insert_one("users", {"id": "driver-b", "role": "driver"})
        await database.insert_one("drivers", {"id": "driver-profile-b", "user_id": "driver-b", "city": "Harare", "verified": False, "verification_status": "needs_review"})
        with self.assertRaises(PermissionError):
            await driver_go_online({"city_id": "zw-harare", "ride_class": "ECONOMY", "location": {"latitude": -17.8248, "longitude": 31.053}}, unverified_user)
        await driver_go_online({"city_id": "zw-harare", "ride_class": "ECONOMY", "location": {"latitude": -17.8248, "longitude": 31.053}}, self.driver_user)
        trip = {"id": "trip-a", "city_id": "zw-harare", "ride_class": "ECONOMY", "pickup": {"latitude": -17.8248, "longitude": 31.053}}
        self.assertEqual((await eligible_drivers(trip, 2, 75))[0]["driver_id"], self.driver["id"])
        await database.update_one("hailing_driver_presence", f"hailing-presence-{self.driver['id']}", {"last_seen_at": "2020-01-01T00:00:00+00:00"})
        self.assertEqual(await eligible_drivers(trip, 2, 75), [])

    async def test_offer_acceptance_normal_boarding_trip_start_location_complete_and_cash_state(self):
        await driver_go_online({"city_id": "zw-harare", "ride_class": "ECONOMY", "location": {"latitude": -17.8248, "longitude": 31.053}}, self.driver_user)
        await database.insert_one("hailing_quotes", {
            "id": "quote-b",
            "user_id": self.customer["id"],
            "city_id": "zw-harare",
            "pickup": {"formatted_address": "Pickup", "latitude": -17.8248, "longitude": 31.053},
            "dropoff": {"formatted_address": "Dropoff", "latitude": -17.78, "longitude": 31.08},
            "route": ROUTE,
            "fare": calculate_fare(await get_city("zw-harare"), "ECONOMY", 6.5, 15),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat(),
        })
        trip = await create_trip_from_quote({"quote_id": "quote-b", "payment_method": "cash", "client_request_id": "request-b"}, self.customer)
        offer = (await current_driver_offer(self.driver_user))["offer"]
        accepted = await accept_offer(offer["id"], self.driver_user)
        self.assertEqual(accepted["status"], "DRIVER_ASSIGNED")
        with self.assertRaises(ValueError):
            await accept_offer(offer["id"], self.driver_user)
        passenger_view = await active_trip_for_user(self.customer)
        self.assertIsNone(passenger_view.get("plain_trip_pin"))
        await mark_arrived(trip["id"], self.driver_user)
        with self.assertRaises(ValueError):
            await start_trip(trip["id"], self.driver_user)
        onboard = await confirm_passenger_boarding(trip["id"], self.customer)
        self.assertEqual(onboard["status"], "PASSENGER_CONFIRMED_BOARDING")
        with self.assertRaises(ValueError):
            await verify_trip_pin(trip["id"], "000000", self.driver_user)
        started = await start_trip(trip["id"], self.driver_user)
        self.assertEqual(started["status"], "IN_PROGRESS")
        located = await update_trip_location(trip["id"], {"location": {"latitude": -17.80, "longitude": 31.06}}, self.driver_user)
        self.assertIn("driver_location", located)
        completed = await complete_trip(trip["id"], self.driver_user)
        self.assertEqual(completed["status"], "COMPLETED")
        self.assertEqual(completed["payment_status"], "cash_collected")

    async def test_optional_pin_trip_requires_pin_after_boarding(self):
        await driver_go_online({"city_id": "zw-harare", "ride_class": "ECONOMY", "location": {"latitude": -17.8248, "longitude": 31.053}}, self.driver_user)
        await database.insert_one("hailing_quotes", {
            "id": "quote-pin",
            "user_id": self.customer["id"],
            "city_id": "zw-harare",
            "pickup": {"formatted_address": "Pickup", "latitude": -17.8248, "longitude": 31.053},
            "dropoff": {"formatted_address": "Dropoff", "latitude": -17.78, "longitude": 31.08},
            "route": ROUTE,
            "fare": calculate_fare(await get_city("zw-harare"), "ECONOMY", 6.5, 15),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat(),
        })
        trip = await create_trip_from_quote({"quote_id": "quote-pin", "payment_method": "cash", "client_request_id": "request-pin", "verify_ride_with_pin": True}, self.customer)
        offer = (await current_driver_offer(self.driver_user))["offer"]
        await accept_offer(offer["id"], self.driver_user)
        await mark_arrived(trip["id"], self.driver_user)
        await confirm_passenger_boarding(trip["id"], self.customer)
        stored = await active_trip_for_user(self.customer)
        self.assertTrue(stored["verify_ride_with_pin"])
        self.assertRegex(stored["plain_trip_pin"], r"^\d{6}$")
        with self.assertRaises(ValueError):
            await start_trip(trip["id"], self.driver_user)
        with self.assertRaises(ValueError):
            await verify_trip_pin(trip["id"], "000000", self.driver_user)
        verified = await verify_trip_pin(trip["id"], stored["plain_trip_pin"], self.driver_user)
        self.assertEqual(verified["status"], "PASSENGER_CONFIRMED_BOARDING")
        self.assertNotIn("trip_pin", verified)
        started = await start_trip(trip["id"], self.driver_user)
        self.assertEqual(started["status"], "IN_PROGRESS")

    async def test_unauthorized_trip_access_and_cancellation_rules(self):
        other = await database.insert_one("users", {"id": "customer-b", "role": "passenger"})
        trip = await database.insert_one("hailing_trips", {"id": "trip-private", "passenger_user_id": self.customer["id"], "status": "SEARCHING", "city_id": "zw-harare"})
        from app.services.hailing_trip_service import get_authorized_trip

        with self.assertRaises(PermissionError):
            await get_authorized_trip(trip["id"], other)
        cancelled = await cancel_trip(trip["id"], "Changed plans", self.customer)
        self.assertEqual(cancelled["status"], "CANCELLED_BY_PASSENGER")

    async def test_sweeper_expires_offers_dispatches_next_driver_and_times_out_search(self):
        driver_b_user = await database.insert_one("users", {"id": "driver-b", "role": "driver", "name": "Driver B"})
        await database.insert_one("drivers", {
            "id": "driver-profile-b",
            "user_id": "driver-b",
            "name": "Driver B",
            "city": "Harare",
            "verified": True,
            "verification_status": "approved",
            "status": "active",
            "approved_hailing_city_ids": ["zw-harare"],
            "approved_hailing_classes": ["ECONOMY"],
        })
        await database.insert_one("vehicles", {"id": "vehicle-b", "driver_id": "driver-profile-b", "user_id": "driver-b", "make": "Honda", "model": "Fit", "color": "Silver", "plate_number": "DEF 456", "seats": 4, "created_at": now_iso()})
        await driver_go_online({"city_id": "zw-harare", "ride_class": "ECONOMY", "location": {"latitude": -17.8248, "longitude": 31.053}}, self.driver_user)
        await driver_go_online({"city_id": "zw-harare", "ride_class": "ECONOMY", "location": {"latitude": -17.8250, "longitude": 31.0532}}, driver_b_user)
        await database.insert_one("hailing_quotes", {
            "id": "quote-sweep",
            "user_id": self.customer["id"],
            "city_id": "zw-harare",
            "pickup": {"formatted_address": "Pickup", "latitude": -17.8248, "longitude": 31.053},
            "dropoff": {"formatted_address": "Dropoff", "latitude": -17.78, "longitude": 31.08},
            "route": ROUTE,
            "fare": calculate_fare(await get_city("zw-harare"), "ECONOMY", 6.5, 15),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat(),
        })
        trip = await create_trip_from_quote({"quote_id": "quote-sweep", "payment_method": "cash", "client_request_id": "request-sweep"}, self.customer)
        first_offer = (await current_driver_offer(self.driver_user))["offer"]
        await database.update_one("hailing_dispatch_offers", first_offer["id"], {"expires_at": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()})
        result = await sweep_hailing_dispatch()
        self.assertGreaterEqual(result["expired_offers"], 1)
        self.assertIsNone(await current_driver_offer(self.driver_user))
        self.assertIsNotNone((await current_driver_offer(driver_b_user))["offer"])
        await database.update_one("hailing_trips", trip["id"], {"search_expires_at": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()})
        await database.update_many("hailing_dispatch_offers", {"trip_id": trip["id"], "status": "pending"}, {"status": "expired", "updated_at": now_iso()})
        await sweep_hailing_dispatch()
        closed = await database.find_one("hailing_trips", {"id": trip["id"]})
        self.assertEqual(closed["status"], "NO_DRIVER_FOUND")

    async def test_driver_cancel_before_start_rematches_and_removes_driver_control(self):
        driver_b_user = await database.insert_one("users", {"id": "driver-c", "role": "driver", "name": "Driver C"})
        await database.insert_one("drivers", {
            "id": "driver-profile-c",
            "user_id": "driver-c",
            "name": "Driver C",
            "city": "Harare",
            "verified": True,
            "verification_status": "approved",
            "status": "active",
            "approved_hailing_city_ids": ["zw-harare"],
            "approved_hailing_classes": ["ECONOMY"],
        })
        await database.insert_one("vehicles", {"id": "vehicle-c", "driver_id": "driver-profile-c", "user_id": "driver-c", "make": "Honda", "model": "Fit", "color": "Silver", "plate_number": "GHI 789", "seats": 4, "created_at": now_iso()})
        await driver_go_online({"city_id": "zw-harare", "ride_class": "ECONOMY", "location": {"latitude": -17.8248, "longitude": 31.053}}, self.driver_user)
        await driver_go_online({"city_id": "zw-harare", "ride_class": "ECONOMY", "location": {"latitude": -17.825, "longitude": 31.053}}, driver_b_user)
        await database.insert_one("hailing_quotes", {
            "id": "quote-rematch",
            "user_id": self.customer["id"],
            "city_id": "zw-harare",
            "pickup": {"formatted_address": "Pickup", "latitude": -17.8248, "longitude": 31.053},
            "dropoff": {"formatted_address": "Dropoff", "latitude": -17.78, "longitude": 31.08},
            "route": ROUTE,
            "fare": calculate_fare(await get_city("zw-harare"), "ECONOMY", 6.5, 15),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat(),
        })
        trip = await create_trip_from_quote({"quote_id": "quote-rematch", "payment_method": "cash", "client_request_id": "request-rematch"}, self.customer)
        offer = (await current_driver_offer(self.driver_user))["offer"]
        await accept_offer(offer["id"], self.driver_user)
        rematched = await cancel_trip(trip["id"], "Cannot continue", self.driver_user)
        self.assertEqual(rematched["status"], "SEARCHING")
        with self.assertRaises(PermissionError):
            await mark_arrived(trip["id"], self.driver_user)

    async def test_admin_city_update_writes_audit_log_and_existing_rides_still_list(self):
        admin = await database.insert_one("users", {"id": "admin", "role": "admin"})
        city = await admin_upsert_city(HailingCityUpsertBody(name="Test Town", slug="test-town", province="Test", latitude=-18, longitude=31, service_radius_km=10), admin)
        self.assertEqual(city["data"]["id"], "zw-test-town")
        logs = await database.find_many("audit_logs", {"action": "hailing_city_upserted"})
        self.assertEqual(len(logs), 1)
        updated_driver = await admin_update_hailing_driver(
            self.driver["id"],
            HailingDriverEligibilityBody(hailing_enabled=False, approved_hailing_city_ids=[], approved_hailing_classes=["ECONOMY"]),
            admin,
        )
        self.assertFalse(updated_driver["data"]["hailing_enabled"])
        driver_logs = await database.find_many("audit_logs", {"action": "hailing_driver_eligibility_update"})
        self.assertEqual(len(driver_logs), 1)
        await database.insert_one("rides", {"id": "legacy-ride", "origin": "Harare", "destination": "Bulawayo", "status": "SCHEDULED", "date": "2099-01-01", "time": "08:00", "available_seats": 2, "user_id": "driver-a"})
        listed = await list_rides(None)
        self.assertTrue(any(item["id"] == "legacy-ride" for item in listed["data"]))


if __name__ == "__main__":
    unittest.main()
