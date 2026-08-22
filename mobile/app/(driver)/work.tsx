import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import {
  claimCourierOffer,
  getCourierProfile,
  listAssignedCourierDeliveries,
  listCourierOffers,
  listWorkAvailability,
  setCourierOnline,
} from "../../services/operationsService";
import { CourierDelivery } from "../../types/courier.types";
import { CourierProfile, WorkAvailability } from "../../types/operations.types";

export default function DriverWorkScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<CourierProfile | null>(null);
  const [availability, setAvailability] = useState<WorkAvailability[]>([]);
  const [deliveries, setDeliveries] = useState<CourierDelivery[]>([]);
  const [offers, setOffers] = useState<CourierDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingOnline, setUpdatingOnline] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const nextProfile = await getCourierProfile();
      const [nextAvailability, nextDeliveries, nextOffers] = await Promise.all([
        listWorkAvailability(),
        listAssignedCourierDeliveries(),
        nextProfile?.status === "APPROVED" && nextProfile.online ? listCourierOffers() : Promise.resolve([]),
      ]);
      setProfile(nextProfile);
      setAvailability(nextAvailability);
      setDeliveries(nextDeliveries);
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

  const courierApproved = profile?.status === "APPROVED";
  const courierOnline = Boolean(courierApproved && profile?.online);

  return (
    <Screen navRole="driver">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>WORKSPACE</Text>
        <Text style={styles.title}>Drive. Deliver. Stay organised.</Text>
        <Text style={styles.body}>Scheduled rides, courier offers, availability and active jobs in one operating view.</Text>
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
          <View style={styles.modeIcon}><MaterialCommunityIcons name="car-clock" size={26} color={v2Theme.colors.ink} /></View>
          <Text style={styles.modeTitle}>Ride calendar</Text>
          <Text style={styles.modeBody}>Publish scheduled routes and manage passenger trips.</Text>
          <View style={styles.modeActionRow}><Text style={styles.modeAction}>Post a trip</Text><MaterialCommunityIcons name="arrow-right" size={17} color={v2Theme.colors.brandStrong} /></View>
        </Pressable>

        <View style={[styles.modeCard, styles.courierCard]}>
          <View style={[styles.modeIcon, styles.courierIcon]}><MaterialCommunityIcons name="motorbike" size={26} color={v2Theme.colors.brandStrong} /></View>
          <Text style={styles.modeTitle}>Courier</Text>
          <Text style={styles.modeBody}>{profile ? `Verification: ${profile.status.replaceAll("_", " ").toLowerCase()}` : "Set up a courier profile before delivery work."}</Text>
          {profile ? (
            <Pressable accessibilityRole="button" disabled={!courierApproved || updatingOnline} onPress={toggleOnline} style={({ pressed }) => [styles.onlineButton, courierOnline && styles.onlineButtonActive, !courierApproved && styles.disabled, pressed && styles.pressed]}>
              <View style={[styles.onlineDot, courierOnline && styles.onlineDotActive]} />
              <Text style={[styles.onlineText, courierOnline && styles.onlineTextActive]}>{updatingOnline ? "Updating…" : courierOnline ? "Online" : "Go online"}</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => router.push("/(driver)/courier-onboarding" as never)} style={styles.onboardingButton}><Text style={styles.onboardingText}>Set up courier</Text><MaterialCommunityIcons name="arrow-right" size={17} color={v2Theme.colors.brandStrong} /></Pressable>
          )}
        </View>
      </View>

      {profile && !courierApproved ? (
        <View style={styles.reviewNotice}>
          <MaterialCommunityIcons name="shield-clock-outline" size={23} color={v2Theme.colors.warning} />
          <View style={styles.noticeCopy}><Text style={styles.reviewNoticeTitle}>Courier review required</Text><Text style={styles.noticeBody}>You can plan availability now, but offers and online work stay locked until approval.</Text></View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Delivery offers</Text><Text style={styles.sectionSub}>{courierOnline ? "Priced work available to claim" : "Go online to receive priced offers"}</Text></View>
          <View style={[styles.livePill, courierOnline && styles.livePillActive]}><View style={[styles.liveDot, courierOnline && styles.liveDotActive]} /><Text style={[styles.liveText, courierOnline && styles.liveTextActive]}>{courierOnline ? "ONLINE" : "OFFLINE"}</Text></View>
        </View>

        {!loading && courierOnline && offers.length === 0 ? (
          <View style={styles.emptyRow}><MaterialCommunityIcons name="radar" size={25} color={v2Theme.colors.inkSecondary} /><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>No priced offers right now</Text><Text style={styles.emptyBody}>Only jobs with a confirmed customer fee and courier payout are offered. No fake distances or payouts are shown.</Text></View></View>
        ) : null}

        <View style={styles.offerList}>
          {offers.slice(0, 5).map((offer) => (
            <View key={offer.id} style={styles.offerCard}>
              <View style={styles.offerTop}>
                <View style={[styles.offerTypeIcon, offer.source_type === "FOOD_ORDER" && styles.foodIcon]}><MaterialCommunityIcons name={offer.source_type === "FOOD_ORDER" ? "food-fork-drink" : "package-variant-closed"} size={22} color={v2Theme.colors.brandStrong} /></View>
                <View style={styles.offerCopy}><Text style={styles.offerEyebrow}>{offer.source_type === "FOOD_ORDER" ? "FOOD DELIVERY" : "COURIER DELIVERY"}</Text><Text numberOfLines={2} style={styles.offerRoute}>{offer.pickup_address} → {offer.dropoff_address}</Text></View>
                <View style={styles.payoutWrap}><Text style={styles.payoutLabel}>YOUR PAYOUT</Text><Text style={styles.payoutValue}>${Number(offer.courier_payout_usd || 0).toFixed(2)}</Text></View>
              </View>
              <View style={styles.offerFacts}>
                <OfferFact icon="package-variant" value={offer.package_type.replaceAll("_", " ")} />
                {offer.distance_km != null ? <OfferFact icon="map-marker-distance" value={`${offer.distance_km.toFixed(1)} km`} /> : null}
                {offer.estimated_duration_minutes != null ? <OfferFact icon="clock-outline" value={`${offer.estimated_duration_minutes} min`} /> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Accept delivery offer for $${Number(offer.courier_payout_usd || 0).toFixed(2)}`} disabled={Boolean(claimingId)} onPress={() => claim(offer)} style={({ pressed }) => [styles.acceptButton, claimingId === offer.id && styles.disabled, pressed && !claimingId && styles.pressed]}>
                <Text style={styles.acceptText}>{claimingId === offer.id ? "Accepting…" : "Accept delivery"}</Text><MaterialCommunityIcons name="arrow-right" size={19} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Availability</Text><Text style={styles.sectionSub}>Your ride and courier calendar</Text></View><Pressable accessibilityRole="button" onPress={() => router.push("/(driver)/availability" as never)} style={styles.manageButton}><Text style={styles.manageText}>Manage</Text></Pressable></View>
        {loading ? <Text style={styles.loadingText}>Loading workspace…</Text> : null}
        {!loading && availability.length === 0 ? (
          <Pressable accessibilityRole="button" onPress={() => router.push("/(driver)/availability" as never)} style={({ pressed }) => [styles.emptyRow, pressed && styles.pressed]}><MaterialCommunityIcons name="calendar-blank-outline" size={25} color={v2Theme.colors.inkSecondary} /><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>No availability blocks yet</Text><Text style={styles.emptyBody}>Add working windows for courier matching and personal planning.</Text></View><MaterialCommunityIcons name="chevron-right" size={21} color={v2Theme.colors.inkTertiary} /></Pressable>
        ) : null}
        {availability.slice(0, 3).map((item) => <View key={item.id} style={styles.availabilityRow}><View style={styles.dateBadge}><Text style={styles.dateText}>{item.date.slice(5)}</Text></View><View style={styles.availabilityCopy}><Text style={styles.availabilityTitle}>{item.mode === "courier" ? "Courier availability" : "Ride availability"}</Text><Text style={styles.availabilityBody}>{item.start_time} – {item.end_time}</Text></View></View>)}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Delivery jobs</Text><Text style={styles.sectionSub}>Assigned to your courier account</Text></View><Text style={styles.count}>{deliveries.length}</Text></View>
        {!loading && deliveries.length === 0 ? <View style={styles.emptyRow}><MaterialCommunityIcons name="package-variant-closed" size={25} color={v2Theme.colors.inkSecondary} /><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>No assigned deliveries</Text><Text style={styles.emptyBody}>Accepted courier jobs will appear here with pickup, drop-off, controls and live location.</Text></View></View> : null}
        {deliveries.slice(0, 6).map((delivery) => (
          <Pressable key={delivery.id} accessibilityRole="button" onPress={() => router.push(`/(driver)/delivery/${delivery.id}` as never)} style={({ pressed }) => [styles.deliveryRow, pressed && styles.pressed]}>
            <View style={styles.deliveryIcon}><MaterialCommunityIcons name={delivery.source_type === "FOOD_ORDER" ? "food-fork-drink" : "package-variant-closed"} size={22} color={v2Theme.colors.brandStrong} /></View>
            <View style={styles.deliveryCopy}><Text numberOfLines={1} style={styles.deliveryTitle}>{delivery.pickup_address} → {delivery.dropoff_address}</Text><Text style={styles.deliveryBody}>{delivery.status.replaceAll("_", " ")}{delivery.courier_payout_usd != null ? ` · $${delivery.courier_payout_usd.toFixed(2)} payout` : ""}</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

function OfferFact({ icon, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; value: string }) {
  return <View style={styles.fact}><MaterialCommunityIcons name={icon} size={15} color={v2Theme.colors.inkSecondary} /><Text style={styles.factText}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { gap: 7 }, eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.25 }, title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1 }, body: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  errorCard: { minHeight: 54, borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 }, errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" }, retry: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" },
  modeGrid: { flexDirection: "row", gap: 10 }, modeCard: { flex: 1, minHeight: 204, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 15, gap: 8 }, courierCard: { backgroundColor: v2Theme.colors.brandSofter }, modeIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" }, courierIcon: { backgroundColor: v2Theme.colors.brandSoft }, modeTitle: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900" }, modeBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16, flex: 1 }, modeActionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modeAction: { color: v2Theme.colors.brandStrong, fontSize: 12, fontWeight: "900" },
  onlineButton: { minHeight: 38, borderRadius: 14, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, onlineButtonActive: { backgroundColor: v2Theme.colors.brand }, onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: v2Theme.colors.inkTertiary }, onlineDotActive: { backgroundColor: "#FFFFFF" }, onlineText: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" }, onlineTextActive: { color: "#FFFFFF" }, onboardingButton: { minHeight: 38, borderRadius: 14, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, onboardingText: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900" },
  reviewNotice: { minHeight: 74, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.warningSoft, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }, noticeCopy: { flex: 1, gap: 3 }, reviewNoticeTitle: { color: v2Theme.colors.warning, fontSize: 12, fontWeight: "900" }, noticeBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  section: { gap: 10 }, sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 }, sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 2 }, livePill: { borderRadius: v2Theme.radius.pill, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 5 }, livePillActive: { backgroundColor: v2Theme.colors.brandSoft }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.inkTertiary }, liveDotActive: { backgroundColor: v2Theme.colors.success }, liveText: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "900" }, liveTextActive: { color: v2Theme.colors.brandStrong },
  offerList: { gap: 10 }, offerCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 12 }, offerTop: { flexDirection: "row", alignItems: "center", gap: 10 }, offerTypeIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, foodIcon: { backgroundColor: v2Theme.colors.brandSofter }, offerCopy: { flex: 1, gap: 4 }, offerEyebrow: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 }, offerRoute: { color: v2Theme.colors.ink, fontSize: 12, lineHeight: 17, fontWeight: "900" }, payoutWrap: { alignItems: "flex-end", gap: 2 }, payoutLabel: { color: v2Theme.colors.inkTertiary, fontSize: 7, fontWeight: "900" }, payoutValue: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" }, offerFacts: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, fact: { minHeight: 30, borderRadius: 12, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 }, factText: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800", textTransform: "capitalize" }, acceptButton: { minHeight: 46, borderRadius: 14, backgroundColor: v2Theme.colors.ink, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, acceptText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  manageButton: { minHeight: 34, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" }, manageText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" }, count: { minWidth: 30, textAlign: "center", color: v2Theme.colors.ink, backgroundColor: v2Theme.colors.surfaceMuted, borderRadius: v2Theme.radius.pill, overflow: "hidden", paddingVertical: 6, paddingHorizontal: 8, fontSize: 11, fontWeight: "900" }, loadingText: { color: v2Theme.colors.inkSecondary, fontSize: 11 },
  emptyRow: { minHeight: 82, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }, emptyCopy: { flex: 1, gap: 3 }, emptyTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" }, emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  availabilityRow: { minHeight: 68, borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 11 }, dateBadge: { width: 46, height: 42, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, dateText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" }, availabilityCopy: { flex: 1, gap: 3 }, availabilityTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" }, availabilityBody: { color: v2Theme.colors.inkSecondary, fontSize: 10 },
  deliveryRow: { minHeight: 74, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 }, deliveryIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, deliveryCopy: { flex: 1, gap: 3 }, deliveryTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" }, deliveryBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, textTransform: "capitalize" },
  disabled: { opacity: 0.42 }, pressed: { opacity: 0.7, transform: [{ scale: 0.995 }] },
});
