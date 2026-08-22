from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from app.models.courier import GeoPoint
from app.models.food import FoodOrderStatus


class RestaurantCreateBody(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=800)
    phone: str = Field(min_length=5, max_length=40)
    address: str = Field(min_length=3, max_length=240)
    location: Optional[GeoPoint] = None
    cuisine_tags: List[str] = Field(default_factory=list, max_length=12)
    opening_hours: Dict[str, str] = Field(default_factory=dict)


class RestaurantUpdateBody(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=800)
    phone: Optional[str] = Field(default=None, min_length=5, max_length=40)
    address: Optional[str] = Field(default=None, min_length=3, max_length=240)
    location: Optional[GeoPoint] = None
    cuisine_tags: Optional[List[str]] = None
    opening_hours: Optional[Dict[str, str]] = None
    is_accepting_orders: Optional[bool] = None
    hero_image_url: Optional[str] = Field(default=None, max_length=500)
    logo_url: Optional[str] = Field(default=None, max_length=500)


class MenuCategoryCreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: Optional[str] = Field(default=None, max_length=240)
    sort_order: int = Field(default=0, ge=0, le=10000)


class MenuItemCreateBody(BaseModel):
    category_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=140)
    description: Optional[str] = Field(default=None, max_length=600)
    price_usd: float = Field(ge=0, le=10000)
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_available: bool = True
    preparation_minutes: Optional[int] = Field(default=None, ge=0, le=480)


class MenuItemUpdateBody(BaseModel):
    category_id: Optional[str] = Field(default=None, min_length=1)
    name: Optional[str] = Field(default=None, min_length=1, max_length=140)
    description: Optional[str] = Field(default=None, max_length=600)
    price_usd: Optional[float] = Field(default=None, ge=0, le=10000)
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_available: Optional[bool] = None
    preparation_minutes: Optional[int] = Field(default=None, ge=0, le=480)


class MerchantOrderStatusBody(BaseModel):
    status: FoodOrderStatus
    note: Optional[str] = Field(default=None, max_length=300)
