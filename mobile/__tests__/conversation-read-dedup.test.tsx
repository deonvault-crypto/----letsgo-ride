import fs from "fs";
import path from "path";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useConversationRealtime } from "../hooks/useConversationRealtime";
import { getConversation, getConversationMessages, markConversationRead } from "../services/conversationService";
import type { RealtimeEventEnvelope } from "../types/realtime.types";

let mockListener: ((event: RealtimeEventEnvelope) => void) | null = null;
let mockRevision = 0;

jest.mock("../contexts/RealtimeContext", () => ({
  useRealtime: () => ({
    reconciliationRevision: mockRevision,
    subscribe: (next: (event: RealtimeEventEnvelope) => void) => {
      mockListener = next;
      return jest.fn();
    },
  }),
}));
jest.mock("../services/conversationService", () => ({
  getConversation: jest.fn(),
  getConversationMessages: jest.fn(),
  markConversationRead: jest.fn(),
}));

const conversation = (overrides: Record<string, unknown> = {}) => ({
  id: "conversation-1", ride_id: "ride-1", request_id: "request-1",
  driver_user_id: "driver-1", passenger_id: "passenger-1", status: "active",
  realtime_version: 1, ...overrides,
}) as any;
const message = (id: string, sender = "driver-1", overrides: Record<string, unknown> = {}) => ({
  id, conversation_id: "conversation-1", sender_id: sender, body: `Message ${id}`,
  created_at: `2027-01-01T10:0${id.slice(-1)}:00+00:00`,
  read_by_driver: sender === "driver-1", read_by_passenger: sender === "passenger-1", ...overrides,
}) as any;
const event = (version: number, payload: Record<string, unknown>, resourceId = "conversation-1", type = "conversation.message_created"): RealtimeEventEnvelope => ({
  event_id: `event-${version}-${resourceId}`, type, resource_type: "conversation", resource_id: resourceId,
  version, occurred_at: "2027-01-01T10:05:00+00:00",
  payload: { conversation_id: resourceId, realtime_version: version, ...payload },
});

describe("conversation thread realtime lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListener = null;
    mockRevision = 0;
    (getConversation as jest.Mock).mockResolvedValue(conversation());
    (getConversationMessages as jest.Mock).mockResolvedValue([]);
    (markConversationRead as jest.Mock).mockResolvedValue({ read: true, changed: 1, conversation_realtime_version: 3 });
  });

  it("loads one initial snapshot and history with no polling timer", async () => {
    renderHook(() => useConversationRealtime("conversation-1", "passenger-1"));
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(1));
    expect(getConversationMessages).toHaveBeenCalledTimes(1);
    const source = fs.readFileSync(path.join(__dirname, "../app/(shared)/conversation/[id].tsx"), "utf8");
    expect(source).not.toContain("useLiveRefresh");
    expect(source).not.toContain("await load()");
    expect(source).toContain("acceptSentMessage(message)");
  });

  it("appends incoming content and marks it read once while ignoring stale, duplicate, and unrelated events", async () => {
    const view = renderHook(() => useConversationRealtime("conversation-1", "passenger-1"));
    await waitFor(() => expect(view.result.current.conversation).not.toBeNull());
    const incoming = message("message-2");
    act(() => mockListener?.(event(2, { message: incoming, last_message: incoming.body, last_message_at: incoming.created_at })));
    await waitFor(() => expect(markConversationRead).toHaveBeenCalledTimes(1));
    expect(view.result.current.messages).toHaveLength(1);
    act(() => {
      mockListener?.(event(2, { message: incoming }));
      mockListener?.(event(3, { message: message("other") }, "conversation-other"));
    });
    expect(view.result.current.messages).toHaveLength(1);
    expect(markConversationRead).toHaveBeenCalledTimes(1);
  });

  it("reconciles once for a version gap and once after reconnect", async () => {
    const view = renderHook(() => useConversationRealtime("conversation-1", "passenger-1"));
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(1));
    (getConversation as jest.Mock).mockResolvedValue(conversation({ realtime_version: 3 }));
    act(() => mockListener?.(event(3, { message: message("message-3") })));
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(2));
    mockRevision = 1;
    view.rerender(undefined);
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(3));
    expect(getConversationMessages).toHaveBeenCalledTimes(3);
  });

  it("appends a successful REST send and deduplicates its realtime echo without a reload", async () => {
    const view = renderHook(() => useConversationRealtime("conversation-1", "passenger-1"));
    await waitFor(() => expect(view.result.current.conversation).not.toBeNull());
    const sent = message("message-2", "passenger-1", { conversation_realtime_version: 2 });
    act(() => view.result.current.acceptSentMessage(sent));
    act(() => mockListener?.(event(2, { message: sent, last_message: sent.body })));
    expect(view.result.current.messages).toHaveLength(1);
    expect(getConversation).toHaveBeenCalledTimes(1);
    expect(getConversationMessages).toHaveBeenCalledTimes(1);
  });

  it("applies read receipts to local message flags", async () => {
    (getConversationMessages as jest.Mock).mockResolvedValue([message("message-1", "passenger-1", { read_by_driver: false })]);
    const view = renderHook(() => useConversationRealtime("conversation-1", "passenger-1"));
    await waitFor(() => expect(view.result.current.messages).toHaveLength(1));
    act(() => mockListener?.(event(2, { reader_user_id: "driver-1" }, "conversation-1", "conversation.read_updated")));
    expect(view.result.current.messages[0].read_by_driver).toBe(true);
  });
});
