from typing import Dict, Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


ReviewRole = Literal["driver", "passenger", "courier", "restaurant", "customer"]
ReviewTransactionType = Literal["intercity", "hailing", "courier", "food_restaurant", "food_courier"]


class ReviewCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    transaction_id: str = Field(
        min_length=1,
        max_length=80,
        validation_alias=AliasChoices("transaction_id", "trip_id"),
    )
    transaction_type: Optional[ReviewTransactionType] = None
    reviewee_id: str = Field(min_length=1, max_length=80)
    rating: int = Field(ge=1, le=5)
    category_ratings: Dict[str, int] = Field(default_factory=dict, max_length=8)
    comment: Optional[str] = Field(default=None, max_length=1200)
    safety_report_requested: bool = False

    @field_validator("category_ratings")
    @classmethod
    def category_values_are_scores(cls, value: Dict[str, int]) -> Dict[str, int]:
        allowed = {
            "safety",
            "punctuality",
            "communication",
            "vehicle_cleanliness",
            "respectful_behavior",
            "payment_reliability",
            "delivery_time",
            "package_handling",
            "professionalism",
            "food_quality",
            "order_accuracy",
            "packaging",
            "delivery_experience",
            "handling",
        }
        cleaned: Dict[str, int] = {}
        for key, score in value.items():
            if key not in allowed:
                continue
            if score < 1 or score > 5:
                raise ValueError("Category ratings must be between 1 and 5.")
            cleaned[key] = score
        return cleaned

    @field_validator("comment")
    @classmethod
    def clean_comment(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None
