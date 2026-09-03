import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { supportEmail } from "../../constants/legal";
import { spacing } from "../../constants/spacing";
import { useScreenReconciliation } from "../../hooks/useScreenReconciliation";
import {
  getSupportThread,
  mySupportMessages,
  replyToSupportMessage,
  sendSupportMessage,
  SupportMessage,
  SupportThread,
} from "../../services/supportService";
import { formatStatus } from "../../utils/formatStatus";

const THREAD_REFRESH_MS = 5000;

export default function SupportScreen() {
  const params = useLocalSearchParams<{ subject?: string; product?: string; supportMessageId?: string }>();
  const initialSubject = params.subject === "Account details change" ? params.subject : "LetsGoRide support";
  const navRole = params.product === "driver" || params.product === "courier" || params.product === "merchant" ? params.product : "customer";
  const requestedMessageId = typeof params.supportMessageId === "string" ? params.supportMessageId : "";

  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(requestedMessageId || null);
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const threadRefreshInFlight = useRef(false);

  useEffect(() => {
    if (requestedMessageId) setSelectedMessageId(requestedMessageId);
  }, [requestedMessageId]);

  const loadMessages = useCallback(async () => {
    try {
      setMessages(await mySupportMessages());
    } catch {
      setMessages([]);
    }
  }, []);

  const loadThread = useCallback(async (messageId: string, silent = false) => {
    if (threadRefreshInFlight.current) return;
    threadRefreshInFlight.current = true;
    if (!silent) setThreadLoading(true);
    try {
      const nextThread = await getSupportThread(messageId);
      setThread(nextThread);
      setThreadError("");
      setMessages((current) => current.map((item) => (
        item.id === messageId
          ? { ...item, subject: nextThread.subject || item.subject, status: nextThread.status }
          : item
      )));
    } catch (err) {
      if (!silent) {
        setThreadError(err instanceof Error ? err.message : "Unable to load this support conversation.");
      }
    } finally {
      if (!silent) setThreadLoading(false);
      threadRefreshInFlight.current = false;
    }
  }, []);

  useScreenReconciliation(loadMessages);

  useFocusEffect(useCallback(() => {
    if (!selectedMessageId) return undefined;

    void loadThread(selectedMessageId);
    const interval = setInterval(() => {
      void loadThread(selectedMessageId, true);
    }, THREAD_REFRESH_MS);

    return () => clearInterval(interval);
  }, [loadThread, selectedMessageId]));

  async function submit() {
    try {
      setSaving(true);
      setError("");
      const created = await sendSupportMessage({ subject, message: message.trim() });
      setMessage("");
      setMessages((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectedMessageId(created.id);
      setThread(null);
      setThreadError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send support message.");
    } finally {
      setSaving(false);
    }
  }

  async function sendReply() {
    if (!selectedMessageId || !reply.trim()) return;
    try {
      setSendingReply(true);
      setThreadError("");
      const created = await replyToSupportMessage(selectedMessageId, reply.trim());
      setReply("");
      setThread((current) => current ? {
        ...current,
        status: current.status === "resolved" || current.status === "closed" ? "received" : current.status,
        items: [...current.items.filter((item) => item.id !== created.id), created],
      } : current);
      await loadMessages();
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : "Unable to send your reply.");
    } finally {
      setSendingReply(false);
    }
  }

  async function refreshScreen() {
    await loadMessages();
    if (selectedMessageId) await loadThread(selectedMessageId, true);
  }

  function openConversation(messageId: string) {
    setSelectedMessageId(messageId);
    setThread(null);
    setThreadError("");
    setReply("");
  }

  function closeConversation() {
    setSelectedMessageId(null);
    setThread(null);
    setThreadError("");
    setReply("");
  }

  return (
    <Screen title="Support" showBack fallbackRoute="/(shared)/account" navRole={navRole} refreshing={false} onRefresh={refreshScreen}>
      <Text style={styles.title}>Support</Text>

      {selectedMessageId ? (
        <View style={styles.threadScreen}>
          <AppButton title="All support requests" variant="secondary" onPress={closeConversation} />

          {threadLoading && !thread ? <LoadingState label="Loading conversation..." /> : null}
          {threadError ? <ErrorState message={threadError} onRetry={() => loadThread(selectedMessageId)} /> : null}

          {thread ? (
            <>
              <View style={styles.threadHeader}>
                <View style={styles.threadHeaderCopy}>
                  <Text style={styles.threadTitle}>{thread.subject || "LetsGoRide support"}</Text>
                  <Text style={styles.threadMeta}>Chat with LetsGoRide Support</Text>
                </View>
                <StatusBadge label={formatStatus(thread.status)} tone="success" />
              </View>

              <View style={styles.transcript}>
                {thread.items.map((item) => {
                  const mine = item.sender_type === "customer";
                  return (
                    <View key={item.id} style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowSupport]}>
                      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleSupport]}>
                        <Text style={[styles.sender, mine && styles.textOnGreen]}>
                          {mine ? "You" : item.sender_name || "LetsGoRide Support"}
                        </Text>
                        <Text style={[styles.bubbleText, mine && styles.textOnGreen]}>{item.message}</Text>
                        {item.created_at ? (
                          <Text style={[styles.time, mine && styles.timeOnGreen]}>{formatTime(item.created_at)}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>

              <Text style={styles.replyLabel}>Reply</Text>
              <AppInput
                label="Message"
                value={reply}
                onChangeText={setReply}
                placeholder="Type a message to support..."
                multiline
              />
              <AppButton
                title="Send reply"
                loading={sendingReply}
                onPress={sendReply}
                disabled={!reply.trim()}
              />
              <Text style={styles.autoRefresh}>Replies from support appear here automatically while this conversation is open.</Text>
            </>
          ) : null}
        </View>
      ) : (
        <>
          <Text style={styles.body}>
            Message LetsGoRide support for Ride, Food, Courier, account, payment, safety, or delivery help. You can also reach us at {supportEmail}.
          </Text>
          <AppInput label="Subject" value={subject} onChangeText={setSubject} />
          <AppInput label="Message" value={message} onChangeText={setMessage} placeholder="How can we help?" multiline />
          {error ? <ErrorState message={error} /> : null}
          <AppButton title="Start conversation" loading={saving} onPress={submit} disabled={message.trim().length < 5} />

          <Text style={styles.sectionTitle}>Your support conversations</Text>
          {messages.length === 0 ? (
            <EmptyState title="No support conversations yet" body="Messages you send to LetsGoRide support will appear here." />
          ) : messages.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Open support conversation: ${item.subject}`}
              onPress={() => openConversation(item.id)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.cardTopRow}>
                <Text style={styles.cardTitle}>{item.subject}</Text>
                <StatusBadge label={formatStatus(item.status)} tone="success" />
              </View>
              <Text style={styles.body} numberOfLines={2}>{item.message}</Text>
              <Text style={styles.openHint}>Open conversation →</Text>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 30,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 20,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
    borderColor: colors.primaryGreen,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  cardTitle: {
    flex: 1,
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 17,
  },
  openHint: {
    color: colors.primaryGreen,
    fontWeight: "900",
    fontSize: 13,
  },
  threadScreen: {
    gap: spacing.md,
  },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  threadHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  threadTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 19,
  },
  threadMeta: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
  },
  transcript: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  bubbleRow: {
    width: "100%",
    flexDirection: "row",
  },
  bubbleRowMine: {
    justifyContent: "flex-end",
  },
  bubbleRowSupport: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 6,
  },
  bubbleMine: {
    backgroundColor: colors.primaryGreen,
    borderBottomRightRadius: 6,
  },
  bubbleSupport: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
  },
  sender: {
    color: colors.primaryGreen,
    fontWeight: "900",
    fontSize: 12,
  },
  bubbleText: {
    color: colors.whiteText,
    lineHeight: 21,
    fontSize: 15,
  },
  textOnGreen: {
    color: colors.whiteText,
  },
  time: {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: "700",
  },
  timeOnGreen: {
    color: "rgba(255,255,255,0.8)",
  },
  replyLabel: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 18,
    marginTop: spacing.sm,
  },
  autoRefresh: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
