import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Screen } from "../../components/ui/Screen";
import { AppButton } from "../../components/ui/AppButton";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { colors } from "../../constants/colors";
import { downloadCompatibleUpdate, getStoreReleases, isNewerVersion, STORE_URLS, StoreRelease } from "../../services/appUpdateService";

export default function AppUpdatesScreen() {
  const currentVersion = Constants.expoConfig?.version || "";
  const { isUpdatePending } = Updates.useUpdates();
  const [release, setRelease] = useState<StoreRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<"store" | "download">("store");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    void getStoreReleases().then(rows => {
      if (active) { setRelease(rows.find(row => row.platform === Platform.OS) || null); setError(null); }
    }).catch(cause => { if (active) { setErrorSource("store"); setError(cause instanceof Error ? cause.message : "Could not check store updates."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]));
  const newer = release && isNewerVersion(release.version, currentVersion);
  async function check() {
    if (busy) return;
    setBusy(true); setError(null); setErrorSource("download");
    try {
      const result = await downloadCompatibleUpdate();
      if (mounted.current) setMessage(result === "ready" ? "Update downloaded. It will apply the next time you open the app." : result === "current" ? "No additional update is available." : "Check the store for app updates.");
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not download the update. Try again."); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function openStore() {
    const url = Platform.OS === "ios" ? STORE_URLS.ios : STORE_URLS.android;
    try { await Linking.openURL(url); } catch { if (mounted.current) setError("Could not open the store. Try again."); }
  }
  return <Screen title="App updates" showBack fallbackRoute="/(shared)/settings">
    <Text style={styles.body}>Installed version {currentVersion || "unavailable"}</Text>
    {loading ? <LoadingState label="Checking store information…" /> : null}
    {error ? <ErrorState message={error} onRetry={() => errorSource === "download" ? void check() : setRevision(value => value + 1)} /> : null}
    {newer ? <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>Version {release.version} is available</Text>
      <Text style={styles.body}>{release.notes}</Text>
      <AppButton title={Platform.OS === "ios" ? "Open App Store" : "Open Google Play"} onPress={openStore} />
    </View> : null}
    <Text accessibilityRole="header" style={styles.title}>Automatic updates</Text>
    <Text style={styles.body}>Small app improvements can download in the background and apply next time you open the app. Your current activity continues uninterrupted.</Text>
    {isUpdatePending ? <Text accessibilityLiveRegion="polite" style={styles.body}>An update is ready for your next app launch.</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text> : null}
    <AppButton title="Check for app improvements" variant="secondary" loading={busy} disabled={isUpdatePending} onPress={check} />
  </Screen>;
}
const styles = StyleSheet.create({
  title: { color: colors.whiteText, fontSize: 18, fontWeight: "700" },
  body: { color: colors.mutedText, fontSize: 15, lineHeight: 23 },
  section: { gap: 16, paddingBottom: 24, marginBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
