from typing import Literal, Optional

from pydantic import BaseModel, Field


UserRole = Literal["passenger", "driver", "admin"]


class RequestOtpBody(BaseModel):
    phone: str = Field(min_length=6)


class VerifyOtpBody(BaseModel):
    phone: str = Field(min_length=6)
    otp: str = Field(min_length=4, max_length=8)
    role: UserRole = "passenger"


class RegisterBody(BaseModel):
    phone: str = Field(min_length=6)
    name: str = Field(min_length=2)
    city: Optional[str] = None
    role: UserRole = "passenger"


class EmailLoginBody(BaseModel):
    email: str = Field(min_length=5)
    password: str = Field(min_length=8)


class EmailRegisterBody(BaseModel):
    name: str = Field(min_length=2)
    email: str = Field(min_length=5)
    password: str = Field(min_length=8)
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
    role: Optional[UserRole] = None
