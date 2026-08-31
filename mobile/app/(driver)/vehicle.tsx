import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { v2Theme } from "../../constants/v2Theme";
import { useDriver } from "../../hooks/useDriver";
import { listMyWorkerApplications } from "../../services/operationsService";
import { WorkerApplication } from "../../types/operations.types";

const DRIVER_BLACK = "#111111";

export default function DriverVehicleScreen() {
  const router = useRouter();
  const { driver } = useDriver();
  const [application, setApplication] = useState<WorkerApplication | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    void listMyWorkerApplications()
      .then((items) => {
        if (active) setApplication(items.find((item) => item.product === "driver") || null);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []));

  const approved = Boolean(driver?.verified || driver?.verification_status === "approved");
  const vehicle = String(application?.vehicle || driver?.vehicle || "Vehicle details not added");
  const vehicleType = application?.vehicle_type || "Not specified";
  const details = application?.vehicle_details || "No additional vehicle details on file.";
  const area = application?.service_area || driver?.city || "Not added";

  return (
    <Screen title="Vehicle" showBack fallbackRoute="/(driver)/account" showNotifications={false}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><MaterialCommunityIcons name="car-outline" size={28} color={DRIVER_BLACK} /></View>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>DRIVER VEHICLE</Text>
          <Text style={styles.title}>{vehicle}</Text>
          <Text style={styles.body}>The vehicle attached to your Driver verification and passenger-facing work profile.</Text>
        </View>
        <StatusBadge label={approved ? "Approved" : "Review"} tone={approved ? "success" : "warning"} />
      </View>

      <View style={styles.card}>
        <Detail label="Vehicle type" value={vehicleType} />
        <Detail label="Service area" value={String(area)} />
        <Detail label="Vehicle details" value={details} />
      </View>

      <View style={styles.actions}>
        <AppButton title="Open vehicle documents" onPress={() => router.push("/(driver)/documents" as never)} />
        <AppButton title="Request a vehicle detail change" variant="secondary" onPress={() => router.push({ pathname: "/(shared)/support", params: { product: "driver", subject: "Vehicle details change" } } as never)} />
      </View>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { borderRadius: 28, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  heroIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  title: { color: DRIVER_BLACK, fontSize: 19, fontWeight: "900", marginTop: 2 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15, marginTop: 4 },
  card: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line },
  detailRow: { minHeight: 68, paddingHorizontal: 15, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line, justifyContent: "center", gap: 4 },
  detailLabel: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  detailValue: { color: DRIVER_BLACK, fontSize: 12, fontWeight: "800", lineHeight: 18 },
  actions: { gap: 9 },
});
