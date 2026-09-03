import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Animated, StyleSheet } from "react-native";

import SupportScreen from "../app/(shared)/support";
import { getSupportThread, mySupportMessages, replyToSupportMessage } from "../services/supportService";

let mockListener: (event: unknown) => void;
let mockParams = { supportMessageId: "support-1" };
const mockSubscribe = (listener: typeof mockListener) => { mockListener = listener; return jest.fn(); };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) => { const React = require("react"); React.useEffect(callback, [callback]); },
}));
jest.mock("../components/ui/Screen", () => ({ Screen: ({ children }: any) => children }));
jest.mock("../hooks/useScreenReconciliation", () => ({
  useScreenReconciliation: (callback: () => void) => { const React = require("react"); React.useEffect(() => { void callback(); }, [callback]); },
}));
jest.mock("../contexts/RealtimeContext", () => ({ useRealtime: () => ({ reconciliationRevision: 0, subscribe: mockSubscribe }) }));
jest.mock("../hooks/useMotionSettings", () => ({ useMotionSettings: () => ({ canAnimate: true }) }));
jest.mock("../services/supportService", () => ({ getSupportThread: jest.fn(), mySupportMessages: jest.fn(), replyToSupportMessage: jest.fn(), sendSupportMessage: jest.fn() }));

const original = { id: "item-1", support_message_id: "support-1", sender_type: "customer", message: "Please help with this ride." };
const staffReply = { id: "item-2", support_message_id: "support-1", sender_type: "staff", message: "I can help you with that." };
const thread = (items: unknown[]) => ({ support_message_id: "support-1", subject: "Ride support", status: "in_review", items });
const replyEvent = { resource_type: "support_message", resource_id: "support-1" };
const motionCalls = () => (Animated.timing as jest.Mock).mock.calls.filter(([, config]) => config.duration === 180);

describe("support message motion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { supportMessageId: "support-1" };
    (mySupportMessages as jest.Mock).mockResolvedValue([]);
    (getSupportThread as jest.Mock).mockResolvedValue(thread([original]));
    jest.spyOn(Animated, "timing").mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
  });
  afterEach(() => jest.restoreAllMocks());

  it("shows history immediately, animates one new reply and ignores duplicate refreshes", async () => {
    const view = render(<SupportScreen />);
    await view.findByText(original.message);
    expect(motionCalls()).toHaveLength(0);
    expect(StyleSheet.flatten(view.getByText(original.message).props.style).color).toBe("#FFFFFF");
    (getSupportThread as jest.Mock).mockResolvedValue(thread([original, staffReply]));
    act(() => mockListener(replyEvent));
    await view.findByText(staffReply.message);
    expect(motionCalls()).toHaveLength(1);
    act(() => mockListener(replyEvent));
    await waitFor(() => expect(getSupportThread).toHaveBeenCalledTimes(3));
    expect(view.getAllByText(staffReply.message)).toHaveLength(1);
    expect(motionCalls()).toHaveLength(1);
  });

  it("preserves the draft on failure and keeps confirmed follow-up replies in the same thread", async () => {
    const view = render(<SupportScreen />);
    await view.findByText(original.message);
    fireEvent.changeText(view.getByLabelText("Message"), "Here is a follow-up.");
    (replyToSupportMessage as jest.Mock).mockRejectedValueOnce(new Error("Connection lost"));
    fireEvent.press(view.getByRole("button", { name: "Send reply" }));
    await view.findByText("Connection lost");
    expect(view.getByDisplayValue("Here is a follow-up.")).toBeOnTheScreen();
    expect(motionCalls()).toHaveLength(0);
    (replyToSupportMessage as jest.Mock).mockResolvedValue({ ...original, id: "item-3", message: "Here is a follow-up." });
    fireEvent.press(view.getByRole("button", { name: "Send reply" }));
    await view.findByText("Here is a follow-up.");
    expect(replyToSupportMessage).toHaveBeenLastCalledWith("support-1", "Here is a follow-up.");
    expect(view.getByLabelText("Message").props.value).toBe("");
    expect(motionCalls()).toHaveLength(1);
  });

  it("does not animate historical messages when a notification opens a different conversation", async () => {
    const view = render(<SupportScreen />);
    await view.findByText(original.message);
    (getSupportThread as jest.Mock).mockResolvedValue({ support_message_id: "support-2", subject: "Other request", status: "received", items: [{ ...staffReply, id: "other-1", support_message_id: "support-2" }] });
    mockParams = { supportMessageId: "support-2" };
    view.rerender(<SupportScreen />);
    await view.findByText("Other request");
    expect(view.getByText(staffReply.message)).toBeOnTheScreen();
    expect(motionCalls()).toHaveLength(0);
  });
});
