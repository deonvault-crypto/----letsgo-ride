import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { ServiceTile } from "../../components/platform/ServiceTile";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";

export default function ServicesScreen() {
  const router = useRouter();

  return (
    <Screen navRole="customer">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LETSGORIDE</Text>
        <Text style={styles.title}>Three services. One customer app.</Text>
        <Text style={styles.body}>Choose what you need today. Ride, Food and Courier are customer services — not account modes.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Travel</Text>
        <ServiceTile title="Ride" subtitle="Search shared and intercity rides" icon="car-outline" tone="brand" onPress={() => router.push("/(customer)/search" as never)} />
        <ServiceTile title="Intercity" subtitle="Find planned city-to-city journeys" icon="road-variant" onPress={() => router.push({ pathname: "/(customer)/search", params: { intent: "intercity" } } as never)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Order & send</Text>
        <ServiceTile title="Food" subtitle="Discover restaurants, menus and delivery" icon="food-fork-drink" badge="NEW" onPress={() => router.push("/(customer)/food" as never)} />
        <ServiceTile title="Courier" subtitle="Send packages from pickup to drop-off" icon="package-variant-closed" badge="NEW" onPress={() => router.push("/(shared)/courier" as never)} />
      </View>

      <View style={styles.boundaryCard}>
        <View style={styles.boundaryIcon}><MaterialCommunityIcons name="layers-triple-outline" size={24} color={v2Theme.colors.brandStrong} /></View>
        <View style={styles.boundaryCopy}><Text style={styles.boundaryTitle}>Work accounts stay separate.</Text><Text style={styles.boundaryBody}>LetsGoRide Driver, LetsGoRide Courier and LetsGoRide Merchant have their own workspaces and identities. This customer app never switches into them.</Text></View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 8, paddingVertical: 4 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1, maxWidth: 350 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 15, lineHeight: 22, maxWidth: 360 },
  section: { gap: 10 },
  sectionLabel: { color: v2Theme.colors.ink, fontSize: v2Theme.type.section, fontWeight: "900", letterSpacing: -0.45, marginBottom: 2 },
  boundaryCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  boundaryIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  boundaryCopy: { flex: 1, gap: 4 },
  boundaryTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  boundaryBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
});
