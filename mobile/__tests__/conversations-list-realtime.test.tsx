import fs from "fs";
import path from "path";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useConversationsRealtime } from "../hooks/useConversationsRealtime";
import { getConversation, listConversations } from "../services/conversationService";
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
jest.mock("../services/conversationService", () => ({ getConversation: jest.fn(), listConversations: jest.fn() }));

const conversation = (id: string, version = 1, time = "2027-01-01T10:00:00+00:00") => ({
  id, ride_id: `ride-${id}`, request_id: `request-${id}`, driver_user_id: "driver-1", passenger_id: "passenger-1",
  status: "active", realtime_version: version, last_message: `Last ${id}`, last_message_at: time,
}) as any;
const event = (id: string, version: number, payload: Record<string, unknown>, type = "conversation.message_created"): RealtimeEventEnvelope => ({
  event_id: `event-${id}-${version}`, type, resource_type: "conversation", resource_id: id, version,
  occurred_at: "2027-01-01T11:00:00+00:00", payload: { conversation_id: id, realtime_version: version, ...payload },
});

describe("Messages list realtime lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListener = null;
    mockRevision = 0;
    (listConversations as jest.Mock).mockResolvedValue([
      conversation("conversation-1", 1, "2027-01-01T10:00:00+00:00"),
      conversation("conversation-2", 1, "2027-01-01T10:30:00+00:00"),
    ]);
    (getConversation as jest.Mock).mockImplementation(async (id: string) => conversation(id, 1, "2027-01-01T11:00:00+00:00"));
  });

  it("loads once with no ten-second polling", async () => {
    renderHook(() => useConversationsRealtime());
    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(1));
    const source = fs.readFileSync(path.join(__dirname, "../app/(shared)/messages.tsx"), "utf8");
    expect(source).not.toContain("useLiveRefresh");
  });

  it("updates preview and ordering locally without a list reload", async () => {
    const view = renderHook(() => useConversationsRealtime());
    await waitFor(() => expect(view.result.current.conversations).toHaveLength(2));
    act(() => mockListener?.(event("conversation-1", 2, {
      last_message: "Newest", last_message_at: "2027-01-01T12:00:00+00:00",
      message: { id: "message-2", conversation_id: "conversation-1", sender_id: "driver-1", body: "Newest", created_at: "2027-01-01T12:00:00+00:00" },
    })));
    expect(view.result.current.conversations[0].id).toBe("conversation-1");
    expect(view.result.current.conversations[0].last_message).toBe("Newest");
    expect(listConversations).toHaveBeenCalledTimes(1);
  });

  it("discovers a new conversation with one targeted fetch", async () => {
    const view = renderHook(() => useConversationsRealtime());
    await waitFor(() => expect(view.result.current.conversations).toHaveLength(2));
    act(() => mockListener?.(event("conversation-3", 1, {}, "conversation.created")));
    await waitFor(() => expect(getConversation).toHaveBeenCalledWith("conversation-3"));
    await waitFor(() => expect(view.result.current.conversations.some((item) => item.id === "conversation-3")).toBe(true));
    expect(listConversations).toHaveBeenCalledTimes(1);
  });

  it("ignores other resources and stale events", async () => {
    const view = renderHook(() => useConversationsRealtime());
    await waitFor(() => expect(view.result.current.conversations).toHaveLength(2));
    act(() => mockListener?.({ ...event("conversation-1", 2, { last_message: "Food" }), resource_type: "food_order" }));
    act(() => mockListener?.(event("conversation-1", 1, { last_message: "Stale" })));
    expect(view.result.current.conversations.find((item) => item.id === "conversation-1")?.last_message).toBe("Last conversation-1");
    expect(getConversation).not.toHaveBeenCalled();
  });

  it("uses targeted gap reconciliation and one list reconciliation on resume", async () => {
    const view = renderHook(() => useConversationsRealtime());
    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(1));
    (getConversation as jest.Mock).mockResolvedValue(conversation("conversation-1", 3, "2027-01-01T12:00:00+00:00"));
    act(() => mockListener?.(event("conversation-1", 3, { last_message: "Gap" })));
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(1));
    expect(listConversations).toHaveBeenCalledTimes(1);
    mockRevision = 1;
    view.rerender(undefined);
    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(2));
  });
});
