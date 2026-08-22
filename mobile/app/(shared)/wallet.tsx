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
        <Text style={styles.title}>Payments, in one place.</Text>
        <Text style={styles.body}>
          Wallet and payment methods will connect here once the payment layer is enabled. No fake balances or payment history are shown before that integration exists.
        </Text>
      </View>

      <View style={styles.row}>
        <MaterialCommunityIcons name="credit-card-outline" size={23} color={v2Theme.colors.ink} />
        <View style={styles.copy}>
          <Text style={styles.rowTitle}>Payment methods</Text>
          <Text style={styles.rowBody}>Securely saved methods will appear here.</Text>
        </View>
      </View>
      <View style={styles.row}>
        <MaterialCommunityIcons name="receipt-text-outline" size={23} color={v2Theme.colors.ink} />
        <View style={styles.copy}>
          <Text style={styles.rowTitle}>Receipts</Text>
          <Text style={styles.rowBody}>Ride, food and courier receipts will share one history.</Text>
        </View>
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
  row: {
    minHeight: 78,
    borderRadius: v2Theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    backgroundColor: v2Theme.colors.surface,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  copy: { flex: 1, gap: 4 },
  rowTitle: {
    color: v2Theme.colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  rowBody: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 12,
  },
});
