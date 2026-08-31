import { MaterialCommunityIcons } from "@expo/vector-icons";
import { initPaymentSheet, initStripe, presentPaymentSheet } from "@stripe/stripe-react-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthRequiredModal } from "../../../components/auth/AuthRequiredModal";
import { HailingMapBackdrop } from "../../../components/hailing/HailingMapBackdrop";
import { RideClassCar } from "../../../components/hailing/RideClassCar";
import { BottomNav } from "../../../components/layout/BottomNav";
import { AppNotice } from "../../../components/ui/AppNotice";
import { v2Theme } from "../../../constants/v2Theme";
import { useLocationDraft } from "../../../contexts/LocationDraftContext";
import { useActiveHailingTrip, useHailingConfig } from "../../../hooks/useHailing";
import { hasSession } from "../../../services/authService";
import {
  createHailingQuote,
  createHailingStripePaymentIntent,
  getPaymentConfig,
  requestHailingTrip,
} from "../../../services/hailingService";
import {
  HailingPaymentMethod,
  HailingPlace,
  HailingQuote,
  HailingRideClass,
  HailingRideClassConfig,
  PaymentConfig,
} from "../../../types/hailing.types";

const RIDE_BLACK = "#111111";
const SHEET_BOTTOM = v2Theme.control.navHeight + 26;
const TERMINAL = new Set(["COMPLETED", "CANCELLED_BY_PASSENGER", "CANCELLED_BY_DRIVER", "CANCELLED_BY_ADMIN", "NO_DRIVER_FOUND"]);
const fallbackRideClasses: HailingRideClassConfig[] = [
  { id: "ECONOMY", label: "Economy", enabled: true },
  { id: "COMFORT", label: "Comfort", enabled: false },
  { id: "XL", label: "XL", enabled: false },
];

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
  const insets = useSafeAreaInsets();
  const { pickup, dropoff } = useLocationDraft();
  const { config, loading: configLoading, error: configError, reload: reloadConfig } = useHailingConfig();
  const { trip: activeTrip, reload: reloadActive } = useActiveHailingTrip(false);
  const [selectedClass, setSelectedClass] = useState<HailingRideClass>("ECONOMY");
  const [quote, setQuote] = useState<HailingQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [verifyWithPin, setVerifyWithPin] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<HailingPaymentMethod>("cash");
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classOptions = useMemo(
    () => (config?.ride_classes?.length ? config.ride_classes : fallbackRideClasses),
    [config?.ride_classes],
  );
  const routeReady = Boolean(pickup && dropoff);
  const cardEnabled = paymentConfig?.card_enabled === true;

  useEffect(() => {
    let mounted = true;
    getPaymentConfig()
      .then((next) => {
        if (mounted) setPaymentConfig(next);
      })
      .catch(() => {
        if (mounted) setPaymentConfig({ card_enabled: false, provider: null, currency: "USD" });
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!cardEnabled && paymentMethod === "card") setPaymentMethod("cash");
  }, [cardEnabled, paymentMethod]);

  useEffect(() => {
    setQuote(null);
  }, [
    pickup?.location.latitude,
    pickup?.location.longitude,
    dropoff?.location.latitude,
    dropoff?.location.longitude,
  ]);

  async function loadQuote(nextClass = selectedClass) {
    if (!pickup || !dropoff) return;
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
      const clientRequestId = `hail-${quote.quote_id}`;
      let stripePaymentIntentId: string | undefined;

      if (paymentMethod === "card") {
        if (!cardEnabled) throw new Error("Card payments are not available right now.");
        const intent = await createHailingStripePaymentIntent({
          quote_id: quote.quote_id,
          client_request_id: clientRequestId,
        });
        await initStripe({ publishableKey: intent.publishable_key });
        const initialized = await initPaymentSheet({
          merchantDisplayName: "LetsGoRide",
          paymentIntentClientSecret: intent.client_secret,
          allowsDelayedPaymentMethods: false,
          returnURL: "letsgoride://stripe-redirect",
        });
        if (initialized.error) throw new Error(initialized.error.message);
        const presented = await presentPaymentSheet();
        if (presented.error) {
          if (presented.error.code === "Canceled") return;
          throw new Error(presented.error.message);
        }
        stripePaymentIntentId = intent.payment_intent_id;
      }

      const trip = await requestHailingTrip({
        quote_id: quote.quote_id,
        payment_method: paymentMethod,
        client_request_id: clientRequestId,
        verify_ride_with_pin: verifyWithPin,
        stripe_payment_intent_id: stripePaymentIntentId,
      });
      router.replace(`/(customer)/hail/searching?tripId=${encodeURIComponent(trip.id)}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request your ride.");
    } finally {
      setRequesting(false);
    }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(customer)/home" as never);
  }

  function chooseClass(option: HailingRideClassConfig) {
    if (!option.enabled) return;
    setSelectedClass(option.id);
    if (quote && routeReady) void loadQuote(option.id);
    else setQuote(null);
  }

  function openActiveTrip() {
    if (!activeTrip) return;
    if (activeTrip.status === "SEARCHING") {
      router.push(`/(customer)/hail/searching?tripId=${encodeURIComponent(activeTrip.id)}` as never);
      return;
    }
    router.push(`/(customer)/hail/trip/${activeTrip.id}` as never);
  }

  const disabled = !configLoading && config?.enabled === false;
  const active = activeTrip && !TERMINAL.has(activeTrip.status);
  const actionDisabled = disabled || requesting || quoting;
  const actionLabel = !pickup
    ? "Choose pickup"
    : !dropoff
      ? "Choose destination"
      : requesting
        ? paymentMethod === "card" ? "Preparing secure card payment…" : "Sending your ride request…"
        : quoting
          ? "Calculating your fare…"
          : quote
            ? `Request ride · $${quote.fare.total_fare.toFixed(2)}`
            : "See fare";
  const actionIcon = requesting ? (paymentMethod === "card" ? "credit-card-lock-outline" : "send-outline") : quoting ? "calculator-variant-outline" : "arrow-right";

  function handlePrimaryAction() {
    if (!pickup) {
      router.push("/(shared)/location-picker?kind=pickup&flow=hailing" as never);
      return;
    }
    if (!dropoff) {
      router.push("/(shared)/location-picker?kind=dropoff&flow=hailing" as never);
      return;
    }
    if (quote) void requestRide();
    else void loadQuote(selectedClass);
  }

  return (
    <SafeAreaView edges={[]} style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <HailingMapBackdrop
        pickup={pickup ? pickup.location : null}
        dropoff={dropoff ? dropoff.location : null}
        route={quote?.route}
        bottomPadding={routeReady ? 500 : 360}
      />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} onPress={goBack} style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="chevron-left" size={27} color={RIDE_BLACK} />
        </Pressable>
        <View style={styles.ridePill}><Text style={styles.ridePillText}>RIDE NOW</Text></View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.topButtonSpacer} />
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <View><Text style={styles.eyebrow}>RIDE NOW</Text><Text style={styles.title}>Where to?</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Refresh Ride Now" hitSlop={6} onPress={() => { reloadConfig(); reloadActive(); }} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="refresh" size={19} color={RIDE_BLACK} />
            </Pressable>
          </View>

          {configError ? <AppNotice message={configError} actionLabel="Retry" onAction={reloadConfig} /> : null}
          {disabled ? <AppNotice title="Not yet live here" message="Ride Now is currently disabled. Intercity and scheduled rides are still available." /> : null}
          {error ? <AppNotice message={error} actionLabel="Retry" onAction={() => routeReady && void loadQuote(selectedClass)} onDismiss={() => setError(null)} /> : null}

          {active ? (
            <Pressable accessibilityRole="button" onPress={openActiveTrip} style={({ pressed }) => [styles.activeTrip, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="car-clock" size={20} color="#FFFFFF" />
              <View style={styles.flex}>
                <Text style={styles.activeTripTitle}>Continue current ride</Text>
                <Text style={styles.activeTripBody}>{activeTrip.status === "SEARCHING" ? "Finding nearby drivers" : activeTrip.status.replaceAll("_", " ")}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}

          <View style={styles.routeCard}>
            <LocationRow label="Pickup" value={pickup?.address || "Choose pickup"} tone="pickup" onPress={() => router.push("/(shared)/location-picker?kind=pickup&flow=hailing" as never)} />
            <View style={styles.divider} />
            <LocationRow label="Destination" value={dropoff?.address || "Where are you going?"} tone="destination" onPress={() => router.push("/(shared)/location-picker?kind=dropoff&flow=hailing" as never)} />
          </View>

          {routeReady ? (
            <View style={styles.classSection}>
              <Text style={styles.sectionTitle}>Choose your ride</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classRail}>
                {classOptions.map((option) => {
                  const selected = selectedClass === option.id;
                  const optionDisabled = !option.enabled;
                  const price = quote?.ride_class === option.id ? `$${quote.fare.total_fare.toFixed(2)}` : optionDisabled ? "Soon" : "Available";
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: optionDisabled }}
                      disabled={optionDisabled}
                      onPress={() => chooseClass(option)}
                      style={({ pressed }) => [styles.classCard, selected && styles.classCardSelected, optionDisabled && styles.classCardDisabled, pressed && styles.pressed]}
                    >
                      <RideClassCar rideClass={option.id} disabled={optionDisabled} selected={selected} />
                      <Text style={[styles.className, selected && styles.classNameSelected]}>{option.label || option.id}</Text>
                      <Text style={[styles.classPrice, selected && styles.classPriceSelected]}>{price}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {quote ? (
            <View style={styles.quoteStrip}>
              <View style={styles.quoteMetric}><Text style={styles.quoteMetricLabel}>FARE</Text><Text style={styles.quoteMetricValue}>${quote.fare.total_fare.toFixed(2)}</Text></View>
              <View style={styles.quoteDivider} />
              <View style={styles.quoteMetric}><Text style={styles.quoteMetricLabel}>TRIP</Text><Text style={styles.quoteMeta}>{quote.route.distance_km.toFixed(1)} km · ~{Math.round(quote.route.duration_minutes)} min</Text></View>
            </View>
          ) : null}

          {quote ? (
            <View style={styles.paymentSection}>
              <Text style={styles.paymentSectionTitle}>Payment</Text>
              <View style={styles.paymentRail}>
                <PaymentChoice
                  icon="cash"
                  label="Cash"
                  caption="Pay the driver"
                  selected={paymentMethod === "cash"}
                  onPress={() => setPaymentMethod("cash")}
                />
                {cardEnabled ? (
                  <PaymentChoice
                    icon="credit-card-outline"
                    label="Card"
                    caption="Secure with Stripe"
                    selected={paymentMethod === "card"}
                    onPress={() => setPaymentMethod("card")}
                  />
                ) : null}
              </View>
            </View>
          ) : null}

          {quote ? (
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: verifyWithPin }} onPress={() => setVerifyWithPin((current) => !current)} style={({ pressed }) => [styles.pinOption, pressed && styles.pressed]}>
              <View style={[styles.pinIcon, verifyWithPin && styles.pinIconActive]}><MaterialCommunityIcons name="shield-key-outline" size={18} color={verifyWithPin ? "#FFFFFF" : RIDE_BLACK} /></View>
              <View style={styles.flex}><Text style={styles.pinTitle}>Safety PIN</Text><Text style={styles.pinBody}>Optional ride verification before the trip starts.</Text></View>
              <View style={[styles.toggle, verifyWithPin && styles.toggleOn]}><View style={[styles.knob, verifyWithPin && styles.knobOn]} /></View>
            </Pressable>
          ) : null}

          <Pressable accessibilityRole="button" disabled={actionDisabled} onPress={handlePrimaryAction} style={({ pressed }) => [styles.primary, actionDisabled && styles.primaryBusy, pressed && !actionDisabled && styles.pressed]}>
            <View style={styles.primaryCopy}>
              <Text style={styles.primaryText}>{actionLabel}</Text>
              {quoting ? <Text style={styles.primaryHint}>Using the selected route and current fare rules</Text> : null}
              {requesting ? <Text style={styles.primaryHint}>{paymentMethod === "card" ? "Your card is authorized securely before dispatch" : "Your request is being sent securely"}</Text> : null}
            </View>
            <MaterialCommunityIcons name={actionIcon} size={20} color="#FFFFFF" />
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => router.push("/(customer)/search" as never)} style={({ pressed }) => [styles.intercityLink, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="road-variant" size={18} color={v2Theme.colors.inkSecondary} />
            <Text style={styles.intercityText}>Intercity / scheduled rides</Text>
            <MaterialCommunityIcons name="chevron-right" size={19} color={v2Theme.colors.inkTertiary} />
          </Pressable>
        </ScrollView>
      </View>

      <BottomNav role="customer" />
      <AuthRequiredModal visible={authOpen} onClose={() => setAuthOpen(false)} returnTo="/(customer)/hail" />
    </SafeAreaView>
  );
}

function LocationRow({ label, value, tone, onPress }: { label: string; value: string; tone: "pickup" | "destination"; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label.toLowerCase()}`} onPress={onPress} style={({ pressed }) => [styles.locationRow, pressed && styles.pressed]}>
      <View style={[styles.locationMarker, tone === "destination" && styles.locationMarkerDestination]}>{tone === "pickup" ? <View style={styles.locationMarkerCore} /> : null}</View>
      <View style={styles.flex}><Text style={styles.locationLabel}>{label}</Text><Text numberOfLines={1} style={styles.locationValue}>{value}</Text></View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={v2Theme.colors.inkTertiary} />
    </Pressable>
  );
}

