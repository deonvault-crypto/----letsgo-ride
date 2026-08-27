import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { v2Theme } from "../../constants/v2Theme";

type Props = {
  product?: "driver" | "courier" | "merchant";
};

export function AccountDeletionShortcut({ product }: Props) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Delete account"
      accessibilityHint="Opens the permanent account deletion confirmation"
      onPress={() =>
        router.push({
          pathname: "/(shared)/settings",
          params: {
            ...(product ? { product } : {}),
            deleteAccount: "1",
          },
        } as never)
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <MaterialCommunityIcons name="delete-outline" size={21} color={v2Theme.colors.danger} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Delete account</Text>
        <Text style={styles.subtitle}>Permanently delete this LetsGoRide account</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={21} color={v2Theme.colors.danger} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 70,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.danger,
    backgroundColor: v2Theme.colors.dangerSoft,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 3 },
  title: { color: v2Theme.colors.danger, fontSize: 13, fontWeight: "900" },
  subtitle: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  pressed: { opacity: 0.72 },
});
