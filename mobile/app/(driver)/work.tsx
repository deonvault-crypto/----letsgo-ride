import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import {
  getCourierProfile,
  listAssignedCourierDeliveries,
  listWorkAvailability,
  setCourierOnline,
} from "../../services/operationsService";
import { CourierDelivery } from "../../types/courier.types";
import { CourierProfile, WorkAvailability } from "../../types/operations.types";

export default function DriverWorkScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<CourierProfile | null>(null);
  const [availability, setAvailability] = useState<WorkAvailability[]>([]);
  const [deliveries, setDeliveries] = useState<CourierDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingOnline, setUpdatingOnline] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [nextProfile, nextAvailability, nextDeliveries] = await Promise.all([
        getCourierProfile(),
        listWorkAvailability(),
        listAssignedCourierDeliveries(),
      ]);
      setProfile(nextProfile);
      setAvailability(nextAvailability);
      setDeliveries(nextDeliveries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load work workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleOnline() {
    if (!profile || updatingOnline) return;
    try {
      setUpdatingOnline(true);
      setError(null);
      setProfile(await setCourierOnline(!profile.online));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change courier status.");
    } finally {
      setUpdatingOnline(false);
    }
  }

  return (
    <Screen navRole="driver">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>WORKSPACE</Text>
        <Text style={styles.title}>Drive. Deliver. Stay organised.</Text>
        <Text style={styles.body}>Your planned rides, courier availability and active jobs belong in one operating view.</Text>
      </View>

      {error ? (
        <Pressable onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      <View style={styles.modeGrid}>
        <Pressable onPress={() => router.push("/(driver)/post-trip" as never)} style={({ pressed }) => [styles.modeCard, pressed && styles.pressed]}>
          <View style={styles.modeIcon}>
            <MaterialCommunityIcons name="car-clock" size={26} color={v2Theme.colors.ink} />
          </View>
          <Text style={styles.modeTitle}>Ride calendar</Text>
          <Text style={styles.modeBody}>Publish scheduled routes and manage passenger trips.</Text>
          <Text style={styles.modeAction}>Post a trip</Text>
        </Pressable>

        <View style={[styles.modeCard, styles.courierCard]}>
          <View style={[styles.modeIcon, styles.courierIcon]}>
            <MaterialCommunityIcons name="motorbike" size={26} color={v2Theme.colors.brandStrong} />
          </View>
          <Text style={styles.modeTitle}>Courier</Text>
          <Text style={styles.modeBody}>
            {profile ? `Verification: ${profile.status.replaceAll("_", " ").toLowerCase()}` : "Courier profile not created yet."}
          </Text>
          {profile ? (
            <Pressable
              disabled={profile.status !== "APPROVED" || updatingOnline}
              onPress={toggleOnline}
              style={({ pressed }) => [
                styles.onlineButton,
                profile.online && styles.onlineButtonActive,
                profile.status !== "APPROVED" && styles.onlineButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.onlineDot, profile.online && styles.onlineDotActive]} />
              <Text style={[styles.onlineText, profile.online && styles.onlineTextActive]}>
                {updatingOnline ? "Updating…" : profile.online ? "Online" : "Go online"}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.modeAction}>Courier onboarding</Text>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Availability</Text>
            <Text style={styles.sectionSub}>Your ride and courier calendar</Text>
          </View>
          <Text style={styles.count}>{availability.length}</Text>
        </View>

        {loading ? <Text style={styles.loadingText}>Loading schedule…</Text> : null}
        {!loading && availability.length === 0 ? (
          <View style={styles.emptyRow}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={25} color={v2Theme.colors.inkSecondary} />
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>No availability blocks yet</Text>
              <Text style={styles.emptyBody}>Add working windows when you want courier matching to use your calendar.</Text>
            </View>
          </View>
        ) : null}
        {availability.slice(0, 4).map((item) => (
          <View key={item.id} style={styles.availabilityRow}>
            <View style={styles.dateBadge}>
              <Text style={styles.dateText}>{item.date.slice(5)}</Text>
            </View>
            <View style={styles.availabilityCopy}>
              <Text style={styles.availabilityTitle}>{item.mode === "courier" ? "Courier availability" : "Ride availability"}</Text>
              <Text style={styles.availabilityBody}>{item.start_time} – {item.end_time}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Delivery jobs</Text>
            <Text style={styles.sectionSub}>Assigned to your courier account</Text>
          </View>
          <Text style={styles.count}>{deliveries.length}</Text>
        </View>
        {!loading && deliveries.length === 0 ? (
          <View style={styles.emptyRow}>
            <MaterialCommunityIcons name="package-variant-closed" size={25} color={v2Theme.colors.inkSecondary} />
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>No assigned deliveries</Text>
              <Text style={styles.emptyBody}>Accepted courier jobs will appear here with pickup, drop-off and live status.</Text>
            </View>
          </View>
        ) : null}
        {deliveries.slice(0, 4).map((delivery) => (
          <Pressable
            key={delivery.id}
            onPress={() => router.push(`/(shared)/courier/${delivery.id}` as never)}
            style={({ pressed }) => [styles.deliveryRow, pressed && styles.pressed]}
          >
            <View style={styles.deliveryIcon}>
              <MaterialCommunityIcons name="package-variant-closed" size={22} color={v2Theme.colors.brandStrong} />
            </View>
            <View style={styles.deliveryCopy}>
              <Text numberOfLines={1} style={styles.deliveryTitle}>{delivery.pickup_address} → {delivery.dropoff_address}</Text>
              <Text style={styles.deliveryBody}>{delivery.status.replaceAll("_", " ")}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 7 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  errorCard: { minHeight: 54, borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 12, fontWeight: "700" },
  retry: { color: v2Theme.colors.danger, fontSize: 12, fontWeight: "900" },
  modeGrid: { flexDirection: "row", gap: 10 },
  modeCard: { flex: 1, minHeight: 196, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 15, gap: 8 },
  courierCard: { backgroundColor: v2Theme.colors.brandSofter },
  modeIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" },
  courierIcon: { backgroundColor: v2Theme.colors.brandSoft },
  modeTitle: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900" },
  modeBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16, flex: 1 },
  modeAction: { color: v2Theme.colors.brandStrong, fontSize: 12, fontWeight: "900" },
  onlineButton: { minHeight: 38, borderRadius: 14, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  onlineButtonActive: { backgroundColor: v2Theme.colors.brand },
  onlineButtonDisabled: { opacity: 0.5 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: v2Theme.colors.inkTertiary },
  onlineDotActive: { backgroundColor: "#FFFFFF" },
  onlineText: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  onlineTextActive: { color: "#FFFFFF" },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 11, marginTop: 2 },
  count: { minWidth: 30, textAlign: "center", color: v2Theme.colors.ink, backgroundColor: v2Theme.colors.surfaceMuted, borderRadius: v2Theme.radius.pill, overflow: "hidden", paddingVertical: 6, paddingHorizontal: 8, fontSize: 11, fontWeight: "900" },
  loadingText: { color: v2Theme.colors.inkSecondary, fontSize: 12 },
  emptyRow: { minHeight: 82, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16 },
  availabilityRow: { minHeight: 68, borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  dateBadge: { width: 46, height: 42, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  dateText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  availabilityCopy: { flex: 1, gap: 3 },
  availabilityTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  availabilityBody: { color: v2Theme.colors.inkSecondary, fontSize: 11 },
  deliveryRow: { minHeight: 74, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  deliveryIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  deliveryCopy: { flex: 1, gap: 3 },
  deliveryTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  deliveryBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, textTransform: "capitalize" },
  pressed: { opacity: 0.7 },
});
