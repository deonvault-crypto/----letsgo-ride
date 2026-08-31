import { MaterialCommunityIcons } from "@expo/vector-icons";
import { initPaymentSheet, initStripe, presentPaymentSheet } from "@stripe/stripe-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { v2Theme } from "../../constants/v2Theme";
import {
  confirmDriverFeeSettlement,
  createDriverFeeSettlementIntent,
} from "../../services/workerFinanceService";
import { WorkerWallet } from "../../types/workerFinance.types";
import { Screen } from "../ui/Screen";


type Props = {
  wallet: WorkerWallet;
  refreshing: boolean;
  onRefresh: () => void;
  onReload: () => Promise<void>;
};

function money(value?: number | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function shortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function dateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function DriverSettlementWallet({ wallet, refreshing, onRefresh, onReload }: Props) {
  const [settling, setSettling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const week = wallet.current_week;
  const statement = wallet.current_statement;
  const due = Number(wallet.amount_due_to_platform_usd || 0);
  const showSettle = wallet.settlement_button_visible === true && due > 0;

  async function settleBalance() {
    if (!showSettle || settling) return;
    try {
      setSettling(true);
      setError(null);
      setMessage("Preparing your exact weekly balance securely…");
      const intent = await createDriverFeeSettlementIntent();
      await initStripe({ publishableKey: intent.publishable_key });
      const initialized = await initPaymentSheet({
        merchantDisplayName: "LetsGoRide",
        paymentIntentClientSecret: intent.client_secret,
        allowsDelayedPaymentMethods: false,
        returnURL: "letsgoride://stripe-redirect",
      });
      if (initialized.error) throw new Error(initialized.error.message);

      setMessage("Complete your secure LetsGoRide balance payment.");
      const presented = await presentPaymentSheet();
      if (presented.error) {
        if (presented.error.code === "Canceled") {
          setMessage(null);
          return;
        }
        throw new Error(presented.error.message);
      }

      setMessage("Payment received by Stripe. Confirming your LetsGoRide balance…");
      const confirmation = await confirmDriverFeeSettlement();
      if (confirmation.settled) {
        setMessage("Balance settled. You’re clear for Ride Now.");
      } else {
        setMessage("Stripe is confirming the payment. Your balance will clear automatically.");
      }
      await onReload();
    } catch (err) {
      setMessage(null);
      setError(err instanceof Error ? err.message : "Unable to settle your balance right now.");
    } finally {
      setSettling(false);
    }
  }

  return (
    <Screen
      showBack
      fallbackRoute="/(shared)/account"
      title="Wallet"
      showNotifications={false}
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {wallet.ride_now_finance_paused ? (
        <View style={styles.pauseCard}>
          <MaterialCommunityIcons name="pause-circle-outline" size={23} color="#8A351B" />
          <View style={styles.flex}>
            <Text style={styles.pauseTitle}>Ride Now is temporarily paused</Text>
            <Text style={styles.pauseBody}>Settle your overdue weekly balance below. Your account, history and support remain available.</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.hero}>
        <Text style={styles.heroKicker}>WEEKLY SETTLEMENT</Text>
        <Text style={styles.heroTitle}>Earn first. Settle once a week.</Text>
        <Text style={styles.heroBody}>Passengers pay you directly. LetsGoRide automatically totals the service fee from completed rides and only asks you to settle after your 7-day earning period.</Text>
      </View>

      <View style={styles.metricsRow}>
        <Metric icon="cash-multiple" label="Fares collected" value={money(week?.gross_fares_usd)} />
        <Metric icon="percent-outline" label="Fees this week" value={money(week?.platform_fee_accrued_usd)} />
      </View>
      <View style={styles.smallMetric}>
        <MaterialCommunityIcons name="car-outline" size={20} color={v2Theme.colors.ink} />
        <Text style={styles.smallMetricLabel}>Completed rides in current earning period</Text>
        <Text style={styles.smallMetricValue}>{week?.ride_count || 0}</Text>
      </View>

      {showSettle && statement ? (
        <View style={[styles.statementCard, statement.status === "overdue" && styles.statementOverdue]}>
          <View style={styles.statementHeader}>
            <View>
              <Text style={styles.statementKicker}>{statement.status === "overdue" ? "OVERDUE" : "STATEMENT READY"}</Text>
              <Text style={styles.statementTitle}>Weekly LetsGoRide balance</Text>
            </View>
            <MaterialCommunityIcons name="receipt-text-check-outline" size={27} color="#FFFFFF" />
          </View>
          <Text style={styles.dueLabel}>AMOUNT TO SETTLE</Text>
          <Text style={styles.dueAmount}>{money(due)}</Text>
          <Text style={styles.statementMeta}>{statement.ride_count} rides · {money(statement.gross_fares_usd)} collected</Text>
          <View style={styles.statementDivider} />
          <View style={styles.statementDates}>
            <DateItem label="Period" value={`${shortDate(statement.period_start)} – ${shortDate(statement.period_end)}`} />
            <DateItem label="Grace deadline" value={dateTime(statement.grace_ends_at)} align="right" />
          </View>
          {message ? <Text style={styles.paymentMessage}>{message}</Text> : null}
          {error ? <Text style={styles.paymentError}>{error}</Text> : null}
          {wallet.settlement_payment_enabled ? (
            <Pressable
              accessibilityRole="button"
              disabled={settling}
              onPress={() => void settleBalance()}
              style={({ pressed }) => [styles.settleButton, settling && styles.buttonDisabled, pressed && !settling && styles.pressed]}
            >
              <Text style={styles.settleButtonText}>{settling ? "Confirming payment…" : `Settle balance · ${money(due)}`}</Text>
              <MaterialCommunityIcons name="arrow-right" size={22} color="#111111" />
            </Pressable>
          ) : (
            <View style={styles.paymentUnavailable}>
              <MaterialCommunityIcons name="shield-alert-outline" size={20} color="#7C4A16" />
              <Text style={styles.paymentUnavailableText}>Secure settlement is temporarily unavailable. Your balance remains recorded and no extra fee is added.</Text>
            </View>
          )}
          <Text style={styles.secureCopy}>Secure payment by Stripe · the amount is calculated by LetsGoRide and cannot be edited.</Text>
        </View>
      ) : (
        <View style={styles.clearCard}>
          <View style={styles.clearIcon}><MaterialCommunityIcons name="check" size={22} color="#0C7137" /></View>
          <View style={styles.flex}>
            <Text style={styles.clearTitle}>Nothing to settle today</Text>
            <Text style={styles.clearBody}>{week?.period_end ? `Your current earning period ends ${dateTime(week.period_end)}. Keep driving — we’ll notify you when your statement is ready.` : "Complete rides first. Your first 7-day earning period begins automatically."}</Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Weekly statements</Text>
        <Text style={styles.sectionSub}>Every statement is calculated from completed Ride Now trips. Paid statements stay here as your record.</Text>
        {wallet.statement_history?.length ? (
          <View style={styles.historyCard}>
            {wallet.statement_history.map((item, index) => (
              <View key={item.id} style={[styles.historyRow, index > 0 && styles.historyBorder]}>
                <View style={[styles.historyIcon, item.status === "paid" && styles.historyIconPaid]}>
                  <MaterialCommunityIcons name={item.status === "paid" ? "check" : "receipt-text-outline"} size={17} color={item.status === "paid" ? "#0C7137" : v2Theme.colors.ink} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.historyTitle}>{shortDate(item.period_start)} – {shortDate(item.period_end)}</Text>
                  <Text style={styles.historyMeta}>{item.ride_count} rides · {item.status === "paid" ? `Paid ${shortDate(item.paid_at)}` : item.status.toUpperCase()}</Text>
                </View>
                <Text style={styles.historyAmount}>{money(item.platform_fee_usd)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyHistory}><Text style={styles.emptyHistoryText}>Your first weekly statement will appear here after your first earning period.</Text></View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Ride Now earnings</Text>
        {wallet.ledger?.length ? (
          <View style={styles.historyCard}>
            {wallet.ledger.slice(0, 12).map((entry, index) => (
              <View key={entry.id} style={[styles.historyRow, index > 0 && styles.historyBorder]}>
                <View style={styles.historyIcon}><MaterialCommunityIcons name="car-outline" size={17} color={v2Theme.colors.ink} /></View>
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={styles.historyTitle}>{entry.label}</Text>
                  <Text style={styles.historyMeta}>Passenger fare {money(entry.gross_usd)}</Text>
                </View>
                <View style={styles.rideAmounts}>
                  <Text style={styles.historyAmount}>{money(entry.gross_usd)}</Text>
                  <Text style={styles.feeAmount}>fee {money(entry.platform_commission_usd)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : <View style={styles.emptyHistory}><Text style={styles.emptyHistoryText}>Completed Ride Now trips will appear here.</Text></View>}
      </View>
    </Screen>
  );
}

function Metric({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.metricCard}><MaterialCommunityIcons name={icon} size={22} color={v2Theme.colors.ink} /><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function DateItem({ label, value, align }: { label: string; value: string; align?: "right" }) {
  return <View style={[styles.dateItem, align === "right" && styles.dateRight]}><Text style={styles.dateLabel}>{label}</Text><Text style={styles.dateValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { backgroundColor: "#111111", borderRadius: 30, padding: 24, marginBottom: 16 },
  heroKicker: { color: "#77DC9A", fontSize: 11, fontWeight: "900", letterSpacing: 2.2 },
  heroTitle: { color: "#FFFFFF", fontSize: 29, lineHeight: 33, fontWeight: "900", marginTop: 10 },
  heroBody: { color: "#C8C8C8", fontSize: 14, lineHeight: 21, marginTop: 12 },
  pauseCard: { flexDirection: "row", gap: 12, padding: 16, borderRadius: 20, backgroundColor: "#FFF0E9", borderWidth: 1, borderColor: "#F2C7B7", marginBottom: 16 },
  pauseTitle: { fontSize: 15, fontWeight: "900", color: "#7E2D17" },
  pauseBody: { fontSize: 13, lineHeight: 19, color: "#88513E", marginTop: 3 },
  metricsRow: { flexDirection: "row", gap: 12 },
  metricCard: { flex: 1, minHeight: 142, borderRadius: 24, padding: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8E2D8" },
  metricLabel: { color: v2Theme.colors.inkSecondary, fontSize: 12, fontWeight: "800", marginTop: 14 },
  metricValue: { color: v2Theme.colors.ink, fontSize: 27, fontWeight: "900", marginTop: 5 },
  smallMetric: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderRadius: 20, backgroundColor: "#F2EFE8", marginTop: 12 },
  smallMetricLabel: { flex: 1, fontSize: 13, color: v2Theme.colors.inkSecondary, fontWeight: "700" },
  smallMetricValue: { fontSize: 18, fontWeight: "900", color: v2Theme.colors.ink },
  statementCard: { backgroundColor: "#111111", borderRadius: 30, padding: 22, marginTop: 20 },
  statementOverdue: { backgroundColor: "#30180F" },
  statementHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  statementKicker: { color: "#78DE9B", fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  statementTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "900", marginTop: 5 },
  dueLabel: { color: "#AFAFAF", fontSize: 10, fontWeight: "900", letterSpacing: 1.7, marginTop: 26 },
  dueAmount: { color: "#FFFFFF", fontSize: 46, fontWeight: "900", lineHeight: 52, marginTop: 3 },
  statementMeta: { color: "#BEBEBE", fontSize: 13, marginTop: 3 },
  statementDivider: { height: 1, backgroundColor: "#333333", marginVertical: 20 },
  statementDates: { flexDirection: "row" },
  dateItem: { flex: 1 },
  dateRight: { alignItems: "flex-end" },
  dateLabel: { color: "#929292", fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  dateValue: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", marginTop: 4 },
  settleButton: { marginTop: 20, minHeight: 64, borderRadius: 20, backgroundColor: "#FFFFFF", paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  settleButtonText: { color: "#111111", fontSize: 16, fontWeight: "900" },
  secureCopy: { color: "#8F8F8F", fontSize: 11, lineHeight: 16, marginTop: 12 },
  paymentMessage: { color: "#B7EAC8", fontSize: 12, lineHeight: 18, marginTop: 16 },
  paymentError: { color: "#FFB6A4", fontSize: 12, lineHeight: 18, marginTop: 16 },
  paymentUnavailable: { flexDirection: "row", gap: 10, backgroundColor: "#FFF1D9", borderRadius: 16, padding: 14, marginTop: 18 },
  paymentUnavailableText: { flex: 1, color: "#7C4A16", fontSize: 12, lineHeight: 18 },
  buttonDisabled: { opacity: 0.55 },
  pressed: { opacity: 0.78 },
  clearCard: { flexDirection: "row", gap: 13, alignItems: "flex-start", backgroundColor: "#EEF9F1", borderRadius: 24, borderWidth: 1, borderColor: "#D0EAD8", padding: 18, marginTop: 20 },
  clearIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  clearTitle: { color: "#0C7137", fontSize: 16, fontWeight: "900" },
  clearBody: { color: "#4E755D", fontSize: 13, lineHeight: 19, marginTop: 4 },
  section: { marginTop: 28 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 24, fontWeight: "900" },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 14 },
  historyCard: { backgroundColor: "#FFFFFF", borderRadius: 24, borderWidth: 1, borderColor: "#E8E2D8", paddingHorizontal: 16 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 76, paddingVertical: 12 },
  historyBorder: { borderTopWidth: 1, borderTopColor: "#EEE9E1" },
  historyIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#F3F1EC", alignItems: "center", justifyContent: "center" },
  historyIconPaid: { backgroundColor: "#E9F7ED" },
  historyTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "800" },
  historyMeta: { color: v2Theme.colors.inkSecondary, fontSize: 11, marginTop: 4 },
  historyAmount: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" },
  rideAmounts: { alignItems: "flex-end" },
  feeAmount: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 3 },
  emptyHistory: { backgroundColor: "#F3F1EC", borderRadius: 20, padding: 18 },
  emptyHistoryText: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 19 },
});
