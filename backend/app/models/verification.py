from typing import Literal, Optional

from pydantic import BaseModel, Field


VerificationStatus = Literal[
    "not_started",
    "pending",
    "needs_review",
    "verified",
    "rejected",
]

DocumentType = Literal[
    "identity_document",
    "driver_license",
    "vehicle_registration_or_logbook",
    "vehicle_photo_optional",
]

DocumentStatus = Literal["pending", "accepted", "rejected"]


class VerificationDocumentMetadata(BaseModel):
    document_type: DocumentType
    file_name: str = Field(min_length=1)
    file_url: Optional[str] = None
    storage_path: Optional[str] = None


class VerificationSubmitBody(BaseModel):
    consent: bool
    verification_notes: Optional[str] = None
    city: Optional[str] = None
    vehicle: Optional[str] = None
    documents: list[VerificationDocumentMetadata] = Field(default_factory=list)


class VerificationStatusUpdateBody(BaseModel):
    status: Literal["needs_review", "verified", "rejected"]
    admin_verification_notes: Optional[str] = None
    rejection_reason: Optional[str] = None
    document_id: Optional[str] = None
    document_status: Optional[DocumentStatus] = None
