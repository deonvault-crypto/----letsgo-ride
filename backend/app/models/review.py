from typing import Dict, Literal, Optional

from pydantic import BaseModel, Field, field_validator


ReviewRole = Literal["driver", "passenger"]


class ReviewCreateBody(BaseModel):
    trip_id: str = Field(min_length=1)
    reviewee_id: str = Field(min_length=1)
    rating: int = Field(ge=1, le=5)
    category_ratings: Dict[str, int] = Field(default_factory=dict)
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
