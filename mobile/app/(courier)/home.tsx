import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";

import { DeliveryMap } from "../../components/maps/DeliveryMap";
import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useCourierWorkspace } from "../../contexts/CourierWorkspaceContext";
import { setCourierOnline } from "../../services/operationsService";
import { decodePolyline } from "../../utils/decodePolyline";

export default function CourierHomeScreen() {
  const router = useRouter();
  const {
    profile, active, earnings, offers, nextShift, loading, error,
    setError, reconcile, applyOnlineProfile,
  } = useCourierWorkspace();
  const [busy, setBusy] = useState(false);
  const offerCount = offers.length;

  const activeRoute = useMemo(
    () => decodePolyline(active?.remaining_route_polyline || active?.route_polyline),
    [active?.remaining_route_polyline, active?.route_polyline],
  );
  const approved = profile?.status === "APPROVED";
  const online = Boolean(approved && profile?.online);

  async function toggleOnline() {
    if (!profile || busy) return;
    try {
      setBusy(true);
      setError(null);
      const updated = await setCourierOnline(!profile.online);
      await applyOnlineProfile(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change your work status.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Screen navRole="courier"><LoadingState label="Preparing your courier day…" /></Screen>;

  return (
    <Screen navRole="courier" refreshing={loading} onRefresh={reconcile} showNotifications>
      {active ? (
        <>
          <View style={styles.activeHero}>
            <View style={styles.activeTop}>
              <View><Text style={styles.activeEyebrow}>ACTIVE DELIVERY</Text><Text style={styles.activeTitle}>Stay with the journey.</Text></View>
              <Text style={styles.activeAvailability}>{profile?.online ? "New offers paused" : "Offline for new offers"}</Text>
            </View>
            <Text numberOfLines={2} style={styles.activeRoute}>{active.pickup_address} → {active.dropoff_address}</Text>
            <View style={styles.metricsRow}>
              <HeroMetric label="REMAINING" value={active.remaining_distance_km != null ? `${active.remaining_distance_km.toFixed(1)} km` : active.distance_km != null ? `${active.distance_km.toFixed(1)} km route` : "Updating"} />
              <HeroMetric label="ETA" value={active.remaining_eta_minutes ? `${active.remaining_eta_minutes} min` : active.estimated_duration_minutes ? `${active.estimated_duration_minutes} min planned` : "Updating"} />
              <HeroMetric label="EARN" value={active.courier_payout_usd != null ? `$${active.courier_payout_usd.toFixed(2)}` : "Updating"} />
            </View>
          </View>
          <DeliveryMap pickup={active.pickup_location} dropoff={active.dropoff_location} courier={active.last_courier_location} route={activeRoute} courierHeading={active.last_courier_location?.heading} height={330} />
          <Pressable accessibilityRole="button" onPress={() => router.push(`/(courier)/delivery/${active.id}` as never)} style={({ pressed }) => [styles.journeyButton, pressed && styles.pressed]}>
            <View><Text style={styles.journeyTitle}>Open live journey</Text><Text style={styles.journeyBody}>Navigation, pickup and verified handoff</Text></View>
            <MaterialCommunityIcons name="arrow-right" size={22} color="#FFFFFF" />
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.idleHero}>
            <View style={styles.heroTop}><Text style={styles.eyebrow}>TODAY</Text><View style={[styles.statePill, online && styles.statePillOnline]}><Text style={[styles.stateText, online && styles.stateTextOnline]}>{online ? "ONLINE" : "OFFLINE"}</Text></View></View>
            <Text style={styles.title}>{online ? "You’re ready for nearby work." : "Start when you’re ready."}</Text>
            <Text style={styles.darkBody}>{approved ? (online ? `${offerCount} available ${offerCount === 1 ? "offer" : "offers"} nearby. You can accept one job at a time.` : "Go online to receive real Courier and Food delivery offers.") : "Your application must be approved before work access opens."}</Text>
            {profile ? (
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: online, disabled: !approved || busy }} disabled={!approved || busy} onPress={toggleOnline} style={({ pressed }) => [styles.onlineButton, online && styles.onlineButtonActive, (!approved || busy) && styles.disabled, pressed && styles.pressed]}>
                <MaterialCommunityIcons name={online ? "pause" : "power"} size={21} color={online ? v2Theme.colors.ink : "#FFFFFF"} />
                <Text style={[styles.onlineButtonText, online && styles.onlineButtonTextActive]}>{busy ? "Updating…" : online ? "Pause new offers" : "Go online"}</Text>
              </Pressable>
            ) : null}
          </View>

          {error ? <Pressable accessibilityRole="button" onPress={reconcile} style={styles.error}><MaterialCommunityIcons name="alert-circle-outline" size={20} color={v2Theme.colors.danger} /><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Retry</Text></Pressable> : null}

          {!profile ? (
            <View style={styles.setupCard}><MaterialCommunityIcons name="clipboard-account-outline" size={32} color={v2Theme.colors.brandStrong} /><Text style={styles.setupTitle}>Courier profile required</Text><Text style={styles.body}>Complete the approved Courier onboarding attached to your account.</Text><Pressable accessibilityRole="button" onPress={() => router.push("/(courier)/onboarding" as never)} style={styles.smallButton}><Text style={styles.smallButtonText}>Open onboarding</Text></Pressable></View>
          ) : null}

          <View style={styles.summaryRow}>
            <SummaryTile icon="cash" value={`$${(earnings?.periods?.today.accrued_earnings_usd || 0).toFixed(2)}`} label="Today accrued" />
            <SummaryTile icon="check-circle-outline" value={String(earnings?.periods?.today.completed_deliveries || 0)} label="Completed" />
            <SummaryTile icon="clock-outline" value={formatMinutes(earnings?.periods?.today.online_minutes || 0)} label="Online" />
          </View>

          <View style={styles.workRow}>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(courier)/offers" as never)} style={({ pressed }) => [styles.workCard, pressed && styles.pressed]}>
              <View style={styles.workIcon}><MaterialCommunityIcons name="radar" size={25} color={v2Theme.colors.brandStrong} /></View>
              <Text style={styles.workValue}>{offerCount}</Text><Text style={styles.workTitle}>Nearby offers</Text><Text style={styles.workBody}>{online ? "Open payout and route details" : "Go online to receive work"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(courier)/schedule" as never)} style={({ pressed }) => [styles.workCard, pressed && styles.pressed]}>
              <View style={styles.workIcon}><MaterialCommunityIcons name="calendar-outline" size={25} color={v2Theme.colors.brandStrong} /></View>
              <Text style={styles.shiftDate}>{nextShift ? formatShiftDate(nextShift.starts_at) : "No shift"}</Text><Text style={styles.workTitle}>Next opening</Text><Text style={styles.workBody}>{nextShift ? `${nextShift.zone} · ${nextShift.remaining_places} places` : "Check available shifts"}</Text>
            </Pressable>
          </View>
        </>
      )}
    </Screen>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) { return <View style={styles.heroMetric}><Text style={styles.heroMetricLabel}>{label}</Text><Text numberOfLines={1} style={styles.heroMetricValue}>{value}</Text></View>; }
function SummaryTile({ icon, value, label }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; value: string; label: string }) { return <View style={styles.summaryTile}><MaterialCommunityIcons name={icon} size={19} color={v2Theme.colors.brandStrong} /><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>; }
function formatMinutes(value: number) { const hours = Math.floor(value / 60); const minutes = value % 60; return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
function formatShiftDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }); }

