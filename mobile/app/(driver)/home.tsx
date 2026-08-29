import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { Avatar } from "../../components/ui/Avatar";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { VerifiedBadge, isIdentityVerified } from "../../components/ui/VerifiedBadge";
import { v2Theme } from "../../constants/v2Theme";
import { useHailingDriverWorkspace } from "../../hooks/useHailing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useDriver } from "../../hooks/useDriver";
import { useDriverRides } from "../../hooks/useDriverRides";
import { useDriverRequests } from "../../hooks/useDriverRequests";
import { Ride, RideRequest } from "../../types/ride.types";
import { firstNameOrFallback } from "../../utils/displayName";
import { formatStatus } from "../../utils/formatStatus";
import { isVerifiedStatus } from "../../utils/verificationStatus";

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { driver } = useDriver();
  const { rides: ownRides, loading, error, reload } = useDriverRides();
  const { requests, loading: requestsLoading, error: requestsError, reload: reloadRequests } = useDriverRequests();
  const { status: hailingStatus, offer: hailingOffer } = useHailingDriverWorkspace(false);

  const driverStatus = driver?.verified
    ? "Verified"
    : driver?.status === "suspended"
      ? "Suspended"
      : formatStatus(driver?.verification_status || driver?.status || "pending_verification");
  const firstName = firstNameOrFallback(user?.name);
  const identityVerified = isIdentityVerified(user) || isVerifiedStatus(driver?.verification_status);
  const activeRides = ownRides.filter((ride) => !["COMPLETED", "CANCELLED", "EXPIRED", "completed", "cancelled"].includes(String(ride.status)));
  const pendingRequests = requests.filter((request) => request.status === "pending");

  return (
    <Screen navRole="driver">
      <View style={styles.profileRow}>
        <Avatar name={user?.name || firstName} imageUri={user?.profile_photo_url} size={56} />
        <View style={styles.profileCopy}>
          <View style={styles.nameRow}><Text style={styles.greeting}>Hi, {firstName}</Text><VerifiedBadge verified={identityVerified} size="medium" /></View>
          <View style={styles.statusRow}><StatusBadge label={driverStatus} tone={driver?.verified ? "success" : driver?.status === "suspended" ? "danger" : "warning"} /><Text style={styles.statusHint}>Driver account</Text></View>
        </View>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>LETSGORIDE DRIVER</Text>
        <Text style={styles.heroTitle}>Plan intercity rides. Manage passengers.</Text>
        <Text style={styles.heroBody}>Share your route, set your available seats and keep every passenger request in one place.</Text>
        <View style={styles.heroActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Post trip" onPress={() => router.push("/(driver)/post-trip" as never)} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="plus" size={21} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>Post trip</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open trip calendar" onPress={() => router.push("/(driver)/availability" as never)} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="calendar-outline" size={20} color={v2Theme.colors.ink} />
            <Text style={styles.secondaryActionText}>Calendar</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric icon="car-clock" label="Active trips" value={String(activeRides.length)} />
        <Metric icon="account-clock-outline" label="Requests" value={String(pendingRequests.length)} />
        <Metric icon="calendar-outline" label="Posted" value={String(ownRides.length)} />
      </View>

      {!identityVerified ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/(shared)/verification" as never)} style={({ pressed }) => [styles.verificationCard, pressed && styles.pressed]}>
          <View style={styles.verificationIcon}><MaterialCommunityIcons name="shield-account-outline" size={24} color={v2Theme.colors.warning} /></View>
          <View style={styles.verificationCopy}><Text style={styles.verificationTitle}>Driver verification</Text><Text style={styles.verificationBody}>Complete verification before publishing or operating shared rides.</Text></View>
          <MaterialCommunityIcons name="chevron-right" size={21} color={v2Theme.colors.inkTertiary} />
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Open Ride Now driver workspace" onPress={() => router.push("/(driver)/hailing" as never)} style={({ pressed }) => [styles.hailingCard, pressed && styles.pressed]}>
        <View style={styles.hailingIcon}><MaterialCommunityIcons name={hailingStatus?.online ? "car-connected" : "car-arrow-right"} size={25} color="#FFFFFF" /></View>
        <View style={styles.hailingCopy}>
          <Text style={styles.hailingEyebrow}>RIDE NOW</Text>
          <Text style={styles.hailingTitle}>{hailingOffer ? "New local ride request" : hailingStatus?.online ? "You’re online for local rides" : "Go online for local hailing"}</Text>
          <Text style={styles.hailingBody}>{hailingOffer ? "Review pickup, destination and fare before accepting." : "Keep this separate from your intercity posted trips."}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color="#FFFFFF" />
      </Pressable>

      <View style={styles.section}>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Posted trips</Text><Text style={styles.sectionSub}>Your carpool schedule</Text></View><Pressable accessibilityRole="button" onPress={() => router.push("/(driver)/trips" as never)} hitSlop={8}><Text style={styles.seeAll}>See all</Text></Pressable></View>
        {loading ? <LoadingState label="Loading driver trips..." /> : null}
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!loading && !error && ownRides.length === 0 ? <EmptyState title="No posted trips" body="Post your first trip when you are ready to accept passenger requests." icon="car-outline" actionLabel="Post trip" onAction={() => router.push("/(driver)/post-trip" as never)} /> : null}
        <View style={styles.list}>{!loading && !error ? ownRides.slice(0, 3).map((ride) => <DriverRideCard key={ride.id} ride={ride} onPress={() => router.push(`/(driver)/trip/${ride.id}` as never)} />) : null}</View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Passenger requests</Text><Text style={styles.sectionSub}>People asking to join your rides</Text></View><View style={styles.countPill}><Text style={styles.countText}>{pendingRequests.length}</Text></View></View>
        {requestsLoading ? <LoadingState label="Loading passenger requests..." /> : null}
        {requestsError ? <ErrorState message={requestsError} onRetry={reloadRequests} /> : null}
        {!requestsLoading && !requestsError && requests.length === 0 ? <EmptyState title="No passenger requests" body="New seat requests for your posted rides will appear here." icon="account-clock-outline" /> : null}
        <View style={styles.list}>{!requestsLoading && !requestsError ? requests.slice(0, 4).map((request) => <PassengerRequestCard key={request.id} request={request} />) : null}</View>
      </View>
    </Screen>
  );
}

