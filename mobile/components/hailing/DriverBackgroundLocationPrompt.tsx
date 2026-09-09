import { usePathname } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { BackgroundLocationDisclosureCard } from "../permissions/BackgroundLocationDisclosureCard";
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

  const primaryLabel = busy ? "Opening…" : permission.requiresSettings ? "Open Settings" : "Allow while working";

  return (
    <BackgroundLocationDisclosureCard
      icon="map-marker-path"
      eyebrow="ACTIVE RIDE NOW TRIP"
      title="Keep the rider’s map moving if you switch apps"
      body="Background location is used only for Driver live tracking while an active Ride Now trip needs your position. The rider does not get your location after tracking ends."
      message={message}
      primaryLabel={primaryLabel}
      busy={busy}
      onPrimary={() => void enable()}
      onDismiss={() => { dismissed.current = true; setPermission(null); }}
    />
  );
}