const styles = StyleSheet.create({
  activeHero: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 18, gap: 13 }, activeTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, activeEyebrow: { color: "#8FE6AE", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, activeTitle: { color: "#FFFFFF", fontSize: 26, fontWeight: "900", letterSpacing: -0.7, marginTop: 4 }, activeAvailability: { maxWidth: 92, color: "rgba(255,255,255,0.72)", fontSize: 8, lineHeight: 12, fontWeight: "800", textAlign: "right" }, activeRoute: { color: "rgba(255,255,255,0.74)", fontSize: 12, lineHeight: 18, fontWeight: "700" }, metricsRow: { flexDirection: "row", gap: 8 }, heroMetric: { flex: 1, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", padding: 10, gap: 3 }, heroMetricLabel: { color: "rgba(255,255,255,0.42)", fontSize: 7, fontWeight: "900" }, heroMetricValue: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" }, journeyButton: { minHeight: 64, borderRadius: 20, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, journeyTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" }, journeyBody: { color: "rgba(255,255,255,0.72)", fontSize: 9, marginTop: 3 },
  idleHero: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 19, gap: 11 }, heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, eyebrow: { color: "#8FE6AE", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, statePill: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 10, paddingVertical: 7 }, statePillOnline: { backgroundColor: "#DDF7E6" }, stateText: { color: "rgba(255,255,255,0.66)", fontSize: 8, fontWeight: "900" }, stateTextOnline: { color: v2Theme.colors.brandStrong }, title: { color: "#FFFFFF", fontSize: 29, lineHeight: 34, fontWeight: "900", letterSpacing: -0.9 }, darkBody: { color: "rgba(255,255,255,0.66)", fontSize: 12, lineHeight: 18 }, body: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18 },
  onlineButton: { minHeight: 51, borderRadius: 16, backgroundColor: v2Theme.colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 2 }, onlineButtonActive: { backgroundColor: "#FFFFFF" }, onlineButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" }, onlineButtonTextActive: { color: v2Theme.colors.ink }, error: { borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }, errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 10, fontWeight: "700" }, retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" }, setupCard: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, padding: 17, gap: 8 }, setupTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" }, smallButton: { alignSelf: "flex-start", borderRadius: 14, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 14, paddingVertical: 11 }, smallButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" }, summaryRow: { flexDirection: "row", gap: 8 }, summaryTile: { flex: 1, minHeight: 100, borderRadius: 21, backgroundColor: v2Theme.colors.surface, padding: 11, gap: 5 }, summaryValue: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" }, summaryLabel: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" }, workRow: { flexDirection: "row", gap: 9 }, workCard: { flex: 1, minHeight: 176, borderRadius: 24, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 6 }, workIcon: { width: 45, height: 45, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 4 }, workValue: { color: v2Theme.colors.ink, fontSize: 29, fontWeight: "900" }, shiftDate: { color: v2Theme.colors.ink, fontSize: 19, fontWeight: "900", minHeight: 35, textAlignVertical: "center" }, workTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" }, workBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 }, disabled: { opacity: 0.42 }, pressed: { opacity: 0.72 },
});
