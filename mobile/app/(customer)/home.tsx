import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { RideCard } from "../../components/cards/RideCard";
import { ServiceSwitcher, CustomerService } from "../../components/platform/ServiceSwitcher";
import { ServiceStoryCard } from "../../components/platform/ServiceStoryCard";
import { EmptyState } from "../../components/states/EmptyState";
import { AppNotice } from "../../components/ui/AppNotice";
import { PopularRouteChips } from "../../components/ui/PopularRouteChips";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useActiveHailingTrip, useHailingConfig } from "../../hooks/useHailing";
import { useRides } from "../../hooks/useRides";
import { isRideBookable } from "../../utils/tripLifecycle";

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { rides, loading, refreshing, error, reload } = useRides();
  const { config: hailingConfig } = useHailingConfig();
  const { trip: activeHailingTrip } = useActiveHailingTrip(false);
  const upcomingRides = rides.filter((ride) => isRideBookable(ride));
  const hailingEnabled = hailingConfig?.enabled !== false;
  const activeHailing = activeHailingTrip && !["COMPLETED", "CANCELLED_BY_PASSENGER", "CANCELLED_BY_DRIVER", "CANCELLED_BY_ADMIN", "NO_DRIVER_FOUND"].includes(activeHailingTrip.status);

  function chooseService(service: CustomerService) {
    if (service === "ride") return;
    if (service === "food") return router.push("/(customer)/food" as never);
    router.push("/(shared)/courier" as never);
  }

  function openDriverProfile(driverId: string | undefined, rideId: string) {
    if (!driverId) return;
    router.push(`/(shared)/driver-profile/${driverId}?rideId=${rideId}` as never);
  }

  return (
    <Screen navRole="customer" refreshing={refreshing} onRefresh={reload}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>MOVE • EAT • SEND</Text>
        <Text style={styles.headline}>What do you need today?</Text>
        <Text style={styles.subhead}>Travel between cities, order food or send a package with LetsGoRide.</Text>
      </View>

      <ServiceSwitcher value="ride" onChange={chooseService} />

      {hailingEnabled ? (
        <Pressable accessibilityRole="button" accessibilityLabel={activeHailing ? "Open active Ride Now trip" : "Request a Ride Now"} onPress={() => router.push(activeHailing ? `/(customer)/hail/trip/${activeHailingTrip.id}` as never : "/(customer)/hail" as never)} style={({ pressed }) => [styles.rideNowCard, pressed && styles.pressed]}>
          <View style={styles.rideNowCopy}>
            <Text style={styles.rideNowEyebrow}>RIDE NOW</Text>
            <Text style={styles.rideNowTitle}>{activeHailing ? "Continue your city ride" : "Where to?"}</Text>
            <Text style={styles.rideNowBody}>{activeHailing ? activeHailingTrip.status.replaceAll("_", " ") : "Request a private local ride with an approved driver."}</Text>
          </View>
          <View style={styles.rideNowAction}><MaterialCommunityIcons name="car-arrow-right" size={24} color="#FFFFFF" /></View>
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Search intercity and scheduled rides" onPress={() => router.push("/(customer)/search" as never)} style={({ pressed }) => [styles.whereCard, pressed && styles.pressed]}>
        <View style={styles.whereIcon}><MaterialCommunityIcons name="magnify" size={27} color={v2Theme.colors.ink} /></View>
        <View style={styles.whereCopy}><Text style={styles.whereTitle}>Intercity / Scheduled rides</Text><Text style={styles.whereSubtitle}>Search routes, dates and available seats</Text></View>
        <MaterialCommunityIcons name="arrow-right" size={23} color={v2Theme.colors.ink} />
      </Pressable>

      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}><Text style={styles.sectionTitle}>For you</Text><Pressable onPress={() => router.push("/(shared)/services" as never)} hitSlop={8}><Text style={styles.textAction}>See all</Text></Pressable></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyRail}>
          <ServiceStoryCard compact title="Ride Now" subtitle="Local private rides" eyebrow="GO" icon="car-arrow-right" image={require("../../assets/images/ride-harare-owned-v2.jpg")} onPress={() => router.push(hailingEnabled ? "/(customer)/hail" as never : "/(customer)/search" as never)} />
          <ServiceStoryCard compact title="Food" subtitle="Kitchens and dishes near you" eyebrow="EAT" icon="food-fork-drink" image={require("../../assets/images/food-marketplace-owned-v1.png")} onPress={() => router.push("/(customer)/food" as never)} />
          <ServiceStoryCard compact title="Courier" subtitle="Parcels with live tracking" eyebrow="SEND" icon="package-variant-closed" image={require("../../assets/images/courier-handoff-owned-v2.jpg")} onPress={() => router.push("/(shared)/courier" as never)} />
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Popular routes</Text>
        <PopularRouteChips onSelect={(origin, destination) => router.push({ pathname: "/(customer)/results", params: { origin, destination, seats: "1" } } as never)} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <View style={styles.headingCopy}><Text style={styles.sectionTitle}>Upcoming rides</Text><Text style={styles.sectionCaption}>Verified trips available to reserve</Text></View>
          <Pressable onPress={() => router.push("/(customer)/search" as never)} hitSlop={8}><Text style={styles.textAction}>Search</Text></Pressable>
        </View>
        {loading ? <View testID="upcoming-rides-skeleton" style={styles.rideSkeleton}><View style={styles.skeletonLineWide} /><View style={styles.skeletonLine} /></View> : null}
        {error ? <AppNotice message={error} actionLabel="Retry" onAction={reload} /> : null}
        {!loading && !error && upcomingRides.length === 0 ? <EmptyState title="No rides nearby yet" body="New trips will appear here when drivers post them." icon="car-clock" /> : null}
        {!loading && upcomingRides.slice(0, 3).map((ride) => (
          <RideCard key={ride.id} ride={ride} onPress={() => router.push(`/(customer)/ride/${ride.id}` as never)} onDriverPress={() => openDriverProfile(ride.driver_id, ride.id)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 7, paddingTop: 2 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.35 },
  headline: { color: v2Theme.colors.ink, fontSize: v2Theme.type.display, lineHeight: 39, fontWeight: "900", letterSpacing: -1.2 },
  subhead: { color: v2Theme.colors.inkSecondary, fontSize: v2Theme.type.body, lineHeight: 22, maxWidth: 340 },
  rideNowCard: { minHeight: 142, borderRadius: 30, backgroundColor: v2Theme.colors.ink, padding: 19, flexDirection: "row", alignItems: "center", gap: 15, shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 4 },
  rideNowCopy: { flex: 1, gap: 5 },
  rideNowEyebrow: { color: "#8FE6AE", fontSize: 10, fontWeight: "900", letterSpacing: 1.25 },
  rideNowTitle: { color: "#FFFFFF", fontSize: 29, lineHeight: 34, fontWeight: "900", letterSpacing: -0.9 },
  rideNowBody: { color: "rgba(255,255,255,0.66)", fontSize: 13, lineHeight: 19 },
  rideNowAction: { width: 52, height: 52, borderRadius: 18, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  whereCard: { minHeight: 82, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, paddingHorizontal: v2Theme.spacing.lg, flexDirection: "row", alignItems: "center", gap: v2Theme.spacing.md, shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  whereIcon: { width: 48, height: 48, borderRadius: v2Theme.radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: v2Theme.colors.surfaceMuted },
  whereCopy: { flex: 1, gap: 4 },
  whereTitle: { color: v2Theme.colors.ink, fontSize: 19, fontWeight: "900", letterSpacing: -0.35 },
  whereSubtitle: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 16 },
  section: { gap: v2Theme.spacing.md },
  sectionHeadingRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: v2Theme.spacing.md },
  headingCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: v2Theme.type.section, fontWeight: "900", letterSpacing: -0.5 },
  sectionCaption: { color: v2Theme.colors.inkSecondary, fontSize: 12 },
  textAction: { color: v2Theme.colors.brandStrong, fontSize: 13, fontWeight: "900" },
  storyRail: { gap: 10, paddingRight: 4 },
  rideSkeleton: { minHeight: 92, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: v2Theme.spacing.lg, gap: 12, justifyContent: "center" },
  skeletonLineWide: { height: 14, width: "68%", borderRadius: 7, backgroundColor: v2Theme.colors.lineStrong },
  skeletonLine: { height: 11, width: "42%", borderRadius: 6, backgroundColor: v2Theme.colors.line },
  pressed: { opacity: 0.7, transform: [{ scale: 0.992 }] },
});
