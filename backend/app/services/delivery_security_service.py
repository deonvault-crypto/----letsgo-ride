from __future__ import annotations

import math
import secrets
from typing import Any, Dict


DELIVERY_HANDOFF_RADIUS_METERS = 250.0
DELIVERY_ARRIVING_RADIUS_METERS = 800.0


def generate_delivery_pin() -> str:
    """Return a zero-padded four digit recipient handoff code."""
    return f"{secrets.randbelow(10000):04d}"


def distance_meters(a: Dict[str, Any] | None, b: Dict[str, Any] | None) -> float | None:
    if not a or not b:
        return None
    try:
        lat1 = math.radians(float(a["latitude"]))
        lon1 = math.radians(float(a["longitude"]))
        lat2 = math.radians(float(b["latitude"]))
        lon2 = math.radians(float(b["longitude"]))
    except (KeyError, TypeError, ValueError):
        return None

    earth_radius_m = 6_371_000.0
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    hav = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return earth_radius_m * (2 * math.atan2(math.sqrt(hav), math.sqrt(1 - hav)))


def is_inside_radius(
    current: Dict[str, Any] | None,
    destination: Dict[str, Any] | None,
    radius_meters: float,
) -> bool:
    distance = distance_meters(current, destination)
    return distance is not None and distance <= radius_meters
