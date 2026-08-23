import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { getCurrentDeviceLocation } from "../../services/locationService";
import { createRestaurant } from "../../services/merchantService";

export default function NewRestaurantScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [cuisines, setCuisines] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [businessRegistration, setBusinessRegistration] = useState("");
  const [dailyHours, setDailyHours] = useState("");
  const [pickupInstructions, setPickupInstructions] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.phone && !phone) setPhone(user.phone);
  }, [user?.phone]);

  const canSave = useMemo(
    () => name.trim().length >= 2 && phone.trim().length >= 5 && address.trim().length >= 3 && contactName.trim().length >= 2 && dailyHours.trim().length >= 3 && Boolean(location) && !saving,
    [name, phone, address, contactName, dailyHours, location, saving],
  );

  async function attachLocation() {
    try {
      setLocating(true);
      setError(null);
      const current = await getCurrentDeviceLocation();
      setLocation({ latitude: current.latitude, longitude: current.longitude });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to attach your location.");
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    if (!canSave) return;
    try {
      setSaving(true);
      setError(null);
      const restaurant = await createRestaurant({
        name: name.trim(),
        description: description.trim() || null,
        phone: phone.trim(),
        address: address.trim(),
        location,
        cuisine_tags: cuisines.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12),
        opening_hours: { daily: dailyHours.trim() },
        contact_person_name: contactName.trim(),
        contact_email: contactEmail.trim() || null,
        business_registration_number: businessRegistration.trim() || null,
        pickup_instructions: pickupInstructions.trim() || null,
        hero_image_url: heroImageUrl.trim() || null,
        logo_url: logoUrl.trim() || null,
      });
      router.replace(`/(merchant)/restaurant/${restaurant.id}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create restaurant.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen showBack fallbackRoute="/(merchant)/home" title="New restaurant" showNotifications={false}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>MERCHANT ONBOARDING</Text>
        <Text style={styles.title}>Build the storefront first.</Text>
        <Text style={styles.body}>Create a private draft, then add menu categories and items before review.</Text>
      </View>

      <View style={styles.formCard}>
        <Field label="Restaurant name" value={name} onChangeText={setName} placeholder="e.g. Mbare Grill" />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="Business phone" keyboardType="phone-pad" />
        <Field label="Address" value={address} onChangeText={setAddress} placeholder="Street, suburb, city" />
        <Field label="Contact person" value={contactName} onChangeText={setContactName} placeholder="Full name" />
        <Field label="Contact email" value={contactEmail} onChangeText={setContactEmail} placeholder="Business email (optional)" keyboardType="email-address" />
        <Field label="Business registration" value={businessRegistration} onChangeText={setBusinessRegistration} placeholder="Registration number (optional)" />
        <Field label="Daily opening hours" value={dailyHours} onChangeText={setDailyHours} placeholder="e.g. 08:00–21:00" />
        <Field label="Cuisine tags" value={cuisines} onChangeText={setCuisines} placeholder="Grill, Zimbabwean, Chicken" />
        <Field label="Hero image URL" value={heroImageUrl} onChangeText={setHeroImageUrl} placeholder="HTTPS image URL (optional)" keyboardType="url" />
        <Field label="Logo URL" value={logoUrl} onChangeText={setLogoUrl} placeholder="HTTPS image URL (optional)" keyboardType="url" />
        <Field label="Courier pickup instructions" value={pickupInstructions} onChangeText={setPickupInstructions} placeholder="Counter, entrance or collection point" />
        <View style={styles.textAreaWrap}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            accessibilityLabel="Restaurant description"
            value={description}
            onChangeText={setDescription}
            maxLength={800}
            multiline
            placeholder="Tell customers what makes this restaurant worth ordering from"
            placeholderTextColor={v2Theme.colors.inkTertiary}
            style={styles.textArea}
          />
        </View>
      </View>

      <Pressable accessibilityRole="button" onPress={attachLocation} disabled={locating} style={({ pressed }) => [styles.locationCard, pressed && styles.pressed]}>
        <View style={styles.locationIcon}><MaterialCommunityIcons name="crosshairs-gps" size={23} color={v2Theme.colors.brandStrong} /></View>
        <View style={styles.locationCopy}>
          <Text style={styles.locationTitle}>{locating ? "Getting location…" : "Attach restaurant GPS pin"}</Text>
          <Text style={styles.locationBody}>{location ? "Precise pickup location attached" : "Required so couriers can route to the right entrance"}</Text>
        </View>
        {location ? <MaterialCommunityIcons name="check-circle" size={22} color={v2Theme.colors.success} /> : <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />}
      </Pressable>

      {error ? <View style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Create restaurant draft" accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={save} style={({ pressed }) => [styles.primaryButton, !canSave && styles.primaryButtonDisabled, pressed && canSave && styles.pressed]}>
        <View><Text style={styles.primaryText}>{saving ? "Creating draft…" : "Create restaurant draft"}</Text><Text style={styles.primarySub}>Nothing goes public yet</Text></View>
        <MaterialCommunityIcons name="arrow-right" size={22} color="#FFFFFF" />
      </Pressable>
    </Screen>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType = "default" }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "default" | "phone-pad" | "email-address" | "url" }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={v2Theme.colors.inkTertiary} keyboardType={keyboardType} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 7 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  formCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 15, gap: 13 },
  fieldWrap: { gap: 5 },
  label: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "900" },
  input: { minHeight: 50, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 13, color: v2Theme.colors.ink, fontSize: 13, fontWeight: "800" },
  textAreaWrap: { gap: 5 },
  textArea: { minHeight: 100, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, padding: 13, color: v2Theme.colors.ink, fontSize: 12, lineHeight: 18, textAlignVertical: "top" },
  locationCard: { minHeight: 76, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  locationIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  locationCopy: { flex: 1, gap: 3 },
  locationTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  locationBody: { color: v2Theme.colors.inkSecondary, fontSize: 10 },
  errorCard: { borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" },
  primaryButton: { minHeight: 64, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.ink, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryButtonDisabled: { opacity: 0.42 },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  primarySub: { color: "rgba(255,255,255,0.62)", fontSize: 9, marginTop: 2 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
