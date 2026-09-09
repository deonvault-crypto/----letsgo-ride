import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { BackgroundLocationDisclosureCard } from "../permissions/BackgroundLocationDisclosureCard";
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
    <BackgroundLocationDisclosureCard
      icon={activeDelivery ? "map-marker-path" : "radar"}
      eyebrow={eyebrow}
      title={title}
      body={body}
      message={message}
      primaryLabel={primaryLabel}
      busy={busy}
      onPrimary={() => void enable()}
      onDismiss={() => { dismissedFor.current = disclosureKey; setPermission(null); }}
    />
  );
}
