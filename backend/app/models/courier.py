from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


CourierStatus = Literal[
    "REQUESTED",
    "MATCHING",
    "ASSIGNED",
    "COURIER_TO_PICKUP",
    "PICKED_UP",
    "IN_TRANSIT",
    "ARRIVING",
    "DELIVERED",
    "CANCELLED",
    "FAILED",
]


class GeoPoint(BaseModel):
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)


class CourierCreateBody(BaseModel):
    pickup_address: str = Field(min_length=3, max_length=240)
    dropoff_address: str = Field(min_length=3, max_length=240)
    pickup_location: Optional[GeoPoint] = None
    dropoff_location: Optional[GeoPoint] = None
    recipient_name: str = Field(min_length=2, max_length=120)
    recipient_phone: str = Field(min_length=5, max_length=40)
    package_type: Literal["parcel", "shopping", "documents", "food", "other"]
    package_description: Optional[str] = Field(default=None, max_length=500)
    weight_kg: Optional[float] = Field(default=None, gt=0, le=100)
    declared_value_usd: Optional[float] = Field(default=None, ge=0, le=10000)
    pickup_note: Optional[str] = Field(default=None, max_length=300)
    dropoff_note: Optional[str] = Field(default=None, max_length=300)


class CourierCancelBody(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=300)


class CourierAssignBody(BaseModel):
    courier_user_id: str = Field(min_length=1)


class CourierQuoteBody(BaseModel):
    price_usd: float = Field(gt=0, le=10000)
    courier_payout_usd: float = Field(gt=0, le=10000)
    distance_km: Optional[float] = Field(default=None, ge=0, le=5000)
    estimated_duration_minutes: Optional[int] = Field(default=None, ge=0, le=10000)

    @model_validator(mode="after")
    def payout_cannot_exceed_customer_fee(self):
        if self.courier_payout_usd > self.price_usd:
            raise ValueError("Courier payout cannot exceed the customer delivery fee.")
        return self


class CourierStatusBody(BaseModel):
    status: CourierStatus
    note: Optional[str] = Field(default=None, max_length=300)


class CourierLocationBody(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: Optional[float] = Field(default=None, ge=0)
    heading: Optional[float] = Field(default=None, ge=0, le=360)
    speed: Optional[float] = None
