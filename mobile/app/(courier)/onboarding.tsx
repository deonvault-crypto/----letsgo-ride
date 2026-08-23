import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { createCourierProfile } from "../../services/operationsService";
import { CourierProfile } from "../../types/operations.types";

type TransportMode = CourierProfile["transport_mode"];

const modes: Array<{ id: TransportMode; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; body: string }> = [
  { id: "bicycle", label: "Bicycle", icon: "bike", body: "Short urban deliveries" },
  { id: "motorbike", label: "Motorbike", icon: "motorbike", body: "Fast city coverage" },
  { id: "car", label: "Car", icon: "car-outline", body: "Flexible parcel sizes" },
  { id: "van", label: "Van", icon: "van-utility", body: "Larger local deliveries" },
];

export default function CourierOnboardingScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<TransportMode>("motorbike");
  const [vehicleDescription, setVehicleDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => Boolean(mode && !saving), [mode, saving]);

  async function submit() {
    if (!canSubmit) return;
    try {
      setSaving(true);
      setError(null);
      await createCourierProfile({
        transport_mode: mode,
        vehicle_description: vehicleDescription.trim() || null,
      });
      router.replace("/(courier)/home" as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create courier profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen showBack fallbackRoute="/(courier)/home" title="Courier onboarding" showNotifications={false}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LETSGORIDE COURIER</Text>
        <Text style={styles.title}>Set up how you deliver.</Text>
        <Text style={styles.body}>This profile belongs only to the Courier product. It does not create a Driver or Customer identity.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transport</Text>
        <View style={styles.grid}>
          {modes.map((item) => {
            const active = mode === item.id;
            return (
              <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setMode(item.id)} style={({ pressed }) => [styles.modeCard, active && styles.modeCardActive, pressed && styles.pressed]}>
                <View style={[styles.modeIcon, active && styles.modeIconActive]}><MaterialCommunityIcons name={item.icon} size={26} color={active ? "#FFFFFF" : v2Theme.colors.ink} /></View>
                <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{item.label}</Text>
                <Text style={[styles.modeBody, active && styles.modeBodyActive]}>{item.body}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vehicle details</Text>
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Description</Text>
          <TextInput accessibilityLabel="Courier vehicle description" value={vehicleDescription} onChangeText={setVehicleDescription} maxLength={180} placeholder="e.g. Honda CB125, black delivery box" placeholderTextColor={v2Theme.colors.inkTertiary} style={styles.input} />
          <Text style={styles.inputHint}>Optional now. Keep it factual so operations can recognise the vehicle later.</Text>
        </View>
      </View>

      <View style={styles.reviewCard}>
        <View style={styles.reviewIcon}><MaterialCommunityIcons name="shield-check-outline" size={24} color={v2Theme.colors.brandStrong} /></View>
        <View style={styles.reviewCopy}><Text style={styles.reviewTitle}>Approval before online work</Text><Text style={styles.reviewBody}>Creating a Courier profile does not automatically unlock paid work. Operations approval remains a separate gate.</Text></View>
      </View>

      {error ? <View style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Create courier profile" onPress={submit} disabled={!canSubmit} style={({ pressed }) => [styles.primaryButton, !canSubmit && styles.disabled, pressed && canSubmit && styles.pressed]}>
        <View><Text style={styles.primaryText}>{saving ? "Creating profile…" : "Create courier profile"}</Text><Text style={styles.primarySub}>Selected: {modes.find((item) => item.id === mode)?.label}</Text></View>
        <MaterialCommunityIcons name="arrow-right" size={22} color="#FFFFFF" />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 7 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  section: { gap: 11 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  modeCard: { width: "48%", minHeight: 144, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, gap: 8 },
  modeCardActive: { backgroundColor: v2Theme.colors.ink, borderColor: v2Theme.colors.ink },
  modeIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  modeIconActive: { backgroundColor: v2Theme.colors.brand },
  modeLabel: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  modeLabelActive: { color: "#FFFFFF" },
  modeBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  modeBodyActive: { color: "rgba(255,255,255,0.62)" },
  inputCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 7 },
  inputLabel: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "900" },
  input: { minHeight: 50, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 12, color: v2Theme.colors.ink, fontSize: 12, fontWeight: "800" },
  inputHint: { color: v2Theme.colors.inkTertiary, fontSize: 9, lineHeight: 14 },
  reviewCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", gap: 11 },
  reviewIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  reviewCopy: { flex: 1, gap: 4 },
  reviewTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  reviewBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  errorCard: { borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", gap: 9, alignItems: "center" },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" },
  primaryButton: { minHeight: 64, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  primarySub: { color: "rgba(255,255,255,0.75)", fontSize: 9, marginTop: 2 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
