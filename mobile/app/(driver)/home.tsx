import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { HailingMapBackdrop } from "../../components/hailing/HailingMapBackdrop";
import { BottomNav } from "../../components/layout/BottomNav";
import { Avatar } from "../../components/ui/Avatar";
import { VerifiedBadge, isIdentityVerified } from "../../components/ui/VerifiedBadge";
import { v2Theme } from "../../constants/v2Theme";
import { useNotifications } from "../../contexts/NotificationContext";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useDriver } from "../../hooks/useDriver";
import { useDriverRequests } from "../../hooks/useDriverRequests";
import { useDriverRides } from "../../hooks/useDriverRides";
import { useHailingDriverWorkspace } from "../../hooks/useHailing";
import { firstNameOrFallback } from "../../utils/displayName";
import { isVerifiedStatus } from "../../utils/verificationStatus";

const DRIVER_BLACK = "#111111";

export default function DriverHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotifications();
  const { user } = useCurrentUser();
  const { driver } = useDriver();
  const { rides: ownRides, loading: ridesLoading } = useDriverRides();
  const { requests, loading: requestsLoading } = useDriverRequests();
  const { status: hailingStatus, offer: hailingOffer } = useHailingDriverWorkspace(false);

  const firstName = firstNameOrFallback(user?.name);
  const identityVerified = isIdentityVerified(user) || isVerifiedStatus(driver?.verification_status);
  const serviceArea = String(driver?.city || user?.city || "Service area");
  const activeRides = ownRides.filter(
    (ride) => !["COMPLETED", "CANCELLED", "EXPIRED", "completed", "cancelled"].includes(String(ride.status)),
  );
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const online = Boolean(hailingStatus?.online);
  const activeHailingTrip = Boolean(hailingStatus?.active_trip?.id);
  const photoApproved = user?.profile_photo_verified === true;
  const photoPending = user?.profile_photo_review_status === "pending";
  const photoRejected = user?.profile_photo_review_status === "rejected";
  // Never interrupt active work. Approval is required only before a new online session.
  const photoBlocksNewWork = !photoApproved && !online && !hailingOffer && !activeHailingTrip;
  const dockBottom = v2Theme.control.navHeight + Math.max(insets.bottom, 10) + 18;

  const photoBlockTitle = photoPending
    ? "Photo awaiting review"
    : photoRejected
      ? "Profile photo needs replacement"
      : "Profile photo approval required";
  const photoBlockBody = photoPending
    ? "Your photo is with Admin for review. Ride Now unlocks after approval."
    : photoRejected
      ? "Upload a clear photo of yourself before going online for new Ride Now requests."
      : "Add a clear profile photo and have it approved before going online for new Ride Now requests.";
  const rideNowTitle = photoBlocksNewWork
    ? photoBlockTitle
    : hailingOffer
      ? "New local ride request"
      : online
        ? "You’re online"
        : "Go online for local rides";
  const rideNowBody = photoBlocksNewWork
    ? photoBlockBody
    : hailingOffer
      ? "Open the request to review pickup, destination and fare."
      : online
        ? "Live dispatch is listening for nearby passenger requests."
        : "Open Ride Now when you’re ready to start accepting nearby trips.";

  function openRideNow() {
    if (photoBlocksNewWork) {
      router.push({ pathname: "/(shared)/edit-profile", params: { product: "driver" } } as never);
      return;
    }
    router.push("/(driver)/hailing" as never);
  }

  return (
    <SafeAreaView edges={[]} style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <HailingMapBackdrop bottomPadding={360} />
      <View pointerEvents="none" style={styles.mapMood} />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Driver account"
          onPress={() => router.push("/(driver)/account" as never)}
          style={({ pressed }) => [styles.identityPill, pressed && styles.pressed]}
        >
          <Avatar name={user?.name || firstName} imageUri={user?.profile_photo_url} size={36} />
          <View style={styles.identityCopy}>
            <View style={styles.nameLine}>
              <Text numberOfLines={1} style={styles.name}>{firstName}</Text>
              <VerifiedBadge verified={identityVerified} />
            </View>
            <Text style={styles.identityMeta}>Driver</Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          hitSlop={8}
          onPress={() => router.push({ pathname: "/(shared)/notifications", params: { product: "driver" } } as never)}
          style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="bell-outline" size={21} color={DRIVER_BLACK} />
          {unreadCount ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View pointerEvents="none" style={styles.mapIdentity}>
        <View style={[styles.liveDot, online && styles.liveDotOnline]} />
        <Text style={styles.mapIdentityLabel}>{online ? "ONLINE" : "OFFLINE"}</Text>
        <View style={styles.mapIdentityDivider} />
        <MaterialCommunityIcons name="map-marker-outline" size={14} color={DRIVER_BLACK} />
        <Text numberOfLines={1} style={styles.mapIdentityCity}>{serviceArea}</Text>
      </View>

      <View pointerEvents="box-none" style={[styles.dock, { bottom: dockBottom }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={photoBlocksNewWork ? "Complete required Driver profile photo approval" : "Open Ride Now driver workspace"}
          onPress={openRideNow}
          style={({ pressed }) => [styles.rideNowCard, pressed && styles.primaryPressed]}
        >
          <View style={[styles.rideNowIcon, photoBlocksNewWork && styles.rideNowIconRequired, hailingOffer && styles.rideNowIconAlert]}>
            <MaterialCommunityIcons
              name={photoBlocksNewWork ? (photoPending ? "clock-outline" : photoRejected ? "camera-alert-outline" : "camera-plus-outline") : hailingOffer ? "car-clock" : online ? "car-connected" : "car-arrow-right"}
              size={24}
              color={hailingOffer ? "#FFFFFF" : DRIVER_BLACK}
            />
          </View>
          <View style={styles.flex}>
            <View style={styles.rideNowEyebrowRow}>
              <Text style={styles.rideNowEyebrow}>RIDE NOW</Text>
              {hailingOffer ? <View style={styles.requestDot} /> : null}
            </View>
            <Text numberOfLines={1} style={styles.rideNowTitle}>{rideNowTitle}</Text>
            <Text numberOfLines={2} style={styles.rideNowBody}>{rideNowBody}</Text>
          </View>
          <View style={styles.primaryArrow}>
            <MaterialCommunityIcons name="arrow-right" size={20} color={DRIVER_BLACK} />
          </View>
        </Pressable>

        <View style={styles.intercityPanel}>
          <View style={styles.intercityHeading}>
            <View style={styles.flex}>
              <Text style={styles.intercityEyebrow}>INTERCITY</Text>
              <Text style={styles.intercityTitle}>Share a route</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post an intercity trip"
              onPress={() => router.push("/(driver)/post-trip" as never)}
              style={({ pressed }) => [styles.postButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
              <Text style={styles.postButtonText}>Post trip</Text>
            </Pressable>
          </View>

          <View style={styles.signalRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(driver)/trips" as never)}
              style={({ pressed }) => [styles.signal, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="routes" size={17} color={v2Theme.colors.inkSecondary} />
              <Text style={styles.signalValue}>{ridesLoading ? "—" : activeRides.length}</Text>
              <Text style={styles.signalLabel}>active</Text>
            </Pressable>
            <View style={styles.signalDivider} />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(driver)/trips" as never)}
              style={({ pressed }) => [styles.signal, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="account-clock-outline" size={17} color={v2Theme.colors.inkSecondary} />
              <Text style={styles.signalValue}>{requestsLoading ? "—" : pendingRequests.length}</Text>
              <Text style={styles.signalLabel}>requests</Text>
            </Pressable>
            <View style={styles.signalDivider} />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(driver)/availability" as never)}
              style={({ pressed }) => [styles.signal, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="calendar-outline" size={17} color={v2Theme.colors.inkSecondary} />
              <Text style={styles.signalValue}>Plan</Text>
              <Text style={styles.signalLabel}>calendar</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <BottomNav role="driver" bottomOffset={Math.max(insets.bottom, 10)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0EEE8" },
  flex: { flex: 1 },
  mapMood: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: "rgba(17,17,17,0.018)",
  },
  topBar: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  identityPill: {
    minHeight: 50,
    maxWidth: "72%",
    paddingLeft: 6,
    paddingRight: 13,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.10)",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    shadowColor: "#000000",
    shadowOpacity: 0.09,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  identityCopy: { flex: 1, gap: 1 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { flexShrink: 1, color: DRIVER_BLACK, fontSize: 14, fontWeight: "900" },
  identityMeta: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  bellButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.10)",
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  badge: {
    position: "absolute",
    top: 3,
    right: 3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: v2Theme.colors.danger,
  },
  badgeText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  mapIdentity: {
    position: "absolute",
    zIndex: 4,
    top: "29%",
    alignSelf: "center",
    maxWidth: "78%",
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.90)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: v2Theme.colors.inkTertiary },
  liveDotOnline: { backgroundColor: DRIVER_BLACK },
  mapIdentityLabel: { color: DRIVER_BLACK, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  mapIdentityDivider: { width: StyleSheet.hairlineWidth, height: 16, backgroundColor: v2Theme.colors.lineStrong, marginHorizontal: 2 },
  mapIdentityCity: { flexShrink: 1, color: DRIVER_BLACK, fontSize: 10, fontWeight: "800" },
  dock: { position: "absolute", zIndex: 10, left: 14, right: 14, gap: 8 },
  rideNowCard: {
    minHeight: 100,
    borderRadius: 28,
    backgroundColor: DRIVER_BLACK,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  rideNowIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  rideNowIconRequired: { backgroundColor: "#FFFFFF" },
  rideNowIconAlert: { backgroundColor: "#D9792B" },
  rideNowEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rideNowEyebrow: { color: "rgba(255,255,255,0.72)", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  requestDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#FFB36B" },
  rideNowTitle: { color: "#FFFFFF", fontSize: 18, lineHeight: 22, fontWeight: "900", letterSpacing: -0.45 },
  rideNowBody: { color: "rgba(255,255,255,0.64)", fontSize: 9, lineHeight: 14, marginTop: 2 },
  primaryArrow: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  intercityPanel: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.09)",
    padding: 12,
    gap: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  intercityHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  intercityEyebrow: { color: DRIVER_BLACK, fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  intercityTitle: { color: DRIVER_BLACK, fontSize: 16, fontWeight: "900", marginTop: 1 },
  postButton: {
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 15,
    backgroundColor: DRIVER_BLACK,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  postButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  signalRow: {
    minHeight: 42,
    borderRadius: 17,
    backgroundColor: v2Theme.colors.surfaceMuted,
    paddingHorizontal: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  signal: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  signalValue: { color: DRIVER_BLACK, fontSize: 10, fontWeight: "900" },
  signalLabel: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "700" },
  signalDivider: { width: StyleSheet.hairlineWidth, height: 22, backgroundColor: v2Theme.colors.lineStrong },
  primaryPressed: { opacity: 0.94, transform: [{ scale: 0.994 }] },
  pressed: { opacity: 0.72 },
});
