from typing import Literal, Optional

from pydantic import BaseModel, Field


class AvailabilityCreateBody(BaseModel):
    mode: Literal["ride", "courier"]
    date: str = Field(min_length=8, max_length=16)
    start_time: str = Field(min_length=3, max_length=8)
    end_time: str = Field(min_length=3, max_length=8)
    note: Optional[str] = Field(default=None, max_length=240)


class CourierProfileCreateBody(BaseModel):
    transport_mode: Literal["bicycle", "motorbike", "car", "van"]
    vehicle_description: Optional[str] = Field(default=None, max_length=180)


class CourierOnlineBody(BaseModel):
    online: bool
