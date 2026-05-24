import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { Avatar } from "../../components/ui/Avatar";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { updateCurrentUser } from "../../services/authService";
import { displayNameOrFallback, isGenericAccountName } from "../../utils/displayName";
import { isValidPhone } from "../../utils/validation";

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, reload } = useCurrentUser();
  const role = user?.role === "driver" ? "driver" : "passenger";
  const displayName = displayNameOrFallback(user?.name);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profileCity, setProfileCity] = useState("");
  const [bio, setBio] = useState("");
  const [travelPreferences, setTravelPreferences] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [profilePhotoName, setProfilePhotoName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
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
      if (phone.trim() && !isValidPhone(phone)) {
        setIsError(true);
        setMessage("Enter your phone number with country code, for example +263772554186.");
        return;
      }
      const updated = await updateCurrentUser({
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        city: profileCity.trim() || undefined,
        bio: bio.trim() || undefined,
        travel_preferences: travelPreferences.trim() || undefined,
        profile_photo_url: profilePhotoUrl || undefined,
        profile_photo_name: profilePhotoName || undefined,
      });
      fillFormFromUser(updated);
      await reload();
      setMessage("Profile saved.");
      setTimeout(() => router.replace("/(shared)/profile" as never), 650);
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
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.78,
        mediaTypes: ["images"],
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const updated = await updateCurrentUser({
        profile_photo_url: asset.uri,
        profile_photo_name: asset.fileName || "profile-photo",
      });
      fillFormFromUser(updated);
      await reload();
      setMessage("Profile photo saved.");
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Unable to update profile photo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Edit profile" showBack fallbackRoute="/(shared)/profile" navRole={role}>
      <View style={styles.card}>
        <View style={styles.photoRow}>
          <Avatar name={displayName} imageUri={profilePhotoUrl} size={68} />
          <View style={styles.photoCopy}>
            <Text style={styles.title}>Profile details</Text>
            <Text style={styles.body}>{profilePhotoName || "Add a clear account photo if you want."}</Text>
          </View>
        </View>
        <AppButton title="Update photo" variant="secondary" onPress={chooseProfilePhoto} loading={saving} />
      </View>
      <View style={styles.card}>
        <AppInput label="Full name" value={name} onChangeText={setName} />
        <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <AppInput label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+263772554186" />
        <AppInput label="City" value={profileCity} onChangeText={setProfileCity} />
        <AppInput label="About" value={bio} onChangeText={setBio} multiline />
        <AppInput label="Travel preferences" value={travelPreferences} onChangeText={setTravelPreferences} multiline />
        {message ? <Text style={[styles.message, isError && styles.error]}>{message}</Text> : null}
        <AppButton title="Save profile" loading={saving} onPress={saveProfile} />
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
  body: {
    color: colors.mutedText,
    lineHeight: 21,
  },
  message: {
    color: colors.primaryGreen,
    fontWeight: "900",
  },
  error: {
    color: colors.danger,
  },
});
