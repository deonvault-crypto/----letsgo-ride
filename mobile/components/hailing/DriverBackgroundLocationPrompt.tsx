import { MaterialCommunityIcons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { v2Theme } from "../../constants/v2Theme";
import { useHailingDriverWorkspace } from "../../hooks/useHailing";
import {
  BackgroundLocationPermissionState,
  getDriverBackgroundLocationPermissionState,
  requestDriverBackgroundLocationPermission,
  startDriverBackgroundTripTracking,
} from "../../services/hailingBackgroundLocation";
import { openLocationSettings } from "../../services/locationService";

export function DriverBackgroundLocationPrompt() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { status } = useHailingDriverWorkspace(false);
  const [permission, setPermission] = useState<BackgroundLocationPermissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dismissed = useRef(false);
  const openedSettings = useRef(false);
  const activeTrip = status?.active_trip;
  const relevant = pathname.includes("/hailing") && Boolean(status?.online) && Boolean(activeTrip);

  const inspect = useCallback(async () => {
    const next = await getDriverBackgroundLocationPermissionState();
    setPermission(next);
    if (next.enabled && activeTrip?.id) await startDriverBackgroundTripTracking(activeTrip.id).catch(() => undefined);
  }, [activeTrip?.id]);

  useEffect(() => {
    if (!relevant) { setPermission(null); dismissed.current = false; return; }
    void inspect().catch(() => undefined);
  }, [inspect, relevant]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !openedSettings.current) return;
      openedSettings.current = false;
      void inspect().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [inspect]);

  if (!relevant || !permission || permission.enabled || dismissed.current) return null;

  async function enable() {
    try {
      setBusy(true); setMessage(null);
      if (permission?.requiresSettings) {
        openedSettings.current = true;
        await openLocationSettings();
        return;
      }
      const next = await requestDriverBackgroundLocationPermission();
      setPermission(next);
      if (next.enabled && activeTrip?.id) await startDriverBackgroundTripTracking(activeTrip.id);
      else setMessage("Background location is still off. Keep LetsGoRide open during the trip, or enable it later in Settings.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Background location could not be enabled.");
    } finally { setBusy(false); }
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.card, { bottom: Math.max(insets.bottom, 10) + 78 }]}>
        <View style={styles.icon}><MaterialCommunityIcons name="map-marker-path" size={22} color="#111111" /></View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>ACTIVE RIDE NOW TRIP</Text>
          <Text style={styles.title}>Keep the rider’s map moving if you switch apps</Text>
          <Text style={styles.body}>Background location is used only for Driver live tracking while an active Ride Now trip needs your position. The rider does not get your location after tracking ends.</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void enable()} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? "Opening…" : permission.requiresSettings ? "Open Settings" : "Allow while working"}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { dismissed.current = true; setPermission(null); }} style={styles.secondary}><Text style={styles.secondaryText}>Not now</Text></Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: "absolute", left: 12, right: 12, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.99)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.13)", padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 11, shadowColor: "#000000", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  icon: { width: 43, height: 43, borderRadius: 15, backgroundColor: "#F0F0ED", alignItems: "center", justifyContent: "center" }, copy: { flex: 1, gap: 4 }, eyebrow: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 1 }, title: { color: v2Theme.colors.ink, fontSize: 14, lineHeight: 18, fontWeight: "900" }, body: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 }, message: { color: v2Theme.colors.danger, fontSize: 9, lineHeight: 13, fontWeight: "700" }, actions: { flexDirection: "row", gap: 7, marginTop: 6 }, primary: { flex: 1, minHeight: 40, borderRadius: 13, backgroundColor: "#111111", alignItems: "center", justifyContent: "center" }, primaryText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" }, secondary: { minWidth: 74, minHeight: 40, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 }, secondaryText: { color: v2Theme.colors.ink, fontSize: 9, fontWeight: "900" }, disabled: { opacity: 0.5 },
});
