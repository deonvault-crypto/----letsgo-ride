from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.courier import GeoPoint


FoodOrderStatus = Literal[
    "PENDING_RESTAURANT",
    "PREPARING",
    "READY_FOR_PICKUP",
    "COURIER_ASSIGNED",
    "PICKED_UP",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
    "REJECTED",
]

FoodPaymentMethod = Literal["CASH_ON_DELIVERY"]


class FoodOrderItemBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    menu_item_id: str = Field(min_length=1)
    quantity: int = Field(ge=1, le=20)
    note: Optional[str] = Field(default=None, max_length=240)


class FoodOrderCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    restaurant_id: str = Field(min_length=1)
    delivery_address: str = Field(min_length=3, max_length=240)
    delivery_location: GeoPoint
    recipient_name: str = Field(min_length=2, max_length=120)
    recipient_phone: str = Field(min_length=5, max_length=40)
    items: List[FoodOrderItemBody] = Field(min_length=1, max_length=50)
    customer_note: Optional[str] = Field(default=None, max_length=400)
    payment_method: FoodPaymentMethod = "CASH_ON_DELIVERY"


class FoodOrderCancelBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: Optional[str] = Field(default=None, max_length=300)
