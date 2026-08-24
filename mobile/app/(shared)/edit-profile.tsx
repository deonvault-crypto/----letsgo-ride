import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { Avatar } from "../../components/ui/Avatar";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { LocationPicker } from "../../components/ui/LocationPicker";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { VerifiedBadge, isIdentityVerified } from "../../components/ui/VerifiedBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { updateCurrentUser, uploadProfilePhoto } from "../../services/authService";
import { displayNameOrFallback, isGenericAccountName } from "../../utils/displayName";
import { isValidPhone } from "../../utils/validation";

export default function EditProfileScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const navRole: "customer" | "driver" | undefined = user?.role === "driver"
    ? "driver"
    : user?.role === "courier" || user?.role === "merchant" || user?.role === "admin"
      ? undefined
      : "customer";
  const displayName = displayNameOrFallback(user?.name);
  const verified = isIdentityVerified(user);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profileCity, setProfileCity] = useState("");
  const [bio, setBio] = useState("");
  const [travelPreferences, setTravelPreferences] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [profilePhotoName, setProfilePhotoName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAndLeaving, setSavedAndLeaving] = useState(false);
  const [message, setMessage] = useState("");
  const [phoneMessage, setPhoneMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function fillFormFromUser(nextUser: typeof user) {
    if (!nextUser) return;
    setName(isGenericAccountName(nextUser.name) ? "" : nextUser.name || "");
    setEmail(nextUser.email || "");
    setPhone(nextUser.phone || "");
    setProfileCity(nextUser.city || "");
    setBio(nextUser.bio || "");
    setTravelPreferences(nextUser.travel_preferences || "");
    setProfilePhotoUrl(nextUser.profile_photo_url || "");
    setProfilePhotoName(nextUser.profile_photo_name || "");
  }

  useEffect(() => {
    fillFormFromUser(user);
  }, [user]);

  async function saveProfile() {
    try {
      setSaving(true);
      setIsError(false);
      setMessage("");
      setPhoneMessage("");
      if (phone.trim() && !isValidPhone(phone)) {
        setIsError(true);
        setMessage("Enter your phone number with country code, for example +263700000000.");
        return;
      }
      const phoneChanged = phone.trim() !== (user?.phone || "");
      const updated = await updateCurrentUser({
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        city: profileCity.trim() || undefined,
        bio: bio.trim() || undefined,
        travel_preferences: travelPreferences.trim() || undefined,
        profile_photo_url: profilePhotoUrl || undefined,
        profile_photo_name: profilePhotoName || undefined,
      });
      fillFormFromUser(updated);
      setSavedAndLeaving(true);
      setMessage("Profile saved. Returning to account...");
      if (phoneChanged) {
        setPhoneMessage("Phone number saved. Verification may be required for some account actions.");
      }
      setTimeout(() => router.replace("/(shared)/account" as never), 900);
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
      setPhoneMessage("");
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
      setMessage("Profile photo saved.");
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Unable to update profile photo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Edit profile" showBack fallbackRoute="/(shared)/account" navRole={navRole}>
      <View style={styles.card}>
        <View style={styles.photoRow}>
          <Avatar name={displayName} imageUri={profilePhotoUrl} size={76} />
          <View style={styles.photoCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.title}>{displayName}</Text>
              <VerifiedBadge verified={verified} />
            </View>
            <Text style={styles.body}>{email || "Email not set"}</Text>
            {verified ? <StatusBadge label="Identity verified" tone="success" /> : null}
          </View>
        </View>
        <AppButton title="Update photo" variant="secondary" onPress={chooseProfilePhoto} loading={saving} disabled={savedAndLeaving} />
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Account</Text>
        <AppInput label="Full name" value={name} onChangeText={setName} editable={!savedAndLeaving} />
        <View style={styles.readOnlyField}>
          <Text style={styles.readOnlyLabel}>Email</Text>
          <Text style={styles.readOnlyValue}>{email || "Email not set"}</Text>
          <Text style={styles.helperText}>Changing a verified email requires a separate re-verification flow.</Text>
        </View>
        <AppInput label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+263700000000" editable={!savedAndLeaving} />
        <Text style={styles.helperText}>Use country code, for example +263700000000.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Profile details</Text>
        <LocationPicker label="City" value={profileCity} onChangeText={setProfileCity} disabled={savedAndLeaving} />
        <AppInput label="About" value={bio} onChangeText={setBio} multiline editable={!savedAndLeaving} />
        <AppInput label="Preferences" value={travelPreferences} onChangeText={setTravelPreferences} multiline editable={!savedAndLeaving} />
        {message ? <Text style={[styles.message, isError && styles.error]}>{message}</Text> : null}
        {phoneMessage ? <Text style={styles.phoneNotice}>{phoneMessage}</Text> : null}
        <AppButton title="Save profile" loading={saving} disabled={savedAndLeaving} onPress={saveProfile} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  photoCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 20,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 17,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 21,
  },
  helperText: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  readOnlyField: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    padding: spacing.md,
    gap: 4,
  },
  readOnlyLabel: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "900",
  },
  readOnlyValue: {
    color: colors.whiteText,
    fontWeight: "900",
  },
  message: {
    color: colors.primaryGreen,
    fontWeight: "900",
  },
  phoneNotice: {
    color: colors.primaryGreen,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
  },
  error: {
    color: colors.danger,
  },
});
