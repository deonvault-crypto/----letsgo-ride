import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { HailingMapBackdrop } from "../../../components/hailing/HailingMapBackdrop";
import { BottomNav } from "../../../components/layout/BottomNav";
import { AppNotice } from "../../../components/ui/AppNotice";
import { v2Theme } from "../../../constants/v2Theme";
import { useActiveHailingTrip } from "../../../hooks/useHailing";
import { cancelHailingTrip } from "../../../services/hailingService";

const RIDE_BLACK = "#111111";
const SHEET_BOTTOM = v2Theme.control.navHeight + 26;

export default function HailingSearchingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const { trip, loading, error, reload, setTrip } = useActiveHailingTrip(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!trip || trip.status !== "SEARCHING") return undefined;
    const start = trip.created_at ? new Date(trip.created_at).getTime() : Date.now();
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [trip?.created_at, trip?.id, trip?.status]);

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
      reload();
    } finally {
      setCancelling(false);
    }
  }

  const noDriver = trip?.status === "NO_DRIVER_FOUND";
  const searchCopy = useMemo(() => {
    if (loading && !trip) return { eyebrow: "RESTORING RIDE", title: "Restoring your ride request…", body: "Checking the server for your active Ride Now request." };
    if (elapsedSeconds < 15) return { eyebrow: "MATCHING YOU", title: "Finding nearby drivers…", body: "Checking approved drivers closest to your pickup." };
    if (elapsedSeconds < 45) return { eyebrow: "EXPANDING SEARCH", title: "Checking more nearby drivers…", body: "We’re widening the search while keeping your request active." };
    return { eyebrow: "STILL SEARCHING", title: "Searching across nearby areas…", body: "Your request is still active. You can leave this screen — we’ll notify you when a driver accepts." };
  }, [elapsedSeconds, loading, trip]);

  return (
    <SafeAreaView edges={[]} style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <HailingMapBackdrop pickup={trip?.pickup} dropoff={trip?.dropoff} route={trip?.route} bottomPadding={350} />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Ride Now" hitSlop={8} onPress={() => router.replace("/(customer)/home" as never)} style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="chevron-left" size={27} color={RIDE_BLACK} />
        </Pressable>
        {trip ? <View style={styles.tripPill}><Text style={styles.tripPillText}>{trip.route.distance_km.toFixed(1)} km · ${trip.fare.total_fare.toFixed(2)}</Text></View> : <View style={styles.tripPill}><Text style={styles.tripPillText}>RIDE NOW</Text></View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh driver search" hitSlop={8} onPress={reload} style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="refresh" size={20} color={RIDE_BLACK} />
        </Pressable>
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.content}>
          <View style={styles.statusRow}>
            <View style={[styles.statusIcon, noDriver && styles.statusIconWarning]}>
              <MaterialCommunityIcons name={noDriver ? "car-off" : "crosshairs-gps"} size={22} color={noDriver ? v2Theme.colors.warning : RIDE_BLACK} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>{noDriver ? "NO MATCH YET" : searchCopy.eyebrow}</Text>
              <Text style={styles.title}>{noDriver ? "No drivers nearby" : searchCopy.title}</Text>
            </View>
          </View>

          <Text style={styles.body}>{noDriver ? "No approved driver accepted in time. Try again in a moment or choose another available ride class." : searchCopy.body}</Text>

          {!noDriver && trip ? (
            <View accessibilityLabel={`Driver search active for ${elapsedSeconds} seconds`} style={styles.progressTrack}>
              <View style={[styles.progressSegment, elapsedSeconds >= 0 && styles.progressSegmentActive]} />
              <View style={[styles.progressSegment, elapsedSeconds >= 15 && styles.progressSegmentActive]} />
              <View style={[styles.progressSegment, elapsedSeconds >= 45 && styles.progressSegmentActive]} />
            </View>
          ) : null}

          {trip ? (
            <View style={styles.routeSummary}>
              <View style={styles.routeDot} /><Text numberOfLines={1} style={styles.routeText}>{trip.pickup.formatted_address}</Text>
              <MaterialCommunityIcons name="arrow-right" size={15} color={v2Theme.colors.inkTertiary} />
              <View style={styles.routeSquare} /><Text numberOfLines={1} style={styles.routeText}>{trip.dropoff.formatted_address}</Text>
            </View>
          ) : null}

          {error ? <AppNotice message={error} actionLabel="Retry" onAction={reload} /> : null}

          {noDriver ? (
            <Pressable accessibilityRole="button" onPress={() => router.replace("/(customer)/hail" as never)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Try another ride</Text><MaterialCommunityIcons name="arrow-right" size={19} color="#FFFFFF" />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel Ride Now request" disabled={cancelling} onPress={cancel} style={({ pressed }) => [styles.cancel, cancelling && styles.cancelBusy, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>{cancelling ? "Cancelling your request…" : "Cancel request"}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <BottomNav role="customer" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ECECE8" },
  topBar: { position: "absolute", left: 16, right: 16, zIndex: 30, elevation: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  topButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.10)", alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOpacity: 0.10, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  tripPill: { minHeight: 36, maxWidth: 220, paddingHorizontal: 13, borderRadius: 18, backgroundColor: "rgba(17,17,17,0.94)", alignItems: "center", justifyContent: "center" },
  tripPillText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  sheet: { position: "absolute", left: 10, right: 10, bottom: SHEET_BOTTOM, backgroundColor: "rgba(255,255,255,0.985)", borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.08)", shadowColor: "#000000", shadowOpacity: 0.13, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "#D7D8D5", alignSelf: "center", marginTop: 8 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 12 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  statusIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: "#F0F0EE", alignItems: "center", justifyContent: "center" },
  statusIconWarning: { backgroundColor: v2Theme.colors.warningSoft },
  eyebrow: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: v2Theme.colors.ink, fontSize: 22, lineHeight: 26, fontWeight: "900", letterSpacing: -0.55, marginTop: 1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 17 },
  progressTrack: { flexDirection: "row", gap: 5 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#DDDDDA" },
  progressSegmentActive: { backgroundColor: RIDE_BLACK },
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
