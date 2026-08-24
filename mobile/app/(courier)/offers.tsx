import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";

import { DeliveryMap } from "../../components/maps/DeliveryMap";
import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { claimCourierOffer, getActiveCourierDelivery, getCourierProfile, listCourierOffers } from "../../services/operationsService";
import { CourierDelivery } from "../../types/courier.types";
import { CourierProfile } from "../../types/operations.types";
import { decodePolyline } from "../../utils/decodePolyline";

export default function CourierOffersScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<CourierProfile | null>(null);
  const [offers, setOffers] = useState<CourierDelivery[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasActive, setHasActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [nextProfile, active] = await Promise.all([getCourierProfile(), getActiveCourierDelivery()]);
      const nextOffers = nextProfile?.status === "APPROVED" && nextProfile.online && !active ? await listCourierOffers() : [];
      setProfile(nextProfile);
      setHasActive(Boolean(active));
      setOffers(nextOffers);
      setSelectedId((current) => nextOffers.some((offer) => offer.id === current) ? current : nextOffers[0]?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load offers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load, 12000, loading || Boolean(profile?.online && !hasActive));
  const selected = offers.find((offer) => offer.id === selectedId) || null;
  const route = useMemo(() => decodePolyline(selected?.route_polyline), [selected?.route_polyline]);

  async function accept(offer: CourierDelivery) {
    if (claiming || hasActive) return;
    try {
      setClaiming(offer.id);
      setError(null);
      const claimed = await claimCourierOffer(offer.id);
      setOffers([]);
      router.push(`/(courier)/delivery/${claimed.id}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This offer could not be accepted.");
      await load();
    } finally {
      setClaiming(null);
    }
  }

  return (
    <Screen title="Offers" navRole="courier" onRefresh={load} refreshing={loading}>
      <View style={styles.heading}><View><Text style={styles.eyebrow}>AVAILABLE NOW</Text><Text style={styles.title}>Nearby work</Text></View><View style={styles.count}><Text style={styles.countText}>{offers.length}</Text></View></View>
      {loading ? <LoadingState label="Looking for delivery work…" /> : null}
      {error ? <Pressable accessibilityRole="button" onPress={load} style={styles.error}><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Retry</Text></Pressable> : null}
      {!loading && hasActive ? <StateCard icon="bike-fast" title="Your current delivery comes first" body="New offers are paused until the active handoff is complete." /> : null}
      {!loading && !hasActive && !profile?.online ? <StateCard icon="power" title="You’re offline" body="Go online from Home when you’re ready to receive work." /> : null}
      {!loading && profile?.online && !hasActive && offers.length === 0 ? <StateCard icon="radar" title="No offers nearby yet" body="Keep this screen open. New Courier and Food delivery work refreshes automatically." /> : null}

      {selected ? (
        <>
          <DeliveryMap pickup={selected.pickup_location} dropoff={selected.dropoff_location} route={route} height={285} />
          <View style={styles.selectedBar}><Text numberOfLines={1} style={styles.selectedText}>{selected.pickup_address} → {selected.dropoff_address}</Text><Text style={styles.selectedPay}>${Number(selected.courier_payout_usd || 0).toFixed(2)}</Text></View>
        </>
      ) : null}

      <View style={styles.list}>
        {offers.map((offer) => {
          const selectedOffer = offer.id === selectedId;
          return (
            <Pressable key={offer.id} accessibilityRole="button" onPress={() => setSelectedId(offer.id)} style={({ pressed }) => [styles.ticket, selectedOffer && styles.ticketSelected, pressed && styles.pressed]}>
              <View style={styles.ticketTop}><View style={styles.source}><MaterialCommunityIcons name={offer.source_type === "FOOD_ORDER" ? "food-takeout-box-outline" : "package-variant-closed"} size={18} color={v2Theme.colors.brandStrong} /><Text style={styles.sourceText}>{offer.source_type === "FOOD_ORDER" ? "FOOD DELIVERY" : "COURIER"}</Text></View><Text style={styles.pay}>${Number(offer.courier_payout_usd || 0).toFixed(2)}</Text></View>
              <RouteLine icon="arrow-up-circle" value={offer.pickup_address} />
              <RouteLine icon="map-marker" value={offer.dropoff_address} />
              <View style={styles.meta}><Meta icon="map-marker-distance" value={offer.distance_km != null ? `${offer.distance_km.toFixed(1)} km` : "Distance updating"} /><Meta icon="clock-outline" value={offer.estimated_duration_minutes ? `${offer.estimated_duration_minutes} min` : "ETA updating"} /></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Accept delivery for ${Number(offer.courier_payout_usd || 0).toFixed(2)} dollars`} disabled={Boolean(claiming)} onPress={() => accept(offer)} style={({ pressed }) => [styles.accept, claiming === offer.id && styles.disabled, pressed && styles.pressed]}><Text style={styles.acceptText}>{claiming === offer.id ? "Accepting…" : "Accept offer"}</Text><MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" /></Pressable>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

function StateCard({ icon, title, body }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string }) { return <View style={styles.state}><View style={styles.stateIcon}><MaterialCommunityIcons name={icon} size={28} color={v2Theme.colors.brandStrong} /></View><View style={styles.flex}><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateBody}>{body}</Text></View></View>; }
function RouteLine({ icon, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; value: string }) { return <View style={styles.routeLine}><MaterialCommunityIcons name={icon} size={18} color={v2Theme.colors.inkSecondary} /><Text numberOfLines={1} style={styles.routeText}>{value}</Text></View>; }
function Meta({ icon, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; value: string }) { return <View style={styles.metaItem}><MaterialCommunityIcons name={icon} size={16} color={v2Theme.colors.inkSecondary} /><Text style={styles.metaText}>{value}</Text></View>; }

const styles = StyleSheet.create({ flex: { flex: 1 }, heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, title: { color: v2Theme.colors.ink, fontSize: 30, fontWeight: "900", letterSpacing: -0.9, marginTop: 3 }, count: { minWidth: 39, height: 39, borderRadius: 14, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, countText: { color: v2Theme.colors.brandStrong, fontSize: 15, fontWeight: "900" }, error: { borderRadius: 17, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", gap: 10 }, errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 10, fontWeight: "700" }, retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" }, state: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }, stateIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, stateTitle: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" }, stateBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15, marginTop: 3 }, selectedBar: { borderRadius: 18, backgroundColor: v2Theme.colors.ink, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 }, selectedText: { flex: 1, color: "rgba(255,255,255,0.76)", fontSize: 10, fontWeight: "700" }, selectedPay: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" }, list: { gap: 10 }, ticket: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, borderWidth: 1, borderColor: v2Theme.colors.line, padding: 14, gap: 10 }, ticketSelected: { borderColor: v2Theme.colors.brand }, ticketTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, source: { flexDirection: "row", alignItems: "center", gap: 7 }, sourceText: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 }, pay: { color: v2Theme.colors.ink, fontSize: 21, fontWeight: "900" }, routeLine: { flexDirection: "row", alignItems: "center", gap: 8 }, routeText: { flex: 1, color: v2Theme.colors.ink, fontSize: 11, fontWeight: "800" }, meta: { flexDirection: "row", gap: 8 }, metaItem: { flex: 1, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, padding: 9, flexDirection: "row", alignItems: "center", gap: 6 }, metaText: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" }, accept: { minHeight: 49, borderRadius: 15, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, acceptText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.72 } });
