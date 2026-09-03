import { requestData } from "./api";

export type SupportMessage = {
  id: string;
  subject: string;
  message: string;
  status: string;
  created_at?: string;
};

export type SupportThreadItem = {
  id: string;
  support_message_id: string;
  sender_type: "customer" | "staff";
  sender_user_id?: string | null;
  sender_name?: string | null;
  sender_ops_role?: string | null;
  message: string;
  is_internal?: boolean;
  created_at?: string | null;
  synthetic?: boolean;
};

export type SupportThread = {
  support_message_id: string;
  subject?: string | null;
  status: string;
  items: SupportThreadItem[];
};

export async function sendSupportMessage(data: {
  subject: string;
  message: string;
  phone?: string;
}) {
  return requestData<SupportMessage>({
    method: "POST",
    url: "/support/messages",
    data,
  });
}

export async function mySupportMessages() {
  return requestData<SupportMessage[]>({
    method: "GET",
    url: "/support/messages/my",
  });
}

export async function getSupportThread(messageId: string) {
  return requestData<SupportThread>({
    method: "GET",
    url: `/support/messages/${encodeURIComponent(messageId)}/thread`,
  });
}

export async function replyToSupportMessage(messageId: string, message: string) {
  return requestData<SupportThreadItem>({
    method: "POST",
    url: `/support/messages/${encodeURIComponent(messageId)}/replies`,
    data: { message },
  });
}
