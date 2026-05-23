from typing import Any, Dict, List, Optional

from app.database import database
from app.utils import new_id, now_iso


DEMO_RIDES: List[Dict[str, Any]] = [
    {
        "driver_name": "Tafadzwa M.",
        "driver_rating": 4.9,
        "vehicle": "Toyota Wish, silver",
        "origin": "Harare",
        "destination": "Bulawayo",
        "pickup_note": "Harare CBD, Fourth Street pickup point",
        "dropoff_note": "Bulawayo City Hall",
        "date": "2026-06-03",
        "time": "07:30",
        "price_usd": 12,
        "available_seats": 3,
    },
    {
        "driver_name": "Nyasha K.",
        "driver_rating": 4.8,
        "vehicle": "Honda Fit, black",
        "origin": "Harare",
        "destination": "Mutare",
        "pickup_note": "Eastgate Mall entrance",
        "dropoff_note": "Mutare CBD",
        "date": "2026-06-04",
        "time": "08:15",
        "price_usd": 10,
        "available_seats": 2,
    },
    {
        "driver_name": "Kudzai R.",
        "driver_rating": 4.7,
        "vehicle": "Nissan Note, white",
        "origin": "Gweru",
        "destination": "Harare",
        "pickup_note": "Gweru city centre",
        "dropoff_note": "Mbare Musika taxi rank area",
        "date": "2026-06-05",
        "time": "06:45",
        "price_usd": 11,
        "available_seats": 4,
    },
    {
        "driver_name": "Farai D.",
        "driver_rating": 4.9,
        "vehicle": "Toyota Noah, charcoal",
        "origin": "Bulawayo",
        "destination": "Victoria Falls",
        "pickup_note": "Bulawayo City Hall",
        "dropoff_note": "Victoria Falls town centre",
        "date": "2026-06-06",
        "time": "09:00",
        "price_usd": 18,
        "available_seats": 5,
    },
    {
        "driver_name": "Rudo S.",
        "driver_rating": 4.8,
        "vehicle": "Mazda Premacy, green",
        "origin": "Kwekwe",
        "destination": "Harare",
        "pickup_note": "Kwekwe main bus stop area",
        "dropoff_note": "Harare CBD, Copacabana",
        "date": "2026-06-07",
        "time": "10:30",
        "price_usd": 9,
        "available_seats": 3,
    },
]


async def seed_demo_rides() -> None:
    rides = await database.find_many("rides")
    if rides:
        return

    seeded = []
    for ride in DEMO_RIDES:
        timestamp = now_iso()
        seeded.append(
            {
                "id": new_id(),
                "driver_id": new_id(),
                "status": "open",
                "is_demo": True,
                "created_at": timestamp,
                "updated_at": timestamp,
                **ride,
            }
        )
    await database.replace_collection("rides", seeded)


async def search_rides(
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    seats: int = 1,
) -> List[Dict[str, Any]]:
    rides = await database.find_many("rides")
    normalized_origin = (origin or "").strip().lower()
    normalized_destination = (destination or "").strip().lower()

    results = []
    for ride in rides:
        if normalized_origin and normalized_origin not in ride["origin"].lower():
            continue
        if normalized_destination and normalized_destination not in ride["destination"].lower():
            continue
        if int(ride.get("available_seats", 0)) < seats:
            continue
        results.append(ride)
    return results


async def create_ride(payload: Dict[str, Any]) -> Dict[str, Any]:
    timestamp = now_iso()
    ride = {
        "id": new_id(),
        "driver_id": payload.get("driver_id") or new_id(),
        "status": "open",
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload,
    }
    return await database.insert_one("rides", ride)
