import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { v2Theme } from "../../constants/v2Theme";

export function AuthRequiredModal({
  visible,
  onClose,
  returnTo,
  title = "You’re almost there.",
  body = "Sign in or create a customer account to continue.",
}: {
  visible: boolean;
  onClose: () => void;
  returnTo: string;
  title?: string;
  body?: string;
}) {
  const router = useRouter();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.card}>
          <View style={styles.icon}>
            <MaterialCommunityIcons name="account-lock-outline" size={29} color={v2Theme.colors.brandStrong} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClose();
              router.push({ pathname: "/(auth)/email-login", params: { returnTo } } as never);
            }}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>Sign in</Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClose();
              router.push({ pathname: "/(auth)/email-register", params: { returnTo } } as never);
            }}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>Create customer account</Text>
          </Pressable>
          <Text style={styles.note}>Browsing stays free. We only ask for an account when identity is needed for a real service.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(14,18,16,0.44)",
    justifyContent: "flex-end",
    padding: 14,
  },
  card: {
    borderRadius: 30,
    backgroundColor: v2Theme.colors.surface,
    padding: 20,
    paddingBottom: 24,
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -10 },
    elevation: 18,
  },
  icon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: v2Theme.colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { gap: 6, marginBottom: 2 },
  title: {
    color: v2Theme.colors.ink,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 19 },
  primary: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: v2Theme.colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 17,
  },
  primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  secondary: {
    minHeight: 50,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  note: { color: v2Theme.colors.inkTertiary, fontSize: 9, lineHeight: 14, textAlign: "center", paddingHorizontal: 8 },
  pressed: { opacity: 0.72 },
});
