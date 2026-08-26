from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.courier import GeoPoint
from app.models.food import FoodOrderStatus


class RestaurantCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=800)
    phone: str = Field(min_length=5, max_length=40)
    address: str = Field(min_length=3, max_length=240)
    location: Optional[GeoPoint] = None
    cuisine_tags: List[str] = Field(default_factory=list, max_length=12)
    opening_hours: Dict[str, str] = Field(default_factory=dict)
    hero_image_url: Optional[str] = Field(default=None, max_length=500)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    contact_person_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    contact_email: Optional[str] = Field(default=None, max_length=180)
    business_registration_number: Optional[str] = Field(default=None, max_length=120)
    pickup_instructions: Optional[str] = Field(default=None, max_length=300)

    @field_validator("cuisine_tags", mode="before")
    @classmethod
    def validate_tags(cls, value):
        return _bounded_tags(value)

    @field_validator("opening_hours", mode="before")
    @classmethod
    def validate_hours(cls, value):
        return _bounded_hours(value)


class RestaurantUpdateBody(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=800)
    phone: Optional[str] = Field(default=None, min_length=5, max_length=40)
    address: Optional[str] = Field(default=None, min_length=3, max_length=240)
    location: Optional[GeoPoint] = None
    cuisine_tags: Optional[List[str]] = Field(default=None, max_length=12)
    opening_hours: Optional[Dict[str, str]] = None
    is_accepting_orders: Optional[bool] = None
    hero_image_url: Optional[str] = Field(default=None, max_length=500)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    contact_person_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    contact_email: Optional[str] = Field(default=None, max_length=180)
    business_registration_number: Optional[str] = Field(default=None, max_length=120)
    pickup_instructions: Optional[str] = Field(default=None, max_length=300)

    @field_validator("cuisine_tags", mode="before")
    @classmethod
    def validate_tags(cls, value):
        return _bounded_tags(value)

    @field_validator("opening_hours", mode="before")
    @classmethod
    def validate_hours(cls, value):
        return _bounded_hours(value)


def _bounded_tags(value: List[str] | None) -> List[str] | None:
    if value is None:
        return None
    if any(not str(item).strip() or len(str(item)) > 60 for item in value):
        raise ValueError("Cuisine tags must be between 1 and 60 characters.")
    return [str(item).strip() for item in value]


def _bounded_hours(value: Dict[str, str] | None) -> Dict[str, str] | None:
    if value is None:
        return None
    if len(value) > 14:
        raise ValueError("Opening hours may contain at most 14 entries.")
    if any(not str(key).strip() or len(str(key)) > 40 or len(str(item)) > 120 for key, item in value.items()):
        raise ValueError("Opening-hours labels and values are too long.")
    return {str(key).strip(): str(item).strip() for key, item in value.items()}


class MenuCategoryCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    description: Optional[str] = Field(default=None, max_length=240)
    sort_order: int = Field(default=0, ge=0, le=10000)
    image_url: Optional[str] = Field(default=None, max_length=500)


class MenuCategoryUpdateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    description: Optional[str] = Field(default=None, max_length=240)
    sort_order: Optional[int] = Field(default=None, ge=0, le=10000)
    image_url: Optional[str] = Field(default=None, max_length=500)


class RestaurantReviewBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["UNDER_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"]
    note: Optional[str] = Field(default=None, max_length=500)


class MenuItemCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    category_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=140)
    description: Optional[str] = Field(default=None, max_length=600)
    price_usd: float = Field(ge=0, le=10000)
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_available: bool = True
    preparation_minutes: Optional[int] = Field(default=None, ge=0, le=480)


class MenuItemUpdateBody(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    category_id: Optional[str] = Field(default=None, min_length=1)
    name: Optional[str] = Field(default=None, min_length=1, max_length=140)
    description: Optional[str] = Field(default=None, max_length=600)
    price_usd: Optional[float] = Field(default=None, ge=0, le=10000)
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_available: Optional[bool] = None
    preparation_minutes: Optional[int] = Field(default=None, ge=0, le=480)


class MerchantOrderStatusBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: FoodOrderStatus
    note: Optional[str] = Field(default=None, max_length=300)
