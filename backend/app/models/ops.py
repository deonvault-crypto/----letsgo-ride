from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


OpsStaffRole = Literal["cs", "manager"]
OpsCasePriority = Literal["low", "normal", "high", "urgent"]
OpsCaseStatus = Literal["open", "in_progress", "waiting_customer", "escalated", "resolved", "closed"]
OpsCaseSourceType = Literal[
    "manual",
    "support_message",
    "safety_report",
    "shared_ride",
    "ride_request",
    "hailing_trip",
    "courier_delivery",
    "food_order",
    "user",
]


class OpsStaffProvisionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: str = Field(min_length=1, max_length=160)
    role: OpsStaffRole
    title: Optional[str] = Field(default=None, max_length=120)
    reason: str = Field(min_length=3, max_length=500)


class OpsStaffUpdateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Optional[OpsStaffRole] = None
    title: Optional[str] = Field(default=None, max_length=120)
    enabled: Optional[bool] = None
    reason: str = Field(min_length=3, max_length=500)


class OpsCaseCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject: str = Field(min_length=3, max_length=180)
    description: str = Field(min_length=3, max_length=5000)
    priority: OpsCasePriority = "normal"
    source_type: OpsCaseSourceType = "manual"
    source_id: Optional[str] = Field(default=None, max_length=160)
    customer_user_id: Optional[str] = Field(default=None, max_length=160)


class OpsCaseNoteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str = Field(min_length=1, max_length=5000)


class OpsCaseEscalateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=3, max_length=2000)


class OpsCaseAssignBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assigned_user_id: Optional[str] = Field(default=None, max_length=160)


class OpsCaseStatusBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: OpsCaseStatus
    note: Optional[str] = Field(default=None, max_length=3000)


class OpsSupportStatusBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["received", "open", "in_review", "resolved", "closed"]
    reply: Optional[str] = Field(default=None, max_length=5000)


class OpsReportStatusBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["submitted", "open", "in_review", "resolved", "dismissed"]
    notes: Optional[str] = Field(default=None, max_length=5000)
