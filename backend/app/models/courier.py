from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)


class CourierQuotePreviewBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pickup_address: str = Field(min_length=3, max_length=240)
    dropoff_address: str = Field(min_length=3, max_length=240)
    pickup_location: Optional[GeoPoint] = None
    dropoff_location: Optional[GeoPoint] = None


class CourierCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
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
    model_config = ConfigDict(extra="forbid")
    reason: Optional[str] = Field(default=None, max_length=300)


class CourierAssignBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    courier_user_id: str = Field(min_length=4, max_length=80)


class CourierQuoteBody(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
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
    model_config = ConfigDict(extra="forbid")
    status: CourierStatus
    note: Optional[str] = Field(default=None, max_length=300)


class CourierDelayBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: Optional[str] = Field(default=None, max_length=300)


class CourierHandoffBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pin: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class CourierLocationBody(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: Optional[float] = Field(default=None, ge=0)
    heading: Optional[float] = Field(default=None, ge=0, le=360)
    speed: Optional[float] = Field(default=None, ge=0, le=120)
    recorded_at: Optional[str] = Field(default=None, max_length=80)

    @field_validator("accuracy", "heading", "speed", mode="before")
    @classmethod
    def normalize_unavailable_sensor_values(cls, value):
        # Core Location uses negative sentinel values when a sensor reading is
        # unavailable. They are absence, not malformed courier input.
        if isinstance(value, (int, float)) and value < 0:
            return None
        return value
