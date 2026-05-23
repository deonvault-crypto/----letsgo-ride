import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { createReport } from "../../services/reportsService";

const reportTypes = ["Unsafe ride", "Scam", "Driver", "Passenger", "Payment issue", "Other"];

export default function ReportIssueScreen() {
  const [reportType, setReportType] = useState(reportTypes[0]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    try {
      setSaving(true);
      setError("");
      await createReport({ report_type: reportType, message });
      setSubmitted(true);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit report.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Report" navRole="passenger">
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
  error: {
    color: colors.danger,
    fontWeight: "700",
  },
});
