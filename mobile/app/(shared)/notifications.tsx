import { StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../components/states/EmptyState";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

export default function NotificationsScreen() {
  return (
    <Screen title="Notifications" showBack fallbackRoute="/(shared)/profile" navRole="passenger">
      <Text style={styles.title}>Notifications</Text>
      <View style={styles.card}>
        <Text style={styles.body}>Trip confirmations, request updates, and support responses will appear here.</Text>
      </View>
      <EmptyState title="No notifications" body="You are all caught up for now." />
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
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
});
