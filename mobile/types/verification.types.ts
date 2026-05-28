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

export type VerificationOcrResult = {
  provider: string;
  status: string;
  extracted_fields: Record<string, string | number | null | undefined>;
  confidence: number;
  reason?: string | null;
};

export type VerificationDocument = {
  id?: string;
  document_type: VerificationDocumentType;
  file_name: string;
  file_url?: string;
  cloudinary_public_id?: string | null;
  uploaded_at?: string;
  status?: VerificationDocumentStatus;
  rejection_reason?: string;
  content_type?: string | null;
  ocr?: VerificationOcrResult | null;
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
  challenge_code?: string | null;
  challenge_created_at?: string | null;
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
  risk_score?: number | null;
  risk_level?: "low" | "medium" | "high" | string | null;
  risk_flags?: string[];
  duplicate_flags?: string[];
  review_reasons?: string[];
  face_match_status?: string | null;
};

export type AdminVerificationDetail = {
  driver: Record<string, unknown> & {
    risk_score?: number | null;
    verification_risk_score?: number | null;
    risk_level?: "low" | "medium" | "high" | string | null;
    risk_flags?: string[];
    verification_risk_flags?: string[];
    duplicate_flags?: string[];
    review_reasons?: string[];
    ocr_provider?: string | null;
    ocr_extracted_fields?: Record<string, string | number | null | undefined>;
    ocr_confidence?: number | null;
    face_match_score?: number | null;
    face_match_status?: string | null;
    face_match_reason?: string | null;
    face_embedding_duplicate_status?: string | null;
    challenge_code?: string | null;
    challenge_created_at?: string | null;
    auto_approval_eligible?: boolean;
  };
  user?: Record<string, unknown> | null;
  vehicles: Record<string, unknown>[];
  documents: VerificationDocument[];
};
