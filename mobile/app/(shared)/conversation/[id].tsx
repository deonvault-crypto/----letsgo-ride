import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AppButton } from "../../../components/ui/AppButton";
import { AppInput } from "../../../components/ui/AppInput";
import { Avatar } from "../../../components/ui/Avatar";
import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { Screen } from "../../../components/ui/Screen";
import { colors } from "../../../constants/colors";
import { spacing } from "../../../constants/spacing";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { useLiveRefresh } from "../../../hooks/useLiveRefresh";
import {
  getConversation,
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
} from "../../../services/conversationService";
import { Conversation, TripMessage } from "../../../types/conversation.types";

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useCurrentUser();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError("");
      const [conversationData, messageData] = await Promise.all([
        getConversation(id),
        getConversationMessages(id),
      ]);
      setConversation(conversationData);
      setMessages(messageData);
      await markConversationRead(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load conversation.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useLiveRefresh(load, 7000);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    if (!id || !body.trim()) return;
    try {
      setSending(true);
      setError("");
      await sendConversationMessage(id, body);
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen title="Messages" showBack fallbackRoute="/(shared)/messages" navRole={user?.role === "driver" ? "driver" : "passenger"}>
      {loading ? <LoadingState label="Loading messages..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && conversation ? (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
          <View style={styles.headerCard}>
            <Avatar name={conversation.other_user_name || "User"} imageUri={conversation.other_user_profile_photo_url} size={50} />
            <View style={styles.copy}>
              <Text style={styles.title}>{conversation.other_user_name || "Trip conversation"}</Text>
              <Text style={styles.body}>{conversation.ride?.origin || "Ride"} to {conversation.ride?.destination || "destination"}</Text>
            </View>
          </View>
          <View style={styles.messages}>
            {messages.length === 0 ? <Text style={styles.empty}>No messages yet. Keep pickup details inside LetsGoRide.</Text> : null}
            {messages.map((message) => {
              const mine = message.sender_id === user?.id;
              return (
                <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={[styles.messageText, mine && styles.mineText]}>{message.body}</Text>
                  <Text style={[styles.time, mine && styles.mineTime]}>{formatTime(message.created_at)}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.composer}>
            <AppInput label="Message" value={body} onChangeText={setBody} placeholder="Write a trip message" multiline />
            <AppButton title="Send message" loading={sending} disabled={!body.trim()} onPress={send} />
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </Screen>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  copy: {
    flex: 1,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 20,
  },
  body: {
    color: colors.mutedText,
  },
  messages: {
    gap: spacing.sm,
  },
  empty: {
    color: colors.mutedText,
    textAlign: "center",
    padding: spacing.lg,
  },
  bubble: {
    maxWidth: "84%",
    borderRadius: 20,
    padding: spacing.md,
    gap: 4,
  },
  mine: {
    alignSelf: "flex-end",
    backgroundColor: colors.primaryGreen,
  },
  theirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    color: colors.whiteText,
    lineHeight: 21,
  },
  mineText: {
    color: colors.card,
    fontWeight: "700",
  },
  time: {
    color: colors.mutedText,
    fontSize: 11,
  },
  mineTime: {
    color: "rgba(255,255,255,0.8)",
  },
  composer: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
});

