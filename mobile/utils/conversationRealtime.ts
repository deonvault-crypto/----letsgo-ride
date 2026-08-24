import type { Conversation, TripMessage } from "../types/conversation.types";
import type { RealtimeEventEnvelope } from "../types/realtime.types";
import { decideRealtimeVersion, normalizeRealtimeVersion } from "./realtimeResource";


const CONVERSATION_EVENT_TYPES = new Set([
  "conversation.created",
  "conversation.message_created",
  "conversation.read_updated",
  "conversation.updated",
]);
const SUMMARY_FIELDS: Array<keyof Conversation> = [
  "status",
  "last_message",
  "last_message_at",
  "last_message_sender_id",
  "updated_at",
];

export type ConversationEventResult = {
  conversation: Conversation;
  messages: TripMessage[];
  message: TripMessage | null;
  applied: boolean;
  needsReconciliation: boolean;
};

export function applyConversationEvent(
  current: Conversation,
  currentMessages: TripMessage[],
  event: RealtimeEventEnvelope,
): ConversationEventResult {
  const ignored = { conversation: current, messages: currentMessages, message: null, applied: false, needsReconciliation: false };
  if (event.resource_type !== "conversation" || event.resource_id !== current.id || !CONVERSATION_EVENT_TYPES.has(event.type)) {
    return ignored;
  }
  const decision = decideRealtimeVersion(current.realtime_version, event);
  if (decision === "ignore") return ignored;
  if (decision === "reconcile") return { ...ignored, needsReconciliation: true };

  const conversation = { ...current, realtime_version: event.version } as Conversation;
  for (const field of SUMMARY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(event.payload, field)) {
      Object.assign(conversation, { [field]: event.payload[field] });
    }
  }

  let messages = currentMessages;
  let message: TripMessage | null = null;
  if (event.type === "conversation.message_created") {
    message = parseMessage(event.payload.message, current.id);
    if (!message) return { ...ignored, needsReconciliation: true };
    messages = appendMessage(currentMessages, message);
  } else if (event.type === "conversation.read_updated" && typeof event.payload.reader_user_id === "string") {
    messages = markMessagesRead(currentMessages, current, event.payload.reader_user_id);
  }
  return { conversation, messages, message, applied: true, needsReconciliation: false };
}

export function authoritativeConversation(current: Conversation | null, next: Conversation) {
  if (!current) return next;
  return normalizeRealtimeVersion(next.realtime_version) < normalizeRealtimeVersion(current.realtime_version) ? current : next;
}

export function applySentMessage(
  current: Conversation,
  currentMessages: TripMessage[],
  message: TripMessage,
): { conversation: Conversation; messages: TripMessage[] } {
  const responseVersion = normalizeRealtimeVersion(message.conversation_realtime_version);
  const currentVersion = normalizeRealtimeVersion(current.realtime_version);
  const conversation = responseVersion < currentVersion ? current : {
    ...current,
    realtime_version: responseVersion,
    last_message: message.body,
    last_message_at: message.created_at,
    last_message_sender_id: message.sender_id,
    updated_at: message.created_at,
  };
  return { conversation, messages: appendMessage(currentMessages, message) };
}

export function sortConversations(items: Conversation[]) {
  return [...items].sort((left, right) => conversationTime(right).localeCompare(conversationTime(left)));
}

export function markMessagesRead(messages: TripMessage[], conversation: Conversation, readerUserId: string) {
  if (readerUserId === conversation.driver_user_id) {
    return messages.map((message) => message.read_by_driver ? message : { ...message, read_by_driver: true });
  }
  if (readerUserId === conversation.passenger_id) {
    return messages.map((message) => message.read_by_passenger ? message : { ...message, read_by_passenger: true });
  }
  return messages;
}

export function isUnreadForConversationUser(message: TripMessage, conversation: Conversation, userId?: string) {
  if (!userId || message.sender_id === userId) return false;
  if (conversation.driver_user_id === userId) return message.read_by_driver !== true;
  if (conversation.passenger_id === userId) return message.read_by_passenger !== true;
  return false;
}

function appendMessage(messages: TripMessage[], message: TripMessage) {
  if (messages.some((item) => item.id === message.id)) return messages;
  return [...messages, message].sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function parseMessage(value: unknown, conversationId: string): TripMessage | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string"
    || item.conversation_id !== conversationId
    || typeof item.sender_id !== "string"
    || typeof item.body !== "string"
    || typeof item.created_at !== "string"
  ) return null;
  return {
    id: item.id,
    conversation_id: conversationId,
    sender_id: item.sender_id,
    body: item.body,
    created_at: item.created_at,
    read_by_driver: item.read_by_driver === true,
    read_by_passenger: item.read_by_passenger === true,
    system: item.system === true,
  };
}

function conversationTime(conversation: Conversation) {
  return conversation.last_message_at || conversation.updated_at || conversation.created_at || "";
}
