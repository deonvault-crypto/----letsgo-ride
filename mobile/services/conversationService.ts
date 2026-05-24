import { Conversation, TripMessage } from "../types/conversation.types";
import { requestData } from "./api";

export async function listConversations() {
  return requestData<Conversation[]>({ method: "GET", url: "/conversations" });
}

export async function getConversation(id: string) {
  return requestData<Conversation>({ method: "GET", url: `/conversations/${id}` });
}

export async function getConversationMessages(id: string) {
  return requestData<TripMessage[]>({ method: "GET", url: `/conversations/${id}/messages` });
}

export async function sendConversationMessage(id: string, body: string) {
  return requestData<TripMessage>({
    method: "POST",
    url: `/conversations/${id}/messages`,
    data: { body },
  });
}

export async function markConversationRead(id: string) {
  return requestData<{ read: boolean }>({ method: "POST", url: `/conversations/${id}/read` });
}

