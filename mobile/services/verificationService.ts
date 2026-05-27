import axios from "axios";

import { api, requestData, toFriendlyApiError } from "./api";
import { ApiResponse } from "../types/api.types";
import {
  VerificationDocument,
  VerificationDocumentType,
  VerificationStatus,
  VerificationProfile,
} from "../types/verification.types";

const verificationDocumentTypes: VerificationDocumentType[] = [
  "selfie",
  "identity_document",
  "driver_license",
  "vehicle_registration_or_logbook",
  "vehicle_photo_optional",
];

const verificationStatuses: VerificationStatus[] = [
  "not_started",
  "pending_uploads",
  "pending_auto_check",
  "needs_review",
  "approved",
  "rejected",
  "needs_resubmission",
];

const statusAliases: Record<string, VerificationStatus> = {
  active: "approved",
  complete: "approved",
  completed: "approved",
  declined: "rejected",
  denied: "rejected",
  manual_review: "needs_review",
  pending: "pending_uploads",
  review: "needs_review",
  resubmission_required: "needs_resubmission",
  submitted: "pending_auto_check",
  verified: "approved",
};

const documentTypeAliases: Record<string, VerificationDocumentType> = {
  driver_licence: "driver_license",
  drivers_license: "driver_license",
  drivers_licence: "driver_license",
  id: "identity_document",
  id_document: "identity_document",
  identity: "identity_document",
  licence: "driver_license",
  license: "driver_license",
  registration: "vehicle_registration_or_logbook",
  registration_logbook: "vehicle_registration_or_logbook",
  vehicle_logbook: "vehicle_registration_or_logbook",
  vehicle_photo: "vehicle_photo_optional",
};

export async function getMyVerification() {
  const data = await requestData<Partial<VerificationProfile> | null>({ method: "GET", url: "/verification/me" });
  return normalizeVerificationProfile(data);
}

export async function submitManualVerification(data: {
  consent: boolean;
  verification_notes?: string;
  city?: string;
  vehicle?: string;
  documents?: VerificationDocument[];
}) {
  const response = await requestData<Partial<VerificationProfile> | null>({
    method: "POST",
    url: "/verification/manual/submit",
    data,
  });
  return normalizeVerificationProfile(response);
}

export async function uploadVerificationDocument(data: {
  documentType: VerificationDocumentType;
  uri: string;
  name: string;
  mimeType?: string;
}) {
  const formData = new FormData();
  formData.append("document_type", data.documentType);
  formData.append("file", {
    uri: data.uri,
    name: data.name,
    type: data.mimeType || "application/octet-stream",
  } as unknown as Blob);

  try {
    const response = await api.post<ApiResponse<VerificationDocument>>(
      "/verification/manual/upload",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    if (!response.data.success) {
      throw new Error(response.data.error || "Upload failed.");
    }
    return normalizeVerificationDocument(response.data.data) || {
      document_type: data.documentType,
      file_name: data.name,
      status: "pending",
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(toFriendlyApiError(err));
    }
    throw err;
  }
}

function normalizeVerificationProfile(data: Partial<VerificationProfile> | null | undefined): VerificationProfile {
  const documents = Array.isArray(data?.documents)
    ? data.documents.map(normalizeVerificationDocument).filter(Boolean) as VerificationDocument[]
    : [];
  const requiredDocuments = Array.isArray(data?.required_documents)
    ? data.required_documents.map(normalizeVerificationDocumentType).filter(Boolean) as VerificationDocumentType[]
    : verificationDocumentTypes;

  return {
    driver_id: typeof data?.driver_id === "string" ? data.driver_id : undefined,
    driver_status: typeof data?.driver_status === "string" ? data.driver_status : undefined,
    verified: Boolean(data?.verified),
    verification_status: normalizeVerificationStatus(data?.verification_status, documents),
    verification_provider: "manual",
    identity_verification_state: data?.identity_verification_state === "active" ? "active" : "pending_verification",
    verification_submitted_at: typeof data?.verification_submitted_at === "string" ? data.verification_submitted_at : null,
    verification_checked_at: typeof data?.verification_checked_at === "string" ? data.verification_checked_at : null,
    verification_notes: typeof data?.verification_notes === "string" ? data.verification_notes : null,
    documents,
    required_documents: requiredDocuments.length ? requiredDocuments : verificationDocumentTypes,
  };
}

function normalizeVerificationDocument(document: unknown): VerificationDocument | null {
  if (!document || typeof document !== "object") return null;
  const raw = document as Record<string, unknown>;
  const documentType = normalizeVerificationDocumentType(raw.document_type || raw.type || raw.kind);
  if (!documentType) return null;

  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    document_type: documentType,
    file_name: String(raw.file_name || raw.filename || raw.name || `${documentType}.jpg`),
    file_url: typeof raw.file_url === "string" ? raw.file_url : undefined,
    uploaded_at: typeof raw.uploaded_at === "string" ? raw.uploaded_at : undefined,
    status: raw.status === "accepted" || raw.status === "rejected" ? raw.status : "pending",
    rejection_reason: typeof raw.rejection_reason === "string" ? raw.rejection_reason : undefined,
    content_type: typeof raw.content_type === "string" ? raw.content_type : null,
  };
}

function normalizeVerificationDocumentType(value: unknown): VerificationDocumentType | null {
  const normalized = String(value || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  const documentType = documentTypeAliases[normalized] || normalized;
  return verificationDocumentTypes.includes(documentType as VerificationDocumentType)
    ? documentType as VerificationDocumentType
    : null;
}

function normalizeVerificationStatus(value: unknown, documents: VerificationDocument[]): VerificationStatus {
  const normalized = String(value || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (verificationStatuses.includes(normalized as VerificationStatus)) {
    return normalized as VerificationStatus;
  }
  if (normalized === "pending") {
    const documentTypes = new Set(documents.map((document) => document.document_type));
    return ["selfie", "identity_document", "driver_license", "vehicle_registration_or_logbook"].every((type) => documentTypes.has(type as VerificationDocumentType))
      ? "pending_auto_check"
      : "pending_uploads";
  }
  return statusAliases[normalized] || "not_started";
}
