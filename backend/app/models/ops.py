from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


OpsRole = Literal["cs", "manager", "admin"]
OpsCaseLevel = Literal["cs", "manager", "admin"]
OpsCaseStatus = Literal["received", "open", "in_progress", "waiting_customer", "resolved", "closed"]


class OpsCaseUpdateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Optional[OpsCaseStatus] = None
    assigned_to: Optional[str] = Field(default=None, max_length=120)
    internal_note: Optional[str] = Field(default=None, min_length=2, max_length=2000)
    resolution: Optional[str] = Field(default=None, min_length=2, max_length=2000)


class OpsEscalationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=3, max_length=1000)


class OpsStaffRoleBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ops_role: Optional[OpsRole] = None
    reason: str = Field(min_length=3, max_length=500)
