import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import {
  claimCourierOffer,
  getCourierEarnings,
  getCourierProfile,
  listAssignedCourierDeliveries,
  listCourierOffers,
  listWorkAvailability,
  setCourierOnline,
} from "../../services/operationsService";
import { CourierDelivery } from "../../types/courier.types";
import { CourierEarningsSummary, CourierProfile, WorkAvailability } from "../../types/operations.types";

const emptyEarnings: CourierEarningsSummary = {
  currency: "USD",
  completed_deliveries: 0,
  total_payout_usd: 0,
  today_payout_usd: 0,
  last_7_days_payout_usd: 0,
  latest_payouts: [],
};

export default function DriverWorkScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<CourierProfile | null>(null);
  const [availability, setAvailability] = useState<WorkAvailability[]>([]);
  const [deliveries, setDeliveries] = useState<CourierDelivery[]>([]);
  const [offers, setOffers] = useState<CourierDelivery[]>([]);
  const [earnings, setEarnings] = useState<CourierEarningsSummary>(emptyEarnings);
  const [loading, setLoading] = useState(true);
  const [refreshingOffers, setRefreshingOffers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingOnline, setUpdatingOnline] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const nextProfile = await getCourierProfile();
      const [nextAvailability, nextDeliveries, nextEarnings, nextOffers] = await Promise.all([
        listWorkAvailability(),
        listAssignedCourierDeliveries(),
        getCourierEarnings(),
        nextProfile?.status === "APPROVED" && nextProfile.online ? listCourierOffers() : Promise.resolve([]),
      ]);
      setProfile(nextProfile);
      setAvailability(nextAvailability);
      setDeliveries(nextDeliveries);
      setEarnings(nextEarnings);
      setOffers(nextOffers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load work workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const courierApproved = profile?.status === "APPROVED";
  const courierOnline = Boolean(courierApproved && profile?.online);

  useEffect(() => {
    if (!courierOnline) return;
    const timer = setInterval(async () => {
      try {
        setRefreshingOffers(true);
        const [nextOffers, nextDeliveries, nextEarnings] = await Promise.all([
          listCourierOffers(),
          listAssignedCourierDeliveries(),
          getCourierEarnings(),
        ]);
        setOffers(nextOffers);
        setDeliveries(nextDeliveries);
        setEarnings(nextEarnings);
      } catch {
        // Keep the last known workspace on transient polling errors. Manual refresh remains available.
      } finally {
        setRefreshingOffers(false);
      }
    }, 12000);
    return () => clearInterval(timer);
  }, [courierOnline]);

  async function toggleOnline() {
    if (!profile || updatingOnline) return;
    try {
      setUpdatingOnline(true);
      setError(null);
      const updated = await setCourierOnline(!profile.online);
      setProfile(updated);
      setOffers(updated.online ? await listCourierOffers() : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change courier status.");
    } finally {
      setUpdatingOnline(false);
    }
  }

  async function refreshOffers() {
    if (!courierOnline || refreshingOffers) return;
    try {
      setRefreshingOffers(true);
      setError(null);
      setOffers(await listCourierOffers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh delivery offers.");
    } finally {
      setRefreshingOffers(false);
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
      router.push(`/(driver)/delivery/${claimed.id}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to accept this delivery offer.");
      await load();
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <Screen navRole="driver">
      <View style={styles.hero}>
        <View>
          <Text style={styles.eyebrow}>DRIVER + COURIER</Text>
          <Text style={styles.title}>Work, without the clutter.</Text>
          <Text style={styles.body}>Trips, delivery offers, active jobs and completed earnings in one operating view.</Text>
        </View>
        <View style={[styles.heroStatus, courierOnline && styles.heroStatusOnline]}>
          <View style={[styles.heroStatusDot, courierOnline && styles.heroStatusDotOnline]} />
          <Text style={[styles.heroStatusText, courierOnline && styles.heroStatusTextOnline]}>{courierOnline ? "ONLINE" : "OFFLINE"}</Text>
        </View>
      </View>

      {error ? (
        <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      <View style={styles.modeGrid}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/(driver)/post-trip" as never)} style={({ pressed }) => [styles.modeCard, pressed && styles.pressed]}>
          <View style={styles.modeIcon}><MaterialCommunityIcons name="car-clock" size={25} color={v2Theme.colors.ink} /></View>
          <Text style={styles.modeTitle}>Ride calendar</Text>
          <Text style={styles.modeBody}>Publish intercity routes and manage passenger trips.</Text>
          <View style={styles.modeAction}><Text style={styles.modeActionText}>Post trip</Text><MaterialCommunityIcons name="arrow-right" size={17} color={v2Theme.colors.ink} /></View>
        </Pressable>

        <View style={[styles.modeCard, styles.courierModeCard]}>
          <View style={[styles.modeIcon, styles.courierModeIcon]}><MaterialCommunityIcons name="motorbike" size={25} color={v2Theme.colors.brandStrong} /></View>
          <Text style={styles.modeTitle}>Courier</Text>
          <Text style={styles.modeBody}>{profile ? `Verification ${profile.status.replaceAll("_", " ").toLowerCase()}` : "Create a courier profile before taking delivery work."}</Text>
          {profile ? (
            <Pressable accessibilityRole="button" disabled={!courierApproved || updatingOnline} onPress={toggleOnline} style={({ pressed }) => [styles.onlineButton, courierOnline && styles.onlineButtonActive, !courierApproved && styles.disabled, pressed && styles.pressed]}>
              <View style={[styles.onlineDot, courierOnline && styles.onlineDotActive]} />
              <Text style={[styles.onlineText, courierOnline && styles.onlineTextActive]}>{updatingOnline ? "Updating…" : courierOnline ? "Go offline" : "Go online"}</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => router.push("/(driver)/courier-onboarding" as never)} style={styles.onboardingButton}><Text style={styles.onboardingText}>Set up courier</Text><MaterialCommunityIcons name="arrow-right" size={17} color={v2Theme.colors.brandStrong} /></Pressable>
          )}
        </View>
      </View>

      {profile && !courierApproved ? (
        <View style={styles.reviewNotice}>
          <MaterialCommunityIcons name="shield-clock-outline" size={23} color={v2Theme.colors.warning} />
          <View style={styles.noticeCopy}><Text style={styles.reviewNoticeTitle}>Courier review required</Text><Text style={styles.noticeBody}>Availability can be planned now. Going online and claiming paid work stays locked until approval.</Text></View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Earnings</Text><Text style={styles.sectionSub}>Completed courier payouts only</Text></View><View style={styles.completedPill}><Text style={styles.completedPillText}>{earnings.completed_deliveries} completed</Text></View></View>
        <View style={styles.earningsCard}>
          <View style={styles.earningsPrimary}><Text style={styles.earningsEyebrow}>TOTAL EARNED</Text><Text style={styles.earningsTotal}>${earnings.total_payout_usd.toFixed(2)}</Text><Text style={styles.earningsCurrency}>{earnings.currency}</Text></View>
          <View style={styles.earningsSide}>
            <EarningsFact label="Today" value={`$${earnings.today_payout_usd.toFixed(2)}`} />
            <View style={styles.earningsDivider} />
            <EarningsFact label="Last 7 days" value={`$${earnings.last_7_days_payout_usd.toFixed(2)}`} />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Delivery offers</Text><Text style={styles.sectionSub}>{courierOnline ? "Live priced work · refreshes automatically" : "Go online to receive priced offers"}</Text></View>
          <Pressable accessibilityRole="button" disabled={!courierOnline || refreshingOffers} onPress={refreshOffers} style={[styles.refreshButton, (!courierOnline || refreshingOffers) && styles.disabled]}>
            <MaterialCommunityIcons name="refresh" size={17} color={v2Theme.colors.inkSecondary} />
          </Pressable>
        </View>

        {!loading && courierOnline && offers.length === 0 ? (
          <View style={styles.emptyRow}><View style={styles.emptyIcon}><MaterialCommunityIcons name="radar" size={24} color={v2Theme.colors.brandStrong} /></View><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>Listening for delivery work</Text><Text style={styles.emptyBody}>Only confirmed priced jobs are offered. New offers refresh while you stay online.</Text></View></View>
        ) : null}

        <View style={styles.offerList}>
          {offers.slice(0, 6).map((offer) => (
            <View key={offer.id} style={styles.offerCard}>
              <View style={styles.offerTop}>
                <View style={[styles.offerTypeIcon, offer.source_type === "FOOD_ORDER" && styles.foodIcon]}><MaterialCommunityIcons name={offer.source_type === "FOOD_ORDER" ? "food-fork-drink" : "package-variant-closed"} size={22} color={v2Theme.colors.brandStrong} /></View>
                <View style={styles.offerCopy}><Text style={styles.offerEyebrow}>{offer.source_type === "FOOD_ORDER" ? "FOOD DELIVERY" : "COURIER DELIVERY"}</Text><Text numberOfLines={2} style={styles.offerRoute}>{offer.pickup_address} → {offer.dropoff_address}</Text></View>
                <View style={styles.payoutWrap}><Text style={styles.payoutLabel}>YOUR PAY</Text><Text style={styles.payoutValue}>${Number(offer.courier_payout_usd || 0).toFixed(2)}</Text></View>
              </View>
              <View style={styles.offerFacts}>
                <OfferFact icon="package-variant" value={offer.package_type.replaceAll("_", " ")} />
                {offer.distance_km != null ? <OfferFact icon="map-marker-distance" value={`${offer.distance_km.toFixed(1)} km`} /> : null}
                {offer.estimated_duration_minutes != null ? <OfferFact icon="clock-outline" value={`${offer.estimated_duration_minutes} min`} /> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Accept delivery offer for $${Number(offer.courier_payout_usd || 0).toFixed(2)}`} disabled={Boolean(claimingId)} onPress={() => claim(offer)} style={({ pressed }) => [styles.acceptButton, claimingId === offer.id && styles.disabled, pressed && !claimingId && styles.pressed]}>
                <View><Text style={styles.acceptText}>{claimingId === offer.id ? "Accepting…" : "Accept delivery"}</Text><Text style={styles.acceptSub}>Claim is atomic — another courier cannot take it after you</Text></View>
                <MaterialCommunityIcons name="arrow-right" size={19} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Active delivery jobs</Text><Text style={styles.sectionSub}>Assigned to your courier account</Text></View><Text style={styles.count}>{deliveries.length}</Text></View>
        {!loading && deliveries.length === 0 ? <View style={styles.emptyRow}><View style={styles.emptyIcon}><MaterialCommunityIcons name="package-variant-closed" size={24} color={v2Theme.colors.inkSecondary} /></View><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>No assigned deliveries</Text><Text style={styles.emptyBody}>Accepted courier jobs appear here with navigation, live location and handoff controls.</Text></View></View> : null}
        {deliveries.slice(0, 6).map((delivery) => (
          <Pressable key={delivery.id} accessibilityRole="button" onPress={() => router.push(`/(driver)/delivery/${delivery.id}` as never)} style={({ pressed }) => [styles.deliveryRow, pressed && styles.pressed]}>
            <View style={styles.deliveryIcon}><MaterialCommunityIcons name={delivery.source_type === "FOOD_ORDER" ? "food-fork-drink" : "package-variant-closed"} size={22} color={v2Theme.colors.brandStrong} /></View>
            <View style={styles.deliveryCopy}><Text numberOfLines={1} style={styles.deliveryTitle}>{delivery.pickup_address} → {delivery.dropoff_address}</Text><Text style={styles.deliveryBody}>{delivery.status.replaceAll("_", " ")}{delivery.courier_payout_usd != null ? ` · $${delivery.courier_payout_usd.toFixed(2)} payout` : ""}</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Availability</Text><Text style={styles.sectionSub}>Ride and courier working windows</Text></View><Pressable accessibilityRole="button" onPress={() => router.push("/(driver)/availability" as never)} style={styles.manageButton}><Text style={styles.manageText}>Manage</Text></Pressable></View>
        {loading ? <Text style={styles.loadingText}>Loading workspace…</Text> : null}
        {!loading && availability.length === 0 ? (
          <Pressable accessibilityRole="button" onPress={() => router.push("/(driver)/availability" as never)} style={({ pressed }) => [styles.emptyRow, pressed && styles.pressed]}><View style={styles.emptyIcon}><MaterialCommunityIcons name="calendar-blank-outline" size={24} color={v2Theme.colors.inkSecondary} /></View><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>No availability yet</Text><Text style={styles.emptyBody}>Add working windows for planning and future matching logic.</Text></View><MaterialCommunityIcons name="chevron-right" size={21} color={v2Theme.colors.inkTertiary} /></Pressable>
        ) : null}
        {availability.slice(0, 3).map((item) => <View key={item.id} style={styles.availabilityRow}><View style={styles.dateBadge}><Text style={styles.dateText}>{item.date.slice(5)}</Text></View><View style={styles.availabilityCopy}><Text style={styles.availabilityTitle}>{item.mode === "courier" ? "Courier availability" : "Ride availability"}</Text><Text style={styles.availabilityBody}>{item.start_time} – {item.end_time}</Text></View></View>)}
      </View>
    </Screen>
  );
}

function EarningsFact({ label, value }: { label: string; value: string }) {
  return <View style={styles.earningsFact}><Text style={styles.earningsFactLabel}>{label}</Text><Text style={styles.earningsFactValue}>{value}</Text></View>;
}

function OfferFact({ icon, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; value: string }) {
  return <View style={styles.fact}><MaterialCommunityIcons name={icon} size={15} color={v2Theme.colors.inkSecondary} /><Text style={styles.factText}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 4 },
  title: { color: v2Theme.colors.ink, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18, marginTop: 5, maxWidth: 290 },
  heroStatus: { marginLeft: "auto", minHeight: 31, borderRadius: 999, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  heroStatusOnline: { backgroundColor: v2Theme.colors.brandSoft },
  heroStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.inkTertiary },
  heroStatusDotOnline: { backgroundColor: v2Theme.colors.brand },
  heroStatusText: { color: v2Theme.colors.inkSecondary, fontSize: 7, fontWeight: "900" },
  heroStatusTextOnline: { color: v2Theme.colors.brandStrong },

  errorCard: { minHeight: 54, borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 10, fontWeight: "700" },
  retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },

  modeGrid: { flexDirection: "row", gap: 10 },
  modeCard: { flex: 1, minHeight: 197, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 14, gap: 8 },
  courierModeCard: { backgroundColor: v2Theme.colors.brandSofter },
  modeIcon: { width: 45, height: 45, borderRadius: 16, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" },
  courierModeIcon: { backgroundColor: v2Theme.colors.brandSoft },
  modeTitle: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" },
  modeBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15, flex: 1 },
  modeAction: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modeActionText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  onlineButton: { minHeight: 39, borderRadius: 14, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  onlineButtonActive: { backgroundColor: v2Theme.colors.ink },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: v2Theme.colors.inkTertiary },
  onlineDotActive: { backgroundColor: v2Theme.colors.brand },
  onlineText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  onlineTextActive: { color: "#FFFFFF" },
  onboardingButton: { minHeight: 39, borderRadius: 14, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  onboardingText: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900" },

  reviewNotice: { minHeight: 74, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.warningSoft, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  noticeCopy: { flex: 1, gap: 3 },
  reviewNoticeTitle: { color: v2Theme.colors.warning, fontSize: 12, fontWeight: "900" },
  noticeBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },

  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 9, marginTop: 2 },
  completedPill: { minHeight: 29, borderRadius: 999, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 9, justifyContent: "center" },
  completedPillText: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "900" },

  earningsCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 16, flexDirection: "row", gap: 14 },
  earningsPrimary: { flex: 1, justifyContent: "center" },
  earningsEyebrow: { color: "rgba(255,255,255,0.48)", fontSize: 7, fontWeight: "900", letterSpacing: 0.9 },
  earningsTotal: { color: "#FFFFFF", fontSize: 31, fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  earningsCurrency: { color: "rgba(255,255,255,0.42)", fontSize: 8, fontWeight: "800" },
  earningsSide: { width: 124, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 11, justifyContent: "center" },
  earningsFact: { minHeight: 48, justifyContent: "center", gap: 2 },
  earningsFactLabel: { color: "rgba(255,255,255,0.48)", fontSize: 7, fontWeight: "800" },
  earningsFactValue: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  earningsDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.14)" },

  refreshButton: { width: 36, height: 36, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  offerList: { gap: 10 },
  offerCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 12 },
  offerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  offerTypeIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  foodIcon: { backgroundColor: v2Theme.colors.brandSofter },
  offerCopy: { flex: 1, gap: 4 },
  offerEyebrow: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  offerRoute: { color: v2Theme.colors.ink, fontSize: 12, lineHeight: 17, fontWeight: "900" },
  payoutWrap: { alignItems: "flex-end", gap: 2 },
  payoutLabel: { color: v2Theme.colors.inkTertiary, fontSize: 7, fontWeight: "900" },
  payoutValue: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" },
  offerFacts: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  fact: { minHeight: 30, borderRadius: 12, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  factText: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800", textTransform: "capitalize" },
  acceptButton: { minHeight: 52, borderRadius: 15, backgroundColor: v2Theme.colors.ink, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  acceptText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  acceptSub: { color: "rgba(255,255,255,0.48)", fontSize: 7, marginTop: 2 },

  count: { minWidth: 30, textAlign: "center", color: v2Theme.colors.ink, backgroundColor: v2Theme.colors.surfaceMuted, borderRadius: v2Theme.radius.pill, overflow: "hidden", paddingVertical: 6, paddingHorizontal: 8, fontSize: 10, fontWeight: "900" },
  emptyRow: { minHeight: 82, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  emptyIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },

  deliveryRow: { minHeight: 74, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  deliveryIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  deliveryCopy: { flex: 1, gap: 3 },
  deliveryTitle: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  deliveryBody: { color: v2Theme.colors.inkSecondary, fontSize: 8, textTransform: "capitalize" },

  manageButton: { minHeight: 34, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  manageText: { color: v2Theme.colors.ink, fontSize: 9, fontWeight: "900" },
  loadingText: { color: v2Theme.colors.inkSecondary, fontSize: 10 },
  availabilityRow: { minHeight: 68, borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  dateBadge: { width: 46, height: 42, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  dateText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  availabilityCopy: { flex: 1, gap: 3 },
  availabilityTitle: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  availabilityBody: { color: v2Theme.colors.inkSecondary, fontSize: 9 },

  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
