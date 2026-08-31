import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { AccountDetailsSummary } from "../../components/account/AccountDetailsSummary";
import { Avatar } from "../../components/ui/Avatar";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { LocationPicker } from "../../components/ui/LocationPicker";
import { Screen } from "../../components/ui/Screen";
import { VerifiedBadge, isIdentityVerified } from "../../components/ui/VerifiedBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { updateCurrentUser, uploadProfilePhoto } from "../../services/authService";
import { listMyWorkerApplications } from "../../services/operationsService";
import { WorkerApplication } from "../../types/operations.types";
import { User } from "../../types/user.types";
import { displayNameOrFallback } from "../../utils/displayName";
import { isValidPhone } from "../../utils/validation";

type ViewMode = "summary" | "edit";

export default function EditProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; product?: string }>();
  const { user } = useCurrentUser();
  const [record, setRecord] = useState<User | null>(user);
  const [application, setApplication] = useState<WorkerApplication | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(params.mode === "edit" ? "edit" : "summary");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profileCity, setProfileCity] = useState("");
  const [bio, setBio] = useState("");
  const [travelPreferences, setTravelPreferences] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [contactNotice, setContactNotice] = useState("");
  const [isError, setIsError] = useState(false);
  const role = record?.role || user?.role;
  const isCustomer = role === "passenger";
  const isWorker = role === "driver" || role === "courier";
  const product = role === "driver" || role === "courier" || role === "merchant" ? role : undefined;
  const accountFallback = role === "driver"
    ? "/(driver)/account"
    : role === "courier"
      ? "/(courier)/account"
      : role === "merchant"
        ? "/(merchant)/account"
        : "/(shared)/account";

  function fillFormFromUser(nextUser: User | null | undefined) {
    if (!nextUser) return;
    setRecord(nextUser);
    setEmail(nextUser.email || "");
    setPhone(nextUser.phone || "");
    setProfileCity(nextUser.city || "");
    setBio(nextUser.bio || "");
    setTravelPreferences(nextUser.travel_preferences || "");
    setProfilePhotoUrl(nextUser.profile_photo_url || nextUser.profile_photo_pending_url || "");
  }

  useEffect(() => {
    fillFormFromUser(user);
  }, [user]);

  useEffect(() => {
    if (!product) {
      setApplication(null);
      return;
    }
    let active = true;
    void listMyWorkerApplications()
      .then((items) => {
        if (active) setApplication(items.find((item) => item.product === product) || null);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [product]);

  async function saveProfile() {
    if (!isCustomer) return;
    try {
      setSaving(true);
      setIsError(false);
      setMessage("");
      setContactNotice("");
      if (phone.trim() && !isValidPhone(phone)) {
        setIsError(true);
        setMessage("Enter your phone number with country code, for example +263700000000.");
        return;
      }
      const emailChanged = email.trim().toLowerCase() !== (record?.email || "").trim().toLowerCase();
      const updated = await updateCurrentUser({
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        city: profileCity.trim() || undefined,
        bio: bio.trim() || undefined,
        travel_preferences: travelPreferences.trim() || undefined,
      });
      fillFormFromUser(updated);
      setViewMode("summary");
      setMessage("Changes saved");
      if (emailChanged && updated.pending_email) {
        setContactNotice("Your current verified email stays active until you verify the new address.");
      }
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function chooseProfilePhoto() {
    try {
      setSaving(true);
      setIsError(false);
      setMessage("");
      setContactNotice("");
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.78,
        mediaTypes: ["images"],
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const updated = await uploadProfilePhoto({
        uri: asset.uri,
        fileName: asset.fileName || "profile-photo.jpg",
        mimeType: asset.mimeType || "image/jpeg",
      });
      fillFormFromUser(updated);
      if ((updated.role === "driver" || updated.role === "courier") && updated.profile_photo_review_status === "pending") {
        setMessage("Photo submitted for Admin review. It will not unlock new work until approved.");
      } else {
        setMessage("Profile photo saved");
      }
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Unable to update profile photo.");
    } finally {
      setSaving(false);
    }
  }

  function requestChange() {
    router.push({
      pathname: "/(shared)/support",
      params: { subject: "Account details change", ...(product ? { product } : {}) },
    } as never);
  }

  const displayName = displayNameOrFallback(application?.full_name || record?.name);
  const verified = isIdentityVerified(record);
  const workerPhotoState = record?.profile_photo_verified === true
    ? "Profile photo approved"
    : record?.profile_photo_review_status === "pending"
      ? "Profile photo awaiting Admin review"
      : record?.profile_photo_review_status === "rejected"
        ? "Profile photo needs replacement"
        : "Profile photo required";
  const summaryRows = [
    { label: "Full legal name", value: application?.full_name || record?.name || "Not added" },
    { label: "Email", value: record?.email || "Not added" },
    { label: "Phone", value: application?.phone || record?.phone || "Not added" },
    { label: product === "merchant" ? "Business city" : product ? "Service city" : "City", value: application?.service_area || record?.city || "Not added" },
  ];
  const identityNote = isCustomer
    ? "Contact LetsGoRide Support to change your legal name. Contact details and ordinary preferences can be updated here."
    : `These details were used to verify your ${product === "merchant" ? "Merchant" : product === "driver" ? "Driver" : "Courier"} account. Contact support to request a correction.`;
  const screenTitle = isCustomer && viewMode === "edit" ? "Edit profile" : "Account details";

  return (
    <Screen title={screenTitle} showBack fallbackRoute={accountFallback as never} showNotifications={false}>
      <View style={styles.photoCard}>
        <View style={styles.photoRow}>
          <Avatar name={displayName} imageUri={profilePhotoUrl} size={72} tone="neutral" />
          <View style={styles.photoCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.title}>{displayName}</Text>
              <VerifiedBadge verified={verified} />
            </View>
            <Text style={styles.body}>{isCustomer ? "Customer profile" : `${product === "merchant" ? "Merchant" : product === "driver" ? "Driver" : "Courier"} profile`}</Text>
            {isWorker ? <Text style={styles.workerPhotoState}>{workerPhotoState}</Text> : null}
          </View>
        </View>
        <AppButton title={isWorker ? "Submit profile photo" : "Update profile photo"} variant="secondary" onPress={chooseProfilePhoto} loading={saving} />
      </View>

      {message ? <Text accessibilityRole="alert" style={[styles.message, isWorker && !isError && styles.workerMessage, isError && styles.error]}>{message}</Text> : null}
      {contactNotice ? <Text style={styles.contactNotice}>{contactNotice}</Text> : null}
      {record?.pending_email ? (
        <AppButton
          title="Verify new email"
          variant="secondary"
          onPress={() => router.push({ pathname: "/(auth)/email-verification", params: { email: record.pending_email, returnTo: "/(shared)/edit-profile", context: "account-change" } } as never)}
        />
      ) : null}

      {viewMode === "summary" || !isCustomer ? (
        <AccountDetailsSummary
          rows={summaryRows}
          note={identityNote}
          onEdit={isCustomer ? () => { setMessage(""); setContactNotice(""); setViewMode("edit"); } : undefined}
          onRequestChange={requestChange}
        />
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Contact & preferences</Text>
          <View style={styles.readOnlyField}>
            <Text style={styles.readOnlyLabel}>Full legal name</Text>
            <Text style={styles.readOnlyValue}>{record?.name || "Not added"}</Text>
            <Text style={styles.helperText}>Contact LetsGoRide Support to change your legal name.</Text>
            <AppButton title="Request a change" variant="ghost" onPress={requestChange} />
          </View>
          <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          <Text style={styles.helperText}>A changed email must be verified before it can be trusted for account recovery.</Text>
          <AppInput label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+263700000000" />
          <LocationPicker label="City" value={profileCity} onChangeText={setProfileCity} />
          <AppInput label="About" value={bio} onChangeText={setBio} multiline />
          <AppInput label="Preferences" value={travelPreferences} onChangeText={setTravelPreferences} multiline />
          <View style={styles.actions}>
            <AppButton title="Cancel" variant="secondary" onPress={() => { fillFormFromUser(record); setMessage(""); setContactNotice(""); setViewMode("summary"); }} />
            <AppButton title="Save changes" loading={saving} onPress={saveProfile} />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoCard: { backgroundColor: colors.card, borderRadius: 26, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  photoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  photoCopy: { flex: 1, gap: 4 },
  title: { color: colors.whiteText, fontWeight: "900", fontSize: 20 },
  sectionTitle: { color: colors.whiteText, fontWeight: "900", fontSize: 17 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  body: { color: colors.mutedText, lineHeight: 21 },
  workerPhotoState: { color: "#111111", fontSize: 11, lineHeight: 16, fontWeight: "900" },
  card: { backgroundColor: colors.card, borderRadius: 26, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  helperText: { color: colors.mutedText, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  readOnlyField: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated, padding: spacing.md, gap: 5 },
  readOnlyLabel: { color: colors.mutedText, fontSize: 12, fontWeight: "900" },
  readOnlyValue: { color: colors.whiteText, fontWeight: "900" },
  actions: { gap: spacing.sm },
  message: { borderRadius: 16, backgroundColor: "#EAF6EE", padding: 11, color: colors.primaryGreen, fontWeight: "900" },
  workerMessage: { backgroundColor: "#F0EFEA", color: "#111111" },
  contactNotice: { borderRadius: 16, backgroundColor: "#FFF6E5", padding: 11, color: "#8B5B08", fontSize: 11, lineHeight: 17, fontWeight: "800" },
  error: { backgroundColor: "#FFF0F0", color: colors.danger },
});
