from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


TripStatus = str


class RideCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    origin: str = Field(min_length=2, max_length=240)
    destination: str = Field(min_length=2, max_length=240)
    pickup_note: str = Field(min_length=2, max_length=300)
    dropoff_note: str = Field(min_length=2, max_length=300)
    date: str = Field(min_length=4, max_length=16)
    time: str = Field(min_length=3, max_length=12)
    price_usd: float = Field(ge=0, le=10000)
    available_seats: int = Field(ge=1, le=20)
    vehicle: str = Field(min_length=2, max_length=180)
    driver_name: str = Field(default="LetsGo Driver", min_length=2, max_length=120)
    driver_rating: Optional[float] = Field(default=None, ge=0, le=5)
    estimated_duration_minutes: int = Field(default=240, ge=15, le=1440)


class RideUpdateBody(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    origin: Optional[str] = Field(default=None, min_length=2, max_length=240)
    destination: Optional[str] = Field(default=None, min_length=2, max_length=240)
    pickup_note: Optional[str] = Field(default=None, min_length=2, max_length=300)
    dropoff_note: Optional[str] = Field(default=None, min_length=2, max_length=300)
    date: Optional[str] = Field(default=None, min_length=4, max_length=16)
    time: Optional[str] = Field(default=None, min_length=3, max_length=12)
    price_usd: Optional[float] = Field(default=None, ge=0, le=10000)
    available_seats: Optional[int] = Field(default=None, ge=0, le=20)
    estimated_duration_minutes: Optional[int] = Field(default=None, ge=15, le=1440)


class AdminRideStatusBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["SCHEDULED", "BOARDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EXPIRED", "open", "closed", "cancelled"]


class RideCancellationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=3, max_length=500)


class LiveLocationBody(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: Optional[float] = Field(default=None, ge=0)
    heading: Optional[float] = Field(default=None, ge=0, le=360)
    speed: Optional[float] = Field(default=None, ge=0, le=120)


class LiveSharingBody(BaseModel):
    enabled: bool = True
