export type VerificationStatus =
  | "not_started"
  | "pending_uploads"
  | "pending_auto_check"
  | "needs_review"
  | "approved"
  | "rejected"
  | "needs_resubmission";

export type IdentityVerificationState =
  | "pending_verification"
  | "active";

export type VerificationDocumentType =
  | "selfie"
  | "identity_document"
  | "driver_license"
  | "vehicle_registration_or_logbook"
  | "vehicle_photo_optional";

export type VerificationDocumentStatus = "pending" | "accepted" | "rejected";

export type VerificationDocument = {
  id?: string;
  document_type: VerificationDocumentType;
  file_name: string;
  uploaded_at?: string;
  status?: VerificationDocumentStatus;
  rejection_reason?: string;
  content_type?: string | null;
};

export type VerificationProfile = {
  driver_id?: string;
  driver_status?: string;
  verified?: boolean;
  verification_status: VerificationStatus;
  verification_provider: "manual";
  identity_verification_state?: IdentityVerificationState | null;
  verification_submitted_at?: string | null;
  verification_checked_at?: string | null;
  verification_notes?: string | null;
  documents: VerificationDocument[];
  required_documents: VerificationDocumentType[];
};

export type AdminVerificationListItem = {
  driver_id: string;
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  driver_status?: string;
  verification_status: VerificationStatus;
  verification_provider: "manual";
  verification_submitted_at?: string | null;
  document_count: number;
};

export type AdminVerificationDetail = {
  driver: Record<string, unknown>;
  user?: Record<string, unknown> | null;
  vehicles: Record<string, unknown>[];
  documents: VerificationDocument[];
};
