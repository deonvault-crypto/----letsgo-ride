from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


RideClass = Literal["ECONOMY", "COMFORT", "XL"]
PaymentMethod = Literal["cash"]
HailingTripStatus = Literal[
    "SEARCHING",
    "DRIVER_ASSIGNED",
    "DRIVER_EN_ROUTE",
    "DRIVER_ARRIVED",
    "PASSENGER_CONFIRMED_BOARDING",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED_BY_PASSENGER",
    "CANCELLED_BY_DRIVER",
    "CANCELLED_BY_ADMIN",
    "NO_DRIVER_FOUND",
]


class HailingPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class HailingPlace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    formatted_address: str = Field(min_length=3, max_length=240)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    place_id: Optional[str] = Field(default=None, max_length=180)
    service_area_id: Optional[str] = Field(default=None, max_length=80)


class ServiceAreaResolveBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class HailingQuoteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pickup: HailingPlace
    dropoff: HailingPlace
    ride_class: RideClass = "ECONOMY"


class HailingTripCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quote_id: str = Field(min_length=8, max_length=80)
    payment_method: PaymentMethod = "cash"
    client_request_id: Optional[str] = Field(default=None, min_length=8, max_length=120)
    verify_ride_with_pin: bool = False


class HailingCancelBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Optional[str] = Field(default=None, max_length=240)


class HailingDriverOnlineBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    city_id: str = Field(min_length=3, max_length=80)
    vehicle_id: Optional[str] = Field(default=None, max_length=80)
    ride_class: RideClass = "ECONOMY"
    location: HailingPoint
    heading: Optional[float] = Field(default=None, ge=0, le=360)
    speed: Optional[float] = Field(default=None, ge=0, le=240)
    accuracy: Optional[float] = Field(default=None, ge=0, le=5000)


class HailingDriverPresenceBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    location: HailingPoint
    heading: Optional[float] = Field(default=None, ge=0, le=360)
    speed: Optional[float] = Field(default=None, ge=0, le=240)
    accuracy: Optional[float] = Field(default=None, ge=0, le=5000)


class HailingVerifyPinBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pin: str = Field(min_length=4, max_length=6, pattern=r"^\d{4,6}$")


class HailingTripLocationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    location: HailingPoint
    heading: Optional[float] = Field(default=None, ge=0, le=360)
    speed: Optional[float] = Field(default=None, ge=0, le=240)
    accuracy: Optional[float] = Field(default=None, ge=0, le=5000)


class HailingSafetyEventBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str = Field(min_length=3, max_length=60)
    message: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("kind")
    @classmethod
    def normalize_kind(cls, value: str) -> str:
        return "_".join(value.strip().lower().split())


class HailingCityUpsertBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=120)
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    province: str = Field(min_length=2, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    service_radius_km: float = Field(gt=0, le=120)
    enabled: bool = True
    ride_hailing_enabled: bool = True
    pickup_enabled: bool = True
    dropoff_enabled: bool = True

    economy_enabled: bool = True
    economy_base_fare: float = Field(default=0.45, ge=0, le=1000)
    economy_per_km: float = Field(default=0.28, ge=0, le=100)
    economy_per_minute: float = Field(default=0.025, ge=0, le=100)
    economy_minimum_fare: float = Field(default=1.00, ge=0, le=1000)
    economy_booking_fee: float = Field(default=0.00, ge=0, le=1000)
    economy_cancellation_fee: float = Field(default=0.00, ge=0, le=1000)
    economy_platform_commission_percent: float = Field(default=3.0, ge=0, le=50)
    economy_maximum_pickup_radius_km: float = Field(default=15.0, gt=0, le=80)
    economy_surge_multiplier: float = Field(default=1.0, ge=1.0, le=3.0)

    comfort_enabled: bool = False
    comfort_base_fare: float = Field(default=0.60, ge=0, le=1000)
    comfort_per_km: float = Field(default=0.36, ge=0, le=100)
    comfort_per_minute: float = Field(default=0.03, ge=0, le=100)
    comfort_minimum_fare: float = Field(default=1.40, ge=0, le=1000)
    comfort_booking_fee: float = Field(default=0.00, ge=0, le=1000)
    comfort_cancellation_fee: float = Field(default=0.00, ge=0, le=1000)
    comfort_platform_commission_percent: float = Field(default=3.0, ge=0, le=50)
    comfort_maximum_pickup_radius_km: float = Field(default=12.0, gt=0, le=80)
    comfort_surge_multiplier: float = Field(default=1.0, ge=1.0, le=3.0)

    xl_enabled: bool = False
    xl_base_fare: float = Field(default=0.75, ge=0, le=1000)
    xl_per_km: float = Field(default=0.42, ge=0, le=100)
    xl_per_minute: float = Field(default=0.04, ge=0, le=100)
    xl_minimum_fare: float = Field(default=1.80, ge=0, le=1000)
    xl_booking_fee: float = Field(default=0.00, ge=0, le=1000)
    xl_cancellation_fee: float = Field(default=0.00, ge=0, le=1000)
    xl_platform_commission_percent: float = Field(default=3.0, ge=0, le=50)
    xl_maximum_pickup_radius_km: float = Field(default=10.0, gt=0, le=80)
    xl_surge_multiplier: float = Field(default=1.0, ge=1.0, le=3.0)

    initial_radius_km: float = Field(default=2.0, gt=0, le=50)
    radius_steps_km: list[float] = Field(default_factory=lambda: [2.0, 4.0, 8.0, 15.0], min_length=1, max_length=8)
    maximum_radius_km: float = Field(default=15.0, gt=0, le=80)
    offer_timeout_seconds: int = Field(default=25, ge=5, le=120)
    search_timeout_seconds: int = Field(default=120, ge=20, le=600)
    driver_stale_seconds: int = Field(default=75, ge=20, le=300)
    dispatch_sweeper_interval_seconds: int = Field(default=3, ge=2, le=30)
    boarding_start_radius_meters: int = Field(default=250, ge=20, le=1500)

    @field_validator("radius_steps_km")
    @classmethod
    def normalize_radius_steps(cls, value: list[float]) -> list[float]:
        normalized = sorted({float(item) for item in value if float(item) > 0})
        if not normalized:
            raise ValueError("At least one positive dispatch radius is required.")
        if any(item > 80 for item in normalized):
            raise ValueError("Dispatch radius steps cannot exceed 80 km.")
        return normalized


class HailingDriverEligibilityBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hailing_enabled: bool
    approved_hailing_city_ids: list[str] = Field(default_factory=list, max_length=50)
    approved_hailing_classes: list[RideClass] = Field(default_factory=list, max_length=3)
