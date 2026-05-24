import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Avatar } from "../../components/ui/Avatar";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { listConversations } from "../../services/conversationService";
import { Conversation } from "../../types/conversation.types";

export default function MessagesScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setConversations(await listConversations());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load messages.");
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load, 10000);

  return (
    <Screen title="Messages" showBack fallbackRoute="/(shared)/profile" navRole="passenger">
      <Text style={styles.title}>Trip messages</Text>
      {loading ? <LoadingState label="Loading conversations..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && conversations.length === 0 ? (
        <EmptyState title="No messages yet" body="Trip conversations will appear after a seat request is created." />
      ) : null}
      {!loading && !error && conversations.map((conversation) => (
        <Pressable
          key={conversation.id}
          accessibilityRole="button"
          onPress={() => router.push(`/(shared)/conversation/${conversation.id}` as never)}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <Avatar name={conversation.other_user_name || "LetsGoRide user"} imageUri={conversation.other_user_profile_photo_url} size={46} />
          <View style={styles.copy}>
            <Text style={styles.name}>{conversation.other_user_name || "Trip conversation"}</Text>
            <Text style={styles.route}>{conversation.ride?.origin || "Ride"} to {conversation.ride?.destination || "destination"}</Text>
            <Text numberOfLines={1} style={styles.body}>{conversation.last_message || "No messages yet."}</Text>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 30,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: spacing.lg,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 17,
  },
  route: {
    color: colors.primaryGreen,
    fontWeight: "800",
  },
  body: {
    color: colors.mutedText,
  },
});

