from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.database import database
from app.services.courier_offer_realtime_service import _distance_meters, eligible_courier_user_ids
from app.services.courier_presence_service import courier_geo_point


def test_courier_geo_point_uses_mongodb_geojson_order():
    assert courier_geo_point({"latitude": -17.8252, "longitude": 31.0335}) == {
        "type": "Point",
        "coordinates": [31.0335, -17.8252],
    }


def test_courier_distance_rejects_far_offer():
    harare_cbd = {"latitude": -17.8252, "longitude": 31.0335}
    nearby = {"latitude": -17.83, "longitude": 31.04}
    far = {"latitude": -18.97, "longitude": 32.67}
    assert (_distance_meters(harare_cbd, nearby) or 999999) < 15_000
    assert (_distance_meters(harare_cbd, far) or 0) > 15_000


def test_realtime_offer_audience_is_geo_shortlisted(monkeypatch):
    now = datetime.now(timezone.utc).isoformat()
    profiles = [
        {
            "user_id": "near-courier",
            "status": "APPROVED",
            "online": True,
            "last_seen_at": now,
            "location": {"type": "Point", "coordinates": [31.04, -17.83]},
        },
        {
            "user_id": "far-courier",
            "status": "APPROVED",
            "online": True,
            "last_seen_at": now,
            "location": {"type": "Point", "coordinates": [32.67, -18.97]},
        },
    ]

    async def fake_find_many(collection, filters=None, **kwargs):
        if collection == "courier_profiles":
            return profiles
        if collection == "users":
            requested = set((filters or {}).get("id", {}).get("$in", []))
            return [{"id": user_id, "role": "courier"} for user_id in requested]
        if collection == "courier_deliveries":
            return []
        return []

    monkeypatch.setattr(database, "db", None)
    monkeypatch.setattr(database, "find_many", fake_find_many)
    recipients = asyncio.run(
        eligible_courier_user_ids(
            pickup_location={"latitude": -17.8252, "longitude": 31.0335},
        )
    )
    assert recipients == {"near-courier"}
