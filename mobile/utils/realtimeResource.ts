import type { RealtimeEventEnvelope } from "../types/realtime.types";


export type RealtimeVersionDecision = "apply" | "ignore" | "reconcile";

export function decideRealtimeVersion(
  localVersion: unknown,
  event: RealtimeEventEnvelope,
): RealtimeVersionDecision {
  const current = normalizeRealtimeVersion(localVersion);
  if (event.version <= current) return "ignore";
  if (event.version > current + 1) return "reconcile";
  if (normalizeRealtimeVersion(event.payload.realtime_version) !== event.version) return "reconcile";
  return "apply";
}

export function normalizeRealtimeVersion(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}
