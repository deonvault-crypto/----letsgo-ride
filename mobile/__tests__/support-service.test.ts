import {
  getSupportThread,
  mySupportMessages,
  replyToSupportMessage,
  sendSupportMessage,
} from "../services/supportService";

const mockRequestData = jest.fn();

jest.mock("../services/api", () => ({
  requestData: (...args: unknown[]) => mockRequestData(...args),
}));

describe("customer support service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("preserves the existing support ticket endpoints", async () => {
    mockRequestData.mockResolvedValueOnce({ id: "support-1" });
    mockRequestData.mockResolvedValueOnce([]);

    await sendSupportMessage({ subject: "Ride support", message: "Please help with my ride." });
    await mySupportMessages();

    expect(mockRequestData).toHaveBeenNthCalledWith(1, {
      method: "POST",
      url: "/support/messages",
      data: { subject: "Ride support", message: "Please help with my ride." },
    });
    expect(mockRequestData).toHaveBeenNthCalledWith(2, {
      method: "GET",
      url: "/support/messages/my",
    });
  });

  it("loads and replies to the same support conversation", async () => {
    mockRequestData.mockResolvedValueOnce({
      support_message_id: "support-1",
      subject: "Ride support",
      status: "in_review",
      items: [],
    });
    mockRequestData.mockResolvedValueOnce({
      id: "reply-1",
      support_message_id: "support-1",
      sender_type: "customer",
      message: "Thanks, I have one more detail.",
    });

    await getSupportThread("support-1");
    await replyToSupportMessage("support-1", "Thanks, I have one more detail.");

    expect(mockRequestData).toHaveBeenNthCalledWith(1, {
      method: "GET",
      url: "/support/messages/support-1/thread",
    });
    expect(mockRequestData).toHaveBeenNthCalledWith(2, {
      method: "POST",
      url: "/support/messages/support-1/replies",
      data: { message: "Thanks, I have one more detail." },
    });
  });

  it("encodes support ids before placing them in request paths", async () => {
    mockRequestData.mockResolvedValue({ items: [] });

    await getSupportThread("support/id");

    expect(mockRequestData).toHaveBeenCalledWith({
      method: "GET",
      url: "/support/messages/support%2Fid/thread",
    });
  });
});
