import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ServiceTile } from "../../components/platform/ServiceTile";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";

export default function ServicesScreen() {
  const router = useRouter();

  return (
    <Screen navRole="passenger">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LETSGORIDE SERVICES</Text>
        <Text style={styles.title}>One app for moving through the day.</Text>
        <Text style={styles.body}>
          Travel, eat and send with a single account, one activity history and one support experience.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Go anywhere</Text>
        <ServiceTile
          title="Ride"
          subtitle="Search shared and intercity rides"
          icon="car-outline"
          tone="brand"
          onPress={() => router.push("/(passenger)/search" as never)}
        />
        <ServiceTile
          title="Intercity"
          subtitle="Find planned city-to-city journeys"
          icon="road-variant"
          onPress={() => router.push("/(passenger)/search" as never)}
        />
        <ServiceTile
          title="Post a trip"
          subtitle="Travelling somewhere? Publish your route"
          icon="calendar-plus"
          onPress={() => router.push("/(driver)/post-trip" as never)}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Get anything delivered</Text>
        <ServiceTile
          title="Food"
          subtitle="Discover restaurants, menus and delivery"
          icon="food-fork-drink"
          badge="NEW"
          onPress={() => router.push("/(shared)/food" as never)}
        />
        <ServiceTile
          title="Courier"
          subtitle="Send packages from pickup to drop-off"
          icon="package-variant-closed"
          badge="NEW"
          onPress={() => router.push("/(shared)/courier" as never)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 8,
    paddingVertical: 4,
  },
  eyebrow: {
    color: v2Theme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  title: {
    color: v2Theme.colors.ink,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -1,
    maxWidth: 350,
  },
  body: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 360,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    color: v2Theme.colors.ink,
    fontSize: v2Theme.type.section,
    fontWeight: "900",
    letterSpacing: -0.45,
    marginBottom: 2,
  },
});
