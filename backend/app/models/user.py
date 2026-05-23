from typing import Literal, Optional

from pydantic import BaseModel, Field


UserRole = Literal["passenger", "driver"]


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


class UserUpdate(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    role: Optional[UserRole] = None
