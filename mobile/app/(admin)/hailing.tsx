import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppNotice } from "../../components/ui/AppNotice";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useScreenReconciliation } from "../../hooks/useScreenReconciliation";
import {
  AdminHailingDriver,
  listAdminHailingCities,
  listAdminHailingDrivers,
  listAdminHailingTrips,
  updateAdminHailingDriverEligibility,
} from "../../services/hailingService";
import { HailingRideClass, HailingServiceArea, HailingTrip } from "../../types/hailing.types";

export default function AdminHailingScreen() {
  const [cities, setCities] = useState<HailingServiceArea[]>([]);
  const [drivers, setDrivers] = useState<AdminHailingDriver[]>([]);
  const [trips, setTrips] = useState<HailingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const [nextCities, nextDrivers, nextTrips] = await Promise.all([
        listAdminHailingCities(),
        listAdminHailingDrivers(),
        listAdminHailingTrips(),
      ]);
      setCities(nextCities);
      setDrivers(nextDrivers);
      setTrips(nextTrips);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load hailing admin.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useScreenReconciliation(load);

  function replaceDriver(updated: AdminHailingDriver) {
    setDrivers((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  async function toggleDriver(driver: AdminHailingDriver) {
    const enabling = !driver.hailing_enabled;
    if (enabling && driver.approved_hailing_city_ids.length === 0) {
      setError("Choose at least one Ride Now city for this driver before enabling hailing.");
      return;
    }
    if (enabling && driver.approved_hailing_classes.length === 0) {
      setError("Choose at least one Ride Now class for this driver before enabling hailing.");
      return;
    }
    try {
      const updated = await updateAdminHailingDriverEligibility(driver.id, {
        hailing_enabled: enabling,
        approved_hailing_city_ids: driver.approved_hailing_city_ids,
        approved_hailing_classes: driver.approved_hailing_classes,
      });
      replaceDriver(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update driver eligibility.");
    }
  }

  async function toggleClass(driver: AdminHailingDriver, rideClass: HailingRideClass) {
    const current = new Set(driver.approved_hailing_classes);
    if (current.has(rideClass)) current.delete(rideClass);
    else current.add(rideClass);
    const classes = Array.from(current) as HailingRideClass[];
    if (driver.hailing_enabled && classes.length === 0) {
      setError("Disable Ride Now for this driver before removing their last approved class.");
      return;
    }
    try {
      const updated = await updateAdminHailingDriverEligibility(driver.id, {
        hailing_enabled: driver.hailing_enabled,
        approved_hailing_city_ids: driver.approved_hailing_city_ids,
        approved_hailing_classes: classes,
      });
      replaceDriver(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update ride classes.");
    }
  }

  async function toggleCity(driver: AdminHailingDriver, cityId: string) {
    const current = new Set(driver.approved_hailing_city_ids);
    if (current.has(cityId)) current.delete(cityId);
    else current.add(cityId);
    const approvedCities = Array.from(current);
    if (driver.hailing_enabled && approvedCities.length === 0) {
      setError("Disable Ride Now for this driver before removing their last approved city.");
      return;
    }
    try {
      const updated = await updateAdminHailingDriverEligibility(driver.id, {
        hailing_enabled: driver.hailing_enabled,
        approved_hailing_city_ids: approvedCities,
        approved_hailing_classes: driver.approved_hailing_classes,
      });
      replaceDriver(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update approved cities.");
    }
  }

  const activeTrips = trips.filter((trip) => !["COMPLETED", "CANCELLED_BY_PASSENGER", "CANCELLED_BY_DRIVER", "CANCELLED_BY_ADMIN", "NO_DRIVER_FOUND"].includes(trip.status));

  return (
    <Screen refreshing={refreshing || loading} onRefresh={load}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ADMIN</Text>
        <Text style={styles.title}>Ride Now control</Text>
        <Text style={styles.body}>Manage hailing cities, dispatch settings, driver eligibility and active trips.</Text>
      </View>
      {error ? <AppNotice message={error} actionLabel="Refresh" onAction={load} /> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Service areas</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {cities.map((city) => (
            <View key={city.id} style={styles.cityCard}>
              <Text style={styles.cityName}>{city.name}</Text>
              <Text style={styles.meta}>{city.ride_hailing_enabled ? "Ride Now enabled" : "Disabled"}</Text>
              <Text style={styles.meta}>{city.ride_classes.map((item) => typeof item === "string" ? item : item.id).join(" · ") || "No classes"}</Text>
              <Text style={styles.micro}>Service radius {city.service_radius_km} km</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dispatch</Text>
        {cities.slice(0, 3).map((city) => (
          <View key={`${city.id}-dispatch`} style={styles.rowCard}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{city.name}</Text>
              <Text style={styles.meta}>
                Radius {(city.dispatch?.initial_radius_km as number | undefined) || 2} → {(city.dispatch?.maximum_radius_km as number | undefined) || city.service_radius_km} km · offer {(city.dispatch?.offer_timeout_seconds as number | undefined) || 25}s · search {(city.dispatch?.search_timeout_seconds as number | undefined) || 120}s
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Drivers</Text>
        <Text style={styles.body}>City and class approval is explicit. A verified driver cannot go online for Ride Now until you assign both and enable them.</Text>
        {drivers.slice(0, 12).map((driver) => (
          <View key={driver.id} style={styles.driverCard}>
            <View style={styles.driverTop}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{driver.name || "Driver"}</Text>
                <Text style={styles.meta}>{driver.verified ? "Verified" : "Not verified"} · {driver.current_presence?.status || "offline"}</Text>
                <Text style={styles.micro}>{driver.hailing_enabled ? "Ride Now approved" : "Not approved for Ride Now"}</Text>
              </View>
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: driver.hailing_enabled }} accessibilityLabel={`Ride Now eligibility for ${driver.name || "driver"}`} onPress={() => toggleDriver(driver)} style={[styles.switch, driver.hailing_enabled && styles.switchOn]}>
                <View style={[styles.knob, driver.hailing_enabled && styles.knobOn]} />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Approved cities</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
              {cities.filter((city) => city.enabled && city.ride_hailing_enabled).map((city) => {
                const selected = driver.approved_hailing_city_ids.includes(city.id);
                return (
                  <Pressable key={`${driver.id}-${city.id}`} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${selected ? "Remove" : "Approve"} ${city.name} for ${driver.name || "driver"}`} onPress={() => toggleCity(driver, city.id)} style={[styles.cityChip, selected && styles.classChipActive]}>
                    <Text style={[styles.classText, selected && styles.classTextActive]}>{city.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.fieldLabel}>Approved classes</Text>
            <View style={styles.classRow}>
              {(["ECONOMY", "COMFORT", "XL"] as const).map((rideClass) => {
                const selected = driver.approved_hailing_classes.includes(rideClass);
                return (
                  <Pressable key={rideClass} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => toggleClass(driver, rideClass)} style={[styles.classChip, selected && styles.classChipActive]}>
                    <Text style={[styles.classText, selected && styles.classTextActive]}>{rideClass}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active trips</Text>
        {activeTrips.length === 0 ? <Text style={styles.body}>No active hailing trips.</Text> : null}
        {activeTrips.slice(0, 8).map((trip) => (
          <View key={trip.id} style={styles.rowCard}>
            <MaterialCommunityIcons name="car-clock" size={22} color={v2Theme.colors.brandStrong} />
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{trip.status.replaceAll("_", " ")}</Text>
              <Text style={styles.meta}>{trip.pickup?.formatted_address} → {trip.dropoff?.formatted_address}</Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 19 },
  section: { gap: 10 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  rail: { gap: 10, paddingRight: 4 },
  chipRail: { gap: 7, paddingRight: 8 },
  cityCard: { width: 210, minHeight: 132, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 14, gap: 5 },
  cityName: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" },
  meta: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16 },
  micro: { color: v2Theme.colors.inkTertiary, fontSize: 10, fontWeight: "800" },
  fieldLabel: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  rowCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  rowTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  driverCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 10 },
  driverTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  switch: { width: 48, height: 30, borderRadius: 15, backgroundColor: v2Theme.colors.lineStrong, justifyContent: "center", paddingHorizontal: 3 },
  switchOn: { backgroundColor: v2Theme.colors.brand },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF" },
  knobOn: { alignSelf: "flex-end" },
  classRow: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
  classChip: { minHeight: 34, borderRadius: 999, paddingHorizontal: 10, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  cityChip: { minHeight: 34, borderRadius: 999, paddingHorizontal: 11, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  classChipActive: { backgroundColor: v2Theme.colors.ink },
  classText: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "900" },
  classTextActive: { color: "#FFFFFF" },
  flex: { flex: 1 },
});
