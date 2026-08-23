import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import {
  claimCourierOffer,
  getActiveCourierDelivery,
  getCourierEarnings,
  getCourierProfile,
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
  const [activeDelivery, setActiveDelivery] = useState<CourierDelivery | null>(null);
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
      const [nextDelivery, nextEarnings] = await Promise.all([
        getActiveCourierDelivery(),
        getCourierEarnings(),
      ]);
      const nextOffers = nextProfile?.status === "APPROVED" && nextProfile.online && !nextDelivery
        ? await listCourierOffers()
        : [];
      setProfile(nextProfile);
      // Server truth wins on every login/focus hydration. A null response clears
      // any stale in-memory job immediately.
      setActiveDelivery(nextDelivery);
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
  const refreshLive = useCallback(async () => {
    try {
      const nextDelivery = await getActiveCourierDelivery();
      const [nextOffers, nextEarnings] = await Promise.all([
        online && !nextDelivery ? listCourierOffers() : Promise.resolve([]),
        getCourierEarnings(),
      ]);
      setOffers(nextOffers);
      setActiveDelivery(nextDelivery);
      setEarnings(nextEarnings);
    } catch {
      // Preserve the last known workspace during short network interruptions.
    }
  }, [online]);
  useLiveRefresh(refreshLive, 12000, online || Boolean(activeDelivery));

  async function toggleOnline() {
    if (!profile || busy) return;
    try {
      setBusy(true);
      setError(null);
      const updated = await setCourierOnline(!profile.online);
      setProfile(updated);
      setOffers(updated.online && !activeDelivery ? await listCourierOffers() : []);
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
      setActiveDelivery(claimed);
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
        <View style={styles.heroTop}>
          <View style={styles.heroMark}><MaterialCommunityIcons name="bike-fast" size={27} color="#FFFFFF" /></View>
          <View style={[styles.statusPill, online && styles.statusPillOnline]}>
            <View style={[styles.statusDot, online && styles.statusDotOnline]} />
            <Text style={[styles.statusText, online && styles.statusTextOnline]}>{online ? "ONLINE" : "OFFLINE"}</Text>
          </View>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>LETSGORIDE COURIER</Text>
          <Text style={styles.title}>{activeDelivery ? "Delivery in progress." : online ? "Ready for your next delivery." : "Your delivery day starts here."}</Text>
          <Text style={styles.body}>{activeDelivery ? (online ? "Your current route stays front and centre until the verified handoff is complete." : "Offline for new offers. Your current delivery remains active and trackable.") : online ? "Nearby paid jobs will appear below. Accept one and we’ll guide the journey from pickup to verified handoff." : "Go online when you’re ready to receive nearby delivery work."}</Text>
        </View>
      </View>

      {loading ? <WorkspaceLoading /> : null}

      {error ? (
        <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      {!loading && !profile ? (
        <View style={styles.setupCard}>
          <View style={styles.setupIcon}><MaterialCommunityIcons name="motorbike" size={29} color={v2Theme.colors.brandStrong} /></View>
          <Text style={styles.setupTitle}>Become a LetsGoRide Courier</Text>
          <Text style={styles.setupBody}>Add your delivery vehicle and courier details. Once approved, you can go online and receive paid jobs.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(courier)/onboarding" as never)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Set up courier account</Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}

      {profile ? (
        <View style={[styles.controlCard, online && styles.controlCardOnline]}>
          <View style={[styles.controlIcon, online && styles.controlIconOnline]}>
            <MaterialCommunityIcons name={online ? "radar" : "power"} size={25} color={online ? "#FFFFFF" : v2Theme.colors.brandStrong} />
          </View>
          <View style={styles.controlCopy}>
            <Text style={styles.controlValue}>{activeDelivery && !online ? "Offline for new offers" : online ? activeDelivery ? "Current delivery active" : "You’re receiving offers" : approved ? "You’re offline" : "Verification in progress"}</Text>
            <Text style={styles.controlHint}>{approved ? activeDelivery ? "Your current delivery remains visible and live until handoff." : online ? "Keep LetsGoRide open while you wait for nearby work." : "Go online whenever you’re ready to deliver." : `Courier status: ${profile.status.replaceAll("_", " ").toLowerCase()}.`}</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={!approved || busy} onPress={toggleOnline} style={[styles.onlineButton, online && styles.onlineButtonActive, (!approved || busy) && styles.disabled]}>
            {busy ? <ActivityIndicator size="small" color={online ? "#FFFFFF" : v2Theme.colors.ink} /> : <Text style={[styles.onlineButtonText, online && styles.onlineButtonTextActive]}>{online ? "Go offline" : "Go online"}</Text>}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.earningsCard}>
        <View style={styles.earningsMain}>
          <Text style={styles.earningsEyebrow}>TODAY</Text>
          <Text style={styles.earningsValue}>${earnings.today_payout_usd.toFixed(2)}</Text>
          <Text style={styles.earningsLabel}>courier earnings</Text>
        </View>
        <View style={styles.earningsDivider} />
        <View style={styles.earningsSide}>
          <MiniMetric label="7 DAYS" value={`$${earnings.last_7_days_payout_usd.toFixed(2)}`} />
          <MiniMetric label="COMPLETED" value={String(earnings.completed_deliveries)} />
        </View>
      </View>

      {activeDelivery ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}><View><Text style={styles.sectionEyebrow}>CURRENT</Text><Text style={styles.sectionTitle}>Active delivery</Text></View></View>
          <Pressable accessibilityRole="button" onPress={() => router.push(`/(courier)/delivery/${activeDelivery.id}` as never)} style={({ pressed }) => [styles.activeCard, pressed && styles.pressed]}>
              <View style={styles.activeTop}>
                <View style={styles.activeIcon}><MaterialCommunityIcons name={activeDelivery.source_type === "FOOD_ORDER" ? "food-takeout-box-outline" : "package-variant-closed"} size={23} color={v2Theme.colors.brandStrong} /></View>
                <View style={styles.activeCopy}><Text style={styles.activeStatus}>{humanCourierStatus(activeDelivery.status)}</Text><Text style={styles.activeHint}>{activeDeliveryHint(activeDelivery.status)}</Text></View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
              </View>
              <RouteLine pickup={activeDelivery.pickup_address} dropoff={activeDelivery.dropoff_address} />
            </Pressable>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionEyebrow}>NEARBY</Text><Text style={styles.sectionTitle}>Delivery offers</Text><Text style={styles.sectionSub}>{activeDelivery ? "New offers pause while you complete the current delivery" : online ? "Priced jobs available to your courier account" : "Go online to start receiving work"}</Text></View>
          {online && !activeDelivery ? <View style={styles.liveBadge}><View style={styles.liveBadgeDot} /><Text style={styles.liveBadgeText}>LIVE</Text></View> : null}
        </View>

        {!loading && online && !activeDelivery && offers.length === 0 ? (
          <View style={styles.listeningCard}>
            <View style={styles.radarWrap}><MaterialCommunityIcons name="radar" size={30} color={v2Theme.colors.brandStrong} /></View>
            <View style={styles.emptyCopy}><Text style={styles.emptyTitle}>Looking for nearby work…</Text><Text style={styles.emptyBody}>You’re online. New delivery offers will appear here automatically.</Text></View>
          </View>
        ) : null}

        {!online && profile && !activeDelivery ? (
          <View style={styles.emptyCard}><MaterialCommunityIcons name="power-sleep" size={27} color={v2Theme.colors.inkSecondary} /><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>Offers are paused</Text><Text style={styles.emptyBody}>Your courier account stays quiet until you go online.</Text></View></View>
        ) : null}

        {offers.map((offer) => (
          <View key={offer.id} style={styles.jobCard}>
            <View style={styles.offerTop}>
              <View style={styles.jobIcon}><MaterialCommunityIcons name={offer.source_type === "FOOD_ORDER" ? "food-fork-drink" : "package-variant-closed"} size={24} color={v2Theme.colors.brandStrong} /></View>
              <View style={styles.jobCopy}>
                <Text style={styles.jobType}>{offer.source_type === "FOOD_ORDER" ? "FOOD DELIVERY" : "COURIER DELIVERY"}</Text>
                <Text style={styles.jobMeta}>{offer.distance_km != null ? `${offer.distance_km.toFixed(1)} km` : "Distance calculating"} · {offer.estimated_duration_minutes != null ? `${offer.estimated_duration_minutes} min` : "ETA calculating"}</Text>
              </View>
              <View style={styles.payBlock}><Text style={styles.payLabel}>YOU EARN</Text><Text style={styles.payValue}>${Number(offer.courier_payout_usd || 0).toFixed(2)}</Text></View>
            </View>
            <RouteLine pickup={offer.pickup_address} dropoff={offer.dropoff_address} />
            <Pressable accessibilityRole="button" accessibilityLabel="Accept delivery" disabled={Boolean(claimingId)} onPress={() => claim(offer)} style={({ pressed }) => [styles.acceptButton, Boolean(claimingId) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.acceptText}>{claimingId === offer.id ? "Accepting delivery…" : "Accept delivery"}</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        ))}
      </View>

      {!activeDelivery && !loading ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current job</Text>
          <View style={styles.emptyCard}><MaterialCommunityIcons name="package-variant" size={27} color={v2Theme.colors.inkSecondary} /><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>No active delivery</Text><Text style={styles.emptyBody}>When you accept an offer, the route and live journey will take over this workspace.</Text></View></View>
        </View>
      ) : null}
    </Screen>
  );
}

function WorkspaceLoading() {
  return <View style={styles.loadingCard}><View style={styles.loadingIcon}><MaterialCommunityIcons name="bike-fast" size={25} color={v2Theme.colors.brandStrong} /></View><View style={styles.loadingCopy}><Text style={styles.loadingTitle}>Getting your workspace ready</Text><Text style={styles.loadingBody}>Checking jobs, offers and earnings…</Text></View><ActivityIndicator size="small" color={v2Theme.colors.brandStrong} /></View>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <View style={styles.miniMetric}><Text style={styles.miniMetricLabel}>{label}</Text><Text style={styles.miniMetricValue}>{value}</Text></View>;
}

function RouteLine({ pickup, dropoff }: { pickup: string; dropoff: string }) {
  return (
    <View style={styles.routeBox}>
      <View style={styles.routeRail}><View style={styles.pickupDot} /><View style={styles.routeRailLine} /><View style={styles.dropoffDot} /></View>
      <View style={styles.routeCopy}>
        <View><Text style={styles.routeLabel}>PICKUP</Text><Text numberOfLines={2} style={styles.routeText}>{pickup}</Text></View>
        <View><Text style={styles.routeLabel}>DROP-OFF</Text><Text numberOfLines={2} style={styles.routeText}>{dropoff}</Text></View>
      </View>
    </View>
  );
}

function humanCourierStatus(status: CourierDelivery["status"]) {
  if (status === "ASSIGNED" || status === "COURIER_TO_PICKUP") return "Head to pickup";
  if (status === "PICKED_UP" || status === "IN_TRANSIT") return "On the way to recipient";
  if (status === "ARRIVING") return "Almost at the recipient";
  if (status === "DELIVERED") return "Delivered";
  return status.replaceAll("_", " ").toLowerCase();
}

function activeDeliveryHint(status: CourierDelivery["status"]) {
  if (status === "ASSIGNED" || status === "COURIER_TO_PICKUP") return "Navigate there and confirm once collected.";
  if (status === "PICKED_UP" || status === "IN_TRANSIT") return "GPS is updating the journey automatically.";
  if (status === "ARRIVING") return "Handoff unlocks near the recipient pin.";
  return "Open delivery details";
}

const styles = StyleSheet.create({
  hero: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 18, gap: 18 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroMark: { width: 51, height: 51, borderRadius: 18, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  heroCopy: { gap: 7 },
  eyebrow: { color: "#8FE6AE", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#FFFFFF", fontSize: 29, lineHeight: 34, fontWeight: "900", letterSpacing: -0.8 },
  body: { color: "rgba(255,255,255,0.66)", fontSize: 12, lineHeight: 18 },
  statusPill: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 11, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6 },
  statusPillOnline: { backgroundColor: "rgba(70,203,115,0.18)" },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.42)" },
  statusDotOnline: { backgroundColor: "#65DE8E" },
  statusText: { color: "rgba(255,255,255,0.62)", fontSize: 9, fontWeight: "900" },
  statusTextOnline: { color: "#A6F2BE" },
  loadingCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  loadingIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  loadingCopy: { flex: 1, gap: 3 },
  loadingTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  loadingBody: { color: v2Theme.colors.inkSecondary, fontSize: 9 },
  errorCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.dangerSoft, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" },
  retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },
  setupCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 18, gap: 10 },
  setupIcon: { width: 56, height: 56, borderRadius: 19, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  setupTitle: { color: v2Theme.colors.ink, fontSize: 21, fontWeight: "900" },
  setupBody: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  controlCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  controlCardOnline: { backgroundColor: v2Theme.colors.brandSofter, borderColor: v2Theme.colors.brandSoft },
  controlIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  controlIconOnline: { backgroundColor: v2Theme.colors.brand },
  controlCopy: { flex: 1, gap: 3 },
  controlValue: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  controlHint: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  onlineButton: { minHeight: 42, minWidth: 82, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  onlineButtonActive: { backgroundColor: v2Theme.colors.ink },
  onlineButtonText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  onlineButtonTextActive: { color: "#FFFFFF" },
  earningsCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, padding: 16, flexDirection: "row", alignItems: "stretch", gap: 15 },
  earningsMain: { flex: 1.15, justifyContent: "center" },
  earningsEyebrow: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  earningsValue: { color: v2Theme.colors.ink, fontSize: 28, lineHeight: 33, fontWeight: "900", letterSpacing: -0.8 },
  earningsLabel: { color: v2Theme.colors.inkSecondary, fontSize: 9 },
  earningsDivider: { width: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line },
  earningsSide: { flex: 1, justifyContent: "space-around", gap: 10 },
  miniMetric: { gap: 2 },
  miniMetricLabel: { color: v2Theme.colors.inkTertiary, fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  miniMetricValue: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionEyebrow: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 21, fontWeight: "900", letterSpacing: -0.45 },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 9, marginTop: 2 },
  liveBadge: { borderRadius: 999, backgroundColor: v2Theme.colors.brandSoft, paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 5 },
  liveBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.brandStrong },
  liveBadgeText: { color: v2Theme.colors.brandStrong, fontSize: 7, fontWeight: "900" },
  emptyCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  listeningCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.brandSoft, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  radarWrap: { width: 52, height: 52, borderRadius: 18, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  jobCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 13 },
  offerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  jobIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  jobCopy: { flex: 1, gap: 3 },
  jobType: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  jobMeta: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "700" },
  payBlock: { alignItems: "flex-end", gap: 1 },
  payLabel: { color: v2Theme.colors.inkTertiary, fontSize: 7, fontWeight: "900" },
  payValue: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" },
  routeBox: { flexDirection: "row", gap: 10, backgroundColor: v2Theme.colors.surfaceMuted, borderRadius: 18, padding: 12 },
  routeRail: { width: 12, alignItems: "center", paddingVertical: 4 },
  pickupDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: v2Theme.colors.brand },
  routeRailLine: { flex: 1, width: 2, minHeight: 25, backgroundColor: v2Theme.colors.lineStrong },
  dropoffDot: { width: 9, height: 9, borderRadius: 2, backgroundColor: v2Theme.colors.ink },
  routeCopy: { flex: 1, gap: 10 },
  routeLabel: { color: v2Theme.colors.inkTertiary, fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  routeText: { color: v2Theme.colors.ink, fontSize: 10, lineHeight: 14, fontWeight: "800", marginTop: 2 },
  acceptButton: { minHeight: 52, borderRadius: 17, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  acceptText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  activeCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.brandSoft, padding: 14, gap: 12 },
  activeTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  activeIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  activeCopy: { flex: 1, gap: 3 },
  activeStatus: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  activeHint: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 13 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72 },
});
