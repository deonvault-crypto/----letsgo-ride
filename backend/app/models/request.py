from typing import Literal, Optional

from pydantic import BaseModel, Field


RequestStatus = Literal["pending", "confirmed", "declined", "cancelled"]


class RideRequestCreateBody(BaseModel):
    ride_id: str = Field(min_length=4)
    passenger_name: str = "Guest Passenger"
    passenger_phone: Optional[str] = None
    passenger_note: Optional[str] = None
    seats: int = Field(default=1, ge=1, le=10)


class RideRequestUpdateBody(BaseModel):
    status: RequestStatus
