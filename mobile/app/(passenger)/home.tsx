import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { RideCard } from "../../components/cards/RideCard";
import { ServiceSwitcher, CustomerService } from "../../components/platform/ServiceSwitcher";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { PopularRouteChips } from "../../components/ui/PopularRouteChips";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useRides } from "../../hooks/useRides";
import { isRideBookable } from "../../utils/tripLifecycle";

export default function PassengerHomeScreen() {
  const router = useRouter();
  const { rides, loading, error, reload } = useRides();
  const upcomingRides = rides.filter((ride) => isRideBookable(ride));

  function chooseService(service: CustomerService) {
    if (service === "ride") return;
    if (service === "food") {
      router.push("/(shared)/food" as never);
      return;
    }
    router.push("/(shared)/courier" as never);
  }

  function openDriverProfile(driverId: string | undefined, rideId: string) {
    if (!driverId) return;
    router.push(`/(shared)/driver-profile/${driverId}?rideId=${rideId}` as never);
  }

  return (
    <Screen navRole="passenger">
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>MOVE • EAT • SEND</Text>
        <Text style={styles.headline}>What do you need today?</Text>
        <Text style={styles.subhead}>
          Travel between cities, order food, or send a package — all from LetsGoRide.
        </Text>
      </View>

      <ServiceSwitcher value="ride" onChange={chooseService} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search for a ride"
        onPress={() => router.push("/(passenger)/search" as never)}
        style={({ pressed }) => [styles.whereCard, pressed && styles.pressed]}
      >
        <View style={styles.whereIcon}>
          <MaterialCommunityIcons name="magnify" size={27} color={v2Theme.colors.ink} />
        </View>
        <View style={styles.whereCopy}>
          <Text style={styles.whereTitle}>Where are you going?</Text>
          <Text style={styles.whereSubtitle}>Search routes, dates and available seats</Text>
        </View>
        <MaterialCommunityIcons name="arrow-right" size={23} color={v2Theme.colors.ink} />
      </Pressable>

      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionTitle}>For you</Text>
          <Pressable onPress={() => router.push("/(shared)/services" as never)} hitSlop={8}>
            <Text style={styles.textAction}>See all</Text>
          </Pressable>
        </View>
        <View style={styles.quickRow}>
          <QuickAction
            icon="car-outline"
            label="Ride"
            onPress={() => router.push("/(passenger)/search" as never)}
          />
          <QuickAction
            icon="food-fork-drink"
            label="Food"
            onPress={() => router.push("/(shared)/food" as never)}
          />
          <QuickAction
            icon="package-variant-closed"
            label="Courier"
            onPress={() => router.push("/(shared)/courier" as never)}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Popular routes</Text>
        <PopularRouteChips
          onSelect={(origin, destination) =>
            router.push({
              pathname: "/(passenger)/results",
              params: { origin, destination, seats: "1" },
            } as never)
          }
        />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.sectionTitle}>Upcoming rides</Text>
            <Text style={styles.sectionCaption}>Verified trips available to reserve</Text>
          </View>
          <Pressable onPress={() => router.push("/(passenger)/search" as never)} hitSlop={8}>
            <Text style={styles.textAction}>Search</Text>
          </Pressable>
        </View>

        {loading ? <LoadingState label="Finding rides..." /> : null}
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!loading && !error && upcomingRides.length === 0 ? (
          <EmptyState
            title="No rides nearby yet"
            body="Try another route or date. New trips appear as drivers publish them."
            icon="car-clock"
          />
        ) : null}
        {!loading && !error && upcomingRides.slice(0, 3).map((ride) => (
          <RideCard
            key={ride.id}
            ride={ride}
            onPress={() => router.push(`/(passenger)/ride/${ride.id}` as never)}
            onDriverPress={() => openDriverProfile(ride.driver_id, ride.id)}
          />
        ))}
      </View>
    </Screen>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
    >
      <View style={styles.quickIcon}>
        <MaterialCommunityIcons name={icon} size={25} color={v2Theme.colors.ink} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
      <MaterialCommunityIcons name="arrow-top-right" size={17} color={v2Theme.colors.inkTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: 7,
    paddingTop: 2,
  },
  eyebrow: {
    color: v2Theme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.35,
  },
  headline: {
    color: v2Theme.colors.ink,
    fontSize: v2Theme.type.display,
    lineHeight: 39,
    fontWeight: "900",
    letterSpacing: -1.2,
  },
  subhead: {
    color: v2Theme.colors.inkSecondary,
    fontSize: v2Theme.type.body,
    lineHeight: 22,
    maxWidth: 340,
  },
  whereCard: {
    minHeight: 82,
    borderRadius: v2Theme.radius.xxl,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.lineStrong,
    paddingHorizontal: v2Theme.spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: v2Theme.spacing.md,
    shadowColor: v2Theme.colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  whereIcon: {
    width: 48,
    height: 48,
    borderRadius: v2Theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: v2Theme.colors.surfaceMuted,
  },
  whereCopy: {
    flex: 1,
    gap: 4,
  },
  whereTitle: {
    color: v2Theme.colors.ink,
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.35,
  },
  whereSubtitle: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  section: {
    gap: v2Theme.spacing.md,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: v2Theme.spacing.md,
  },
  headingCopy: {
    flex: 1,
    gap: 3,
  },
  sectionTitle: {
    color: v2Theme.colors.ink,
    fontSize: v2Theme.type.section,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  sectionCaption: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 12,
  },
  textAction: {
    color: v2Theme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "900",
  },
  quickRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickCard: {
    flex: 1,
    minHeight: 112,
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surfaceMuted,
    padding: 12,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    color: v2Theme.colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.992 }],
  },
});
