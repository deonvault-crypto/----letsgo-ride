import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { v2Theme } from "../../constants/v2Theme";
import { useCourierWorkspace } from "../../contexts/CourierWorkspaceContext";
import {
  CourierBackgroundLocationPermissionState,
  getCourierBackgroundLocationPermissionState,
  requestCourierBackgroundLocationPermission,
  startCourierBackgroundAvailabilityTracking,
  startCourierBackgroundDeliveryTracking,
  stopCourierBackgroundAvailabilityTracking,
} from "../../services/courierBackgroundLocation";
import { openLocationSettings } from "../../services/locationService";

const ACTIVE_STATUSES = new Set(["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]);

export function CourierBackgroundLocationPrompt() {
  const insets = useSafeAreaInsets();
  const { active, profile } = useCourierWorkspace();
  const [permission, setPermission] = useState<CourierBackgroundLocationPermissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dismissedFor = useRef<string | null>(null);
  const openedSettings = useRef(false);
  const activeDelivery = Boolean(active?.id && ACTIVE_STATUSES.has(active.status));
  const onlineAvailability = Boolean(Platform.OS === "android" && profile?.status === "APPROVED" && profile?.online && !activeDelivery);
  const relevant = activeDelivery || onlineAvailability;
  const disclosureKey = activeDelivery ? `delivery:${active?.id}` : "online";

  const startRelevantTracking = useCallback(async () => {
    if (activeDelivery && active?.id) {
      await startCourierBackgroundDeliveryTracking(active.id);
      return;
    }
    if (onlineAvailability) await startCourierBackgroundAvailabilityTracking();
  }, [active?.id, activeDelivery, onlineAvailability]);

  const inspect = useCallback(async () => {
    const next = await getCourierBackgroundLocationPermissionState();
    setPermission(next);
    if (next.enabled && relevant) await startRelevantTracking();
  }, [relevant, startRelevantTracking]);

  useEffect(() => {
    if (!relevant) {
      setPermission(null);
      dismissedFor.current = null;
      if (Platform.OS === "android" && !profile?.online) void stopCourierBackgroundAvailabilityTracking();
      return;
    }
    void inspect().catch(() => undefined);
  }, [inspect, profile?.online, relevant]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !openedSettings.current) return;
      openedSettings.current = false;
      void inspect().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [inspect]);

  if (!relevant || !permission || permission.enabled || dismissedFor.current === disclosureKey) return null;

  async function enable() {
    try {
      setBusy(true);
      setMessage(null);
      if (permission?.requiresSettings) {
        openedSettings.current = true;
        await openLocationSettings();
        return;
      }
      const next = await requestCourierBackgroundLocationPermission();
      setPermission(next);
      if (next.enabled) {
        await startRelevantTracking();
      } else {
        setMessage(activeDelivery
          ? "Background location is still off. Keep LetsGoRide open during the delivery, or enable it later in Settings."
          : "Background availability is still off. Keep LetsGoRide open while Online to receive nearby delivery requests.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Background location could not be enabled.");
    } finally {
      setBusy(false);
    }
  }

  const eyebrow = activeDelivery ? "ACTIVE DELIVERY" : "COURIER ONLINE";
  const title = activeDelivery
    ? "Keep the customer’s map moving if you switch apps"
    : "Keep receiving nearby requests when you switch apps";
  const body = activeDelivery
    ? "Background location is used only while an active delivery needs your position. Tracking stops when the delivery ends unless you choose to stay Online for new work."
    : "While you choose to stay Online, LetsGoRide can use your location in the background to keep nearby delivery matching accurate. Android keeps a visible ongoing notification, and tracking stops when you go Offline.";
  const primaryLabel = busy
    ? "Opening…"
    : permission.requiresSettings
      ? "Open Settings"
      : activeDelivery
        ? "Allow while delivering"
        : "Allow while Online";

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.card, { bottom: Math.max(insets.bottom, 10) + 78 }]}>
        <View style={styles.icon}><MaterialCommunityIcons name={activeDelivery ? "map-marker-path" : "radar"} size={22} color="#111111" /></View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void enable()} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{primaryLabel}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { dismissedFor.current = disclosureKey; setPermission(null); }} style={styles.secondary}><Text style={styles.secondaryText}>Not now</Text></Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: "absolute", left: 12, right: 12, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.99)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.13)", padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 11, shadowColor: "#000000", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  icon: { width: 43, height: 43, borderRadius: 15, backgroundColor: "#F0F0ED", alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 4 },
  eyebrow: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  title: { color: v2Theme.colors.ink, fontSize: 14, lineHeight: 18, fontWeight: "900" },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  message: { color: v2Theme.colors.danger, fontSize: 9, lineHeight: 13, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 7, marginTop: 6 },
  primary: { flex: 1, minHeight: 40, borderRadius: 13, backgroundColor: "#111111", alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  secondary: { minWidth: 74, minHeight: 40, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  secondaryText: { color: v2Theme.colors.ink, fontSize: 9, fontWeight: "900" },
  disabled: { opacity: 0.5 },
});
