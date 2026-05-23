from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models.user import validate_international_phone


class ReportCreateBody(BaseModel):
    report_type: str = Field(min_length=2)
    message: str = Field(min_length=5)
    ride_id: Optional[str] = None
    user_phone: Optional[str] = None

    @field_validator("user_phone")
    @classmethod
    def phone_has_country_code(cls, value: Optional[str]) -> Optional[str]:
        return validate_international_phone(value)


class SupportMessageBody(BaseModel):
    subject: str = Field(min_length=2)
    message: str = Field(min_length=5)
    phone: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def phone_has_country_code(cls, value: Optional[str]) -> Optional[str]:
        return validate_international_phone(value)


class WaitlistBody(BaseModel):
    name: str = Field(min_length=2)
    phone: str = Field(min_length=6)
    city: Optional[str] = None
    interest: Optional[str] = None
