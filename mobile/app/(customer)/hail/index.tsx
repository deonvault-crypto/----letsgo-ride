import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
  const { trip: activeTrip, reload: reloadActive } = useActiveHailingTrip(false);
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
  const routeReady = Boolean(pickup && dropoff);

  useEffect(() => {
    setQuote(null);
  }, [
    pickup?.location.latitude,
    pickup?.location.longitude,
    dropoff?.location.latitude,
    dropoff?.location.longitude,
  ]);

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
  const actionDisabled = disabled || requesting || quoting || !routeReady;
  const actionLabel = requesting
    ? "Requesting…"
    : quoting
      ? "Calculating fare…"
      : quote
        ? `Request ride · $${quote.fare.total_fare.toFixed(2)}`
        : "See fare";

  return (
    <Screen navRole="customer" refreshing={false} onRefresh={() => { reloadConfig(); reloadActive(); }}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>RIDE NOW</Text>
        <Text style={styles.title}>Where to?</Text>
        <Text style={styles.body}>Choose pickup, then destination. We’ll show your fare before you request.</Text>
      </View>

      {configError ? <AppNotice message={configError} actionLabel="Retry" onAction={reloadConfig} /> : null}
      {disabled ? <AppNotice title="Not yet live here" message="Ride Now is currently disabled. Intercity and scheduled rides are still available." /> : null}
      {error ? <AppNotice message={error} onDismiss={() => setError(null)} /> : null}

      {active ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open active Ride Now trip"
          onPress={() => router.push(`/(customer)/hail/trip/${activeTrip.id}` as never)}
          style={({ pressed }) => [styles.activeCard, pressed && styles.pressed]}
        >
          <View style={styles.activeIcon}><MaterialCommunityIcons name="car-clock" size={23} color="#FFFFFF" /></View>
          <View style={styles.flex}>
            <Text style={styles.activeTitle}>Continue your Ride Now trip</Text>
            <Text style={styles.activeBody}>{activeTrip.status.replaceAll("_", " ")}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#FFFFFF" />
        </Pressable>
      ) : null}

      <View style={styles.routeCard}>
        <LocationRow
          label="Pickup"
          value={pickup?.address || "Choose pickup"}
          tone="pickup"
          onPress={() => router.push("/(shared)/location-picker?kind=pickup&flow=hailing" as never)}
        />
        <View style={styles.routeLineWrap}><View style={styles.routeLine} /></View>
        <LocationRow
          label="Destination"
          value={dropoff?.address || "Where are you going?"}
          tone="destination"
          onPress={() => router.push("/(shared)/location-picker?kind=dropoff&flow=hailing" as never)}
        />
      </View>

      {!routeReady ? (
        <View style={styles.routeHint}>
          <MaterialCommunityIcons name="gesture-tap" size={18} color={v2Theme.colors.brandStrong} />
          <Text style={styles.routeHintText}>
            {!pickup ? "Start with your pickup. Destination comes next." : "Pickup set. Now choose your destination."}
          </Text>
        </View>
      ) : null}

      {routeReady ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose your ride</Text>
          <View style={styles.classGrid}>
            {(enabledClasses.length ? enabledClasses : fallbackRideClasses).map((option) => {
              const activeClass = selectedClass === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeClass }}
                  onPress={() => {
                    setSelectedClass(option.id);
                    setQuote(null);
                  }}
                  style={({ pressed }) => [styles.classPill, activeClass && styles.classPillActive, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons
                    name={option.id === "XL" ? "van-passenger" : option.id === "COMFORT" ? "car-limousine" : "car"}
                    size={18}
                    color={activeClass ? "#FFFFFF" : v2Theme.colors.ink}
                  />
                  <Text style={[styles.classText, activeClass && styles.classTextActive]}>{option.label || option.id}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {quote ? (
        <View style={styles.quoteCard}>
          <View style={styles.quoteTop}>
            <View>
              <Text style={styles.quoteLabel}>ESTIMATED CASH FARE</Text>
              <Text style={styles.quotePrice}>${quote.fare.total_fare.toFixed(2)}</Text>
            </View>
            <View style={styles.etaPill}>
              <MaterialCommunityIcons name="map-marker-distance" size={16} color={v2Theme.colors.ink} />
              <Text style={styles.etaText}>{quote.route.distance_km.toFixed(1)} km</Text>
            </View>
          </View>
          <Text style={styles.quoteBody}>About {Math.round(quote.route.duration_minutes)} min · fare calculated from this route</Text>
          {quote.fare.surge_multiplier > 1 ? <Text style={styles.surge}>High demand fare shown before request</Text> : null}
        </View>
      ) : null}

      {quote ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: verifyWithPin }}
          onPress={() => setVerifyWithPin((current) => !current)}
          style={({ pressed }) => [styles.pinOption, pressed && styles.pressed]}
        >
          <View style={[styles.pinIcon, verifyWithPin && styles.pinIconActive]}>
            <MaterialCommunityIcons name="shield-key-outline" size={19} color={verifyWithPin ? "#FFFFFF" : v2Theme.colors.brandStrong} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.pinTitle}>Safety PIN</Text>
            <Text style={styles.pinBody}>Optional. Ask the driver to verify a PIN before starting.</Text>
          </View>
          <View style={[styles.pinToggle, verifyWithPin && styles.pinToggleOn]}>
            <View style={[styles.pinKnob, verifyWithPin && styles.pinKnobOn]} />
          </View>
        </Pressable>
      ) : null}

      {routeReady ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={quote ? "Request Ride Now" : "Calculate Ride Now fare"}
          disabled={actionDisabled}
          onPress={quote ? requestRide : () => loadQuote(selectedClass)}
          style={({ pressed }) => [styles.primaryAction, actionDisabled && styles.disabled, pressed && !actionDisabled && styles.pressed]}
        >
          <Text style={styles.primaryActionText}>{actionLabel}</Text>
          {!quoting && !requesting ? <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" /> : null}
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(customer)/search" as never)}
        style={({ pressed }) => [styles.intercityLink, pressed && styles.pressed]}
      >
        <View style={styles.intercityIcon}><MaterialCommunityIcons name="road-variant" size={20} color={v2Theme.colors.inkSecondary} /></View>
        <View style={styles.flex}>
          <Text style={styles.intercityTitle}>Intercity / scheduled rides</Text>
          <Text style={styles.intercityBody}>Search posted trips and reserve a seat.</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={v2Theme.colors.inkTertiary} />
      </Pressable>

      <AuthRequiredModal visible={authOpen} onClose={() => setAuthOpen(false)} returnTo="/(customer)/hail" />
    </Screen>
  );
}

