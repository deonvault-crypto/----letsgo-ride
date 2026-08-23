import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import {
  claimCourierOffer,
  getCourierEarnings,
  getCourierProfile,
  listAssignedCourierDeliveries,
  listCourierOffers,
  setCourierOnline,
} from "../../services/operationsService";
import { CourierDelivery } from "../../types/courier.types";
import { CourierEarningsSummary, CourierProfile } from "../../types/operations.types";

const emptyEarnings: CourierEarningsSummary = {
  currency: "USD",
  completed_deliveries: 0,
  total_payout_usd: 0,
  today_payout_usd: 0,
  last_7_days_payout_usd: 0,
  latest_payouts: [],
};

export default function CourierHomeScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<CourierProfile | null>(null);
  const [deliveries, setDeliveries] = useState<CourierDelivery[]>([]);
  const [offers, setOffers] = useState<CourierDelivery[]>([]);
  const [earnings, setEarnings] = useState<CourierEarningsSummary>(emptyEarnings);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const nextProfile = await getCourierProfile();
      const [nextDeliveries, nextEarnings] = await Promise.all([
        listAssignedCourierDeliveries(),
        getCourierEarnings(),
      ]);
      const nextOffers = nextProfile?.status === "APPROVED" && nextProfile.online
        ? await listCourierOffers()
        : [];
      setProfile(nextProfile);
      setDeliveries(nextDeliveries);
      setEarnings(nextEarnings);
      setOffers(nextOffers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load courier workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const approved = profile?.status === "APPROVED";
  const online = Boolean(approved && profile?.online);
  const activeDeliveries = deliveries.filter((item) => !["DELIVERED", "CANCELLED", "FAILED"].includes(item.status));

  useEffect(() => {
    if (!online) return;
    const timer = setInterval(async () => {
      try {
        const [nextOffers, nextDeliveries, nextEarnings] = await Promise.all([
          listCourierOffers(),
          listAssignedCourierDeliveries(),
          getCourierEarnings(),
        ]);
        setOffers(nextOffers);
        setDeliveries(nextDeliveries);
        setEarnings(nextEarnings);
      } catch {
        // Keep last known state on transient network failures.
      }
    }, 12000);
    return () => clearInterval(timer);
  }, [online]);

  async function toggleOnline() {
    if (!profile || busy) return;
    try {
      setBusy(true);
      setError(null);
      const updated = await setCourierOnline(!profile.online);
      setProfile(updated);
      setOffers(updated.online ? await listCourierOffers() : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change courier status.");
    } finally {
      setBusy(false);
    }
  }

  async function claim(offer: CourierDelivery) {
    if (claimingId) return;
    try {
      setClaimingId(offer.id);
      setError(null);
      const claimed = await claimCourierOffer(offer.id);
      setOffers((current) => current.filter((item) => item.id !== offer.id));
      setDeliveries((current) => [claimed, ...current.filter((item) => item.id !== claimed.id)]);
      router.push(`/(courier)/delivery/${claimed.id}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to accept this delivery offer.");
      await load();
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <Screen showNotifications={false}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>LETSGORIDE COURIER</Text>
          <Text style={styles.title}>Deliver. Earn. Stay focused.</Text>
          <Text style={styles.body}>This workspace is only for courier work. No ride-posting or customer mode lives here.</Text>
        </View>
        <View style={[styles.statusPill, online && styles.statusPillOnline]}>
          <View style={[styles.statusDot, online && styles.statusDotOnline]} />
          <Text style={[styles.statusText, online && styles.statusTextOnline]}>{online ? "ONLINE" : "OFFLINE"}</Text>
        </View>
      </View>

      {loading ? <LoadingState label="Loading courier workspace..." /> : null}

      {error ? (
        <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      {!loading && !profile ? (
        <View style={styles.setupCard}>
          <View style={styles.setupIcon}><MaterialCommunityIcons name="motorbike" size={28} color={v2Theme.colors.brandStrong} /></View>
          <Text style={styles.setupTitle}>Set up your courier profile</Text>
          <Text style={styles.setupBody}>Choose your delivery vehicle and submit your courier profile for approval.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(courier)/onboarding" as never)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Start courier setup</Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}

      {profile ? (
        <View style={styles.controlCard}>
          <View style={styles.controlCopy}>
            <Text style={styles.controlLabel}>Courier verification</Text>
            <Text style={styles.controlValue}>{profile.status.replaceAll("_", " ").toLowerCase()}</Text>
            <Text style={styles.controlHint}>{approved ? "You can go online and receive nearby delivery offers." : "Approval is required before paid delivery work."}</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={!approved || busy} onPress={toggleOnline} style={[styles.onlineButton, online && styles.onlineButtonActive, (!approved || busy) && styles.disabled]}>
            <Text style={[styles.onlineButtonText, online && styles.onlineButtonTextActive]}>{busy ? "Updating…" : online ? "Go offline" : "Go online"}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.metrics}>
        <Metric icon="briefcase-outline" label="Active jobs" value={String(activeDeliveries.length)} />
        <Metric icon="check-decagram-outline" label="Completed" value={String(earnings.completed_deliveries)} />
        <Metric icon="cash" label="Total earned" value={`$${earnings.total_payout_usd.toFixed(2)}`} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Delivery offers</Text><Text style={styles.sectionSub}>{online ? "Live priced courier work" : "Go online to receive offers"}</Text></View>
        </View>
        {!loading && online && offers.length === 0 ? (
          <View style={styles.emptyCard}><MaterialCommunityIcons name="radar" size={28} color={v2Theme.colors.brandStrong} /><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>Listening for delivery work</Text><Text style={styles.emptyBody}>New priced requests appear here while you stay online.</Text></View></View>
        ) : null}
        {offers.map((offer) => (
          <View key={offer.id} style={styles.jobCard}>
            <View style={styles.jobIcon}><MaterialCommunityIcons name={offer.source_type === "FOOD_ORDER" ? "food-fork-drink" : "package-variant-closed"} size={23} color={v2Theme.colors.brandStrong} /></View>
            <View style={styles.jobCopy}>
              <Text style={styles.jobType}>{offer.source_type === "FOOD_ORDER" ? "FOOD DELIVERY" : "COURIER DELIVERY"}</Text>
              <Text numberOfLines={2} style={styles.jobRoute}>{offer.pickup_address} → {offer.dropoff_address}</Text>
              <Text style={styles.jobMeta}>{offer.distance_km != null ? `${offer.distance_km.toFixed(1)} km` : "Distance pending"} · {offer.estimated_duration_minutes != null ? `${offer.estimated_duration_minutes} min` : "ETA pending"}</Text>
            </View>
            <View style={styles.jobAction}>
              <Text style={styles.payLabel}>YOUR PAY</Text>
              <Text style={styles.payValue}>${Number(offer.courier_payout_usd || 0).toFixed(2)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Accept delivery" disabled={Boolean(claimingId)} onPress={() => claim(offer)} style={[styles.acceptButton, claimingId && styles.disabled]}>
                <Text style={styles.acceptText}>{claimingId === offer.id ? "Accepting…" : "Accept"}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Active deliveries</Text><Text style={styles.sectionSub}>Jobs currently assigned to this courier account</Text></View></View>
        {activeDeliveries.length === 0 ? (
          <View style={styles.emptyCard}><MaterialCommunityIcons name="package-variant" size={26} color={v2Theme.colors.inkSecondary} /><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>No active delivery</Text><Text style={styles.emptyBody}>Accepted jobs will appear here.</Text></View></View>
        ) : null}
        {activeDeliveries.map((delivery) => (
          <Pressable key={delivery.id} accessibilityRole="button" onPress={() => router.push(`/(courier)/delivery/${delivery.id}` as never)} style={({ pressed }) => [styles.activeCard, pressed && styles.pressed]}>
            <View style={styles.activeIcon}><MaterialCommunityIcons name="navigation-variant-outline" size={22} color={v2Theme.colors.ink} /></View>
            <View style={styles.activeCopy}><Text style={styles.activeStatus}>{delivery.status.replaceAll("_", " ")}</Text><Text numberOfLines={2} style={styles.activeRoute}>{delivery.pickup_address} → {delivery.dropoff_address}</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

function Metric({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.metric}><View style={styles.metricIcon}><MaterialCommunityIcons name={icon} size={20} color={v2Theme.colors.brandStrong} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 18, gap: 14 },
  heroCopy: { gap: 7 },
  eyebrow: { color: "#8FE6AE", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#FFFFFF", fontSize: 29, lineHeight: 34, fontWeight: "900", letterSpacing: -0.8 },
  body: { color: "rgba(255,255,255,0.66)", fontSize: 12, lineHeight: 18 },
  statusPill: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 11, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6 },
  statusPillOnline: { backgroundColor: "rgba(70,203,115,0.18)" },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.42)" },
  statusDotOnline: { backgroundColor: "#65DE8E" },
  statusText: { color: "rgba(255,255,255,0.62)", fontSize: 9, fontWeight: "900" },
  statusTextOnline: { color: "#A6F2BE" },
  errorCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.dangerSoft, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" },
  retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },
  setupCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 18, gap: 10 },
  setupIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  setupTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900" },
  setupBody: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 52, borderRadius: 17, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  controlCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  controlCopy: { flex: 1, gap: 3 },
  controlLabel: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  controlValue: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900", textTransform: "capitalize" },
  controlHint: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  onlineButton: { minHeight: 42, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  onlineButtonActive: { backgroundColor: v2Theme.colors.ink },
  onlineButtonText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  onlineButtonTextActive: { color: "#FFFFFF" },
  metrics: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, minHeight: 105, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, padding: 11, gap: 4 },
  metricIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  metricValue: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" },
  metricLabel: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 9, marginTop: 2 },
  emptyCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  jobCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, padding: 13, flexDirection: "row", gap: 11, alignItems: "center" },
  jobIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  jobCopy: { flex: 1, gap: 3 },
  jobType: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  jobRoute: { color: v2Theme.colors.ink, fontSize: 11, lineHeight: 16, fontWeight: "900" },
  jobMeta: { color: v2Theme.colors.inkSecondary, fontSize: 8 },
  jobAction: { alignItems: "flex-end", gap: 4 },
  payLabel: { color: v2Theme.colors.inkTertiary, fontSize: 7, fontWeight: "900" },
  payValue: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900" },
  acceptButton: { minHeight: 32, borderRadius: 12, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  acceptText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  activeCard: { minHeight: 76, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  activeIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  activeCopy: { flex: 1, gap: 3 },
  activeStatus: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", textTransform: "capitalize" },
  activeRoute: { color: v2Theme.colors.ink, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72 },
});
