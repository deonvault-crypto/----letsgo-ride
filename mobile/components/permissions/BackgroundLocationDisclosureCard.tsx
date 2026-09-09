import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { v2Theme } from "../../constants/v2Theme";

type BackgroundLocationDisclosureCardProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  eyebrow: string;
  title: string;
  body: string;
  message?: string | null;
  primaryLabel: string;
  busy: boolean;
  onPrimary: () => void;
  onDismiss: () => void;
};

export function BackgroundLocationDisclosureCard({
  icon,
  eyebrow,
  title,
  body,
  message,
  primaryLabel,
  busy,
  onPrimary,
  onDismiss,
}: BackgroundLocationDisclosureCardProps) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.card, { bottom: Math.max(insets.bottom, 10) + 78 }]}>
        <View style={styles.icon}>
          <MaterialCommunityIcons name={icon} size={22} color="#111111" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onPrimary}
              style={[styles.primary, busy && styles.disabled]}
            >
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onDismiss}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: 12,
    right: 12,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.99)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.13)",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  icon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: "#F0F0ED",
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 4 },
  eyebrow: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  title: { color: v2Theme.colors.ink, fontSize: 14, lineHeight: 18, fontWeight: "900" },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  message: { color: v2Theme.colors.danger, fontSize: 9, lineHeight: 13, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 7, marginTop: 6 },
  primary: {
    flex: 1,
    minHeight: 40,
    borderRadius: 13,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  secondary: {
    minWidth: 74,
    minHeight: 40,
    borderRadius: 13,
    backgroundColor: v2Theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  secondaryText: { color: v2Theme.colors.ink, fontSize: 9, fontWeight: "900" },
  disabled: { opacity: 0.5 },
});
