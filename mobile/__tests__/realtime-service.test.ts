import { RealtimeService, parseRealtimeEvent, realtimeUrl } from "../services/realtimeService";


class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code?: number }) => void) | null = null;
  sent: string[] = [];
  close = jest.fn((code?: number) => {
    this.readyState = 3;
    this.onclose?.({ code });
  });

  send(data: string) { this.sent.push(data); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: unknown) { this.onmessage?.({ data: typeof value === "string" ? value : JSON.stringify(value) }); }
  serverClose(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}

const event = {
  event_id: "event-1",
  type: "diagnostic.updated",
  resource_type: "diagnostic",
  resource_id: "resource-1",
  version: 1,
  occurred_at: "2026-08-24T20:00:00Z",
  payload: { status: "ok" },
};

describe("RealtimeService", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  function setup() {
    const sockets: FakeSocket[] = [];
    const protocols: string[][] = [];
    const service = new RealtimeService({
      tokenProvider: async () => "acct_test-token",
      socketFactory: (_url, nextProtocols) => {
        protocols.push(nextProtocols);
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      random: () => 0,
      baseReconnectMs: 1000,
      maxReconnectMs: 8000,
      healthTimeoutMs: 60000,
    });
    return { service, sockets, protocols };
  }

  it("builds the canonical websocket URL and connects with the current token", async () => {
    const { service, sockets, protocols } = setup();
    await service.start("user-1:passenger");
    expect(sockets).toHaveLength(1);
    expect(protocols[0]).toEqual(["letsgoride.realtime.v1", "letsgoride.auth.acct_test-token"]);
    expect(realtimeUrl("https://api.example.com/")).toBe("wss://api.example.com/realtime");
    service.stop();
  });

  it("accepts ready, responds to heartbeat, and emits a valid event once", async () => {
    const { service, sockets } = setup();
    const listener = jest.fn();
    const reconcile = jest.fn();
    service.onEvent(listener);
    service.onReconciliationNeeded(reconcile);
    await service.start("user-1:passenger");
    sockets[0].open();
    sockets[0].message({ type: "realtime.ready" });
    sockets[0].message({ type: "realtime.ping" });
    sockets[0].message(event);
    sockets[0].message(event);
    sockets[0].message({ ...event, event_id: "event-stale", version: 1 });

    expect(service.connectionState).toBe("connected");
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(sockets[0].sent).toContain(JSON.stringify({ type: "realtime.pong" }));
    expect(sockets[0].sent).toContain(JSON.stringify({ type: "realtime.ack", event_id: "event-1" }));
    service.stop();
  });

  it("ignores malformed messages and invalid envelopes", async () => {
    const { service, sockets } = setup();
    const listener = jest.fn();
    service.onEvent(listener);
    await service.start("user-1:passenger");
    sockets[0].message("not-json");
    sockets[0].message({ event_id: "missing-fields" });
    expect(listener).not.toHaveBeenCalled();
    expect(parseRealtimeEvent(null)).toBeNull();
    service.stop();
  });

  it("uses capped exponential reconnect and does not reconnect while suspended", async () => {
    const { service, sockets } = setup();
    await service.start("user-1:passenger");
    sockets[0].serverClose();
    expect(service.connectionState).toBe("reconnecting");
    jest.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);

    service.suspend();
    expect(service.connectionState).toBe("suspended");
    jest.advanceTimersByTime(30000);
    expect(sockets).toHaveLength(2);
    await service.resume();
    expect(sockets).toHaveLength(3);
    service.stop();
  });

  it("reports authentication rejection without entering a reconnect loop", async () => {
    const { service, sockets } = setup();
    const rejected = jest.fn();
    service.onAuthenticationFailure(rejected);
    await service.start("user-1:passenger");
    sockets[0].serverClose(4401);
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(service.connectionState).toBe("idle");
    jest.advanceTimersByTime(30000);
    expect(sockets).toHaveLength(1);
  });

  it("times out a connection that never becomes healthy", async () => {
    const { service, sockets } = setup();
    await service.start("user-1:passenger");
    await jest.advanceTimersByTimeAsync(60000);
    expect(sockets[0].close).toHaveBeenCalledWith(4000, "heartbeat_timeout");
    expect(service.connectionState).toBe("reconnecting");
    service.stop();
  });

  it("bounds per-resource version memory within a long authenticated session", async () => {
    const { service, sockets } = setup();
    await service.start("user-1:passenger");
    sockets[0].open();

    for (let index = 0; index < 2_050; index += 1) {
      sockets[0].message({
        ...event,
        event_id: `event-${index}`,
        resource_id: `resource-${index}`,
      });
    }

    const versions = (service as unknown as { resourceVersions: Map<string, number> }).resourceVersions;
    expect(versions.size).toBe(2_000);
    service.stop();
  });
});
