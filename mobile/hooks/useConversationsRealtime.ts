import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtime } from "../contexts/RealtimeContext";
import { getConversation, listConversations } from "../services/conversationService";
import type { Conversation } from "../types/conversation.types";
import { applyConversationEvent, authoritativeConversation, sortConversations } from "../utils/conversationRealtime";


export function useConversationsRealtime() {
  const { reconciliationRevision, subscribe } = useRealtime();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const conversationsRef = useRef<Conversation[]>([]);
  const mounted = useRef(true);
  const opened = useRef(false);
  const seenReconciliationRevision = useRef(reconciliationRevision);
  const listInFlight = useRef<Promise<void> | null>(null);
  const detailInFlight = useRef(new Map<string, Promise<void>>());

  const replace = useCallback((items: Conversation[]) => {
    const sorted = sortConversations(items);
    conversationsRef.current = sorted;
    setConversations(sorted);
  }, []);

  const acceptConversation = useCallback((incoming: Conversation) => {
    const index = conversationsRef.current.findIndex((item) => item.id === incoming.id);
    const accepted = authoritativeConversation(index >= 0 ? conversationsRef.current[index] : null, incoming);
    const next = index >= 0
      ? conversationsRef.current.map((item, itemIndex) => itemIndex === index ? accepted : item)
      : [accepted, ...conversationsRef.current];
    replace(next);
  }, [replace]);

  const reconcileConversation = useCallback((conversationId: string) => {
    const existing = detailInFlight.current.get(conversationId);
    if (existing) return existing;
    const request = getConversation(conversationId)
      .then((conversation) => { if (mounted.current) acceptConversation(conversation); })
      .catch((err) => console.warn("conversation_detail_reconciliation_failed", err))
      .finally(() => { detailInFlight.current.delete(conversationId); });
    detailInFlight.current.set(conversationId, request);
    return request;
  }, [acceptConversation]);

  const reconcile = useCallback(async (showError = false) => {
    if (listInFlight.current) return listInFlight.current;
    const request = (async () => {
      try {
        const items = await listConversations();
        if (!mounted.current) return;
        replace(items);
        setError("");
      } catch (err) {
        if (!mounted.current) return;
        if (showError || conversationsRef.current.length === 0) setError(err instanceof Error ? err.message : "Unable to load messages.");
        else console.warn("conversations_reconciliation_failed", err);
      } finally {
        if (mounted.current) setLoading(false);
        listInFlight.current = null;
      }
    })();
    listInFlight.current = request;
    return request;
  }, [replace]);

  useEffect(() => {
    mounted.current = true;
    opened.current = true;
    void reconcile(true);
    return () => { mounted.current = false; };
  }, [reconcile]);

  useEffect(() => subscribe((event) => {
    if (event.resource_type !== "conversation") return;
    const current = conversationsRef.current.find((item) => item.id === event.resource_id);
    if (!current) {
      if (event.type === "conversation.created" || event.type === "conversation.message_created" || event.type === "conversation.updated") {
        void reconcileConversation(event.resource_id);
      }
      return;
    }
    const result = applyConversationEvent(current, [], event);
    if (result.needsReconciliation) {
      void reconcileConversation(event.resource_id);
      return;
    }
    if (result.applied) acceptConversation(result.conversation);
  }), [acceptConversation, reconcileConversation, subscribe]);

  useEffect(() => {
    if (seenReconciliationRevision.current === reconciliationRevision) return;
    seenReconciliationRevision.current = reconciliationRevision;
    if (opened.current) void reconcile(false);
  }, [reconcile, reconciliationRevision]);

  return { conversations, loading, error, reconcile: () => reconcile(true) };
}
