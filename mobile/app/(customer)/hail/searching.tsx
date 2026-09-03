import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { HailingMapBackdrop } from "../../../components/hailing/HailingMapBackdrop";
import { BottomNav } from "../../../components/layout/BottomNav";
import { AppNotice } from "../../../components/ui/AppNotice";
import { MotionView } from "../../../components/ui/MotionView";
import { useMotionSettings } from "../../../hooks/useMotionSettings";
import { v2Theme } from "../../../constants/v2Theme";
import { useActiveHailingTrip } from "../../../hooks/useHailing";
import { cancelHailingTrip } from "../../../services/hailingService";

const RIDE_BLACK = "#111111";
const SHEET_BOTTOM = v2Theme.control.navHeight + 26;


export default function HailingSearchingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const { trip, loading, error, reload, setTrip, realtimeState } = useActiveHailingTrip(true);
  const { canAnimate } = useMotionSettings();
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (loading || !trip || trip.status === "SEARCHING" || trip.status === "NO_DRIVER_FOUND") return;
    router.replace(`/(customer)/hail/trip/${trip.id}` as never);
  }, [loading, router, trip?.id, trip?.status]);

  async function cancel() {
    const id = trip?.id || params.tripId;
    if (!id) {
      router.replace("/(customer)/hail" as never);
      return;
    }
    try {
      setCancelling(true);
      const next = await cancelHailingTrip(id, "Passenger cancelled while searching");
      setTrip(next);
      router.replace(`/(customer)/hail/trip/${next.id}` as never);
    } catch {
      void reload();
    } finally {
      setCancelling(false);
    }
  }

  const noDriver = trip?.status === "NO_DRIVER_FOUND";
  const live = realtimeState === "connected";
  const searching = trip?.status === "SEARCHING";
  const restoring = loading && !trip;
  const searchTitle = restoring ? "Restoring your request…"
    : !trip ? "Ride request unavailable"
      : !searching ? "Opening your ride…"
        : !live || error ? "Reconnecting…"
          : "Finding a driver";
  const searchBody = restoring ? "Getting your latest ride request."
    : !trip ? "Refresh to check your ride request."
      : !live || error ? "Checking your request. Your ride status will update when connected."
        : "We’ll notify you when a driver accepts. You can leave this screen.";
  const busy = restoring || (searching && live && !error);

  return (
    <SafeAreaView edges={[]} style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <HailingMapBackdrop pickup={trip?.pickup} dropoff={trip?.dropoff} route={trip?.route} bottomPadding={350} />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Home" hitSlop={8} onPress={() => router.replace("/(customer)/home" as never)} style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="chevron-left" size={27} color={RIDE_BLACK} />
        </Pressable>
        {trip ? <View style={styles.tripPill}><Text style={styles.tripPillText}>{trip.route.distance_km.toFixed(1)} km · ${trip.fare.total_fare.toFixed(2)}</Text></View> : <View style={styles.tripPill}><Text style={styles.tripPillText}>RIDE NOW</Text></View>}
        <View accessibilityLabel={live ? "Ride updates connected" : "Ride updates reconnecting"} style={styles.liveButton}>
          <View style={[styles.liveDot, !live && styles.liveDotSyncing]} />
          <MaterialCommunityIcons name="access-point" size={18} color={RIDE_BLACK} />
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <MotionView changeKey={noDriver ? "no-driver" : searchTitle} style={styles.statusRow} accessibilityLiveRegion="polite">
            <View style={[styles.statusIcon, noDriver && styles.statusIconWarning]}>
              {busy && canAnimate ? <ActivityIndicator color={RIDE_BLACK} /> : (
                <MaterialCommunityIcons name={noDriver ? "car-off" : "crosshairs-gps"} size={22} color={noDriver ? v2Theme.colors.warning : RIDE_BLACK} />
              )}
            </View>
            <View style={styles.flex}>
              <Text style={styles.title}>{noDriver ? "No drivers nearby" : searchTitle}</Text>
            </View>
          </MotionView>

          <Text style={styles.body}>{noDriver ? "No approved driver accepted in time. Try again in a moment or choose another available ride class." : searchBody}</Text>

          {trip ? (
            <View style={styles.routeSummary}>
              <View style={styles.routeDot} /><Text numberOfLines={1} style={styles.routeText}>{trip.pickup.formatted_address}</Text>
              <MaterialCommunityIcons name="arrow-right" size={15} color={v2Theme.colors.inkTertiary} />
              <View style={styles.routeSquare} /><Text numberOfLines={1} style={styles.routeText}>{trip.dropoff.formatted_address}</Text>
            </View>
          ) : null}

          {error ? <AppNotice message={error} actionLabel="Reconnect" onAction={() => void reload()} /> : null}

          {noDriver ? (
            <Pressable accessibilityRole="button" onPress={() => router.replace("/(customer)/hail" as never)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Try another ride</Text><MaterialCommunityIcons name="arrow-right" size={19} color="#FFFFFF" />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel Ride Now request" accessibilityState={{ disabled: cancelling, busy: cancelling }} disabled={cancelling} onPress={() => void cancel()} style={({ pressed }) => [styles.cancel, cancelling && styles.cancelBusy, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>{cancelling ? "Cancelling your request…" : "Cancel request"}</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      <BottomNav role="customer" activeTone="neutral" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ECECE8" },
  topBar: { position: "absolute", left: 16, right: 16, zIndex: 30, elevation: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  topButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.10)", alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOpacity: 0.10, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  liveButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.10)", alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOpacity: 0.10, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  liveDot: { position: "absolute", top: 10, right: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: v2Theme.colors.brand },
  liveDotSyncing: { backgroundColor: "#D39A24" },
  tripPill: { minHeight: 36, maxWidth: 220, paddingHorizontal: 13, borderRadius: 18, backgroundColor: "rgba(17,17,17,0.94)", alignItems: "center", justifyContent: "center" },
  tripPillText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  sheet: { position: "absolute", left: 10, right: 10, bottom: SHEET_BOTTOM, maxHeight: "60%", overflow: "hidden", backgroundColor: "rgba(255,255,255,0.985)", borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.08)", shadowColor: "#000000", shadowOpacity: 0.13, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "#D7D8D5", alignSelf: "center", marginTop: 8 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 12 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  statusIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: "#F0F0EE", alignItems: "center", justifyContent: "center" },
  statusIconWarning: { backgroundColor: v2Theme.colors.warningSoft },
  title: { color: v2Theme.colors.ink, fontSize: 22, lineHeight: 26, fontWeight: "900", letterSpacing: -0.55, marginTop: 1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 17 },
  routeSummary: { minHeight: 40, borderRadius: 14, backgroundColor: "#F7F7F5", paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7 },
  routeDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: RIDE_BLACK },
  routeSquare: { width: 9, height: 9, borderRadius: 2, backgroundColor: RIDE_BLACK },
  routeText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "700" },
  primary: { minHeight: 52, borderRadius: 18, backgroundColor: RIDE_BLACK, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  cancel: { minHeight: 50, borderRadius: 18, backgroundColor: RIDE_BLACK, alignItems: "center", justifyContent: "center" },
  cancelBusy: { backgroundColor: "#2B2B2B" },
  cancelText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  flex: { flex: 1 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
