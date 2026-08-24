import { API_BASE_URL } from "../constants/config";
import { RealtimeConnectionState, RealtimeEventEnvelope } from "../types/realtime.types";
import { getToken } from "./api";


type RealtimeSocket = {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: ((event: { code?: number }) => void) | null;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

type RealtimeServiceOptions = {
  socketFactory?: (url: string, protocols: string[]) => RealtimeSocket;
  tokenProvider?: () => Promise<string | null>;
  random?: () => number;
  baseReconnectMs?: number;
  maxReconnectMs?: number;
  healthTimeoutMs?: number;
};

type StateListener = (state: RealtimeConnectionState) => void;
type EventListener = (event: RealtimeEventEnvelope) => void;
type ReconciliationListener = () => void;
type AuthenticationFailureListener = () => void;

const REALTIME_PROTOCOL = "letsgoride.realtime.v1";
const AUTH_PROTOCOL_PREFIX = "letsgoride.auth.";
const MAX_SEEN_EVENTS = 500;
const SOCKET_OPEN = 1;

export function realtimeUrl(apiBaseUrl = API_BASE_URL) {
  const trimmed = apiBaseUrl.replace(/\/+$/, "");
  return `${trimmed.replace(/^https:/, "wss:").replace(/^http:/, "ws:")}/realtime`;
}

export function parseRealtimeEvent(value: unknown): RealtimeEventEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (
    typeof event.event_id !== "string" || !event.event_id
    || typeof event.type !== "string" || !event.type.includes(".")
    || typeof event.resource_type !== "string" || !event.resource_type
    || typeof event.resource_id !== "string" || !event.resource_id
    || typeof event.version !== "number" || !Number.isInteger(event.version) || event.version < 1
    || typeof event.occurred_at !== "string" || !event.occurred_at
    || !event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)
  ) return null;
  return event as RealtimeEventEnvelope;
}

export class RealtimeService {
  private socket: RealtimeSocket | null = null;
  private sessionKey: string | null = null;
  private state: RealtimeConnectionState = "idle";
  private generation = 0;
  private shouldConnect = false;
  private suspended = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly seenEventIds = new Set<string>();
  private readonly seenEventQueue: string[] = [];
  private readonly resourceVersions = new Map<string, number>();
  private readonly stateListeners = new Set<StateListener>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly reconciliationListeners = new Set<ReconciliationListener>();
  private readonly authenticationFailureListeners = new Set<AuthenticationFailureListener>();
  private readonly socketFactory: (url: string, protocols: string[]) => RealtimeSocket;
  private readonly tokenProvider: () => Promise<string | null>;
  private readonly random: () => number;
  private readonly baseReconnectMs: number;
  private readonly maxReconnectMs: number;
  private readonly healthTimeoutMs: number;

  constructor(options: RealtimeServiceOptions = {}) {
    this.socketFactory = options.socketFactory || ((url, protocols) => new WebSocket(url, protocols) as unknown as RealtimeSocket);
    this.tokenProvider = options.tokenProvider || getToken;
    this.random = options.random || Math.random;
    this.baseReconnectMs = options.baseReconnectMs || 1_000;
    this.maxReconnectMs = options.maxReconnectMs || 30_000;
    this.healthTimeoutMs = options.healthTimeoutMs || 65_000;
  }

  get connectionState() {
    return this.state;
  }

  onStateChange(listener: StateListener) {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => { this.stateListeners.delete(listener); };
  }

  onEvent(listener: EventListener) {
    this.eventListeners.add(listener);
    return () => { this.eventListeners.delete(listener); };
  }

  onReconciliationNeeded(listener: ReconciliationListener) {
    this.reconciliationListeners.add(listener);
    return () => { this.reconciliationListeners.delete(listener); };
  }

  onAuthenticationFailure(listener: AuthenticationFailureListener) {
    this.authenticationFailureListeners.add(listener);
    return () => { this.authenticationFailureListeners.delete(listener); };
  }

  async start(sessionKey: string) {
    if (!sessionKey) return;
    if (this.sessionKey === sessionKey && this.shouldConnect && !this.suspended && this.socket) return;
    this.stop(true);
    this.sessionKey = sessionKey;
    this.shouldConnect = true;
    this.suspended = false;
    const generation = ++this.generation;
    await this.open(generation);
  }

  suspend() {
    if (!this.sessionKey) return;
    this.suspended = true;
    this.generation += 1;
    this.clearTimers();
    this.closeSocket();
    this.setState("suspended");
  }

  async resume() {
    if (!this.sessionKey || !this.shouldConnect) return;
    this.suspended = false;
    const generation = ++this.generation;
    await this.open(generation);
  }