function Metric({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.metric}><View style={styles.metricIcon}><MaterialCommunityIcons name={icon} size={20} color={v2Theme.colors.brandStrong} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function DriverRideCard({ ride, onPress }: { ride: Ride; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.rideCard, pressed && styles.pressed]}><View style={styles.rideIcon}><MaterialCommunityIcons name="car-outline" size={23} color={v2Theme.colors.ink} /></View><View style={styles.rideCopy}><Text numberOfLines={2} style={styles.rideRoute}>{ride.origin} → {ride.destination}</Text><Text style={styles.rideMeta}>{ride.date} · {ride.time} · {ride.available_seats} seats</Text></View><View style={styles.rideRight}><Text style={styles.ridePrice}>${ride.price_usd.toFixed(2)}</Text><Text style={styles.rideStatus}>{formatStatus(String(ride.status))}</Text></View></Pressable>;
}

function PassengerRequestCard({ request }: { request: RideRequest }) {
  return <View style={styles.requestCard}><Avatar name={request.passenger_name} imageUri={request.passenger_profile_photo_url} size={44} /><View style={styles.requestCopy}><View style={styles.requestNameRow}><Text style={styles.requestName}>{request.passenger_name}</Text><VerifiedBadge verified={isVerifiedStatus(request.passenger_verification_status)} /></View><Text numberOfLines={1} style={styles.requestRoute}>{request.ride_snapshot?.origin || "Ride"} → {request.ride_snapshot?.destination || "destination"}</Text><Text style={styles.requestMeta}>{request.seats} {request.seats === 1 ? "seat" : "seats"} · {formatStatus(request.status)}</Text></View></View>;
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 3 },
  profileCopy: { flex: 1, gap: 5 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  greeting: { color: v2Theme.colors.ink, fontSize: 25, fontWeight: "900", letterSpacing: -0.6 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusHint: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" },
  heroCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 18, gap: 10 },
  eyebrow: { color: "#8FE6AE", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  heroTitle: { color: "#FFFFFF", fontSize: 25, lineHeight: 30, fontWeight: "900", letterSpacing: -0.7 },
  heroBody: { color: "rgba(255,255,255,0.66)", fontSize: 12, lineHeight: 18 },
  heroActions: { flexDirection: "row", gap: 9, marginTop: 4 },
  primaryAction: { flex: 1, minHeight: 48, borderRadius: 15, backgroundColor: v2Theme.colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  primaryActionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  secondaryAction: { flex: 1, minHeight: 48, borderRadius: 15, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  secondaryActionText: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  metrics: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, minHeight: 102, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 11, gap: 4 },
  metricIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  metricValue: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900" },
  metricLabel: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" },
  verificationCard: { minHeight: 78, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.warningSoft, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  verificationIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  verificationCopy: { flex: 1, gap: 3 },
  verificationTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  verificationBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  hailingCard: { minHeight: 104, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 16, flexDirection: "row", alignItems: "center", gap: 13 },
  hailingIcon: { width: 50, height: 50, borderRadius: 18, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  hailingCopy: { flex: 1, gap: 3 },
  hailingEyebrow: { color: "#8FE6AE", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  hailingTitle: { color: "#FFFFFF", fontSize: 16, lineHeight: 21, fontWeight: "900" },
  hailingBody: { color: "rgba(255,255,255,0.66)", fontSize: 10, lineHeight: 15 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 9, marginTop: 2 },
  seeAll: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900" },
  countPill: { minWidth: 30, minHeight: 30, borderRadius: 999, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  countText: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900" },
  list: { gap: 8 },
  rideCard: { minHeight: 82, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  rideIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  rideCopy: { flex: 1, gap: 4 },
  rideRoute: { color: v2Theme.colors.ink, fontSize: 12, lineHeight: 17, fontWeight: "900" },
  rideMeta: { color: v2Theme.colors.inkSecondary, fontSize: 8 },
  rideRight: { alignItems: "flex-end", gap: 3 },
  ridePrice: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  rideStatus: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" },
  requestCard: { minHeight: 76, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  requestCopy: { flex: 1, gap: 3 },
  requestNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  requestName: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  requestRoute: { color: v2Theme.colors.inkSecondary, fontSize: 9 },
  requestMeta: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "800" },
  pressed: { opacity: 0.72 },
});
