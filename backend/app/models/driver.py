from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DriverApplicationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=6, max_length=32)
    city: str = Field(min_length=2, max_length=120)
    vehicle: Optional[str] = Field(default=None, max_length=180)
    experience: Optional[str] = Field(default=None, max_length=1200)


class VehicleBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    make: str = Field(min_length=2, max_length=80)
    model: str = Field(min_length=1, max_length=80)
    color: str = Field(min_length=2, max_length=40)
    plate_number: str = Field(min_length=2, max_length=32)
    seats: int = Field(ge=1, le=20)
