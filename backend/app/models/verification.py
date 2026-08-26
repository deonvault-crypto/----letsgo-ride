from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


VerificationStatus = Literal[
    "not_started",
    "pending_uploads",
    "pending_auto_check",
    "needs_review",
    "approved",
    "rejected",
    "needs_resubmission",
]

IdentityVerificationState = Literal[
    "pending_verification",
    "active",
]

DocumentType = Literal[
    "selfie",
    "identity_document",
    "driver_license",
    "vehicle_registration_or_logbook",
    "vehicle_photo_optional",
]

DocumentStatus = Literal["pending", "accepted", "rejected"]


class VerificationDocumentReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_id: str = Field(min_length=8, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    document_type: DocumentType


class VerificationSubmitBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    consent: bool
    verification_notes: Optional[str] = Field(default=None, max_length=1000)
    city: Optional[str] = Field(default=None, max_length=120)
    vehicle: Optional[str] = Field(default=None, max_length=180)
    documents: list[VerificationDocumentReference] = Field(min_length=1, max_length=8)


class VerificationStatusUpdateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["needs_review", "approved", "rejected", "needs_resubmission"]
    admin_verification_notes: Optional[str] = Field(default=None, max_length=1000)
    rejection_reason: Optional[str] = Field(default=None, max_length=600)
    document_id: Optional[str] = Field(default=None, max_length=80)
    document_status: Optional[DocumentStatus] = None