function PaymentChoice({ icon, label, caption, selected, onPress }: { icon: "cash" | "credit-card-outline"; label: string; caption: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.paymentChoice, selected && styles.paymentChoiceSelected, pressed && styles.pressed]}
    >
      <View style={[styles.paymentIcon, selected && styles.paymentIconSelected]}>
        <MaterialCommunityIcons name={icon} size={18} color={selected ? "#FFFFFF" : RIDE_BLACK} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.paymentLabel, selected && styles.paymentLabelSelected]}>{label}</Text>
        <Text style={[styles.paymentCaption, selected && styles.paymentCaptionSelected]}>{caption}</Text>
      </View>
      <MaterialCommunityIcons name={selected ? "radiobox-marked" : "radiobox-blank"} size={18} color={selected ? "#FFFFFF" : v2Theme.colors.inkTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ECECE8" },
  topBar: { position: "absolute", left: 16, right: 16, zIndex: 30, elevation: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.10)", alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOpacity: 0.10, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  topButtonSpacer: { width: 48, height: 48 },
  ridePill: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.94)", alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.08)" },
  ridePillText: { color: RIDE_BLACK, fontSize: 10, fontWeight: "900", letterSpacing: 1.25 },
  sheet: { position: "absolute", left: 10, right: 10, bottom: SHEET_BOTTOM, maxHeight: "61%", minHeight: 248, backgroundColor: "rgba(255,255,255,0.985)", borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.08)", shadowColor: "#000000", shadowOpacity: 0.13, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12, overflow: "hidden" },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "#D7D8D5", alignSelf: "center", marginTop: 8 },
  sheetContent: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 16, gap: 11 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  eyebrow: { color: RIDE_BLACK, fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: v2Theme.colors.ink, fontSize: 27, lineHeight: 31, fontWeight: "900", letterSpacing: -0.8 },
  refreshButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  activeTrip: { minHeight: 48, borderRadius: 17, backgroundColor: RIDE_BLACK, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  activeTripTitle: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  activeTripBody: { color: "rgba(255,255,255,0.62)", fontSize: 9, marginTop: 1 },
  routeCard: { borderRadius: 19, backgroundColor: "#F7F7F5", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden" },
  locationRow: { minHeight: 55, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  locationMarker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: RIDE_BLACK, alignItems: "center", justifyContent: "center" },
  locationMarkerDestination: { borderRadius: 3, backgroundColor: RIDE_BLACK },
  locationMarkerCore: { width: 4, height: 4, borderRadius: 2, backgroundColor: RIDE_BLACK },
  locationLabel: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" },
  locationValue: { color: v2Theme.colors.ink, fontSize: 13, lineHeight: 17, fontWeight: "800", marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 36, backgroundColor: v2Theme.colors.lineStrong },
  classSection: { gap: 7 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  classRail: { gap: 9, paddingRight: 6, paddingVertical: 2 },
  classCard: { width: 112, minHeight: 124, borderRadius: 20, backgroundColor: "#F6F6F4", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, paddingHorizontal: 3, paddingTop: 8, paddingBottom: 10, alignItems: "center", justifyContent: "flex-start", overflow: "visible" },
  classCardSelected: { backgroundColor: RIDE_BLACK, borderColor: "rgba(84,199,121,0.26)", shadowColor: "#54C779", shadowOpacity: 0.20, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  classCardDisabled: { opacity: 0.52 },
  className: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900", marginTop: 1 },
  classNameSelected: { color: "#FFFFFF" },
  classPrice: { color: v2Theme.colors.inkTertiary, fontSize: 9.5, fontWeight: "800", marginTop: 2 },
  classPriceSelected: { color: "rgba(255,255,255,0.70)" },
  quoteStrip: { minHeight: 58, borderRadius: 17, backgroundColor: "#F2F2F0", paddingHorizontal: 12, flexDirection: "row", alignItems: "center" },
  quoteMetric: { flex: 1, gap: 2 },
  quoteMetricLabel: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  quoteMetricValue: { color: RIDE_BLACK, fontSize: 21, fontWeight: "900", letterSpacing: -0.5 },
  quoteMeta: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" },
  quoteDivider: { width: 1, height: 34, marginHorizontal: 10, backgroundColor: v2Theme.colors.lineStrong },
  paymentSection: { gap: 7 },
  paymentSectionTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  paymentRail: { flexDirection: "row", gap: 8 },
  paymentChoice: { flex: 1, minHeight: 58, borderRadius: 17, backgroundColor: "#F7F7F5", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  paymentChoiceSelected: { backgroundColor: RIDE_BLACK, borderColor: RIDE_BLACK },
  paymentIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: "#ECEDEB", alignItems: "center", justifyContent: "center" },
  paymentIconSelected: { backgroundColor: "rgba(255,255,255,0.14)" },
  paymentLabel: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  paymentLabelSelected: { color: "#FFFFFF" },
  paymentCaption: { color: v2Theme.colors.inkSecondary, fontSize: 8, lineHeight: 11, marginTop: 1 },
  paymentCaptionSelected: { color: "rgba(255,255,255,0.62)" },
  pinOption: { minHeight: 54, borderRadius: 17, backgroundColor: "#F7F7F5", paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  pinIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#ECEDEB", alignItems: "center", justifyContent: "center" },
  pinIconActive: { backgroundColor: RIDE_BLACK },
  pinTitle: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  pinBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 13, marginTop: 1 },
  toggle: { width: 39, height: 23, borderRadius: 12, backgroundColor: "#D8DAD7", padding: 3 },
  toggleOn: { backgroundColor: RIDE_BLACK },
  knob: { width: 17, height: 17, borderRadius: 9, backgroundColor: "#FFFFFF" },
  knobOn: { alignSelf: "flex-end" },
  primary: { minHeight: 54, borderRadius: 18, backgroundColor: RIDE_BLACK, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  primaryBusy: { backgroundColor: "#252525" },
  primaryCopy: { flex: 1 },
  primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  primaryHint: { color: "rgba(255,255,255,0.62)", fontSize: 8.5, lineHeight: 12, marginTop: 2 },
  intercityLink: { minHeight: 42, borderRadius: 15, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F8F8F6" },
  intercityText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" },
  flex: { flex: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
