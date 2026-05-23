import { requestData } from "./api";

export type SupportMessage = {
  id: string;
  subject: string;
  message: string;
  status: string;
  created_at?: string;
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
