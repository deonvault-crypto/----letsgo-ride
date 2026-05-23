from typing import Optional

from pydantic import BaseModel, Field


class DriverApplicationBody(BaseModel):
    name: str = Field(min_length=2)
    phone: str = Field(min_length=6)
    city: str = Field(min_length=2)
    vehicle: Optional[str] = None
    experience: Optional[str] = None


class VehicleBody(BaseModel):
    make: str = Field(min_length=2)
    model: str = Field(min_length=1)
    color: str = Field(min_length=2)
    plate_number: str = Field(min_length=2)
    seats: int = Field(ge=1, le=20)
