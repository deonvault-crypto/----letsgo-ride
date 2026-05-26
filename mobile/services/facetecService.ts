import { NativeModules, Platform } from "react-native";

import { requestData } from "./api";
import { VerificationProfile } from "../types/verification.types";

const nativeFaceTec = NativeModules.LetsGoRideFaceTec as
  | {
      startVerification?: (payload: FaceTecSessionToken) => Promise<FaceTecNativeResult>;
    }
  | undefined;

export type FaceTecSessionToken = {
  session_token: string;
  device_key_identifier: string;
  external_database_ref_id: string;
};

type FaceTecNativeResult = {
  session_id?: string;
  face_scan?: string;
  audit_trail_image?: string;
  low_quality_audit_trail_image?: string;
  id_scan?: string;
  id_scan_front_image?: string;
  id_scan_back_image?: string;
  min_match_level?: number;
};

export function isFaceTecNativeAvailable() {
  return Platform.OS !== "web" && typeof nativeFaceTec?.startVerification === "function";
}

export async function getFaceTecSessionToken() {
  return requestData<FaceTecSessionToken>({
    method: "GET",
    url: "/api/facetec/session-token",
  });
}

export async function submitFaceTecPayload(payload: FaceTecNativeResult & FaceTecSessionToken) {
  return requestData<VerificationProfile>({
    method: "POST",
    url: "/api/verify-user",
    data: {
      session_id: payload.session_id || payload.session_token,
      external_database_ref_id: payload.external_database_ref_id,
      device_key_identifier: payload.device_key_identifier,
      face_scan: payload.face_scan,
      audit_trail_image: payload.audit_trail_image,
      low_quality_audit_trail_image: payload.low_quality_audit_trail_image,
      id_scan: payload.id_scan,
      id_scan_front_image: payload.id_scan_front_image,
      id_scan_back_image: payload.id_scan_back_image,
      min_match_level: payload.min_match_level,
    },
  });
}

export async function startFaceTecVerification() {
  const session = await getFaceTecSessionToken();
  if (!isFaceTecNativeAvailable()) {
    throw new Error("Biometric verification is not available in this build. You can still submit documents for manual review.");
  }
  const nativeResult = await nativeFaceTec?.startVerification?.(session);
  if (!nativeResult?.face_scan || !nativeResult?.id_scan) {
    throw new Error("Biometric verification was not completed. Please try again or use manual review.");
  }
  return submitFaceTecPayload({ ...session, ...nativeResult });
}
