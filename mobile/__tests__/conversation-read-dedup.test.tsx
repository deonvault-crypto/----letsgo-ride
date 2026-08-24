import { act, render, waitFor } from "@testing-library/react-native";

import ConversationScreen from "../app/(shared)/conversation/[id]";
import { getConversation, getConversationMessages, markConversationRead } from "../services/conversationService";
import { passengerUser } from "./fixtures";

let mockRefreshCallback: (() => Promise<void>) | null = null;

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "conversation-1" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useSegments: () => ["(shared)", "conversation", "conversation-1"],
}));

jest.mock("../hooks/useCurrentUser", () => {
  const { passengerUser: mockPassengerUser } = require("./fixtures");
  return { useCurrentUser: () => ({ user: mockPassengerUser }) };
});
jest.mock("../hooks/useLiveRefresh", () => ({
  useLiveRefresh: (callback: () => Promise<void>) => {
    mockRefreshCallback = callback;
  },
}));
jest.mock("../services/conversationService", () => ({
  getConversation: jest.fn(),
  getConversationMessages: jest.fn(),
  markConversationRead: jest.fn(),
  sendConversationMessage: jest.fn(),
}));

describe("conversation read lifecycle", () => {
  it("marks newly fetched unread messages once, not on every poll", async () => {
    (getConversation as jest.Mock).mockResolvedValue({
      id: "conversation-1",
      ride_id: "ride-1",
      request_id: "request-1",
      driver_user_id: "driver-1",
      passenger_id: passengerUser.id,
      status: "active",
    });
    (getConversationMessages as jest.Mock).mockResolvedValue([{
      id: "message-1",
      conversation_id: "conversation-1",
      sender_id: "driver-1",
      body: "Hello",
      created_at: "2026-08-24T10:00:00Z",
      read_by_driver: true,
      read_by_passenger: false,
    }]);
    (markConversationRead as jest.Mock).mockResolvedValue({ read: true });

    render(<ConversationScreen />);
    await act(async () => { await mockRefreshCallback?.(); });
    await waitFor(() => expect(markConversationRead).toHaveBeenCalledTimes(1));
    await act(async () => { await mockRefreshCallback?.(); });
    expect(markConversationRead).toHaveBeenCalledTimes(1);
  });
});