  reconnect() {
    if (!this.sessionKey || !this.shouldConnect || this.suspended) return;
    this.generation += 1;
    this.clearTimers();
    this.closeSocket();
    void this.open(this.generation);
  }

  stop(clearSeenState = true) {
    this.shouldConnect = false;
    this.suspended = false;
    this.sessionKey = null;
    this.generation += 1;
    this.reconnectAttempt = 0;
    this.clearTimers();
    this.closeSocket();
    if (clearSeenState) {
      this.seenEventIds.clear();
      this.seenEventQueue.length = 0;
      this.resourceVersions.clear();
    }
    this.setState("idle");
  }

  private async open(generation: number) {
    if (!this.shouldConnect || this.suspended || !this.sessionKey || generation !== this.generation) return;
    this.setState(this.reconnectAttempt ? "reconnecting" : "connecting");
    const token = await this.tokenProvider();
    if (!token || generation !== this.generation || this.suspended || !this.shouldConnect) {
      if (!token && generation === this.generation) this.stop(true);
      return;
    }
    let socket: RealtimeSocket;
    try {
      socket = this.socketFactory(realtimeUrl(), [REALTIME_PROTOCOL, `${AUTH_PROTOCOL_PREFIX}${token}`]);
    } catch {
      this.scheduleReconnect(generation);
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket || generation !== this.generation) return;
      this.armHealthTimeout(socket);
    };
    socket.onmessage = (message) => {
      if (this.socket !== socket || generation !== this.generation) return;
      this.armHealthTimeout(socket);
      this.handleMessage(socket, message.data);
    };
    socket.onerror = () => undefined;
    socket.onclose = (event) => {
      if (this.socket !== socket || generation !== this.generation) return;
      this.socket = null;
      this.clearHealthTimer();
      if (event.code === 4401 || event.code === 4403) {
        this.shouldConnect = false;
        this.setState("idle");
        this.authenticationFailureListeners.forEach((listener) => listener());
        return;
      }
      this.scheduleReconnect(generation);
    };
    this.armHealthTimeout(socket);
  }

  private handleMessage(socket: RealtimeSocket, raw: unknown) {
    if (typeof raw !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const control = parsed as Record<string, unknown>;
      if (control.type === "realtime.ready") {
        this.reconnectAttempt = 0;
        this.setState("connected");
        this.reconciliationListeners.forEach((listener) => listener());
        return;
      }
      if (control.type === "realtime.ping") {
        if (socket.readyState === SOCKET_OPEN) socket.send(JSON.stringify({ type: "realtime.pong" }));
        return;
      }
    }
    const event = parseRealtimeEvent(parsed);
    if (!event || this.seenEventIds.has(event.event_id)) return;
    const resourceKey = `${event.resource_type}:${event.resource_id}`;
    const latestVersion = this.resourceVersions.get(resourceKey) || 0;
    if (event.version <= latestVersion) return;
    this.resourceVersions.set(resourceKey, event.version);
    this.rememberEvent(event.event_id);
    this.eventListeners.forEach((listener) => listener(event));
    if (socket.readyState === SOCKET_OPEN) {
      socket.send(JSON.stringify({ type: "realtime.ack", event_id: event.event_id }));
    }
  }

  private rememberEvent(eventId: string) {
    this.seenEventIds.add(eventId);
    this.seenEventQueue.push(eventId);
    while (this.seenEventQueue.length > MAX_SEEN_EVENTS) {
      const oldest = this.seenEventQueue.shift();
      if (oldest) this.seenEventIds.delete(oldest);
    }
  }

  private scheduleReconnect(generation: number) {
    if (!this.shouldConnect || this.suspended || generation !== this.generation || this.reconnectTimer) return;
    const exponential = Math.min(this.maxReconnectMs, this.baseReconnectMs * (2 ** this.reconnectAttempt));
    const delay = Math.min(this.maxReconnectMs, exponential + exponential * 0.25 * this.random());
    this.reconnectAttempt += 1;
    this.setState("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open(generation);
    }, delay);
  }

  private armHealthTimeout(socket: RealtimeSocket) {
    this.clearHealthTimer();
    this.healthTimer = setTimeout(() => {
      if (this.socket === socket) socket.close(4000, "heartbeat_timeout");
    }, this.healthTimeoutMs);
  }

  private clearHealthTimer() {
    if (this.healthTimer) clearTimeout(this.healthTimer);
    this.healthTimer = null;
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearHealthTimer();
  }

  private closeSocket() {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState < 2) socket.close(1000, "client_lifecycle");
  }

  private setState(nextState: RealtimeConnectionState) {
    if (this.state === nextState) return;
    this.state = nextState;
    this.stateListeners.forEach((listener) => listener(nextState));
  }
}

export const realtimeService = new RealtimeService();
