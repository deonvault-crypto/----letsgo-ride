import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { DriverCard } from "../../../components/cards/DriverCard";
import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { AppButton } from "../../../components/ui/AppButton";
import { Screen } from "../../../components/ui/Screen";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { colors } from "../../../constants/colors";
import { spacing } from "../../../constants/spacing";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { getRide } from "../../../services/ridesService";
import { Ride } from "../../../types/ride.types";
import { formatTripDate } from "../../../utils/formatDate";
import { formatUsd } from "../../../utils/formatPrice";
import { departureCountdown, isRideBookable, tripStatusLabel, tripStatusTone } from "../../../utils/tripLifecycle";
import { isVerifiedStatus } from "../../../utils/verificationStatus";

export default function RideDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isGuest } = useCurrentUser();
  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setRide(await getRide(id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load ride.");
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  if (loading) return <Screen title="Ride" showBack fallbackRoute="/(customer)/results" navRole="customer"><LoadingState label="Loading ride details..." /></Screen>;
  if (error || !ride) return <Screen title="Ride" showBack fallbackRoute="/(customer)/search" navRole="customer"><ErrorState message={error || "Ride not found."} /></Screen>;

  const isOwnRide = Boolean(ride.is_own_ride || (user?.id && ride.driver_user_id === user.id));
  const bookable = isRideBookable(ride);
  const countdown = departureCountdown(ride);
  const driverReviewCount = Number(ride.driver_review_count || 0);

  function openDriverProfile() {
    if (!ride?.driver_id) return;
    router.push(`/(shared)/driver-profile/${ride.driver_id}?rideId=${ride.id}` as never);
  }

  function requestSeat() {
    if (isGuest) {
      router.push({ pathname: "/(auth)/email-login", params: { returnTo: `/(customer)/request/${ride?.id}` } } as never);
      return;
    }
    router.push(`/(customer)/request/${ride?.id}` as never);
  }

  return (
    <Screen title="Ride" showBack fallbackRoute="/(customer)/search" navRole="customer">
      <View style={styles.headerCard}><StatusBadge label={tripStatusLabel(ride.status)} tone={tripStatusTone(ride.status)} /><Text style={styles.title}>{ride.origin} to {ride.destination}</Text>{countdown ? <Text style={styles.body}>{countdown}</Text> : null}<Text style={styles.price}>{formatUsd(ride.price_usd)} per seat</Text></View>
      <View style={styles.detailCard}><Info icon="calendar-clock" label="When" value={formatTripDate(ride.date, ride.time)} /><Info icon="map-marker-outline" label="Pickup" value={ride.pickup_note} /><Info icon="flag-checkered" label="Drop-off" value={ride.dropoff_note} /><Info icon="seat-passenger" label="Seats" value={`${ride.available_seats} available`} /></View>
      <DriverCard name={ride.driver_name} rating={ride.driver_rating} vehicle={ride.vehicle} verified={isVerifiedStatus(ride.driver_verification_status)} imageUri={ride.driver_profile_photo_url || ride.driver_avatar_url} onPress={openDriverProfile} reviewCount={driverReviewCount} completedTripsCount={ride.driver_completed_trips_count} />
      <View style={styles.detailCard}><View style={styles.driverInfoHeader}><Text style={styles.sectionTitle}>Driver profile</Text><Pressable accessibilityRole="button" onPress={openDriverProfile} style={({ pressed }) => pressed && styles.linkPressed}><Text style={styles.reviewLink}>{driverReviewCount > 0 ? "Read reviews" : "No reviews yet"}</Text></Pressable></View><Text style={styles.body}>View verified identity status, completed trips, vehicle details, and public reviews before requesting a seat.</Text></View>
      <View style={styles.detailCard}><Text style={styles.sectionTitle}>Safety notes</Text><Text style={styles.body}>Check pickup details before travelling. Keep trip records in the app and report unsafe driving, scams, or passenger issues after the ride.</Text></View>
      {!bookable && !isOwnRide ? <View style={styles.detailCard}><StatusBadge label={tripStatusLabel(ride.status)} tone={tripStatusTone(ride.status)} /><Text style={styles.body}>{ride.status === "IN_PROGRESS" ? "This ride is already in progress." : "This ride is no longer available for new bookings."}</Text></View> : isOwnRide ? <View style={styles.detailCard}><StatusBadge label="Your ride" tone="neutral" /><Text style={styles.body}>This is your posted ride.</Text></View> : <AppButton title={isGuest ? "Sign in to request seat" : "Request seat"} disabled={!bookable} onPress={requestSeat} />}
    </Screen>
  );
}

function Info({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <View style={styles.infoRow}><MaterialCommunityIcons name={icon as never} size={21} color={colors.primaryGreen} /><View style={styles.infoBody}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  headerCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 28, padding: spacing.xl, gap: spacing.md },
  title: { color: colors.whiteText, fontWeight: "900", fontSize: 30 },
  price: { color: colors.softGreen, fontWeight: "900", fontSize: 22 },
  detailCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: spacing.lg, gap: spacing.lg },
  infoRow: { flexDirection: "row", gap: spacing.md },
  infoBody: { flex: 1 },
  infoLabel: { color: colors.mutedText, fontWeight: "800", fontSize: 12 },
  infoValue: { color: colors.whiteText, fontWeight: "800", marginTop: 3 },
  sectionTitle: { color: colors.whiteText, fontWeight: "900", fontSize: 18 },
  driverInfoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  reviewLink: { color: colors.primaryGreen, fontWeight: "900" },
  linkPressed: { opacity: 0.75 },
  body: { color: colors.mutedText, lineHeight: 22 },
});
