import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtime } from "../contexts/RealtimeContext";
import { getConversation, getConversationMessages, markConversationRead } from "../services/conversationService";
import type { Conversation, TripMessage } from "../types/conversation.types";
import {
  applyConversationEvent,
  applySentMessage,
  authoritativeConversation,
  isUnreadForConversationUser,
  markMessagesRead,
} from "../utils/conversationRealtime";


export function useConversationRealtime(conversationId: string | undefined, userId: string | undefined) {
  const { reconciliationRevision, subscribe } = useRealtime();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const conversationRef = useRef<Conversation | null>(null);
  const messagesRef = useRef<TripMessage[]>([]);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const mounted = useRef(true);
  const opened = useRef(false);
  const seenReconciliationRevision = useRef(reconciliationRevision);
  const snapshotInFlight = useRef<{ id: string; key: object; promise: Promise<void> } | null>(null);
  const readInFlight = useRef(false);
  const lastReadMessageId = useRef<string | null>(null);
  const readRunner = useRef<() => Promise<void>>(async () => undefined);

  const acceptConversation = useCallback((next: Conversation) => {
    const accepted = authoritativeConversation(conversationRef.current, next);
    conversationRef.current = accepted;
    setConversation(accepted);
    return accepted;
  }, []);

  const performRead = useCallback(async () => {
    const currentConversation = conversationRef.current;
    if (!conversationId || !currentConversation || !userId || readInFlight.current) return;
    const latestUnread = [...messagesRef.current].reverse().find((message) => isUnreadForConversationUser(message, currentConversation, userId));
    if (!latestUnread || lastReadMessageId.current === latestUnread.id) return;
    readInFlight.current = true;
    const requestedMessageId = latestUnread.id;
    try {
      const result = await markConversationRead(conversationId);
      if (!mounted.current || conversationIdRef.current !== conversationId) return;
      lastReadMessageId.current = requestedMessageId;
      const nextMessages = markMessagesRead(messagesRef.current, currentConversation, userId);
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      const nextConversation = {
        ...conversationRef.current as Conversation,
        realtime_version: Math.max(
          Number(conversationRef.current?.realtime_version || 0),
          Number(result.conversation_realtime_version || 0),
        ),
      };
      conversationRef.current = nextConversation;
      setConversation(nextConversation);
    } catch (err) {
      console.warn("conversation_mark_read_failed", err);
    } finally {
      readInFlight.current = false;
      const newestUnread = [...messagesRef.current].reverse().find((message) => isUnreadForConversationUser(message, conversationRef.current as Conversation, userId));
      if (newestUnread && newestUnread.id !== requestedMessageId) void readRunner.current();
    }
  }, [conversationId, userId]);
  readRunner.current = performRead;

  const reconcile = useCallback(async (showError = false) => {
    if (!conversationId) return;
    if (snapshotInFlight.current?.id === conversationId) return snapshotInFlight.current.promise;
    const key = {};
    const request = (async () => {
      try {
        const [nextConversation, nextMessages] = await Promise.all([
          getConversation(conversationId),
          getConversationMessages(conversationId),
        ]);
        if (!mounted.current || conversationIdRef.current !== conversationId) return;
        acceptConversation(nextConversation);
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
        setError("");
        void readRunner.current();
      } catch (err) {
        if (!mounted.current || conversationIdRef.current !== conversationId) return;
        if (showError || !conversationRef.current) setError(err instanceof Error ? err.message : "Unable to load conversation.");
        else console.warn("conversation_reconciliation_failed", err);
      } finally {
        if (mounted.current && conversationIdRef.current === conversationId) setLoading(false);
        if (snapshotInFlight.current?.key === key) snapshotInFlight.current = null;
      }
    })();
    snapshotInFlight.current = { id: conversationId, key, promise: request };
    return request;
  }, [acceptConversation, conversationId]);

  useEffect(() => {
    mounted.current = true;
    opened.current = Boolean(conversationId);
    conversationRef.current = null;
    messagesRef.current = [];
    lastReadMessageId.current = null;
    setConversation(null);
    setMessages([]);
    setError("");
    setLoading(Boolean(conversationId));
    if (conversationId) void reconcile(true);
    return () => { mounted.current = false; };
  }, [conversationId, reconcile]);

  useEffect(() => subscribe((event) => {
    const current = conversationRef.current;
    if (!current || event.resource_type !== "conversation" || event.resource_id !== conversationId) return;
    const result = applyConversationEvent(current, messagesRef.current, event);
    if (result.needsReconciliation) {
      void reconcile(false);
      return;
    }
    if (!result.applied) return;
    conversationRef.current = result.conversation;
    messagesRef.current = result.messages;
    setConversation(result.conversation);
    setMessages(result.messages);
    if (result.message && result.message.sender_id !== userId) void readRunner.current();
  }), [conversationId, reconcile, subscribe, userId]);

  useEffect(() => {
    if (seenReconciliationRevision.current === reconciliationRevision) return;
    seenReconciliationRevision.current = reconciliationRevision;
    if (opened.current) void reconcile(false);
  }, [reconcile, reconciliationRevision]);

  const acceptSentMessage = useCallback((message: TripMessage) => {
    const current = conversationRef.current;
    if (!current) return;
    const next = applySentMessage(current, messagesRef.current, message);
    conversationRef.current = next.conversation;
    messagesRef.current = next.messages;
    setConversation(next.conversation);
    setMessages(next.messages);
  }, []);

  return { conversation, messages, loading, error, setError, acceptSentMessage, reconcile: () => reconcile(true) };
}
