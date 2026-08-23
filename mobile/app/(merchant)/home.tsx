import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { listMyRestaurants } from "../../services/merchantService";
import { MerchantRestaurant } from "../../types/merchant.types";

export default function MerchantHomeScreen() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<MerchantRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setRestaurants(await listMyRestaurants());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load merchant workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  return (
    <Screen showBack fallbackRoute="/(shared)/account" title="Merchant" showNotifications={false}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LETSGORIDE MERCHANT</Text>
        <Text style={styles.title}>Run your restaurant.</Text>
        <Text style={styles.body}>Menus, availability and incoming orders live in one operating workspace.</Text>
      </View>

      <View style={styles.topActions}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/(merchant)/new" as never)} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
          <View style={styles.primaryActionIcon}><MaterialCommunityIcons name="plus" size={22} color="#FFFFFF" /></View>
          <View style={styles.actionCopy}>
            <Text style={styles.primaryActionTitle}>Add restaurant</Text>
            <Text style={styles.primaryActionBody}>Create a merchant profile and menu</Text>
          </View>
          <MaterialCommunityIcons name="arrow-right" size={21} color="#FFFFFF" />
        </Pressable>
      </View>

      {error ? (
        <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Your restaurants</Text>
            <Text style={styles.sectionSub}>{restaurants.length} merchant locations</Text>
          </View>
          <View style={styles.countPill}><Text style={styles.countText}>{restaurants.length}</Text></View>
        </View>

        {loading ? <Text style={styles.loading}>Loading restaurants…</Text> : null}

        {!loading && !error && restaurants.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}><MaterialCommunityIcons name="storefront-outline" size={29} color={v2Theme.colors.brandStrong} /></View>
            <Text style={styles.emptyTitle}>No restaurant yet</Text>
            <Text style={styles.emptyBody}>Start with the business details, then build categories and menu items before submitting for review.</Text>
          </View>
        ) : null}

        <View style={styles.restaurantList}>
          {restaurants.map((restaurant) => (
            <Pressable
              key={restaurant.id}
              accessibilityRole="button"
              onPress={() => router.push(`/(merchant)/restaurant/${restaurant.id}` as never)}
              style={({ pressed }) => [styles.restaurantCard, pressed && styles.pressed]}
            >
              <View style={styles.restaurantIcon}><MaterialCommunityIcons name="storefront-outline" size={24} color={v2Theme.colors.ink} /></View>
              <View style={styles.restaurantCopy}>
                <View style={styles.restaurantTitleRow}>
                  <Text numberOfLines={1} style={styles.restaurantName}>{restaurant.name}</Text>
                  <StatusPill status={restaurant.status} />
                </View>
                <Text numberOfLines={1} style={styles.restaurantAddress}>{restaurant.address}</Text>
                <View style={styles.restaurantMeta}>
                  <View style={[styles.onlineDot, restaurant.is_accepting_orders && styles.onlineDotActive]} />
                  <Text style={styles.restaurantMetaText}>{restaurant.is_accepting_orders ? "Accepting orders" : "Orders paused"}</Text>
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoIcon}><MaterialCommunityIcons name="shield-check-outline" size={23} color={v2Theme.colors.brandStrong} /></View>
        <View style={styles.infoCopy}>
          <Text style={styles.infoTitle}>Merchant review stays separate from publishing</Text>
          <Text style={styles.infoBody}>Draft restaurants can build menus privately. Customers only see restaurants after review and activation.</Text>
        </View>
      </View>
    </Screen>
  );
}

function StatusPill({ status }: { status: string }) {
  const active = status === "ACTIVE";
  const pending = ["PENDING_REVIEW", "SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(status);
  return (
    <View style={[styles.statusPill, active && styles.statusPillActive, pending && styles.statusPillPending]}>
      <Text style={[styles.statusText, active && styles.statusTextActive, pending && styles.statusTextPending]}>{status.replaceAll("_", " ")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 7 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: v2Theme.colors.ink, fontSize: 32, lineHeight: 37, fontWeight: "900", letterSpacing: -1.05 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  topActions: { gap: 10 },
  primaryAction: { minHeight: 84, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  primaryActionIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  actionCopy: { flex: 1, gap: 3 },
  primaryActionTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  primaryActionBody: { color: "rgba(255,255,255,0.62)", fontSize: 10 },
  errorCard: { minHeight: 58, borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" },
  retry: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" },
  section: { gap: 11 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 2 },
  countPill: { minWidth: 34, minHeight: 30, borderRadius: v2Theme.radius.pill, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center", paddingHorizontal: 9 },
  countText: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  loading: { color: v2Theme.colors.inkSecondary, fontSize: 12 },
  emptyCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 20, gap: 9 },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18 },
  restaurantList: { gap: 9 },
  restaurantCard: { minHeight: 86, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  restaurantIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  restaurantCopy: { flex: 1, gap: 5 },
  restaurantTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  restaurantName: { flex: 1, color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  restaurantAddress: { color: v2Theme.colors.inkSecondary, fontSize: 10 },
  restaurantMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.inkTertiary },
  onlineDotActive: { backgroundColor: v2Theme.colors.success },
  restaurantMetaText: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  statusPill: { borderRadius: v2Theme.radius.pill, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 7, paddingVertical: 5 },
  statusPillActive: { backgroundColor: v2Theme.colors.brandSoft },
  statusPillPending: { backgroundColor: v2Theme.colors.warningSoft },
  statusText: { color: v2Theme.colors.inkSecondary, fontSize: 7, fontWeight: "900" },
  statusTextActive: { color: v2Theme.colors.brandStrong },
  statusTextPending: { color: v2Theme.colors.warning },
  infoCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 15, flexDirection: "row", gap: 11 },
  infoIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  infoCopy: { flex: 1, gap: 4 },
  infoTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  infoBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
