import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { createCourierDelivery } from "../../services/courierService";
import { getCurrentDeviceLocation } from "../../services/locationService";
import { CourierCreatePayload } from "../../types/courier.types";

const packageTypes = [
  ["parcel", "package-variant", "Parcel"],
  ["shopping", "shopping-outline", "Shopping"],
  ["documents", "file-document-outline", "Documents"],
  ["other", "dots-horizontal", "Other"],
] as const;

type PackageType = CourierCreatePayload["package_type"];

export default function CourierScreen() {
  const router = useRouter();
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [description, setDescription] = useState("");
  const [packageType, setPackageType] = useState<PackageType>("parcel");
  const [pickupLocation, setPickupLocation] = useState<CourierCreatePayload["pickup_location"]>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    pickupAddress.trim().length >= 3 &&
    dropoffAddress.trim().length >= 3 &&
    recipientName.trim().length >= 2 &&
    recipientPhone.trim().length >= 5 &&
    !submitting;

  async function attachCurrentPickupLocation() {
    try {
      setLocating(true);
      setError(null);
      const location = await getCurrentDeviceLocation();
      setPickupLocation({ latitude: location.latitude, longitude: location.longitude });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to get your current location.");
    } finally {
      setLocating(false);
    }
  }

  async function submitDelivery() {
    if (!canSubmit) {
      setError("Add pickup, drop-off, recipient name and recipient phone before continuing.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const delivery = await createCourierDelivery({
        pickup_address: pickupAddress.trim(),
        dropoff_address: dropoffAddress.trim(),
        pickup_location: pickupLocation,
        recipient_name: recipientName.trim(),
        recipient_phone: recipientPhone.trim(),
        package_type: packageType,
        package_description: description.trim() || null,
      });
      router.replace(`/(shared)/courier/${delivery.id}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create this delivery.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen showBack fallbackRoute="/(passenger)/home" title="Courier" showNotifications={false}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LETSGORIDE COURIER</Text>
        <Text style={styles.title}>Send it with clarity.</Text>
        <Text style={styles.body}>
          Create a real delivery request with a traceable lifecycle from pickup through handoff.
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionTitle}>Route</Text>
          {pickupLocation ? (
            <View style={styles.gpsPill}>
              <MaterialCommunityIcons name="crosshairs-gps" size={13} color={v2Theme.colors.brandStrong} />
              <Text style={styles.gpsPillText}>Pickup GPS attached</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.routeCard}>
          <AddressField
            icon="circle-slice-8"
            label="Pickup"
            placeholder="Street, building or landmark"
            value={pickupAddress}
            onChangeText={setPickupAddress}
            brand
          />
          <View style={styles.routeDivider} />
          <AddressField
            icon="map-marker-outline"
            label="Drop-off"
            placeholder="Delivery address or landmark"
            value={dropoffAddress}
            onChangeText={setDropoffAddress}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use current location for pickup"
          disabled={locating}
          onPress={attachCurrentPickupLocation}
          style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={19} color={v2Theme.colors.brandStrong} />
          <Text style={styles.locationButtonText}>{locating ? "Getting location…" : "Use current location for pickup"}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What are you sending?</Text>
        <View style={styles.packageGrid}>
          {packageTypes.map(([value, icon, label]) => {
            const selected = packageType === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
                onPress={() => setPackageType(value)}
                style={({ pressed }) => [
                  styles.packageCard,
                  selected && styles.packageCardSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.packageIcon, selected && styles.packageIconSelected]}>
                  <MaterialCommunityIcons
                    name={icon}
                    size={24}
                    color={selected ? v2Theme.colors.brandStrong : v2Theme.colors.ink}
                  />
                </View>
                <Text style={[styles.packageLabel, selected && styles.packageLabelSelected]}>{label}</Text>
                {selected ? <MaterialCommunityIcons name="check-circle" size={18} color={v2Theme.colors.brand} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recipient</Text>
        <View style={styles.formCard}>
          <FormField
            label="Full name"
            placeholder="Who should receive it?"
            value={recipientName}
            onChangeText={setRecipientName}
            autoCapitalize="words"
          />
          <View style={styles.formDivider} />
          <FormField
            label="Phone number"
            placeholder="e.g. +263 77 123 4567"
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            keyboardType="phone-pad"
          />
          <View style={styles.formDivider} />
          <FormField
            label="Package note"
            placeholder="Optional description or handling note"
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </View>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoIcon}>
          <MaterialCommunityIcons name="shield-check-outline" size={25} color={v2Theme.colors.brandStrong} />
        </View>
        <View style={styles.infoCopy}>
          <Text style={styles.infoTitle}>Accountable delivery</Text>
          <Text style={styles.infoBody}>
            Once requested, status changes and courier assignment are recorded as delivery events. Live GPS appears only during an active assigned delivery.
          </Text>
        </View>
      </View>

      {error ? (
        <View accessibilityRole="alert" style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Request delivery"
        accessibilityState={{ disabled: !canSubmit }}
        disabled={!canSubmit}
        onPress={submitDelivery}
        style={({ pressed }) => [
          styles.primaryButton,
          !canSubmit && styles.primaryButtonDisabled,
          pressed && canSubmit && styles.pressed,
        ]}
      >
        <View>
          <Text style={styles.primaryButtonText}>{submitting ? "Creating delivery…" : "Request delivery"}</Text>
          <Text style={styles.primaryButtonSubtext}>Price appears only after the pricing layer returns a real quote</Text>
        </View>
        <MaterialCommunityIcons name="arrow-right" size={21} color="#FFFFFF" />
      </Pressable>
    </Screen>
  );
}

function AddressField({
  icon,
  label,
  placeholder,
  value,
  onChangeText,
  brand = false,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  brand?: boolean;
}) {
  return (
    <View style={styles.addressRow}>
      <View style={[styles.dot, brand && styles.pickupDot]}>
        <MaterialCommunityIcons name={icon} size={20} color={brand ? v2Theme.colors.brandStrong : v2Theme.colors.ink} />
      </View>
      <View style={styles.addressCopy}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
          accessibilityLabel={`${label} address`}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={v2Theme.colors.inkTertiary}
          style={styles.addressInput}
          returnKeyType="next"
        />
      </View>
    </View>
  );
}

function FormField({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType = "default",
  autoCapitalize = "sentences",
  multiline = false,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
}) {
  return (
    <View style={[styles.formField, multiline && styles.formFieldMultiline]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={v2Theme.colors.inkTertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.formInput, multiline && styles.formInputMultiline]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 7 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: v2Theme.colors.ink, fontSize: 32, lineHeight: 37, fontWeight: "900", letterSpacing: -1.05 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 15, lineHeight: 22 },
  section: { gap: 12 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  gpsPill: { borderRadius: v2Theme.radius.pill, backgroundColor: v2Theme.colors.brandSoft, paddingHorizontal: 9, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 },
  gpsPillText: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900" },
  routeCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden" },
  addressRow: { minHeight: 86, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  routeDivider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginLeft: 72 },
  dot: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  pickupDot: { backgroundColor: v2Theme.colors.brandSoft },
  addressCopy: { flex: 1, gap: 4 },
  fieldLabel: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "900", letterSpacing: 0.2 },
  addressInput: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "800", minHeight: 30, paddingVertical: 0 },
  locationButton: { alignSelf: "flex-start", minHeight: 42, borderRadius: 15, backgroundColor: v2Theme.colors.brandSofter, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  locationButtonText: { color: v2Theme.colors.brandStrong, fontSize: 12, fontWeight: "900" },
  packageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  packageCard: { width: "48%", minHeight: 110, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, borderWidth: 1, borderColor: "transparent", padding: 13, justifyContent: "space-between" },
  packageCardSelected: { backgroundColor: v2Theme.colors.brandSofter, borderColor: "#CFE7D7" },
  packageIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" },
  packageIconSelected: { backgroundColor: v2Theme.colors.brandSoft },
  packageLabel: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  packageLabelSelected: { color: v2Theme.colors.brandStrong },
  formCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, overflow: "hidden" },
  formField: { minHeight: 76, paddingHorizontal: 16, paddingVertical: 12, gap: 5, justifyContent: "center" },
  formFieldMultiline: { minHeight: 112, justifyContent: "flex-start" },
  formInput: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "700", paddingVertical: 3 },
  formInputMultiline: { minHeight: 62 },
  formDivider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginLeft: 16 },
  infoCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 16, flexDirection: "row", gap: 12 },
  infoIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  infoCopy: { flex: 1, gap: 5 },
  infoTitle: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" },
  infoBody: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18 },
  errorCard: { borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  primaryButton: { minHeight: 68, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  primaryButtonDisabled: { backgroundColor: "#9BB9A5" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  primaryButtonSubtext: { color: "rgba(255,255,255,0.72)", fontSize: 9, lineHeight: 13, maxWidth: 250, marginTop: 3 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
