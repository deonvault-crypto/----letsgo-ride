import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.database import COLLECTION_NAMES, database
from app.services.workforce_shift_service import my_courier_shift_bookings


class WorkforceShiftQueryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])

    async def test_booking_history_batches_shift_reads(self):
        courier = {"id": "courier-query-test", "role": "courier"}
        await database.insert_one(
            "courier_profiles",
            {"id": "profile-query-test", "user_id": courier["id"], "status": "APPROVED", "online": False},
        )
        starts = datetime.now(timezone.utc) + timedelta(days=1)
        for index in range(2):
            shift_id = f"shift-{index}"
            await database.insert_one(
                "courier_shifts",
                {
                    "id": shift_id,
                    "active": True,
                    "zone": f"Zone {index}",
                    "starts_at": (starts + timedelta(hours=index)).isoformat(),
                    "ends_at": (starts + timedelta(hours=index + 1)).isoformat(),
                    "capacity": 2,
                    "booked_count": 1,
                    "booking_cutoff_minutes": 0,
                },
            )
            await database.insert_one(
                "courier_shift_bookings",
                {
                    "id": f"booking-{index}",
                    "shift_id": shift_id,
                    "courier_user_id": courier["id"],
                    "status": "BOOKED",
                },
            )

        with patch.object(database, "find_many", wraps=database.find_many) as find_many:
            history = await my_courier_shift_bookings(courier)

        self.assertEqual([item["shift"]["id"] for item in history], ["shift-1", "shift-0"])
        shift_queries = [
            call
            for call in find_many.await_args_list
            if call.args and call.args[0] == "courier_shifts"
        ]
        self.assertEqual(len(shift_queries), 1)
        self.assertEqual(
            set(shift_queries[0].args[1]["id"]["$in"]),
            {"shift-0", "shift-1"},
        )


if __name__ == "__main__":
    unittest.main()
