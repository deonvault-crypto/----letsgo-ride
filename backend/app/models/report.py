from typing import Optional

from pydantic import BaseModel, Field


class ReportCreateBody(BaseModel):
    report_type: str = Field(min_length=2)
    message: str = Field(min_length=5)
    ride_id: Optional[str] = None
    user_phone: Optional[str] = None


class SupportMessageBody(BaseModel):
    subject: str = Field(min_length=2)
    message: str = Field(min_length=5)
    phone: Optional[str] = None


class WaitlistBody(BaseModel):
    name: str = Field(min_length=2)
    phone: str = Field(min_length=6)
    city: Optional[str] = None
    interest: Optional[str] = None
