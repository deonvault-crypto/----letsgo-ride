export type RealtimeConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "suspended";

export type RealtimeEventEnvelope = {
  event_id: string;
  type: string;
  resource_type: string;
  resource_id: string;
  version: number;
  occurred_at: string;
  payload: Record<string, unknown>;
};
