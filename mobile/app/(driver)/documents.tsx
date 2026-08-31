import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { v2Theme } from "../../constants/v2Theme";
import { getMyVerification } from "../../services/verificationService";
import { VerificationDocument, VerificationProfile } from "../../types/verification.types";
import { formatStatus } from "../../utils/formatStatus";

const DRIVER_BLACK = "#111111";
const LABELS: Record<string, string> = {
  selfie: "Selfie",
  identity_document: "Identity document",
  driver_license: "Driver licence",
  vehicle_registration_or_logbook: "Vehicle registration / logbook",
  vehicle_photo_optional: "Vehicle photo",
};

export default function DriverDocumentsScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<VerificationProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setProfile(await getMyVerification());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Driver documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const approved = profile?.verification_status === "approved";
  const documents = profile?.documents || [];

  return (
    <Screen title="Documents" showBack fallbackRoute="/(driver)/account" showNotifications={false} refreshing={loading} onRefresh={load}>
      {loading && !profile ? <LoadingState label="Loading Driver documents…" /> : null}
      {error && !profile ? <ErrorState message={error} onRetry={load} /> : null}

      {profile ? (
        <>
          <View style={styles.hero}>
            <View style={styles.heroIcon}><MaterialCommunityIcons name="file-document-check-outline" size={28} color={DRIVER_BLACK} /></View>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>VERIFICATION RECORD</Text>
              <Text style={styles.title}>Driver documents</Text>
              <Text style={styles.body}>Identity, licence and vehicle records are kept together here so this page stays focused.</Text>
            </View>
            <StatusBadge label={formatStatus(profile.verification_status)} tone={approved ? "success" : profile.verification_status === "rejected" ? "danger" : "warning"} />
          </View>

          <View style={styles.card}>
            {(profile.required_documents || []).map((type) => {
              const document = latestDocument(documents, type);
              return <DocumentRow key={type} type={type} document={document} />;
            })}
          </View>

          <AppButton
            title={approved ? "Review verification record" : "Complete / update verification"}
            onPress={() => router.push({ pathname: "/(shared)/verification", params: { product: "driver" } } as never)}
          />
        </>
      ) : null}
    </Screen>
  );
}

function latestDocument(documents: VerificationDocument[], type: string) {
  return [...documents].reverse().find((item) => item.document_type === type);
}

function DocumentRow({ type, document }: { type: string; document?: VerificationDocument }) {
  const status = document?.status || "missing";
  const tone = status === "accepted" ? "success" : status === "rejected" ? "danger" : "warning";
  return (
    <View style={styles.documentRow}>
      <View style={styles.documentIcon}><MaterialCommunityIcons name={status === "accepted" ? "check" : status === "rejected" ? "alert-outline" : "file-outline"} size={20} color={DRIVER_BLACK} /></View>
      <View style={styles.flex}>
        <Text style={styles.documentTitle}>{LABELS[type] || formatStatus(type)}</Text>
        <Text style={styles.documentBody}>{document?.file_name || "Not uploaded yet"}</Text>
        {document?.rejection_reason ? <Text style={styles.rejection}>{document.rejection_reason}</Text> : null}
      </View>
      <StatusBadge label={formatStatus(status)} tone={tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { borderRadius: 28, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  heroIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  title: { color: DRIVER_BLACK, fontSize: 19, fontWeight: "900", marginTop: 2 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15, marginTop: 4 },
  card: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line },
  documentRow: { minHeight: 76, padding: 13, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line },
  documentIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  documentTitle: { color: DRIVER_BLACK, fontSize: 11, fontWeight: "900" },
  documentBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14, marginTop: 2 },
  rejection: { color: v2Theme.colors.danger, fontSize: 9, lineHeight: 14, marginTop: 3, fontWeight: "700" },
});
