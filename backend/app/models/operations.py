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


WorkerProduct = Literal["courier", "driver", "merchant"]


class WorkerApplicationBody(BaseModel):
    product: WorkerProduct
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=6, max_length=32)
    service_area: str = Field(min_length=2, max_length=120)
    vehicle: Optional[str] = Field(default=None, max_length=180)
    experience: Optional[str] = Field(default=None, max_length=600)
    business_name: Optional[str] = Field(default=None, max_length=160)
    business_address: Optional[str] = Field(default=None, max_length=240)
    business_registration_number: Optional[str] = Field(default=None, max_length=120)
    accepted_terms: bool = False


class WorkerApplicationReviewBody(BaseModel):
    status: Literal["UNDER_REVIEW", "APPROVED", "REJECTED"]
    note: Optional[str] = Field(default=None, max_length=600)


class CourierShiftCreateBody(BaseModel):
    zone: str = Field(min_length=2, max_length=120)
    starts_at: str = Field(min_length=16, max_length=40)
    ends_at: str = Field(min_length=16, max_length=40)
    capacity: int = Field(ge=1, le=1000)
    booking_cutoff_minutes: int = Field(default=60, ge=0, le=10080)
    incentive_usd: Optional[float] = Field(default=None, ge=0, le=10000)
    active: bool = True


class CourierShiftUpdateBody(BaseModel):
    zone: Optional[str] = Field(default=None, min_length=2, max_length=120)
    starts_at: Optional[str] = Field(default=None, min_length=16, max_length=40)
    ends_at: Optional[str] = Field(default=None, min_length=16, max_length=40)
    capacity: Optional[int] = Field(default=None, ge=1, le=1000)
    booking_cutoff_minutes: Optional[int] = Field(default=None, ge=0, le=10080)
    incentive_usd: Optional[float] = Field(default=None, ge=0, le=10000)
    active: Optional[bool] = None
