import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { supportEmail } from "../../constants/legal";
import { spacing } from "../../constants/spacing";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { mySupportMessages, sendSupportMessage, SupportMessage } from "../../services/supportService";
import { formatStatus } from "../../utils/formatStatus";

export default function SupportScreen() {
  const params = useLocalSearchParams<{ subject?: string; message?: string }>();
  const [subject, setSubject] = useState(params.subject || "LetsGoRide support");
  const [message, setMessage] = useState(params.message || "");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadMessages = useCallback(async () => {
    try {
      setMessages(await mySupportMessages());
    } catch {
      setMessages([]);
    }
  }, []);

  useLiveRefresh(loadMessages);

  async function submit() {
    try {
      setSaving(true);
      setError("");
      await sendSupportMessage({ subject, message });
      setMessage("");
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send support message.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Support" showBack fallbackRoute="/(shared)/account" navRole="customer">
      <Text style={styles.title}>How can we help?</Text>
      <Text style={styles.body}>Get help with Ride, Food, Courier, your account, payments or safety. You can also reach us at {supportEmail}.</Text>
      <AppInput label="Subject" value={subject} onChangeText={setSubject} />
      <AppInput label="Message" value={message} onChangeText={setMessage} placeholder="Tell us what happened" multiline />
      {error ? <ErrorState message={error} /> : null}
      <AppButton title="Send message" loading={saving} onPress={submit} disabled={message.trim().length < 5} />
      <Text style={styles.sectionTitle}>Your support requests</Text>
      {messages.length === 0 ? (
        <EmptyState title="No support requests yet" body="Messages you send to LetsGoRide support will appear here." />
      ) : messages.map((item) => (
        <View key={item.id} style={styles.card}>
          <StatusBadge label={formatStatus(item.status)} tone="success" />
          <Text style={styles.cardTitle}>{item.subject}</Text>
          <Text style={styles.body}>{item.message}</Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.whiteText, fontWeight: "900", fontSize: 30 },
  body: { color: colors.mutedText, lineHeight: 22 },
  sectionTitle: { color: colors.whiteText, fontWeight: "900", fontSize: 20, marginTop: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { color: colors.whiteText, fontWeight: "900", fontSize: 17 },
});
