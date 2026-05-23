import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { Avatar } from "../../components/ui/Avatar";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { updateCurrentUser } from "../../services/authService";
import { displayNameOrFallback, firstNameOrFallback, isGenericAccountName } from "../../utils/displayName";
import { formatStatus } from "../../utils/formatStatus";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, reload } = useCurrentUser();
  const role = user?.role === "driver" ? "driver" : "passenger";
  const displayName = displayNameOrFallback(user?.name);
  const firstName = firstNameOrFallback(user?.name);
  const contact = user?.phone || user?.email || "Add phone or email";
  const city = user?.city || "Zimbabwe";
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
      setMessage("");
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
      setMessage("Profile updated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function chooseProfilePhoto() {
    try {
      setSaving(true);
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
      setMessage("Profile photo updated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update profile photo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen navRole={role}>
      <View style={styles.profileCard}>
        <Avatar name={displayName} imageUri={profilePhotoUrl || user?.profile_photo_url} />
        <View style={styles.profileText}>
          <Text style={styles.name}>Hi, {firstName}</Text>
          <Text style={styles.meta}>{contact}</Text>
          <Text style={styles.meta}>{city} - {formatStatus(role)} account</Text>
        </View>
        <StatusBadge label={formatStatus(role)} tone="success" />
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Profile details</Text>
        <Text style={styles.body}>
          Your phone number is used for pickup coordination and trip safety. It
          is not shown in public ride browsing.
        </Text>
        <View style={styles.photoRow}>
          <Avatar name={displayName} imageUri={profilePhotoUrl} size={64} />
          <View style={styles.photoCopy}>
            <Text style={styles.photoTitle}>Profile picture</Text>
            <Text style={styles.meta}>{profilePhotoName || "Optional account photo"}</Text>
          </View>
          <AppButton title="Update photo" variant="secondary" onPress={chooseProfilePhoto} loading={saving} style={styles.photoButton} />
        </View>
        <AppInput label="Full name" value={name} onChangeText={setName} />
        <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <AppInput label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <AppInput label="City" value={profileCity} onChangeText={setProfileCity} />
        <AppInput label="About" value={bio} onChangeText={setBio} multiline />
        <AppInput label="Travel preferences" value={travelPreferences} onChangeText={setTravelPreferences} multiline />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <AppButton title="Save profile" loading={saving} onPress={saveProfile} />
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Passenger and driver modes</Text>
        <Text style={styles.body}>
          Passenger mode is for booking seats. Driver mode is for posting trips
          and managing passenger requests.
        </Text>
        <AppButton
          title="Open passenger mode"
          variant="secondary"
          onPress={() => router.push("/(passenger)/home" as never)}
        />
        <AppButton
          title="Open driver mode"
          variant="ghost"
          onPress={() => router.push("/(driver)/home" as never)}
        />
      </View>
      <View style={styles.links}>
        <AppButton title="Driver verification" variant="ghost" onPress={() => router.push("/(shared)/verification" as never)} />
        {user?.role === "admin" ? (
          <AppButton title="Admin verification queue" variant="secondary" onPress={() => router.push("/(admin)/verifications" as never)} />
        ) : null}
        <AppButton title="Settings" variant="ghost" onPress={() => router.push("/(shared)/settings" as never)} />
        <AppButton title="Safety Center" variant="ghost" onPress={() => router.push("/(shared)/safety" as never)} />
        <AppButton title="Support" variant="ghost" onPress={() => router.push("/(shared)/support" as never)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  profileText: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 20,
  },
  meta: {
    color: colors.mutedText,
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 18,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 21,
  },
  message: {
    color: colors.primaryGreen,
    fontWeight: "800",
  },
  links: {
    gap: spacing.sm,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  photoCopy: {
    flex: 1,
  },
  photoTitle: {
    color: colors.whiteText,
    fontWeight: "900",
  },
  photoButton: {
    minHeight: 44,
  },
});
