import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";

export default function WalletScreen() {
  return (
    <Screen showBack fallbackRoute="/(shared)/account" title="Wallet" showNotifications={false}>
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="wallet-outline" size={30} color={v2Theme.colors.brandStrong} />
        </View>
        <Text style={styles.kicker}>NOT YET AVAILABLE</Text>
        <Text style={styles.title}>Wallet is coming later.</Text>
        <Text style={styles.body}>You’ll still see the exact price before confirming a ride, food order or delivery.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: v2Theme.radius.xxl,
    backgroundColor: v2Theme.colors.brandSofter,
    padding: 20,
    gap: 10,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: v2Theme.colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  title: {
    color: v2Theme.colors.ink,
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  body: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
});
