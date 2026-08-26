from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


RequestStatus = Literal[
    "pending",
    "confirmed",
    "declined",
    "cancelled",
    "cancelled_by_passenger",
    "cancelled_by_driver",
    "cancelled_by_admin",
]


class RideRequestCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ride_id: str = Field(min_length=4, max_length=80)
    passenger_name: str = Field(default="Guest Passenger", min_length=2, max_length=120)
    passenger_phone: Optional[str] = Field(default=None, max_length=32)
    passenger_note: Optional[str] = Field(default=None, max_length=600)
    seats: int = Field(default=1, ge=1, le=10)


class RideRequestUpdateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: RequestStatus
    reason: Optional[str] = Field(default=None, max_length=600)
