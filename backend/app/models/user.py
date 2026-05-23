from typing import Literal, Optional

import re

from pydantic import BaseModel, Field, field_validator


UserRole = Literal["passenger", "driver", "admin"]
PHONE_PATTERN = re.compile(r"^\+[1-9]\d{7,14}$")


def validate_international_phone(phone: Optional[str]) -> Optional[str]:
    if phone in (None, ""):
        return phone
    normalized = phone.strip().replace(" ", "")
    if not PHONE_PATTERN.match(normalized):
        raise ValueError("Enter your phone number with country code, for example +263772554186.")
    return normalized


class RequestOtpBody(BaseModel):
    phone: str = Field(min_length=6)

    @field_validator("phone")
    @classmethod
    def phone_has_country_code(cls, value: str) -> str:
        return validate_international_phone(value) or value


class VerifyOtpBody(BaseModel):
    phone: str = Field(min_length=6)
    otp: str = Field(min_length=4, max_length=8)
    role: UserRole = "passenger"

    @field_validator("phone")
    @classmethod
    def phone_has_country_code(cls, value: str) -> str:
        return validate_international_phone(value) or value


class RegisterBody(BaseModel):
    phone: str = Field(min_length=6)
    name: str = Field(min_length=2)
    city: Optional[str] = None
    role: UserRole = "passenger"

    @field_validator("phone")
    @classmethod
    def phone_has_country_code(cls, value: str) -> str:
        return validate_international_phone(value) or value


class EmailLoginBody(BaseModel):
    email: str = Field(min_length=5)
    password: str = Field(min_length=8)


class EmailRegisterBody(BaseModel):
    name: str = Field(min_length=2)
    email: str = Field(min_length=5)
    password: str = Field(min_length=8)
    confirm_password: str = Field(min_length=8)
    city: Optional[str] = None
    role: UserRole = "passenger"


class ForgotPasswordBody(BaseModel):
    email: str = Field(min_length=5)


class ResetPasswordBody(BaseModel):
    email: str = Field(min_length=5)
    code: str = Field(min_length=4, max_length=8)
    password: str = Field(min_length=8)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = Field(default=None, min_length=6)
    email: Optional[str] = Field(default=None, min_length=5)
    city: Optional[str] = None
    bio: Optional[str] = None
    travel_preferences: Optional[str] = None
    profile_photo_url: Optional[str] = None
    profile_photo_name: Optional[str] = None
    profile_photo_verified: Optional[bool] = None
    email_verified: Optional[bool] = None
    notification_trip_updates: Optional[bool] = None
    notification_booking_requests: Optional[bool] = None
    notification_support_replies: Optional[bool] = None
    notification_safety_alerts: Optional[bool] = None
    notification_marketing: Optional[bool] = None
    role: Optional[UserRole] = None

    @field_validator("phone")
    @classmethod
    def phone_has_country_code(cls, value: Optional[str]) -> Optional[str]:
        return validate_international_phone(value)


class VerifyEmailBody(BaseModel):
    email: str = Field(min_length=5)
    code: str = Field(min_length=6, max_length=6)


class ResendEmailVerificationBody(BaseModel):
    email: str = Field(min_length=5)
