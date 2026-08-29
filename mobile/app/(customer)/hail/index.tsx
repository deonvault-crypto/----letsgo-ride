import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AuthRequiredModal } from "../../../components/auth/AuthRequiredModal";
import { AppNotice } from "../../../components/ui/AppNotice";
import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import { useLocationDraft } from "../../../contexts/LocationDraftContext";
import { useActiveHailingTrip, useHailingConfig } from "../../../hooks/useHailing";
import { hasSession } from "../../../services/authService";
import { createHailingQuote, requestHailingTrip } from "../../../services/hailingService";
import { HailingPlace, HailingQuote, HailingRideClass, HailingRideClassConfig } from "../../../types/hailing.types";

const fallbackRideClasses: HailingRideClassConfig[] = [{ id: "ECONOMY", label: "Economy", enabled: true }];

function toHailingPlace(choice: NonNullable<ReturnType<typeof useLocationDraft>["pickup"]>): HailingPlace {
  return {
    formatted_address: choice.address,
    latitude: choice.location.latitude,
    longitude: choice.location.longitude,
    place_id: choice.placeId || null,
  };
}

export default function HailingHomeScreen() {
  const router = useRouter();
  const { pickup, dropoff } = useLocationDraft();
  const { config, loading: configLoading, error: configError, reload: reloadConfig } = useHailingConfig();
  const { trip: activeTrip, loading: activeLoading, reload: reloadActive } = useActiveHailingTrip(false);
  const [selectedClass, setSelectedClass] = useState<HailingRideClass>("ECONOMY");
  const [quote, setQuote] = useState<HailingQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [verifyWithPin, setVerifyWithPin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabledClasses = useMemo(
    () => (config?.ride_classes || []).filter((option) => option.enabled),
    [config?.ride_classes],
  );

  async function loadQuote(nextClass = selectedClass) {
    if (!pickup || !dropoff) {
      setError("Choose pickup and destination first.");
      return;
    }
    if (!(await hasSession())) {
      setAuthOpen(true);
      return;
    }
    try {
      setQuoting(true);
      setError(null);
      const next = await createHailingQuote({
        pickup: toHailingPlace(pickup),
        dropoff: toHailingPlace(dropoff),
        ride_class: nextClass,
      });
      setQuote(next);
      setSelectedClass(next.ride_class);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to calculate this ride right now.");
    } finally {
      setQuoting(false);
    }
  }

  async function requestRide() {
    if (!quote) {
      await loadQuote(selectedClass);
      return;
    }
    try {
      setRequesting(true);
      setError(null);
      const trip = await requestHailingTrip({
        quote_id: quote.quote_id,
        payment_method: "cash",
        client_request_id: `hail-${quote.quote_id}`,
        verify_ride_with_pin: verifyWithPin,
      });
      router.replace(`/(customer)/hail/searching?tripId=${encodeURIComponent(trip.id)}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request your ride.");
    } finally {
      setRequesting(false);
    }
  }

  const disabled = !configLoading && config?.enabled === false;
  const active = activeTrip && !["COMPLETED", "CANCELLED_BY_PASSENGER", "CANCELLED_BY_DRIVER", "CANCELLED_BY_ADMIN", "NO_DRIVER_FOUND"].includes(activeTrip.status);

  return (
    <Screen navRole="customer" refreshing={quoting || activeLoading} onRefresh={() => { reloadConfig(); reloadActive(); }}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>RIDE NOW</Text>
        <Text style={styles.title}>A private city ride, requested now.</Text>
        <Text style={styles.body}>Choose pickup and destination, see the server-calculated fare, then we look for an approved nearby driver.</Text>
      </View>

      {configError ? <AppNotice message={configError} actionLabel="Retry" onAction={reloadConfig} /> : null}
      {disabled ? <AppNotice title="Not yet live here" message="Ride Now is currently disabled. Intercity and scheduled rides are still available." /> : null}
      {error ? <AppNotice message={error} actionLabel="Retry" onAction={() => loadQuote(selectedClass)} /> : null}

      {active ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Open active Ride Now trip" onPress={() => router.push(`/(customer)/hail/trip/${activeTrip.id}` as never)} style={({ pressed }) => [styles.activeCard, pressed && styles.pressed]}>
          <View style={styles.activeIcon}><MaterialCommunityIcons name="car-clock" size={25} color="#FFFFFF" /></View>
          <View style={styles.flex}><Text style={styles.activeTitle}>You have an active Ride Now trip</Text><Text style={styles.activeBody}>{activeTrip.status.replaceAll("_", " ")}</Text></View>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#FFFFFF" />
        </Pressable>
      ) : null}

      <View style={styles.routeCard}>
        <LocationRow label="Pickup" value={pickup?.address || "Choose pickup"} onPress={() => router.push("/(shared)/location-picker?kind=pickup" as never)} />
        <View style={styles.routeDivider} />
        <LocationRow label="Destination" value={dropoff?.address || "Choose destination"} onPress={() => router.push("/(shared)/location-picker?kind=dropoff" as never)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ride class</Text>
        <View style={styles.classGrid}>
          {(enabledClasses.length ? enabledClasses : fallbackRideClasses).map((option) => {
            const activeClass = selectedClass === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: activeClass }}
                onPress={() => { setSelectedClass(option.id); setQuote(null); }}
                style={({ pressed }) => [styles.classPill, activeClass && styles.classPillActive, pressed && styles.pressed]}
              >
                <Text style={[styles.classText, activeClass && styles.classTextActive]}>{option.label || option.id}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {quote ? (
        <View style={styles.quoteCard}>
          <Text style={styles.quoteLabel}>Estimated cash fare</Text>
          <Text style={styles.quotePrice}>${quote.fare.total_fare.toFixed(2)}</Text>
          <Text style={styles.quoteBody}>{quote.route.distance_km.toFixed(1)} km · about {Math.round(quote.route.duration_minutes)} min</Text>
          {quote.fare.surge_multiplier > 1 ? <Text style={styles.surge}>High demand fare shown before request</Text> : null}
        </View>
      ) : null}

      <Pressable accessibilityRole="switch" accessibilityState={{ checked: verifyWithPin }} onPress={() => setVerifyWithPin((current) => !current)} style={({ pressed }) => [styles.pinOption, pressed && styles.pressed]}>
        <View style={[styles.pinToggle, verifyWithPin && styles.pinToggleOn]}><View style={[styles.pinKnob, verifyWithPin && styles.pinKnobOn]} /></View>
        <View style={styles.flex}>
          <Text style={styles.pinTitle}>Verify my ride with a PIN</Text>
          <Text style={styles.pinBody}>Optional extra check. Normal Ride Now trips do not require a PIN.</Text>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Calculate Ride Now fare" disabled={disabled || quoting} onPress={() => loadQuote(selectedClass)} style={({ pressed }) => [styles.secondaryAction, (disabled || quoting) && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.secondaryActionText}>{quoting ? "Calculating..." : "See price"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Request Ride Now" disabled={disabled || requesting || quoting || !pickup || !dropoff} onPress={requestRide} style={({ pressed }) => [styles.primaryAction, (disabled || requesting || quoting || !pickup || !dropoff) && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.primaryActionText}>{requesting ? "Requesting..." : "Request ride"}</Text>
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push("/(customer)/search" as never)} style={({ pressed }) => [styles.intercityLink, pressed && styles.pressed]}>
        <Text style={styles.intercityTitle}>Looking for intercity or scheduled rides?</Text>
        <Text style={styles.intercityBody}>Search posted trips and reserve seats instead.</Text>
      </Pressable>

      <AuthRequiredModal visible={authOpen} onClose={() => setAuthOpen(false)} returnTo="/(customer)/hail" />
    </Screen>
  );
}

function LocationRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label.toLowerCase()}`} onPress={onPress} style={({ pressed }) => [styles.locationRow, pressed && styles.pressed]}>
      <View style={styles.locationMarker} />
      <View style={styles.flex}><Text style={styles.locationLabel}>{label}</Text><Text numberOfLines={2} style={styles.locationValue}>{value}</Text></View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 8, paddingTop: 2 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: v2Theme.colors.ink, fontSize: 34, lineHeight: 39, fontWeight: "900", letterSpacing: -1.25 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  activeCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  activeIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  activeTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  activeBody: { color: "rgba(255,255,255,0.68)", fontSize: 11, marginTop: 3 },
  routeCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden" },
  locationRow: { minHeight: 76, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  locationMarker: { width: 10, height: 10, borderRadius: 5, backgroundColor: v2Theme.colors.brand },
  locationLabel: { color: v2Theme.colors.inkTertiary, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  locationValue: { color: v2Theme.colors.ink, fontSize: 14, lineHeight: 19, fontWeight: "800", marginTop: 2 },
  routeDivider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginLeft: 52 },
  section: { gap: 10 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" },
  classGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  classPill: { minHeight: 44, borderRadius: 999, paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" },
  classPillActive: { backgroundColor: v2Theme.colors.ink, borderColor: v2Theme.colors.ink },
  classText: { color: v2Theme.colors.inkSecondary, fontSize: 12, fontWeight: "900" },
  classTextActive: { color: "#FFFFFF" },
  quoteCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 18, gap: 5 },
  quoteLabel: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" },
  quotePrice: { color: v2Theme.colors.ink, fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  quoteBody: { color: v2Theme.colors.inkSecondary, fontSize: 12, fontWeight: "700" },
  surge: { color: v2Theme.colors.warning, fontSize: 11, fontWeight: "900", marginTop: 4 },
  pinOption: { minHeight: 74, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  pinToggle: { width: 46, height: 28, borderRadius: 14, backgroundColor: v2Theme.colors.lineStrong, justifyContent: "center", paddingHorizontal: 3 },
  pinToggleOn: { backgroundColor: v2Theme.colors.brand },
  pinKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },
  pinKnobOn: { alignSelf: "flex-end" },
  pinTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  pinBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16, marginTop: 2 },
  actions: { flexDirection: "row", gap: 10 },
  primaryAction: { flex: 1, minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  primaryActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  secondaryAction: { flex: 1, minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, alignItems: "center", justifyContent: "center" },
  secondaryActionText: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  intercityLink: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 15 },
  intercityTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  intercityBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, marginTop: 3 },
  flex: { flex: 1 },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.72 },
});
