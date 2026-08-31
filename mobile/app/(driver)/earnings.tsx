import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { getWorkerWallet } from "../../services/workerFinanceService";
import { WorkerWallet } from "../../types/workerFinance.types";

const DRIVER_BLACK = "#111111";

export default function DriverEarningsScreen() {
  const [wallet, setWallet] = useState<WorkerWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await getWorkerWallet();
      setWallet(next);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your earnings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function refresh() {
    setRefreshing(true);
    void load();
  }

  const weekRides = wallet?.driver_settlement?.current_week_ride_count || 0;
  const weekCash = wallet?.driver_settlement?.current_week_cash_fares_usd || 0;

  return (
    <Screen
      title="Earnings"
      showBack
      fallbackRoute="/(driver)/account"
      showNotifications={false}
      refreshing={refreshing}
      onRefresh={wallet ? refresh : undefined}
    >
      {loading && !wallet ? (
        <View style={styles.loadingCard}>
          <Text style={styles.loadingText}>Loading your earnings…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={load}><Text style={styles.retry}>Retry</Text></Pressable>
        </View>
      ) : null}

      {wallet ? (
        <>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>DRIVER EARNINGS</Text>
            <Text style={styles.amount}>{money(wallet.cash_collected_usd)}</Text>
            <Text style={styles.heroLabel}>Cash earned from Ride Now</Text>
            <View style={styles.heroDivider} />
            <View style={styles.heroRow}>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>100%</Text>
                <Text style={styles.heroMetricLabel}>Yours to keep</Text>
              </View>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>{weekRides}</Text>
                <Text style={styles.heroMetricLabel}>Rides this week</Text>
              </View>
            </View>
          </View>

          <View style={styles.keepCard}>
            <View style={styles.keepIcon}>
              <MaterialCommunityIcons name="hand-coin-outline" size={24} color={DRIVER_BLACK} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.keepTitle}>You keep 100% of your Ride Now earnings.</Text>
              <Text style={styles.keepBody}>During the LetsGoRide launch, every Ride Now cash fare you collect is yours.</Text>
            </View>
          </View>

          <View style={styles.grid}>
            <StatCard icon="cash-multiple" label="Cash earned" value={money(wallet.cash_collected_usd)} body="Passenger pays you directly after the ride." />
            <StatCard icon="calendar-week-outline" label="This week" value={money(weekCash)} body={`${weekRides} completed ${weekRides === 1 ? "ride" : "rides"} this week.`} />
            <StatCard icon="chart-line" label="Total earnings" value={money(wallet.net_earnings_usd)} body="Your recorded Ride Now earnings." />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent earnings</Text>
            {wallet.ledger.length ? (
              <View style={styles.ledger}>
                {wallet.ledger.slice(0, 20).map((entry, index) => (
                  <View key={entry.id} style={[styles.ledgerRow, index > 0 && styles.rowBorder]}>
                    <View style={styles.ledgerIcon}>
                      <MaterialCommunityIcons name="car-outline" size={19} color={DRIVER_BLACK} />
                    </View>
                    <View style={styles.flex}>
                      <Text numberOfLines={1} style={styles.ledgerTitle}>{entry.label}</Text>
                      <Text style={styles.ledgerMeta}>{formatDate(entry.occurred_at)}</Text>
                    </View>
                    <Text style={styles.ledgerAmount}>{money(entry.worker_earnings_usd)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="car-clock" size={24} color={DRIVER_BLACK} />
                <Text style={styles.emptyTitle}>Your first earnings will appear here.</Text>
                <Text style={styles.emptyBody}>Complete a Ride Now trip and the amount you earned will be recorded automatically.</Text>
              </View>
            )}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function StatCard({ icon, label, value, body }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; body: string }) {
  return (
    <View style={styles.statCard}>
      <MaterialCommunityIcons name={icon} size={20} color={DRIVER_BLACK} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statBody}>{body}</Text>
    </View>
  );
}

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Completed";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Completed" : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { borderRadius: 30, backgroundColor: DRIVER_BLACK, padding: 20, gap: 5 },
  eyebrow: { color: "rgba(255,255,255,0.56)", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  amount: { color: "#FFFFFF", fontSize: 42, lineHeight: 47, fontWeight: "900", letterSpacing: -1.6 },
  heroLabel: { color: "rgba(255,255,255,0.68)", fontSize: 11, fontWeight: "700" },
  heroDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.16)", marginVertical: 10 },
  heroRow: { flexDirection: "row", gap: 12 },
  heroMetric: { flex: 1, gap: 2 },
  heroMetricValue: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  heroMetricLabel: { color: "rgba(255,255,255,0.54)", fontSize: 9, fontWeight: "700" },
  keepCard: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  keepIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  keepTitle: { color: DRIVER_BLACK, fontSize: 14, fontWeight: "900", letterSpacing: -0.2 },
  keepBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15, marginTop: 3 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  statCard: { width: "48%", minHeight: 128, borderRadius: 22, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 13, gap: 5 },
  statLabel: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  statValue: { color: DRIVER_BLACK, fontSize: 20, fontWeight: "900" },
  statBody: { color: v2Theme.colors.inkTertiary, fontSize: 8, lineHeight: 12 },
  section: { gap: 10 },
  sectionTitle: { color: DRIVER_BLACK, fontSize: 19, fontWeight: "900", letterSpacing: -0.25 },
  ledger: { borderRadius: 22, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden" },
  ledgerRow: { minHeight: 68, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line },
  ledgerIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  ledgerTitle: { color: DRIVER_BLACK, fontSize: 10, fontWeight: "900" },
  ledgerMeta: { color: v2Theme.colors.inkSecondary, fontSize: 8, marginTop: 2 },
  ledgerAmount: { color: DRIVER_BLACK, fontSize: 12, fontWeight: "900" },
  emptyCard: { borderRadius: 22, backgroundColor: v2Theme.colors.surfaceMuted, padding: 16, gap: 6 },
  emptyTitle: { color: DRIVER_BLACK, fontSize: 13, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  loadingCard: { height: 170, borderRadius: 30, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  loadingText: { color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "800" },
  errorCard: { minHeight: 58, borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  retry: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" },
});