function LocationRow({
  label,
  value,
  tone,
  onPress,
}: {
  label: string;
  value: string;
  tone: "pickup" | "destination";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Choose ${label.toLowerCase()}`}
      onPress={onPress}
      style={({ pressed }) => [styles.locationRow, pressed && styles.pressed]}
    >
      <View style={[styles.locationMarker, tone === "destination" && styles.locationMarkerDestination]}>
        {tone === "pickup" ? <View style={styles.locationMarkerCore} /> : null}
      </View>
      <View style={styles.flex}>
        <Text style={styles.locationLabel}>{label}</Text>
        <Text numberOfLines={2} style={styles.locationValue}>{value}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={21} color={v2Theme.colors.inkTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 4, paddingTop: 1 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.35 },
  title: { color: v2Theme.colors.ink, fontSize: 34, lineHeight: 38, fontWeight: "900", letterSpacing: -1.15 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 19, maxWidth: 335 },
  activeCard: { borderRadius: 22, backgroundColor: v2Theme.colors.ink, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  activeIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  activeTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  activeBody: { color: "rgba(255,255,255,0.66)", fontSize: 10, marginTop: 2 },
  routeCard: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden" },
  locationRow: { minHeight: 70, paddingHorizontal: 15, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  locationMarker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  locationMarkerDestination: { borderRadius: 3, borderColor: v2Theme.colors.ink, backgroundColor: v2Theme.colors.ink },
  locationMarkerCore: { width: 4, height: 4, borderRadius: 2, backgroundColor: v2Theme.colors.brand },
  locationLabel: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  locationValue: { color: v2Theme.colors.ink, fontSize: 15, lineHeight: 19, fontWeight: "800", marginTop: 2 },
  routeLineWrap: { height: 1, paddingLeft: 21, backgroundColor: v2Theme.colors.line },
  routeLine: { position: "absolute", left: 21, top: -16, width: 1, height: 33, backgroundColor: v2Theme.colors.lineStrong },
  routeHint: { minHeight: 42, borderRadius: 16, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: v2Theme.colors.brandSofter },
  routeHintText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  section: { gap: 9 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900", letterSpacing: -0.35 },
  classGrid: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
  classPill: { minHeight: 46, borderRadius: 16, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, backgroundColor: v2Theme.colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  classPillActive: { backgroundColor: v2Theme.colors.ink, borderColor: v2Theme.colors.ink },
  classText: { color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "900" },
  classTextActive: { color: "#FFFFFF" },
  quoteCard: { borderRadius: 22, backgroundColor: v2Theme.colors.brandSofter, padding: 16, gap: 5 },
  quoteTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  quoteLabel: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  quotePrice: { color: v2Theme.colors.ink, fontSize: 32, lineHeight: 36, fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  quoteBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "700" },
  etaPill: { minHeight: 34, paddingHorizontal: 10, borderRadius: 17, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.72)" },
  etaText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  surge: { color: v2Theme.colors.warning, fontSize: 10, fontWeight: "900", marginTop: 2 },
  pinOption: { minHeight: 66, borderRadius: 20, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  pinIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  pinIconActive: { backgroundColor: v2Theme.colors.brand },
  pinToggle: { width: 42, height: 24, borderRadius: 12, backgroundColor: v2Theme.colors.lineStrong, justifyContent: "center", paddingHorizontal: 3 },
  pinToggleOn: { backgroundColor: v2Theme.colors.brand },
  pinKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFFFFF" },
  pinKnobOn: { alignSelf: "flex-end" },
  pinTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  pinBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 14, marginTop: 2 },
  primaryAction: { minHeight: 56, borderRadius: 18, paddingHorizontal: 18, backgroundColor: v2Theme.colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  intercityLink: { minHeight: 68, borderRadius: 20, backgroundColor: v2Theme.colors.surfaceMuted, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  intercityIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" },
  intercityTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  intercityBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 2 },
  flex: { flex: 1 },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.993 }] },
});
