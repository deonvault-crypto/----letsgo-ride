import asyncio
import json
import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.database import COLLECTION_NAMES, database
from app.models.ride import AdminRideStatusBody, RideCancellationBody
from app.routers.admin import update_ride_status as admin_update_ride_status
from app.routers.requests import _accept_request, _cancel_by_driver, _cancel_by_passenger, _decline_request
from app.routers.rides import cancel_trip_route
from app.services.event_service import realtime_event_service
from app.services.realtime_connection_manager import RealtimePrincipal, principal_can_receive
from app.services.ride_realtime_service import (
    insert_versioned_ride,
    ride_realtime_version,
    update_versioned_ride,
)
from app.services.ride_request_realtime_service import (
    insert_versioned_ride_request,
    ride_request_realtime_version,
    update_versioned_ride_request,
)
from app.services.ride_service import (
    ZIMBABWE_TZ,
    apply_ride_lifecycle,
    create_ride,
    disable_live_location,
    list_public_rides,
    list_user_rides,
    search_rides,
    end_trip,
    live_trip_state,
    start_trip,
    sweep_ride_lifecycle,
    update_live_location,
)


class RideRealtimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        self.driver = {"id": "driver-rt", "role": "driver", "name": "Driver", "phone": "+263770000001"}
        self.passenger = {"id": "passenger-rt", "role": "passenger", "name": "Passenger", "phone": "+263770000002"}
        self.other = {"id": "other-rt", "role": "passenger", "name": "Other"}
        for user in (self.driver, self.passenger, self.other):
            await database.insert_one("users", user)
        self.publish = AsyncMock(return_value=True)
        self.publish_patch = patch.object(realtime_event_service, "publish", self.publish)
        self.publish_patch.start()

    async def asyncTearDown(self):
        self.publish_patch.stop()

    def future_ride(self, ride_id="ride-rt", **overrides):
        future = datetime.now(ZIMBABWE_TZ) + timedelta(days=5)
        return {
            "id": ride_id,
            "user_id": self.driver["id"],
            "driver_id": "driver-profile-rt",
            "driver_name": "Driver",
            "vehicle": "Toyota, silver",
            "origin": "Harare",
            "destination": "Bulawayo",
            "pickup_note": "Joina City",
            "dropoff_note": "City Hall",
            "date": future.strftime("%Y-%m-%d"),
            "time": future.strftime("%H:%M"),
            "price_usd": 12,
            "available_seats": 2,
            "status": "SCHEDULED",
            "estimated_duration_minutes": 240,
            "live_tracking_enabled": False,
            "created_at": future.isoformat(),
            "updated_at": future.isoformat(),
            **overrides,
        }

    async def insert_ride(self, ride_id="ride-rt", **overrides):
        return await insert_versioned_ride(self.future_ride(ride_id, **overrides))

    async def insert_request(self, request_id="request-rt", **overrides):
        request = {
            "id": request_id,
            "ride_id": "ride-rt",
            "user_id": self.passenger["id"],
            "passenger_name": "Passenger",
            "passenger_phone": "+263770000002",
            "passenger_note": "One bag",
            "seats": 1,
            "status": "pending",
            "created_at": "2026-08-25T10:00:00+00:00",
            "updated_at": "2026-08-25T10:00:00+00:00",
            **overrides,
        }
        return await insert_versioned_ride_request(request)

    def publications(self, resource_type):
        return [call.args[0] for call in self.publish.await_args_list if call.args[0].envelope.resource_type == resource_type]

    async def test_versions_initialize_legacy_at_zero_and_increment_atomically(self):
        self.assertEqual(ride_realtime_version({"id": "legacy"}), 0)
        self.assertEqual(ride_request_realtime_version({"id": "legacy"}), 0)
        await database.insert_one("rides", self.future_ride("legacy-ride"))
        first, second = await asyncio.gather(
            update_versioned_ride({"id": "legacy-ride"}, {"updated_at": "one"}),
            update_versioned_ride({"id": "legacy-ride"}, {"updated_at": "two"}),
        )
        self.assertEqual(sorted([first["realtime_version"], second["realtime_version"]]), [1, 2])
        await database.insert_one("ride_requests", {"id": "legacy-request", "status": "pending"})
        request_first, request_second = await asyncio.gather(
            update_versioned_ride_request({"id": "legacy-request"}, {"updated_at": "one"}),
            update_versioned_ride_request({"id": "legacy-request"}, {"updated_at": "two"}),
        )
        self.assertEqual(sorted([request_first["realtime_version"], request_second["realtime_version"]]), [1, 2])

    async def test_ride_creation_publishes_safe_driver_event(self):
        created = await create_ride(self.future_ride("created-ride"))
        self.assertEqual(created["realtime_version"], 1)
        event = self.publications("ride")[-1]
        self.assertEqual(event.envelope.type, "ride.created")
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.driver["id"], "driver"), event.audience))
        self.assertFalse(principal_can_receive(RealtimePrincipal(self.other["id"], "passenger"), event.audience))
        encoded = json.dumps(event.envelope.payload).lower()
        for protected in ("phone", "email", "token", "password", "document"):
            self.assertNotIn(protected, encoded)

    async def test_confirmed_passenger_receives_ride_events_but_unrelated_user_does_not(self):
        ride = await self.insert_ride()
        await self.insert_request(status="confirmed")
        updated = await update_versioned_ride({"id": ride["id"]}, {"status": "BOARDING"})
        from app.services.ride_realtime_service import publish_ride_realtime
        await publish_ride_realtime(updated, "ride.status_changed")
        event = self.publications("ride")[-1]
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.driver["id"], "driver"), event.audience))
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.passenger["id"], "passenger"), event.audience))
        self.assertFalse(principal_can_receive(RealtimePrincipal(self.other["id"], "passenger"), event.audience))

    async def test_manual_start_location_disable_and_end_publish_monotonic_truth(self):
        departure = datetime.now(ZIMBABWE_TZ) + timedelta(minutes=5)
        ride = await self.insert_ride(date=departure.strftime("%Y-%m-%d"), time=departure.strftime("%H:%M"))
        await self.insert_request(status="confirmed")
        started = await start_trip(ride["id"], self.driver)
        location = await update_live_location(
            ride["id"], self.driver,
            {"latitude": -17.8318, "longitude": 31.0460, "accuracy": 8, "heading": 90, "speed": 12},
        )
        disabled = await disable_live_location(ride["id"], self.driver)
        completed = await end_trip(ride["id"], self.driver)
        versions = [started["realtime_version"], location["realtime_version"], disabled["realtime_version"], completed["realtime_version"]]
        self.assertEqual(versions, sorted(set(versions)))
        ride_events = self.publications("ride")
        self.assertIn("ride.location_updated", [item.envelope.type for item in ride_events])
        self.assertEqual(ride_events[-1].envelope.type, "ride.terminal")
        with self.assertRaises(ValueError):
            await update_live_location(ride["id"], self.driver, {"latitude": -17.8, "longitude": 31.0})

    async def test_cancellation_is_terminal_versioned_and_cannot_be_reopened(self):
        ride = await self.insert_ride(live_tracking_enabled=True)
        response = await cancel_trip_route(ride["id"], RideCancellationBody(reason="Plans changed"), self.driver)
        cancelled = response["data"]
        self.assertEqual(cancelled["status"], "CANCELLED")
        self.assertEqual(cancelled["realtime_version"], 2)
        self.assertFalse(cancelled["live_tracking_enabled"])
        self.assertTrue(cancelled["cancelled_at"])
        self.assertEqual(self.publications("ride")[-1].envelope.type, "ride.terminal")
        with self.assertRaises(HTTPException):
            await admin_update_ride_status(
                ride["id"], AdminRideStatusBody(status="SCHEDULED"), reason=None,
                admin={"id": "admin-rt", "role": "admin"},
            )

    async def test_lifecycle_sweeper_uses_versioned_mutations_for_boarding_in_progress_and_complete(self):
        now = datetime.now(ZIMBABWE_TZ)
        boarding_at = now + timedelta(minutes=5)
        in_progress_at = now - timedelta(minutes=1)
        boarding = await self.insert_ride("boarding", date=boarding_at.strftime("%Y-%m-%d"), time=boarding_at.strftime("%H:%M"))
        in_progress = await self.insert_ride("auto-start", date=in_progress_at.strftime("%Y-%m-%d"), time=in_progress_at.strftime("%H:%M"))
        completed = await self.insert_ride(
            "auto-complete", status="IN_PROGRESS", date=(now - timedelta(days=1)).strftime("%Y-%m-%d"),
            time=now.strftime("%H:%M"), estimated_duration_minutes=15,
        )
        result = await sweep_ride_lifecycle()
        self.assertEqual(result["changed"], 3)
        stored = {item["id"]: item for item in await database.find_many("rides")}
        self.assertEqual(stored[boarding["id"]]["status"], "BOARDING")
        self.assertEqual(stored[in_progress["id"]]["status"], "IN_PROGRESS")
        self.assertEqual(stored[completed["id"]]["status"], "COMPLETED")
        for item in stored.values():
            self.assertEqual(item["realtime_version"], 2)
        self.assertEqual(len(self.publications("ride")), 3)

    async def test_ride_request_lifecycle_audience_and_seat_versions(self):
        ride = await self.insert_ride()
        request = await self.insert_request()
        accepted = await _accept_request(request, ride, self.driver)
        self.assertEqual(accepted["status"], "confirmed")
        self.assertEqual(accepted["realtime_version"], 2)
        stored_ride = await database.find_one("rides", {"id": ride["id"]})
        self.assertEqual(stored_ride["available_seats"], 1)
        self.assertEqual(stored_ride["realtime_version"], 2)
        request_event = self.publications("ride_request")[-1]
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.driver["id"], "driver"), request_event.audience))
        self.assertTrue(principal_can_receive(RealtimePrincipal(self.passenger["id"], "passenger"), request_event.audience))
        self.assertFalse(principal_can_receive(RealtimePrincipal(self.other["id"], "passenger"), request_event.audience))
        encoded = json.dumps(request_event.envelope.payload).lower()
        for protected in ("passenger_phone", "phone", "token", "password", "document"):
            self.assertNotIn(protected, encoded)
        cancelled = await _cancel_by_driver(accepted, stored_ride, self.driver, "Plans changed")
        self.assertEqual(cancelled["status"], "cancelled_by_driver")
        restored = await database.find_one("rides", {"id": ride["id"]})
        self.assertEqual(restored["available_seats"], 2)
        self.assertGreater(restored["realtime_version"], stored_ride["realtime_version"])

    async def test_request_decline_passenger_cancel_and_noop_are_versioned_once(self):
        ride = await self.insert_ride()
        declined_request = await self.insert_request("decline")
        declined = await _decline_request(declined_request, ride, self.driver, "Full route")
        self.assertEqual(declined["realtime_version"], 2)
        passenger_request = await self.insert_request("passenger-cancel")
        cancelled = await _cancel_by_passenger(passenger_request, ride, self.passenger, "Changed plans")
        self.assertEqual(cancelled["realtime_version"], 2)
        before = ride_request_realtime_version(cancelled)
        with self.assertRaises(HTTPException):
            await _cancel_by_passenger(cancelled, ride, self.passenger, "Again")
        stored = await database.find_one("ride_requests", {"id": cancelled["id"]})
        self.assertEqual(stored["realtime_version"], before)

    async def test_concurrent_acceptance_has_one_winner_and_never_oversells(self):
        ride = await self.insert_ride(available_seats=1)
        first = await self.insert_request("request-a")
        second = await self.insert_request("request-b", user_id=self.other["id"], passenger_name="Other")
        results = await asyncio.gather(
            _accept_request(first, ride, self.driver),
            _accept_request(second, ride, self.driver),
            return_exceptions=True,
        )
        winners = [result for result in results if isinstance(result, dict)]
        self.assertEqual(len(winners), 1)
        stored_ride = await database.find_one("rides", {"id": ride["id"]})
        self.assertEqual(stored_ride["available_seats"], 0)
        requests = await database.find_many("ride_requests", {"ride_id": ride["id"]})
        self.assertEqual(len([item for item in requests if item["status"] == "confirmed"]), 1)

    async def test_redis_failure_does_not_roll_back_committed_ride_or_request(self):
        ride = await self.insert_ride()
        request = await self.insert_request()
        self.publish.side_effect = RuntimeError("redis unavailable")
        accepted = await _accept_request(request, ride, self.driver)
        self.assertEqual(accepted["status"], "confirmed")
        self.assertEqual((await database.find_one("rides", {"id": ride["id"]}))["available_seats"], 1)

    async def test_ride_lists_reconcile_lifecycle_once_per_ride(self):
        await self.insert_ride()
        lifecycle = AsyncMock(side_effect=lambda ride: ride)
        with patch("app.services.ride_service.apply_ride_lifecycle", lifecycle):
            public_rows = await list_public_rides(self.passenger)
        self.assertEqual(len(public_rows), 1)
        self.assertEqual(lifecycle.await_count, 1)

        lifecycle.reset_mock()
        with patch("app.services.ride_service.apply_ride_lifecycle", lifecycle):
            driver_rows = await list_user_rides(self.driver)
        self.assertEqual(len(driver_rows), 1)
        self.assertEqual(lifecycle.await_count, 1)

    async def test_public_search_pushes_status_date_and_seats_into_query(self):
        search_date = "2099-09-01"
        rides = (
            self.future_ride("matching", date=search_date, available_seats=2),
            self.future_ride("legacy-open", date=search_date, status="open", available_seats=3),
            self.future_ride("insufficient-seats", date=search_date, available_seats=1),
            self.future_ride("completed", date=search_date, status="COMPLETED", available_seats=4),
            self.future_ride("other-date", date="2099-09-02", available_seats=4),
        )
        for ride in rides:
            await database.insert_one("rides", ride)

        original_find_many = database.find_many
        with patch.object(database, "find_many", side_effect=original_find_many) as find_many:
            results = await search_rides(
                origin="Harare",
                seats=2,
                date=search_date,
                current_user=self.passenger,
            )

        ride_queries = [
            call.args[1] for call in find_many.await_args_list
            if (
                len(call.args) > 1
                and call.args[0] == "rides"
                and "status" in call.args[1]
                and "date" in call.args[1]
            )
        ]
        self.assertEqual(len(ride_queries), 1)
        self.assertEqual(ride_queries[0]["date"], search_date)
        self.assertEqual(ride_queries[0]["available_seats"], {"$gte": 2})
        self.assertIn("SCHEDULED", ride_queries[0]["status"]["$in"])
        self.assertIn("open", ride_queries[0]["status"]["$in"])
        self.assertEqual({ride["id"] for ride in results}, {"matching", "legacy-open"})

    async def test_live_state_rejects_unrelated_customer(self):
        ride = await self.insert_ride(status="IN_PROGRESS", live_tracking_enabled=True)
        await self.insert_request(status="confirmed")
        state = await live_trip_state(ride["id"], self.passenger)
        self.assertEqual(state["ride_id"], ride["id"])
        with self.assertRaises(PermissionError):
            await live_trip_state(ride["id"], self.other)


if __name__ == "__main__":
    unittest.main()
