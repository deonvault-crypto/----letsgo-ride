from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.user import validate_international_phone


class ReportCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    report_type: str = Field(min_length=2, max_length=120)
    message: str = Field(min_length=5, max_length=4000)
    ride_id: Optional[str] = Field(default=None, max_length=80)
    user_phone: Optional[str] = None

    @field_validator("user_phone")
    @classmethod
    def phone_has_country_code(cls, value: Optional[str]) -> Optional[str]:
        return validate_international_phone(value)


class SupportMessageBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str = Field(min_length=2, max_length=160)
    message: str = Field(min_length=5, max_length=4000)
    phone: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def phone_has_country_code(cls, value: Optional[str]) -> Optional[str]:
        return validate_international_phone(value)


class WaitlistBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=6, max_length=32)
    city: Optional[str] = Field(default=None, max_length=120)
    interest: Optional[str] = Field(default=None, max_length=600)
