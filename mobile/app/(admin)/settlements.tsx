import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Screen } from "../../components/ui/Screen";
import { getAdminDriverSettlements, AdminDriverSettlementDashboard } from "../../services/adminService";
import { v2Theme } from "../../constants/v2Theme";

export default function AdminDriverSettlementsScreen() {
  const [data, setData] = useState<AdminDriverSettlementDashboard | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setData(await getAdminDriverSettlements()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load driver settlements."); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <Screen showBack fallbackRoute="/(admin)/dashboard" title="Driver settlements" showNotifications={false} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }}>
      {error ? <View style={styles.notice}><Text style={styles.noticeText}>{error}</Text></View> : null}
      {data ? <>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>WEEKLY RECEIVABLES</Text>
          <Text style={styles.heroValue}>${data.summary.outstanding_usd.toFixed(2)}</Text>
          <Text style={styles.heroLabel}>Outstanding from drivers</Text>
          <View style={styles.metrics}>
            <Metric label="Collected" value={`$${data.summary.collected_usd.toFixed(2)}`} />
            <Metric label="Overdue" value={String(data.summary.overdue_count)} />
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.title}>Statements</Text>
          <Text style={styles.sub}>Every amount is calculated from completed Ride Now fare snapshots. No manual subtraction.</Text>
          {data.items.length ? data.items.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.name}>{item.driver_name}</Text>
                <Text style={styles.meta}>{item.ride_count} rides · ${item.gross_fares_usd.toFixed(2)} cash fares</Text>
                <Text style={styles.meta}>{item.period_start.slice(0, 10)} → {item.period_end.slice(0, 10)}</Text>
              </View>
              <View style={styles.amountCol}>
                <Text style={styles.amount}>${item.amount_due_usd.toFixed(2)}</Text>
                <View style={[styles.status, item.status === "overdue" && styles.statusDanger, item.status === "paid" && styles.statusPaid]}>
                  <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
                </View>
              </View>
            </View>
          )) : <View style={styles.empty}><MaterialCommunityIcons name="check-circle-outline" size={28} color={v2Theme.colors.success} /><Text style={styles.emptyText}>No weekly statements yet.</Text></View>}
        </View>
      </> : null}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, padding: 22, backgroundColor: "#111111" },
  eyebrow: { color: "#AAB0B6", fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  heroValue: { color: "#FFFFFF", fontSize: 38, fontWeight: "900", marginTop: 10 },
  heroLabel: { color: "#C9CDD1", fontSize: 14, marginTop: 2 },
  metrics: { flexDirection: "row", gap: 10, marginTop: 18 },
  metric: { flex: 1, padding: 13, borderRadius: 18, backgroundColor: "#202124" },
  metricValue: { color: "#FFFFFF", fontWeight: "900", fontSize: 18 },
  metricLabel: { color: "#AAB0B6", fontSize: 12, marginTop: 3 },
  section: { marginTop: 22 },
  title: { color: "#111111", fontSize: 22, fontWeight: "900" },
  sub: { color: "#687078", fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 12 },
  row: { flexDirection: "row", gap: 12, alignItems: "center", padding: 16, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#ECE8E1", marginBottom: 10 },
  flex: { flex: 1 },
  name: { color: "#111111", fontWeight: "900", fontSize: 15 },
  meta: { color: "#747A80", fontSize: 12, marginTop: 3 },
  amountCol: { alignItems: "flex-end" },
  amount: { color: "#111111", fontSize: 18, fontWeight: "900" },
  status: { marginTop: 6, borderRadius: 999, backgroundColor: "#F3E7B7", paddingHorizontal: 9, paddingVertical: 4 },
  statusDanger: { backgroundColor: "#FAD9D6" },
  statusPaid: { backgroundColor: "#DDF3E5" },
  statusText: { color: "#34383C", fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  empty: { alignItems: "center", padding: 26, borderRadius: 22, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#ECE8E1" },
  emptyText: { marginTop: 8, color: "#687078", fontWeight: "700" },
  notice: { padding: 14, borderRadius: 16, backgroundColor: "#FDE8E7" },
  noticeText: { color: v2Theme.colors.danger, fontWeight: "700" },
});
