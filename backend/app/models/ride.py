from typing import Optional

from pydantic import BaseModel, Field


TripStatus = str


class RideCreateBody(BaseModel):
    origin: str = Field(min_length=2)
    destination: str = Field(min_length=2)
    pickup_note: str = Field(min_length=2)
    dropoff_note: str = Field(min_length=2)
    date: str = Field(min_length=4)
    time: str = Field(min_length=3)
    price_usd: float = Field(ge=0)
    available_seats: int = Field(ge=1, le=20)
    vehicle: str = Field(min_length=2)
    driver_name: str = Field(default="LetsGo Driver", min_length=2)
    driver_rating: Optional[float] = Field(default=None, ge=0, le=5)
    estimated_duration_minutes: int = Field(default=240, ge=15, le=1440)


class RideUpdateBody(BaseModel):
    origin: Optional[str] = None
    destination: Optional[str] = None
    pickup_note: Optional[str] = None
    dropoff_note: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    price_usd: Optional[float] = Field(default=None, ge=0)
    available_seats: Optional[int] = Field(default=None, ge=0, le=20)
    status: Optional[str] = None
    estimated_duration_minutes: Optional[int] = Field(default=None, ge=15, le=1440)


class LiveLocationBody(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: Optional[float] = Field(default=None, ge=0)
    heading: Optional[float] = Field(default=None, ge=0, le=360)
    speed: Optional[float] = None


class LiveSharingBody(BaseModel):
    enabled: bool = True
