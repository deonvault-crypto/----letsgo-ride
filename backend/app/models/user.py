from typing import Literal, Optional

import re

from pydantic import BaseModel, Field, field_validator


UserRole = Literal["passenger", "driver", "courier", "merchant", "admin"]
PHONE_PATTERN = re.compile(r"^\+[1-9]\d{7,14}$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PASSWORD_SYMBOL_PATTERN = re.compile(r"[^A-Za-z0-9]")


def validate_international_phone(phone: Optional[str]) -> Optional[str]:
    if phone in (None, ""):
        return phone
    normalized = phone.strip().replace(" ", "")
    if not PHONE_PATTERN.match(normalized):
        raise ValueError("Enter your phone number with country code, for example +263700000000.")
    return normalized


def normalize_email(value: str) -> str:
    normalized = value.strip().lower()
    if not EMAIL_PATTERN.match(normalized):
        raise ValueError("Enter a valid email address.")
    return normalized


def validate_strong_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters.")
    if not any(character.isupper() for character in value):
        raise ValueError("Password must include uppercase, lowercase, number, and symbol.")
    if not any(character.islower() for character in value):
        raise ValueError("Password must include uppercase, lowercase, number, and symbol.")
    if not any(character.isdigit() for character in value):
        raise ValueError("Password must include uppercase, lowercase, number, and symbol.")
    if not PASSWORD_SYMBOL_PATTERN.search(value):
        raise ValueError("Password must include uppercase, lowercase, number, and symbol.")
    return value


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

    @field_validator("email")
    @classmethod
    def email_is_normalized(cls, value: str) -> str:
        return normalize_email(value)


class EmailRegisterBody(BaseModel):
    name: str = Field(min_length=2)
    email: str = Field(min_length=5)
    password: str = Field(min_length=8)
    confirm_password: str = Field(min_length=8)
    city: Optional[str] = None
    role: UserRole = "passenger"

    @field_validator("email")
    @classmethod
    def email_is_normalized(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("password", "confirm_password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        return validate_strong_password(value)


class ForgotPasswordBody(BaseModel):
    email: str = Field(min_length=5)

    @field_validator("email")
    @classmethod
    def email_is_normalized(cls, value: str) -> str:
        return normalize_email(value)


class ResetPasswordBody(BaseModel):
    email: str = Field(min_length=5)
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8)
    confirm_password: Optional[str] = None

    @field_validator("email")
    @classmethod
    def email_is_normalized(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        return validate_strong_password(value)


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
    # Account type is created during onboarding and intentionally cannot be changed via /auth/me.
    role: Optional[UserRole] = None

    @field_validator("phone")
    @classmethod
    def phone_has_country_code(cls, value: Optional[str]) -> Optional[str]:
        return validate_international_phone(value)

    @field_validator("email")
    @classmethod
    def email_is_normalized(cls, value: Optional[str]) -> Optional[str]:
        if value in (None, ""):
            return value
        return normalize_email(value)


class AdminRoleUpdateBody(BaseModel):
    role: Literal["driver", "courier", "merchant", "admin"]
    reason: str = Field(min_length=3, max_length=300)


class VerifyEmailBody(BaseModel):
    email: str = Field(min_length=5)
    code: str = Field(min_length=6, max_length=6)

    @field_validator("email")
    @classmethod
    def email_is_normalized(cls, value: str) -> str:
        return normalize_email(value)


class ResendEmailVerificationBody(BaseModel):
    email: str = Field(min_length=5)

    @field_validator("email")
    @classmethod
    def email_is_normalized(cls, value: str) -> str:
        return normalize_email(value)
