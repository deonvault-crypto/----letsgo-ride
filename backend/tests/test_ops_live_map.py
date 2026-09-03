import unittest
from datetime import datetime, timedelta, timezone

from app.database import database
from app.ops_auth import get_ops_user
from app.routers.ops_live_map import live_map_snapshot


class OpsLiveMapTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in list(database.memory.keys()):
            await database.replace_collection(collection, [])

        self.admin = {
            "id": "admin-live-map",
            "role": "admin",
            "name": "Ops Admin",
            "email": "admin@example.com",
            "status": "active",
        }
        await database.insert_one("users", self.admin)
        self.admin_ops = await get_ops_user(self.admin)

    async def test_live_map_returns_only_fresh_operational_workers_and_no_customer_private_data(self):
        now = datetime.now(timezone.utc)
        fresh = now.isoformat()
        stale = (now - timedelta(minutes=10)).isoformat()

        await database.insert_one("users", {
            "id": "driver-user",
            "role": "driver",
            "name": "Fresh Driver",
            "email": "driver-private@example.com",
            "phone": "+263700000001",
        })
        await database.insert_one("users", {
            "id": "courier-user",
            "role": "courier",
            "name": "Fresh Courier",
            "email": "courier-private@example.com",
            "phone": "+263700000002",
        })
        await database.insert_one("users", {
            "id": "idle-customer",
            "role": "passenger",
            "name": "Idle Customer",
            "email": "customer-private@example.com",
            "phone": "+263700000003",
            "location": {"type": "Point", "coordinates": [31.01, -17.82]},
        })
        await database.insert_one("users", {
            "id": "stale-driver-user",
            "role": "driver",
            "name": "Stale Driver",
        })

        await database.insert_one("drivers", {
            "id": "driver-1",
            "user_id": "driver-user",
            "name": "Fresh Driver",
        })
        await database.insert_one("drivers", {
            "id": "driver-stale",
            "user_id": "stale-driver-user",
            "name": "Stale Driver",
        })
        await database.insert_one("vehicles", {
            "id": "vehicle-1",
            "driver_id": "driver-1",
            "make": "Toyota",
            "model": "Aqua",
            "color": "Black",
            "plate_number": "ABC1234",
        })

        await database.insert_one("hailing_driver_presence", {
            "id": "presence-fresh",
            "driver_id": "driver-1",
            "user_id": "driver-user",
            "vehicle_id": "vehicle-1",
            "ride_class": "ECONOMY",
            "status": "on_trip",
            "location": {"type": "Point", "coordinates": [31.0522, -17.8292]},
            "last_seen_at": fresh,
            "updated_at": fresh,
        })
        await database.insert_one("hailing_driver_presence", {
            "id": "presence-stale",
            "driver_id": "driver-stale",
            "user_id": "stale-driver-user",
            "status": "available",
            "location": {"type": "Point", "coordinates": [30.9, -17.7]},
            "last_seen_at": stale,
            "updated_at": stale,
        })
        await database.insert_one("courier_profiles", {
            "id": "courier-profile",
            "user_id": "courier-user",
            "name": "Fresh Courier",
            "status": "APPROVED",
            "online": True,
            "location": {"type": "Point", "coordinates": [31.06, -17.84]},
            "last_seen_at": fresh,
            "updated_at": fresh,
        })

        await database.insert_one("hailing_trips", {
            "id": "hail-active",
            "status": "IN_PROGRESS",
            "driver_id": "driver-1",
            "driver_user_id": "driver-user",
            "passenger_user_id": "idle-customer",
            "passenger_snapshot": {
                "name": "Private Passenger",
                "email": "must-not-leak@example.com",
                "phone": "+263700000009",
            },
            "pickup": {"address": "Harare CBD", "latitude": -17.83, "longitude": 31.05},
            "dropoff": {"address": "Borrowdale", "latitude": -17.76, "longitude": 31.09},
            "updated_at": fresh,
        })
        await database.insert_one("courier_deliveries", {
            "id": "delivery-active",
            "status": "COURIER_TO_PICKUP",
            "courier_user_id": "courier-user",
            "customer_user_id": "idle-customer",
            "pickup_address": "Avondale",
            "dropoff_address": "Eastlea",
            "updated_at": fresh,
        })

        response = await live_map_snapshot(user=self.admin_ops)
        data = response["data"]
        entities = data["entities"]

        self.assertEqual({item["display_name"] for item in entities}, {"Fresh Driver", "Fresh Courier"})
        self.assertEqual(data["kpis"]["online_drivers"], 1)
        self.assertEqual(data["kpis"]["online_couriers"], 1)
        self.assertEqual(data["kpis"]["active_hailing"], 1)
        self.assertEqual(data["kpis"]["active_deliveries"], 1)

        serialized = repr(data)
        self.assertNotIn("driver-private@example.com", serialized)
        self.assertNotIn("courier-private@example.com", serialized)
        self.assertNotIn("customer-private@example.com", serialized)
        self.assertNotIn("must-not-leak@example.com", serialized)
        self.assertNotIn("Private Passenger", serialized)
        self.assertNotIn("Idle Customer", serialized)
        self.assertNotIn("Stale Driver", serialized)

        driver = next(item for item in entities if item["entity_type"] == "driver")
        self.assertEqual(driver["vehicle"]["plate_number"], "ABC1234")
        self.assertEqual(driver["active_job"]["id"], "hail-active")
        self.assertEqual(driver["latitude"], -17.8292)
        self.assertEqual(driver["longitude"], 31.0522)

    async def test_live_map_attention_is_count_only_and_does_not_copy_support_or_report_text(self):
        await database.insert_one("support_messages", {
            "id": "support-1",
            "status": "open",
            "subject": "Private support subject",
            "message": "Private support message",
        })
        await database.insert_one("reports", {
            "id": "report-1",
            "status": "open",
            "message": "Private safety report",
        })
        await database.insert_one("drivers", {
            "id": "pending-driver",
            "verification_status": "needs_review",
            "name": "Pending Driver Private Name",
        })

        response = await live_map_snapshot(user=self.admin_ops)
        data = response["data"]
        breakdown = data["kpis"]["attention_breakdown"]

        self.assertEqual(breakdown["support"], 1)
        self.assertEqual(breakdown["safety"], 1)
        self.assertEqual(breakdown["pending_verification"], 1)
        serialized = repr(data)
        self.assertNotIn("Private support subject", serialized)
        self.assertNotIn("Private support message", serialized)
        self.assertNotIn("Private safety report", serialized)
        self.assertNotIn("Pending Driver Private Name", serialized)


if __name__ == "__main__":
    unittest.main()
