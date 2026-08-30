import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useCallback, useEffect, useState } from "react";

import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import {
  createWorkerPayoutMethod,
  deleteWorkerPayoutMethod,
  getWorkerWallet,
  setDefaultWorkerPayoutMethod,
  updateWorkerPayoutMethod,
} from "../../services/workerFinanceService";
import { PayoutMethodType, WorkerLedgerEntry, WorkerPayoutMethod, WorkerWallet } from "../../types/workerFinance.types";

export default function WalletScreen() {
  const [wallet, setWallet] = useState<WorkerWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingMethod, setEditingMethod] = useState<WorkerPayoutMethod | null>(null);
  const [methodType, setMethodType] = useState<PayoutMethodType>("ECOCASH");
  const [holder, setHolder] = useState("");
  const [mobile, setMobile] = useState("");
  const [bank, setBank] = useState("");
  const [account, setAccount] = useState("");
  const [branch, setBranch] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setWallet(await getWorkerWallet());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your wallet.");
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

  function clearFields() {
    setHolder("");
    setMobile("");
    setBank("");
    setAccount("");
    setBranch("");
    setBranchCode("");
    setMethodType("ECOCASH");
    setEditingMethod(null);
  }

  function resetForm() {
    clearFields();
    setShowForm(false);
  }

  function openAddForm() {
    clearFields();
    setShowForm(true);
    setError(null);
  }

  function openEditForm(method: WorkerPayoutMethod) {
    setEditingMethod(method);
    setMethodType(method.method_type);
    setHolder(method.account_holder_name || "");
    setMobile("");
    setBank(method.bank_name || "");
    setAccount("");
    setBranch(method.branch_name || "");
    setBranchCode(method.branch_code || "");
    setShowForm(true);
    setError(null);
  }

  async function saveMethod() {
    const editing = Boolean(editingMethod);
    const cleanHolder = holder.trim();
    const cleanMobile = mobile.trim();
    const cleanBank = bank.trim();
    const cleanAccount = account.trim();

    if (!cleanHolder) return setError("Enter the account holder name.");
    if (methodType === "ECOCASH") {
      if (!editing && cleanMobile.length < 7) return setError("Enter the EcoCash mobile number.");
      if (editing && cleanMobile && cleanMobile.length < 7) return setError("Enter a valid new EcoCash mobile number or leave it blank to keep the saved one.");
    }
    if (methodType === "BANK") {
      if (!cleanBank) return setError("Enter the bank name.");
      if (!editing && cleanAccount.length < 4) return setError("Enter the bank account number.");
      if (editing && cleanAccount && cleanAccount.length < 4) return setError("Enter a valid new account number or leave it blank to keep the saved one.");
    }

    try {
      setSaving(true);
      setError(null);
      if (editingMethod) {
        await updateWorkerPayoutMethod(editingMethod.id, {
          account_holder_name: cleanHolder,
          mobile_number: methodType === "ECOCASH" && cleanMobile ? cleanMobile : undefined,
          bank_name: methodType === "BANK" ? cleanBank : undefined,
          account_number: methodType === "BANK" && cleanAccount ? cleanAccount : undefined,
          branch_name: methodType === "BANK" ? branch.trim() || null : undefined,
          branch_code: methodType === "BANK" ? branchCode.trim() || null : undefined,
          currency: "USD",
        });
      } else {
        await createWorkerPayoutMethod({
          method_type: methodType,
          account_holder_name: cleanHolder,
          mobile_number: methodType === "ECOCASH" ? cleanMobile : undefined,
          bank_name: methodType === "BANK" ? cleanBank : undefined,
          account_number: methodType === "BANK" ? cleanAccount : undefined,
          branch_name: methodType === "BANK" ? branch.trim() || undefined : undefined,
          branch_code: methodType === "BANK" ? branchCode.trim() || undefined : undefined,
          currency: "USD",
          make_default: !(wallet?.payout_methods.length),
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save this payout method.");
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(method: WorkerPayoutMethod) {
    if (method.is_default) return;
    try {
      setError(null);
      await setDefaultWorkerPayoutMethod(method.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change the default payout method.");
    }
  }

  function removeMethod(method: WorkerPayoutMethod) {
    Alert.alert(
      "Remove payout method?",
      `${method.method_type === "ECOCASH" ? "EcoCash" : method.bank_name || "Bank"} ${method.masked_reference} will be removed.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void (async () => {
            try {
              await deleteWorkerPayoutMethod(method.id);
              if (editingMethod?.id === method.id) resetForm();
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Unable to remove this payout method.");
            }
          })(),
        },
      ],
    );
  }

  const roleLabel = wallet?.worker_role === "courier" ? "Courier" : "Driver";
  return (
    <Screen showBack fallbackRoute="/(shared)/account" title="Wallet" showNotifications={false} refreshing={refreshing} onRefresh={wallet ? refresh : undefined}>
      {loading && !wallet ? <WalletSkeleton /> : null}
      {error ? (
        <View style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          {!wallet ? <Pressable accessibilityRole="button" onPress={load}><Text style={styles.retry}>Retry</Text></Pressable> : null}
        </View>
      ) : null}

      {wallet ? <>
        <View style={styles.heroCard}>
          <Text style={styles.kicker}>{roleLabel.toUpperCase()} WALLET</Text>
          <Text style={styles.balance}>{money(wallet.available_balance_usd)}</Text>
          <Text style={styles.balanceLabel}>Available for payout</Text>
          <View style={styles.heroDivider} />
          <View style={styles.heroMetrics}>
            <Metric label="Total take-home" value={money(wallet.net_earnings_usd)} />
            <Metric label="Paid out" value={money(wallet.paid_out_usd)} />
          </View>
        </View>

        <View style={styles.moneyGrid}>
          {wallet.worker_role === "driver" ? <>
            <MoneyCard icon="cash-multiple" label="Cash earnings" value={money(wallet.cash_collected_usd)} body="100% yours. LetsGoRide charges no fee on cash Ride Now trips." />
            <MoneyCard icon="credit-card-outline" label="Card earnings" value={money(wallet.digital_earnings_usd)} body="Your card-trip earnings after the LetsGoRide card fee." />
            <MoneyCard icon="percent-outline" label="Card platform fees" value={money(wallet.platform_commission_usd)} body="LetsGoRide only takes a platform fee from card-paid Ride Now trips." />
            <MoneyCard icon="wallet-outline" label="Total take-home" value={money(wallet.net_earnings_usd)} body="Cash in full plus your net earnings from card trips." />
          </> : <>
            <MoneyCard icon="wallet-outline" label="Delivery earnings" value={money(wallet.net_earnings_usd)} body="Your recorded earnings from completed deliveries." />
            <MoneyCard icon="credit-card-outline" label="Digital earnings" value={money(wallet.digital_earnings_usd)} body="Courier earnings recorded digitally before payouts." />
            <MoneyCard icon="bank-transfer" label="Paid out" value={money(wallet.paid_out_usd)} body="Payouts already recorded as paid." />
            <MoneyCard icon="cash-check" label="Available" value={money(wallet.available_balance_usd)} body="Digital earnings still available for payout." />
          </>}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Payout methods</Text>
              <Text style={styles.sectionSub}>EcoCash or bank account · destination details stay masked</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={showForm ? "Close payout method form" : "Add payout method"} onPress={showForm ? resetForm : openAddForm} style={styles.addButton}>
              <MaterialCommunityIcons name={showForm ? "close" : "plus"} size={19} color="#FFFFFF" />
            </Pressable>
          </View>

          {showForm ? (
            <View style={styles.formCard}>
              {editingMethod ? (
                <View style={styles.editHeader}>
                  <View style={styles.editIcon}><MaterialCommunityIcons name="shield-edit-outline" size={20} color={v2Theme.colors.ink} /></View>
                  <View style={styles.editCopy}>
                    <Text style={styles.editTitle}>Editing {methodType === "ECOCASH" ? "EcoCash" : "bank account"}</Text>
                    <Text style={styles.editBody}>Saved destination {editingMethod.masked_reference} stays unchanged unless you type a new number below.</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.methodTabs}>
                  <MethodTab label="EcoCash" active={methodType === "ECOCASH"} onPress={() => setMethodType("ECOCASH")} />
                  <MethodTab label="Bank account" active={methodType === "BANK"} onPress={() => setMethodType("BANK")} />
                </View>
              )}

              <AppInput label="Account holder name" value={holder} onChangeText={setHolder} placeholder="Name on the account" />
              {methodType === "ECOCASH" ? (
                <AppInput
                  label={editingMethod ? "New EcoCash number (optional)" : "EcoCash mobile number"}
                  value={mobile}
                  onChangeText={setMobile}
                  placeholder={editingMethod ? `Keep ${editingMethod.masked_reference}` : "e.g. +263 77…"}
                  keyboardType="phone-pad"
                />
              ) : <>
                <AppInput label="Bank name" value={bank} onChangeText={setBank} placeholder="Bank" />
                <AppInput
                  label={editingMethod ? "New account number (optional)" : "Account number"}
                  value={account}
                  onChangeText={setAccount}
                  placeholder={editingMethod ? `Keep ${editingMethod.masked_reference}` : "Account number"}
                />
                <AppInput label="Branch / branch name" value={branch} onChangeText={setBranch} placeholder="Optional" />
                <AppInput label="Branch code" value={branchCode} onChangeText={setBranchCode} placeholder="Optional" />
              </>}

              <View style={styles.securityNote}>
                <MaterialCommunityIcons name="shield-lock-outline" size={19} color={v2Theme.colors.ink} />
                <Text style={styles.securityText}>Never enter a banking password, card number, CVV, PIN or OTP here. LetsGoRide never shows your full saved payout destination again.</Text>
              </View>
              <Pressable accessibilityRole="button" disabled={saving} onPress={saveMethod} style={[styles.saveButton, saving && styles.disabled]}>
                <Text style={styles.saveText}>{saving ? (editingMethod ? "Updating securely…" : "Saving securely…") : (editingMethod ? "Update payout method" : "Save payout method")}</Text>
              </Pressable>
            </View>
          ) : null}

          {wallet.payout_methods.length ? (
            <View style={styles.methodList}>
              {wallet.payout_methods.map((method) => (
                <View key={method.id} style={styles.methodCard}>
                  <View style={styles.methodIcon}><MaterialCommunityIcons name={method.method_type === "ECOCASH" ? "cellphone" : "bank-outline"} size={22} color={v2Theme.colors.ink} /></View>
                  <View style={styles.methodCopy}>
                    <View style={styles.methodTitleRow}>
                      <Text style={styles.methodTitle}>{method.method_type === "ECOCASH" ? "EcoCash" : method.bank_name || "Bank account"}</Text>
                      {method.is_default ? <Text style={styles.defaultTag}>DEFAULT</Text> : null}
                    </View>
                    <Text style={styles.methodReference}>{method.account_holder_name} · {method.masked_reference}</Text>
                  </View>
                  <View style={styles.methodActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Edit payout method" hitSlop={8} onPress={() => openEditForm(method)}>
                      <MaterialCommunityIcons name="pencil-outline" size={20} color={v2Theme.colors.ink} />
                    </Pressable>
                    {!method.is_default ? <Pressable accessibilityRole="button" accessibilityLabel="Make default payout method" hitSlop={8} onPress={() => void makeDefault(method)}><MaterialCommunityIcons name="star-outline" size={20} color={v2Theme.colors.inkSecondary} /></Pressable> : null}
                    <Pressable accessibilityRole="button" accessibilityLabel="Remove payout method" hitSlop={8} onPress={() => removeMethod(method)}><MaterialCommunityIcons name="trash-can-outline" size={20} color={v2Theme.colors.danger} /></Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : !showForm ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="wallet-plus-outline" size={27} color={v2Theme.colors.ink} />
              <Text style={styles.emptyTitle}>No payout method saved</Text>
              <Text style={styles.emptyBody}>Add EcoCash or a bank account so it is ready when settlements are enabled.</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent earnings</Text>
          {wallet.ledger.length ? (
            <View style={styles.ledgerCard}>
              {wallet.ledger.slice(0, 20).map((entry, index) => (
                <View key={entry.id} style={[styles.ledgerRow, index > 0 && styles.rowBorder]}>
                  <View style={styles.ledgerIcon}><MaterialCommunityIcons name={entry.source_type === "RIDE_NOW" ? "car-outline" : "package-variant-closed"} size={19} color={v2Theme.colors.ink} /></View>
                  <View style={styles.ledgerCopy}>
                    <Text numberOfLines={1} style={styles.ledgerTitle}>{entry.label}</Text>
                    <Text style={styles.ledgerMeta}>{formatDate(entry.occurred_at)} · {ledgerSettlementLabel(entry)}</Text>
                  </View>
                  <Text style={styles.ledgerAmount}>{money(entry.worker_earnings_usd)}</Text>
                </View>
              ))}
            </View>
          ) : <Text style={styles.emptyInline}>Completed Ride Now trips or deliveries will appear here.</Text>}
        </View>

        <View style={styles.settlementNote}>
          <MaterialCommunityIcons name="information-outline" size={21} color={v2Theme.colors.inkSecondary} />
          <Text style={styles.settlementText}>{wallet.settlement_integrated ? "Payout settlement is connected." : "Cash Ride Now earnings stay with the driver immediately. Digital balances are recorded here, but automatic withdrawals and payout settlement are not connected yet."}</Text>
        </View>
      </> : null}
    </Screen>
  );
}

function WalletSkeleton() {
  return <View style={styles.skeletonWrap}><View style={styles.skeletonHero} /><View style={styles.skeletonRow}><View style={styles.skeletonBox} /><View style={styles.skeletonBox} /></View><View style={styles.skeletonLine} /></View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function MoneyCard({ icon, label, value, body }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; body: string }) {
  return <View style={styles.moneyCard}><MaterialCommunityIcons name={icon} size={20} color={v2Theme.colors.ink} /><Text style={styles.moneyLabel}>{label}</Text><Text style={styles.moneyValue}>{value}</Text><Text style={styles.moneyBody}>{body}</Text></View>;
}

function MethodTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.methodTab, active && styles.methodTabActive]}><Text style={[styles.methodTabText, active && styles.methodTabTextActive]}>{label}</Text></Pressable>;
}

function ledgerSettlementLabel(entry: WorkerLedgerEntry) {
  if (entry.source_type === "RIDE_NOW" && entry.payment_method === "cash") return "Cash · 100% yours";
  if (entry.source_type === "RIDE_NOW" && entry.payment_method === "card") return "Card · after platform fee";
  return entry.settlement_state.replaceAll("_", " ");
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
  errorCard: { minHeight: 58, borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  retry: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" },
  heroCard: { borderRadius: 28, backgroundColor: "#111111", padding: 20, gap: 5 },
  kicker: { color: "rgba(255,255,255,0.56)", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  balance: { color: "#FFFFFF", fontSize: 39, lineHeight: 44, fontWeight: "900", letterSpacing: -1.5 },
  balanceLabel: { color: "rgba(255,255,255,0.68)", fontSize: 11, fontWeight: "700" },
  heroDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.16)", marginVertical: 10 },
  heroMetrics: { flexDirection: "row", gap: 12 },
  metric: { flex: 1, gap: 2 },
  metricValue: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  metricLabel: { color: "rgba(255,255,255,0.52)", fontSize: 9, fontWeight: "700" },
  moneyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  moneyCard: { width: "48%", minHeight: 128, borderRadius: 20, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 13, gap: 5 },
  moneyLabel: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  moneyValue: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900" },
  moneyBody: { color: v2Theme.colors.inkTertiary, fontSize: 8, lineHeight: 12 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 9, marginTop: 2 },
  addButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#111111", alignItems: "center", justifyContent: "center" },
  formCard: { borderRadius: 22, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 14, gap: 12 },
  methodTabs: { flexDirection: "row", backgroundColor: v2Theme.colors.surfaceMuted, borderRadius: 15, padding: 4, gap: 4 },
  methodTab: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  methodTabActive: { backgroundColor: "#111111" },
  methodTabText: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "900" },
  methodTabTextActive: { color: "#FFFFFF" },
  editHeader: { borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, padding: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  editIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" },
  editCopy: { flex: 1, gap: 2 },
  editTitle: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  editBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 13 },
  securityNote: { borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, padding: 11, flexDirection: "row", gap: 8 },
  securityText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  saveButton: { minHeight: 50, borderRadius: 17, backgroundColor: "#111111", alignItems: "center", justifyContent: "center" },
  saveText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  methodList: { gap: 8 },
  methodCard: { minHeight: 70, borderRadius: 19, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 11, flexDirection: "row", alignItems: "center", gap: 10 },
  methodIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  methodCopy: { flex: 1, gap: 3 },
  methodTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  methodTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  defaultTag: { color: "#111111", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  methodReference: { color: v2Theme.colors.inkSecondary, fontSize: 9 },
  methodActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  emptyCard: { borderRadius: 20, backgroundColor: v2Theme.colors.surfaceMuted, padding: 16, gap: 5 },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  ledgerCard: { borderRadius: 20, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden" },
  ledgerRow: { minHeight: 68, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line },
  ledgerIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  ledgerCopy: { flex: 1, gap: 2 },
  ledgerTitle: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  ledgerMeta: { color: v2Theme.colors.inkSecondary, fontSize: 8, textTransform: "capitalize" },
  ledgerAmount: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  emptyInline: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  settlementNote: { borderRadius: 18, backgroundColor: v2Theme.colors.surfaceMuted, padding: 13, flexDirection: "row", gap: 9 },
  settlementText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  skeletonWrap: { gap: 10 },
  skeletonHero: { height: 180, borderRadius: 28, backgroundColor: v2Theme.colors.surfaceMuted },
  skeletonRow: { flexDirection: "row", gap: 9 },
  skeletonBox: { flex: 1, height: 120, borderRadius: 20, backgroundColor: v2Theme.colors.surfaceMuted },
  skeletonLine: { height: 70, borderRadius: 20, backgroundColor: v2Theme.colors.surfaceMuted },
  disabled: { opacity: 0.5 },
});