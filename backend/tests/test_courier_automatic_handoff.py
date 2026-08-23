import unittest

from app.database import COLLECTION_NAMES, database
from app.services.courier_service import (
    complete_delivery_with_pin,
    create_delivery,
    get_delivery_pin,
    update_courier_location,
    update_delivery_status,
)
from app.services.operations_service import claim_courier_offer


class CourierAutomaticHandoffTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

        self.customer = {
            "id": "customer-1",
            "role": "passenger",
            "name": "Tariro Customer",
            "phone": "+263770000001",
        }
        self.courier = {
            "id": "courier-1",
            "role": "courier",
            "name": "Tafadzwa Courier",
            "phone": "+263770000002",
        }
        await database.insert_one("users", self.customer)
        await database.insert_one("users", self.courier)
        await database.insert_one(
            "courier_profiles",
            {
                "id": "profile-1",
                "user_id": self.courier["id"],
                "name": self.courier["name"],
                "status": "APPROVED",
                "online": True,
                "transport_mode": "motorbike",
            },
        )

        self.delivery = await create_delivery(
            {
                "pickup_address": "Joina City, Harare",
                "dropoff_address": "Sam Levy's Village, Harare",
                "pickup_location": {"latitude": -17.8318, "longitude": 31.0460},
                "dropoff_location": {"latitude": -17.7590, "longitude": 31.0910},
                "recipient_name": "Tariro Customer",
                "recipient_phone": "+263770000001",
                "package_type": "parcel",
                "package_description": "Small parcel",
            },
            self.customer,
        )
        self.delivery = await database.update_one(
            "courier_deliveries",
            self.delivery["id"],
            {
                "status": "MATCHING",
                "quote_status": "READY",
                "price_usd": 7.0,
                "courier_payout_usd": 5.0,
            },
        )

    async def test_accept_pickup_arrival_and_pin_handoff_are_safe_and_minimal(self):
        claimed = await claim_courier_offer(self.delivery["id"], self.courier)
        self.assertEqual(claimed["status"], "COURIER_TO_PICKUP")

        moving = await update_delivery_status(
            self.delivery["id"],
            "PICKED_UP",
            self.courier,
        )
        self.assertEqual(moving["status"], "IN_TRANSIT")

        with self.assertRaises(ValueError):
            await update_delivery_status(
                self.delivery["id"],
                "ARRIVING",
                self.courier,
            )

        still_moving = await update_courier_location(
            self.delivery["id"],
            {"latitude": -17.80, "longitude": 31.06, "accuracy": 10},
            self.courier,
        )
        self.assertEqual(still_moving["status"], "IN_TRANSIT")

        arriving = await update_courier_location(
            self.delivery["id"],
            {"latitude": -17.7600, "longitude": 31.0905, "accuracy": 8},
            self.courier,
        )
        self.assertEqual(arriving["status"], "ARRIVING")

        handoff = await get_delivery_pin(self.delivery["id"], self.customer)
        self.assertEqual(len(handoff["pin"]), 4)
        self.assertTrue(handoff["pin"].isdigit())

        with self.assertRaises(ValueError):
            await complete_delivery_with_pin(self.delivery["id"], "99999"[-4:], self.courier) if handoff["pin"] != "9999" else complete_delivery_with_pin(self.delivery["id"], "0000", self.courier)

        completed = await complete_delivery_with_pin(
            self.delivery["id"],
            handoff["pin"],
            self.courier,
        )
        self.assertEqual(completed["status"], "DELIVERED")
        self.assertEqual(completed["delivery_verification_method"], "RECIPIENT_PIN")
        self.assertFalse(completed["live_tracking_active"])

        final_handoff = await get_delivery_pin(self.delivery["id"], self.customer)
        self.assertTrue(final_handoff["verified"])


if __name__ == "__main__":
    unittest.main()
