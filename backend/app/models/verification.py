from typing import Literal, Optional

from pydantic import BaseModel, Field


VerificationStatus = Literal[
    "not_started",
    "pending",
    "needs_review",
    "verified",
    "rejected",
    "processing_biometrics",
    "active",
    "flagged_for_review",
]

IdentityVerificationState = Literal[
    "pending_verification",
    "processing_biometrics",
    "active",
    "flagged_for_review",
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


class FaceTecVerifyUserBody(BaseModel):
    session_id: Optional[str] = Field(default=None, max_length=160)
    external_database_ref_id: Optional[str] = Field(default=None, max_length=160)
    device_key_identifier: Optional[str] = Field(default=None, max_length=160)
    face_scan: str = Field(min_length=100, max_length=6_000_000)
    audit_trail_image: Optional[str] = Field(default=None, max_length=2_500_000)
    low_quality_audit_trail_image: Optional[str] = Field(default=None, max_length=2_500_000)
    id_scan: str = Field(min_length=100, max_length=6_000_000)
    id_scan_front_image: Optional[str] = Field(default=None, max_length=3_000_000)
    id_scan_back_image: Optional[str] = Field(default=None, max_length=3_000_000)
    min_match_level: Optional[int] = Field(default=None, ge=1, le=6)
