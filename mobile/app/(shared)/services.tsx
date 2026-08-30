import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ServiceStoryCard } from "../../components/platform/ServiceStoryCard";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";

export default function ServicesScreen() {
  const router = useRouter();

  return (
    <Screen navRole="customer">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LETSGORIDE</Text>
        <Text style={styles.title}>What can we help with?</Text>
        <Text style={styles.body}>Ride across town, order food or send something.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Travel</Text>
        <ServiceStoryCard title="Ride" subtitle="Search local journeys and planned city-to-city trips" eyebrow="GO SOMEWHERE" icon="car-outline" image={require("../../assets/images/ride-harare-owned-v2.jpg")} onPress={() => router.push("/(customer)/search" as never)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Order & send</Text>
        <ServiceStoryCard title="Food" subtitle="Discover kitchens and dishes near you" eyebrow="ORDER IN" icon="food-fork-drink" image={require("../../assets/images/food-landing-editorial-owned-v1.jpg")} onPress={() => router.push("/(customer)/food" as never)} />
        <ServiceStoryCard title="Courier" subtitle="Send parcels and documents with live tracking" eyebrow="SEND IT" icon="package-variant-closed" image={require("../../assets/images/courier-handoff-owned-v2.jpg")} onPress={() => router.push("/(shared)/courier" as never)} />
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
});
