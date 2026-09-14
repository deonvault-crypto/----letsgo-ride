import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { v2Theme } from "../../constants/v2Theme";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { switchWorkMode } from "../../services/authService";

type WorkMode = "driver" | "courier";

const labels: Record<WorkMode, string> = { driver: "Driver", courier: "Courier" };
const icons: Record<WorkMode, keyof typeof MaterialCommunityIcons.glyphMap> = { driver: "steering", courier: "bike-fast" };

export function WorkModeSwitcher() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [busy, setBusy] = useState<WorkMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = useMemo(() => {
    const modes = new Set<WorkMode>();
    for (const value of user?.work_products || []) {
      if (value === "driver" || value === "courier") modes.add(value);
    }
    if (user?.role === "driver" || user?.role === "courier") modes.add(user.role);
    return [...modes];
  }, [user?.role, user?.work_products]);

  if (!user || available.length < 2 || (user.role !== "driver" && user.role !== "courier")) return null;

  async function changeMode(target: WorkMode) {
    if (target === user?.role || busy) return;
    try {
      setBusy(target);
      setError(null);
      await switchWorkMode(target);
      router.replace((target === "driver" ? "/(driver)/home" : "/(courier)/home") as never);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to switch work mode.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.icon}>
          <MaterialCommunityIcons name="swap-horizontal-bold" size={22} color={v2Theme.colors.brandStrong} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Work mode</Text>
          <Text style={styles.body}>Driver and Courier are approved on this account. Go offline and finish active work before switching.</Text>
        </View>
      </View>
      <View style={styles.options}>
        {available.map((mode) => {
          const active = user.role === mode;
          return (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: Boolean(busy) }}
              onPress={() => void changeMode(mode)}
              disabled={Boolean(busy) || active}
              style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && !active && styles.pressed]}
            >
              <MaterialCommunityIcons name={icons[mode]} size={19} color={active ? "#FFFFFF" : v2Theme.colors.ink} />
              <Text style={[styles.optionText, active && styles.optionTextActive]}>{busy === mode ? "Switching…" : labels[mode]}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 23, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, gap: 11 },
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.brandSofter, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 },
  title: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14, marginTop: 2 },
  options: { flexDirection: "row", gap: 8 },
  option: { flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  optionActive: { backgroundColor: v2Theme.colors.ink },
  optionText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  optionTextActive: { color: "#FFFFFF" },
  error: { color: v2Theme.colors.danger, fontSize: 9, lineHeight: 14, fontWeight: "700" },
  pressed: { opacity: 0.72 },
});
