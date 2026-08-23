import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { EmptyState } from "../../components/states/EmptyState";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { createReport, myReports, SafetyReport } from "../../services/reportsService";
import { formatStatus } from "../../utils/formatStatus";

const reportTypes = ["Ride", "Food order", "Courier delivery", "Scam", "Payment issue", "Other"];

export default function ReportIssueScreen() {
  const { rideId } = useLocalSearchParams<{ rideId?: string }>();
  const [reportType, setReportType] = useState(reportTypes[0]);
  const [message, setMessage] = useState("");
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    try {
      setReports(await myReports());
    } catch {
      setReports([]);
    }
  }, []);

  useLiveRefresh(loadReports);

  async function submit() {
    try {
      setSaving(true);
      setError("");
      await createReport({ report_type: reportType, message, ride_id: rideId || undefined });
      setSubmitted(true);
      setMessage("");
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit report.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Report" showBack fallbackRoute="/(shared)/safety" navRole="customer">
      <Text style={styles.title}>Report issue</Text>
      <View style={styles.chips}>
        {reportTypes.map((type) => (
          <Pressable
            key={type}
            onPress={() => setReportType(type)}
            style={[styles.chip, reportType === type && styles.activeChip]}
          >
            <Text style={[styles.chipText, reportType === type && styles.activeChipText]}>{type}</Text>
          </Pressable>
        ))}
      </View>
      <AppInput
        label="Report details"
        value={message}
        onChangeText={setMessage}
        placeholder="Describe what happened"
        multiline
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {submitted ? <StatusBadge label="Report submitted" tone="success" /> : null}
      <AppButton title="Submit report" loading={saving} onPress={submit} disabled={message.trim().length < 5} />

      <Text style={styles.sectionTitle}>Your reports</Text>
      {reports.length === 0 ? (
        <EmptyState title="No reports yet" body="Reports you send to LetsGoRide support will appear here." />
      ) : reports.map((report) => (
        <View key={report.id} style={styles.reportCard}>
          <StatusBadge label={formatStatus(report.status)} tone="warning" />
          <Text style={styles.reportTitle}>{report.report_type}</Text>
          <Text style={styles.reportText}>{report.message}</Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 30,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeChip: {
    backgroundColor: "rgba(29,185,84,0.16)",
    borderColor: colors.primaryGreen,
  },
  chipText: {
    color: colors.mutedText,
    fontWeight: "800",
  },
  activeChipText: {
    color: colors.whiteText,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 20,
    marginTop: spacing.md,
  },
  reportCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  reportTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 17,
  },
  reportText: {
    color: colors.mutedText,
    lineHeight: 21,
  },
  error: {
    color: colors.danger,
    fontWeight: "700",
  },
});
