import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { createCourierDelivery, previewCourierQuote } from "../../services/courierService";
import { getCurrentDeviceLocation } from "../../services/locationService";
import {
  CourierCreatePayload,
  CourierQuotePreview,
} from "../../types/courier.types";

const packageTypes = [
  ["parcel", "package-variant-closed", "Parcel", "Everyday packages"],
  ["shopping", "shopping-outline", "Shopping", "Store pickups"],
  ["documents", "file-document-outline", "Documents", "Paperwork & envelopes"],
  ["other", "dots-horizontal-circle-outline", "Other", "Tell us what it is"],
] as const;

const steps = ["Route", "Package", "Recipient", "Review"] as const;
type PackageType = CourierCreatePayload["package_type"];

export default function CourierScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [pickupLocation, setPickupLocation] = useState<CourierCreatePayload["pickup_location"]>(null);
  const [packageType, setPackageType] = useState<PackageType>("parcel");
  const [description, setDescription] = useState("");
  const [weight, setWeight] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [dropoffNote, setDropoffNote] = useState("");
  const [quote, setQuote] = useState<CourierQuotePreview | null>(null);
  const [locating, setLocating] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function invalidateQuote() {
    setQuote(null);
  }

  function updatePickupAddress(value: string) {
    setPickupAddress(value);
    setPickupLocation(null);
    invalidateQuote();
  }

  function updateDropoffAddress(value: string) {
    setDropoffAddress(value);
    invalidateQuote();
  }

  async function attachCurrentPickupLocation() {
    try {
      setLocating(true);
      setError(null);
      const location = await getCurrentDeviceLocation();
      setPickupLocation({ latitude: location.latitude, longitude: location.longitude });
      invalidateQuote();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to get your current location.");
    } finally {
      setLocating(false);
    }
  }

  function validateCurrentStep() {
    if (step === 0) {
      if (pickupAddress.trim().length < 3 || dropoffAddress.trim().length < 3) {
        return "Add a clear pickup and drop-off location before continuing.";
      }
    }
    if (step === 1) {
      const parsedWeight = weight.trim() ? Number(weight) : null;
      const parsedValue = declaredValue.trim() ? Number(declaredValue) : null;
      if (parsedWeight != null && (!Number.isFinite(parsedWeight) || parsedWeight <= 0 || parsedWeight > 100)) {
        return "Package weight must be between 0 and 100 kg.";
      }
      if (parsedValue != null && (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 10000)) {
        return "Declared value must be between $0 and $10,000.";
      }
    }
    if (step === 2) {
      if (recipientName.trim().length < 2 || recipientPhone.trim().length < 5) {
        return "Add the recipient name and phone number before reviewing the delivery.";
      }
    }
    return null;
  }

  async function nextStep() {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    if (step < 2) {
      setStep((current) => current + 1);
      return;
    }
    setStep(3);
    await loadQuote();
  }

  function previousStep() {
    setError(null);
    setStep((current) => Math.max(0, current - 1));
  }

  async function loadQuote() {
    if (pickupAddress.trim().length < 3 || dropoffAddress.trim().length < 3) {
      setError("Add a clear pickup and drop-off location first.");
      return;
    }
    try {
      setQuoting(true);
      setError(null);
      const nextQuote = await previewCourierQuote({
        pickup_address: pickupAddress.trim(),
        dropoff_address: dropoffAddress.trim(),
        pickup_location: pickupLocation,
      });
      setQuote(nextQuote);
    } catch (err) {
      setQuote(null);
      setError(err instanceof Error ? err.message : "Unable to calculate this delivery price.");
    } finally {
      setQuoting(false);
    }
  }

  function payload(): CourierCreatePayload {
    const parsedWeight = weight.trim() ? Number(weight) : null;
    const parsedValue = declaredValue.trim() ? Number(declaredValue) : null;
    return {
      pickup_address: pickupAddress.trim(),
      dropoff_address: dropoffAddress.trim(),
      pickup_location: quote?.pickup_location ?? pickupLocation,
      dropoff_location: quote?.dropoff_location ?? null,
      recipient_name: recipientName.trim(),
      recipient_phone: recipientPhone.trim(),
      package_type: packageType,
      package_description: description.trim() || null,
      weight_kg: parsedWeight != null && Number.isFinite(parsedWeight) ? parsedWeight : null,
      declared_value_usd: parsedValue != null && Number.isFinite(parsedValue) ? parsedValue : null,
      pickup_note: pickupNote.trim() || null,
      dropoff_note: dropoffNote.trim() || null,
    };
  }

  async function confirmDelivery() {
    if (!quote || submitting) return;
    try {
      setSubmitting(true);
      setError(null);
      const delivery = await createCourierDelivery(payload());
      router.replace(`/(shared)/courier/${delivery.id}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request this courier delivery.");
      await loadQuote();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen showBack fallbackRoute="/(shared)/services" title="Courier" showNotifications={false}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="package-variant-closed" size={28} color={v2Theme.colors.brandStrong} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>LETSGORIDE COURIER</Text>
          <Text style={styles.title}>Send something.</Text>
          <Text style={styles.body}>Real route. Clear price. Live delivery progress.</Text>
        </View>
      </View>

      <Progress step={step} />

      {error ? (
        <View style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          {step === 3 ? (
            <Pressable accessibilityRole="button" onPress={loadQuote} disabled={quoting} hitSlop={8}>
              <Text style={styles.errorAction}>{quoting ? "Trying…" : "Try again"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {step === 0 ? (
        <RouteStep
          pickupAddress={pickupAddress}
          dropoffAddress={dropoffAddress}
          pickupLocationAttached={Boolean(pickupLocation)}
          locating={locating}
          onPickupChange={updatePickupAddress}
          onDropoffChange={updateDropoffAddress}
          onUseCurrentLocation={attachCurrentPickupLocation}
        />
      ) : null}

      {step === 1 ? (
        <PackageStep
          packageType={packageType}
          description={description}
          weight={weight}
          declaredValue={declaredValue}
          onPackageType={setPackageType}
          onDescription={setDescription}
          onWeight={setWeight}
          onDeclaredValue={setDeclaredValue}
        />
      ) : null}

      {step === 2 ? (
        <RecipientStep
          recipientName={recipientName}
          recipientPhone={recipientPhone}
          pickupNote={pickupNote}
          dropoffNote={dropoffNote}
          onRecipientName={setRecipientName}
          onRecipientPhone={setRecipientPhone}
          onPickupNote={setPickupNote}
          onDropoffNote={setDropoffNote}
        />
      ) : null}

      {step === 3 ? (
        <ReviewStep
          pickupAddress={pickupAddress}
          dropoffAddress={dropoffAddress}
          packageType={packageType}
          recipientName={recipientName}
          quote={quote}
          quoting={quoting}
          onRefreshQuote={loadQuote}
        />
      ) : null}

      <View style={styles.footerActions}>
        {step > 0 ? (
          <Pressable accessibilityRole="button" onPress={previousStep} disabled={submitting} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="arrow-left" size={19} color={v2Theme.colors.ink} />
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
        ) : null}

        {step < 3 ? (
          <Pressable accessibilityRole="button" onPress={nextStep} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>{step === 2 ? "Review & get price" : "Continue"}</Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirm and request courier"
            disabled={!quote || submitting || quoting}
            onPress={confirmDelivery}
            style={({ pressed }) => [styles.primaryButton, (!quote || submitting || quoting) && styles.disabled, pressed && quote && !submitting && styles.pressed]}
          >
            <View>
              <Text style={styles.primaryButtonText}>{submitting ? "Requesting courier…" : "Confirm & request courier"}</Text>
              {quote ? <Text style={styles.primaryButtonSub}>${quote.price_usd.toFixed(2)} · server-confirmed at request</Text> : null}
            </View>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
          </Pressable>
        )}
      </View>

      <View style={styles.trustRow}>
        <MaterialCommunityIcons name="shield-check-outline" size={17} color={v2Theme.colors.inkSecondary} />
        <Text style={styles.trustText}>Pricing and route calculations come from the LetsGoRide backend. The app does not invent delivery fees.</Text>
      </View>
    </Screen>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <View style={styles.progressWrap}>
      {steps.map((label, index) => (
        <View key={label} style={styles.progressItem}>
          <View style={[styles.progressBar, index <= step && styles.progressBarActive]} />
          <Text style={[styles.progressLabel, index === step && styles.progressLabelActive]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function RouteStep({
  pickupAddress,
  dropoffAddress,
  pickupLocationAttached,
  locating,
  onPickupChange,
  onDropoffChange,
  onUseCurrentLocation,
}: {
  pickupAddress: string;
  dropoffAddress: string;
  pickupLocationAttached: boolean;
  locating: boolean;
  onPickupChange: (value: string) => void;
  onDropoffChange: (value: string) => void;
  onUseCurrentLocation: () => void;
}) {
  return (
    <View style={styles.section}>
      <View>
        <Text style={styles.sectionEyebrow}>STEP 1</Text>
        <Text style={styles.sectionTitle}>Where is it going?</Text>
        <Text style={styles.sectionBody}>Use specific streets, buildings or landmarks so the route can be priced accurately.</Text>
      </View>

      <View style={styles.routeCard}>
        <Field
          label="Pickup"
          icon="circle-slice-8"
          placeholder="Street, building or landmark"
          value={pickupAddress}
          onChangeText={onPickupChange}
          autoCapitalize="words"
          brand
        />
        <View style={styles.routeLine} />
        <Field
          label="Drop-off"
          icon="map-marker-outline"
          placeholder="Delivery address or landmark"
          value={dropoffAddress}
          onChangeText={onDropoffChange}
          autoCapitalize="words"
        />
      </View>

      <Pressable accessibilityRole="button" disabled={locating} onPress={onUseCurrentLocation} style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}>
        <View style={[styles.locationIcon, pickupLocationAttached && styles.locationIconActive]}>
          <MaterialCommunityIcons name={pickupLocationAttached ? "check" : "crosshairs-gps"} size={19} color={pickupLocationAttached ? "#FFFFFF" : v2Theme.colors.brandStrong} />
        </View>
        <View style={styles.locationCopy}>
          <Text style={styles.locationTitle}>{locating ? "Getting your location…" : pickupLocationAttached ? "Pickup GPS attached" : "Use my current pickup location"}</Text>
          <Text style={styles.locationBody}>{pickupLocationAttached ? "The address stays visible while GPS improves route accuracy." : "Optional · foreground location permission only."}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={v2Theme.colors.inkTertiary} />
      </Pressable>
    </View>
  );
}

function PackageStep({
  packageType,
  description,
  weight,
  declaredValue,
  onPackageType,
  onDescription,
  onWeight,
  onDeclaredValue,
}: {
  packageType: PackageType;
  description: string;
  weight: string;
  declaredValue: string;
  onPackageType: (value: PackageType) => void;
  onDescription: (value: string) => void;
  onWeight: (value: string) => void;
  onDeclaredValue: (value: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View>
        <Text style={styles.sectionEyebrow}>STEP 2</Text>
        <Text style={styles.sectionTitle}>What are we carrying?</Text>
        <Text style={styles.sectionBody}>Give the courier enough context to arrive with the right transport and handling expectations.</Text>
      </View>

      <View style={styles.packageGrid}>
        {packageTypes.map(([value, icon, label, supporting]) => {
          const selected = packageType === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onPackageType(value)}
              style={({ pressed }) => [styles.packageCard, selected && styles.packageCardSelected, pressed && styles.pressed]}
            >
              <View style={[styles.packageIcon, selected && styles.packageIconSelected]}>
                <MaterialCommunityIcons name={icon} size={23} color={selected ? v2Theme.colors.brandStrong : v2Theme.colors.ink} />
              </View>
              <Text style={styles.packageTitle}>{label}</Text>
              <Text style={styles.packageBody}>{supporting}</Text>
              {selected ? <MaterialCommunityIcons name="check-circle" size={18} color={v2Theme.colors.brand} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.formCard}>
        <SimpleField label="Package description" placeholder="e.g. Small sealed box with clothing" value={description} onChangeText={onDescription} multiline />
        <View style={styles.formDivider} />
        <View style={styles.twoColumn}>
          <View style={styles.column}>
            <SimpleField label="Weight (kg)" placeholder="Optional" value={weight} onChangeText={onWeight} keyboardType="decimal-pad" />
          </View>
          <View style={styles.columnDivider} />
          <View style={styles.column}>
            <SimpleField label="Declared value (USD)" placeholder="Optional" value={declaredValue} onChangeText={onDeclaredValue} keyboardType="decimal-pad" />
          </View>
        </View>
      </View>
    </View>
  );
}

function RecipientStep({
  recipientName,
  recipientPhone,
  pickupNote,
  dropoffNote,
  onRecipientName,
  onRecipientPhone,
  onPickupNote,
  onDropoffNote,
}: {
  recipientName: string;
  recipientPhone: string;
  pickupNote: string;
  dropoffNote: string;
  onRecipientName: (value: string) => void;
  onRecipientPhone: (value: string) => void;
  onPickupNote: (value: string) => void;
  onDropoffNote: (value: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View>
        <Text style={styles.sectionEyebrow}>STEP 3</Text>
        <Text style={styles.sectionTitle}>Who receives it?</Text>
        <Text style={styles.sectionBody}>These details are used for the delivery handoff and should belong to the intended recipient.</Text>
      </View>

      <View style={styles.formCard}>
        <SimpleField label="Recipient name" placeholder="Full name" value={recipientName} onChangeText={onRecipientName} autoCapitalize="words" />
        <View style={styles.formDivider} />
        <SimpleField label="Recipient phone" placeholder="e.g. +263 77 123 4567" value={recipientPhone} onChangeText={onRecipientPhone} keyboardType="phone-pad" />
      </View>

      <View style={styles.formCard}>
        <SimpleField label="Pickup note" placeholder="Optional gate, desk or collection note" value={pickupNote} onChangeText={onPickupNote} multiline />
        <View style={styles.formDivider} />
        <SimpleField label="Drop-off note" placeholder="Optional handoff instruction" value={dropoffNote} onChangeText={onDropoffNote} multiline />
      </View>
    </View>
  );
}

function ReviewStep({
  pickupAddress,
  dropoffAddress,
  packageType,
  recipientName,
  quote,
  quoting,
  onRefreshQuote,
}: {
  pickupAddress: string;
  dropoffAddress: string;
  packageType: PackageType;
  recipientName: string;
  quote: CourierQuotePreview | null;
  quoting: boolean;
  onRefreshQuote: () => void;
}) {
  return (
    <View style={styles.section}>
      <View>
        <Text style={styles.sectionEyebrow}>STEP 4</Text>
        <Text style={styles.sectionTitle}>Review your delivery.</Text>
        <Text style={styles.sectionBody}>The quote below comes from the live server route and pricing policy. It is recalculated when you confirm.</Text>
      </View>

      <View style={styles.reviewRouteCard}>
        <ReviewLocation icon="circle-slice-8" label="PICKUP" value={quote?.pickup_address || pickupAddress} brand />
        <View style={styles.reviewRouteConnector} />
        <ReviewLocation icon="map-marker" label="DROP-OFF" value={quote?.dropoff_address || dropoffAddress} />
      </View>

      {quoting ? (
        <View style={styles.quoteLoadingCard}>
          <View style={styles.quoteLoadingIcon}><MaterialCommunityIcons name="routes" size={24} color={v2Theme.colors.brandStrong} /></View>
          <View style={styles.quoteLoadingCopy}><Text style={styles.quoteLoadingTitle}>Calculating the real route…</Text><Text style={styles.quoteLoadingBody}>Checking road distance, estimated time and server pricing.</Text></View>
        </View>
      ) : quote ? (
        <View style={styles.quoteCard}>
          <View style={styles.quoteTop}>
            <View>
              <Text style={styles.quoteEyebrow}>DELIVERY PRICE</Text>
              <Text style={styles.quotePrice}>${quote.price_usd.toFixed(2)}</Text>
              <Text style={styles.quoteCurrency}>{quote.currency}</Text>
            </View>
            <View style={styles.quoteVerified}><MaterialCommunityIcons name="check-decagram" size={19} color={v2Theme.colors.brandStrong} /><Text style={styles.quoteVerifiedText}>Server priced</Text></View>
          </View>
          <View style={styles.quoteFacts}>
            <QuoteFact icon="map-marker-distance" label="Distance" value={`${quote.distance_km.toFixed(1)} km`} />
            <View style={styles.quoteFactDivider} />
            <QuoteFact icon="clock-outline" label="Estimated drive" value={`${quote.estimated_duration_minutes} min`} />
            <View style={styles.quoteFactDivider} />
            <QuoteFact icon="package-variant" label="Package" value={packageType.replaceAll("_", " ")} />
          </View>
          <Pressable accessibilityRole="button" onPress={onRefreshQuote} style={({ pressed }) => [styles.refreshQuote, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="refresh" size={16} color={v2Theme.colors.inkSecondary} />
            <Text style={styles.refreshQuoteText}>Refresh quote</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={onRefreshQuote} style={({ pressed }) => [styles.quoteUnavailableCard, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="calculator-variant-outline" size={25} color={v2Theme.colors.brandStrong} />
          <View style={styles.quoteLoadingCopy}><Text style={styles.quoteLoadingTitle}>Get a live delivery price</Text><Text style={styles.quoteLoadingBody}>We will only let you request a courier after a real server quote is available.</Text></View>
          <MaterialCommunityIcons name="arrow-right" size={20} color={v2Theme.colors.brandStrong} />
        </Pressable>
      )}

      <View style={styles.reviewMetaCard}>
        <ReviewMeta icon="account-outline" label="Recipient" value={recipientName} />
        <ReviewMeta icon="package-variant-closed" label="Service" value="Courier delivery" />
        <ReviewMeta icon="shield-check-outline" label="Tracking" value="Live after courier assignment" />
      </View>
    </View>
  );
}

function Field({ label, icon, brand, ...props }: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; brand?: boolean } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldRow}>
      <View style={[styles.fieldIcon, brand && styles.fieldIconBrand]}><MaterialCommunityIcons name={icon} size={20} color={brand ? v2Theme.colors.brandStrong : v2Theme.colors.inkSecondary} /></View>
      <View style={styles.fieldCopy}><Text style={styles.fieldLabel}>{label}</Text><TextInput placeholderTextColor={v2Theme.colors.inkTertiary} style={styles.fieldInput} {...props} /></View>
    </View>
  );
}

function SimpleField({ label, multiline, ...props }: { label: string; multiline?: boolean } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.simpleField}>
      <Text style={styles.simpleLabel}>{label}</Text>
      <TextInput placeholderTextColor={v2Theme.colors.inkTertiary} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} style={[styles.simpleInput, multiline && styles.simpleInputMultiline]} {...props} />
    </View>
  );
}

function ReviewLocation({ icon, label, value, brand }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; brand?: boolean }) {
  return <View style={styles.reviewLocation}><View style={[styles.reviewLocationIcon, brand && styles.reviewLocationIconBrand]}><MaterialCommunityIcons name={icon} size={18} color={brand ? v2Theme.colors.brandStrong : v2Theme.colors.inkSecondary} /></View><View style={styles.reviewLocationCopy}><Text style={styles.reviewLocationLabel}>{label}</Text><Text style={styles.reviewLocationValue}>{value}</Text></View></View>;
}

function QuoteFact({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.quoteFact}><MaterialCommunityIcons name={icon} size={18} color={v2Theme.colors.inkSecondary} /><Text style={styles.quoteFactLabel}>{label}</Text><Text style={styles.quoteFactValue}>{value}</Text></View>;
}

function ReviewMeta({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.reviewMetaRow}><View style={styles.reviewMetaIcon}><MaterialCommunityIcons name={icon} size={19} color={v2Theme.colors.inkSecondary} /></View><View style={styles.reviewMetaCopy}><Text style={styles.reviewMetaLabel}>{label}</Text><Text style={styles.reviewMetaValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  heroIcon: { width: 56, height: 56, borderRadius: 19, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, gap: 4 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 35, fontWeight: "900", letterSpacing: -1.1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 19 },

  progressWrap: { flexDirection: "row", gap: 7 },
  progressItem: { flex: 1, gap: 6 },
  progressBar: { height: 4, borderRadius: 3, backgroundColor: v2Theme.colors.lineStrong },
  progressBarActive: { backgroundColor: v2Theme.colors.brand },
  progressLabel: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "800" },
  progressLabelActive: { color: v2Theme.colors.ink },

  errorCard: { borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  errorAction: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },

  section: { gap: 14 },
  sectionEyebrow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 4 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 25, lineHeight: 30, fontWeight: "900", letterSpacing: -0.7 },
  sectionBody: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },

  routeCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, overflow: "hidden", borderWidth: 1, borderColor: v2Theme.colors.line },
  fieldRow: { minHeight: 82, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  fieldIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  fieldIconBrand: { backgroundColor: v2Theme.colors.brandSoft },
  fieldCopy: { flex: 1, gap: 4 },
  fieldLabel: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  fieldInput: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "800", paddingVertical: 4 },
  routeLine: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginLeft: 69 },

  locationButton: { minHeight: 72, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  locationIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  locationIconActive: { backgroundColor: v2Theme.colors.brand },
  locationCopy: { flex: 1, gap: 3 },
  locationTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  locationBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },

  packageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  packageCard: { width: "48%", minHeight: 146, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 13, gap: 7, borderWidth: 1, borderColor: "transparent" },
  packageCardSelected: { backgroundColor: v2Theme.colors.brandSofter, borderColor: v2Theme.colors.brandSoft },
  packageIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" },
  packageIconSelected: { backgroundColor: v2Theme.colors.brandSoft },
  packageTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  packageBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 13, flex: 1 },

  formCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, overflow: "hidden", borderWidth: 1, borderColor: v2Theme.colors.line },
  formDivider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginHorizontal: 14 },
  simpleField: { paddingHorizontal: 15, paddingVertical: 13, gap: 5, minHeight: 72 },
  simpleLabel: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.55 },
  simpleInput: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "800", paddingVertical: 4 },
  simpleInputMultiline: { minHeight: 52 },
  twoColumn: { flexDirection: "row" },
  column: { flex: 1 },
  columnDivider: { width: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginVertical: 12 },

  reviewRouteCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, padding: 14, gap: 0, borderWidth: 1, borderColor: v2Theme.colors.line },
  reviewLocation: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 61 },
  reviewLocationIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  reviewLocationIconBrand: { backgroundColor: v2Theme.colors.brandSoft },
  reviewLocationCopy: { flex: 1, gap: 3 },
  reviewLocationLabel: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  reviewLocationValue: { color: v2Theme.colors.ink, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  reviewRouteConnector: { width: 1, height: 14, backgroundColor: v2Theme.colors.lineStrong, marginLeft: 20 },

  quoteLoadingCard: { minHeight: 92, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  quoteUnavailableCard: { minHeight: 92, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  quoteLoadingIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  quoteLoadingCopy: { flex: 1, gap: 4 },
  quoteLoadingTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  quoteLoadingBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },

  quoteCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 17, gap: 15 },
  quoteTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  quoteEyebrow: { color: "rgba(255,255,255,0.54)", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  quotePrice: { color: "#FFFFFF", fontSize: 38, lineHeight: 43, fontWeight: "900", letterSpacing: -1.4, marginTop: 2 },
  quoteCurrency: { color: "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: "800" },
  quoteVerified: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 10, minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6 },
  quoteVerifiedText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  quoteFacts: { flexDirection: "row", alignItems: "stretch", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 17, paddingVertical: 10 },
  quoteFact: { flex: 1, alignItems: "center", gap: 3, paddingHorizontal: 5 },
  quoteFactDivider: { width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.16)" },
  quoteFactLabel: { color: "rgba(255,255,255,0.48)", fontSize: 7, fontWeight: "800" },
  quoteFactValue: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", textTransform: "capitalize", textAlign: "center" },
  refreshQuote: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 5 },
  refreshQuoteText: { color: "rgba(255,255,255,0.62)", fontSize: 9, fontWeight: "800" },

  reviewMetaCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 13, borderWidth: 1, borderColor: v2Theme.colors.line },
  reviewMetaRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line },
  reviewMetaIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  reviewMetaCopy: { flex: 1, gap: 2 },
  reviewMetaLabel: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" },
  reviewMetaValue: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },

  footerActions: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  secondaryButton: { minHeight: 58, minWidth: 92, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: 1, borderColor: v2Theme.colors.line, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  secondaryButtonText: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  primaryButton: { flex: 1, minHeight: 58, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  primaryButtonSub: { color: "rgba(255,255,255,0.7)", fontSize: 8, marginTop: 2 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },

  trustRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 3 },
  trustText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
});
