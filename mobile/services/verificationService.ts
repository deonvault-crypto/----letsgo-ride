import axios from "axios";

import { api, requestData, toFriendlyApiError } from "./api";
import { ApiResponse } from "../types/api.types";
import {
  VerificationDocument,
  VerificationDocumentType,
  VerificationProfile,
} from "../types/verification.types";

export async function getMyVerification() {
  return requestData<VerificationProfile>({ method: "GET", url: "/verification/me" });
}

export async function submitManualVerification(data: {
  consent: boolean;
  verification_notes?: string;
  city?: string;
  vehicle?: string;
  documents?: VerificationDocument[];
}) {
  return requestData<VerificationProfile>({
    method: "POST",
    url: "/verification/manual/submit",
    data,
  });
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
    return response.data.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(toFriendlyApiError(err));
    }
    throw err;
  }
}
