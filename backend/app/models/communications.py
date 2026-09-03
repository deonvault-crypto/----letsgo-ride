from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CampaignBody(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=2000)
    kind: Literal["marketing", "service_update", "safety_alert", "app_update"]
    roles: list[Literal["passenger", "driver", "courier", "merchant"]] = Field(min_length=1, max_length=4)
    user_ids: list[str] = Field(default_factory=list, max_length=100)
    action: Literal["none", "support", "ride", "food", "courier", "app_updates"] = "none"
    push: bool = False
    scheduled_at: Optional[datetime] = None
    expires_at: datetime

    @field_validator("user_ids")
    @classmethod
    def valid_ids(cls, values):
        import re
        if any(not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value) for value in values):
            raise ValueError("Invalid customer identifier.")
        return sorted(set(values))

    @field_validator("scheduled_at", "expires_at")
    @classmethod
    def timezone_required(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("A timezone is required.")
        return value.astimezone(timezone.utc) if value else None

    @model_validator(mode="after")
    def dates_and_action(self):
        start = self.scheduled_at or datetime.now(timezone.utc)
        if self.expires_at <= start:
            raise ValueError("Expiry must follow the send time.")
        if (self.expires_at - datetime.now(timezone.utc)).days > 90:
            raise ValueError("Expiry must be within 90 days.")
        if self.action in {"ride", "food", "courier"} and self.roles != ["passenger"]:
            raise ValueError("This action is available to customers only.")
        return self


class CampaignRevision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1)


class AppReleaseBody(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    platform: Literal["ios", "android"]
    version: str = Field(pattern=r"^\d{1,3}\.\d{1,3}\.\d{1,3}$")
    notes: str = Field(min_length=1, max_length=2000)
    available_in_store: bool = False
    reason: str = Field(min_length=3, max_length=500)
