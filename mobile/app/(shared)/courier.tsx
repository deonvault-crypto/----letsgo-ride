import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AuthRequiredModal } from "../../components/auth/AuthRequiredModal";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useLocationDraft } from "../../contexts/LocationDraftContext";
import { createCourierDelivery, previewCourierQuote } from "../../services/courierService";
import { hasSession } from "../../services/authService";
import { CourierCreatePayload, CourierQuotePreview } from "../../types/courier.types";

const packageTypes = [
  ["parcel", "package-variant-closed", "Parcel", "Boxes, gifts & everyday packages"],
  ["shopping", "shopping-outline", "Shopping", "Store pickups & shopping bags"],
  ["documents", "file-document-outline", "Documents", "Envelopes, forms & paperwork"],
  ["other", "dots-horizontal-circle-outline", "Other", "Tell the courier what it is"],
] as const;

const steps = ["Route", "Package", "Recipient", "Review"] as const;
type PackageType = CourierCreatePayload["package_type"];

export default function CourierScreen() {
  const router = useRouter();
  const { pickup, dropoff, clear } = useLocationDraft();
  const [step, setStep] = useState(0);
  const [packageType, setPackageType] = useState<PackageType>("parcel");
  const [description, setDescription] = useState("");
  const [weight, setWeight] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [dropoffNote, setDropoffNote] = useState("");
  const [quote, setQuote] = useState<CourierQuotePreview | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transition = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    transition.setValue(0);
    Animated.spring(transition, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 190,
      mass: 0.8,
    }).start();
  }, [step, transition]);

  useEffect(() => {
    setQuote(null);
  }, [pickup?.location.latitude, pickup?.location.longitude, dropoff?.location.latitude, dropoff?.location.longitude]);

  const animatedStepStyle = {
    opacity: transition,
    transform: [
      {
        translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
      },
    ],
  };

  function validateCurrentStep() {
    if (step === 0 && (!pickup || !dropoff)) {
      return "Choose both pickup and drop-off on the map before continuing.";
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
    if (step === 2 && (recipientName.trim().length < 2 || recipientPhone.trim().length < 5)) {
      return "Add the recipient name and phone number before reviewing the delivery.";
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

    // Guests can browse LetsGoRide and even choose precise map locations. We ask
    // for identity only when they are about to enter the real service workflow.
    if (step === 0 && !(await hasSession())) {
      setAuthPromptOpen(true);
      return;
    }

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
    if (!pickup || !dropoff) {
      setError("Choose pickup and drop-off locations first.");
      return;
    }
    try {
      setQuoting(true);
      setError(null);
      setQuote(
        await previewCourierQuote({
          pickup_address: pickup.address,
          dropoff_address: dropoff.address,
          pickup_location: pickup.location,
          dropoff_location: dropoff.location,
        }),
      );
    } catch (err) {
      setQuote(null);
      setError(err instanceof Error ? err.message : "Unable to calculate this delivery price.");
    } finally {
      setQuoting(false);
    }
  }

  function payload(): CourierCreatePayload {
    if (!pickup || !dropoff) throw new Error("Delivery locations are missing.");
    const parsedWeight = weight.trim() ? Number(weight) : null;
    const parsedValue = declaredValue.trim() ? Number(declaredValue) : null;
    return {
      pickup_address: pickup.address,
      dropoff_address: dropoff.address,
      pickup_location: quote?.pickup_location ?? pickup.location,
      dropoff_location: quote?.dropoff_location ?? dropoff.location,
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
    if (!(await hasSession())) {
      setAuthPromptOpen(true);
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const delivery = await createCourierDelivery(payload());
      clear();
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
      <AuthRequiredModal
        visible={authPromptOpen}
        onClose={() => setAuthPromptOpen(false)}
        returnTo="/(shared)/courier"
        title="Ready to send it?"
        body="Sign in or create a customer account to request a real courier. Your selected map locations stay ready when you return."
      />

      <CourierHero />
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

      <Animated.View style={[styles.stepStage, animatedStepStyle]}>
        {step === 0 ? (
          <RouteStep
            pickupLabel={pickup?.label || null}
            pickupAddress={pickup?.address || null}
            dropoffLabel={dropoff?.label || null}
            dropoffAddress={dropoff?.address || null}
            onPickup={() => router.push({ pathname: "/(shared)/location-picker", params: { kind: "pickup" } } as never)}
            onDropoff={() => router.push({ pathname: "/(shared)/location-picker", params: { kind: "dropoff" } } as never)}
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
            pickupAddress={pickup?.address || ""}
            dropoffAddress={dropoff?.address || ""}
            packageType={packageType}
            recipientName={recipientName}
            quote={quote}
            quoting={quoting}
            onRefreshQuote={loadQuote}
          />
        ) : null}
      </Animated.View>

      <View style={styles.footerActions}>
        {step > 0 ? (
          <Pressable accessibilityRole="button" onPress={previousStep} disabled={submitting} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="arrow-left" size={19} color={v2Theme.colors.ink} />
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
        ) : null}

        {step < 3 ? (
          <Pressable accessibilityRole="button" onPress={nextStep} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>{step === 0 ? "Continue" : step === 2 ? "Review & get price" : "Continue"}</Text>
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
              {quote ? <Text style={styles.primaryButtonSub}>${quote.price_usd.toFixed(2)} · final server check on request</Text> : null}
            </View>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
          </Pressable>
        )}
      </View>

      <View style={styles.trustRow}>
        <MaterialCommunityIcons name="shield-check-outline" size={17} color={v2Theme.colors.inkSecondary} />
        <Text style={styles.trustText}>Your exact map pins guide the route, while place names help everyone recognise each stop.</Text>
      </View>
    </Screen>
  );
}

function CourierHero() {
  return (
    <LinearGradient
      colors={["#123F2A", "#176E3D", "#2F9A58"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroCopy}>
        <Text style={styles.heroEyebrow}>LETSGORIDE COURIER</Text>
        <Text style={styles.heroTitle}>Send it without guessing.</Text>
        <Text style={styles.heroBody}>Search the place, pin the exact gate, see the real route, then track the courier live.</Text>
      </View>
      <View style={styles.heroArt}>
        <View style={[styles.artTile, styles.artTileBack]}>
          <MaterialCommunityIcons name="file-document-outline" size={24} color="#173E2A" />
        </View>
        <View style={[styles.artTile, styles.artTileMiddle]}>
          <MaterialCommunityIcons name="shopping-outline" size={27} color="#173E2A" />
        </View>
        <View style={[styles.artTile, styles.artTileFront]}>
          <MaterialCommunityIcons name="package-variant-closed" size={32} color="#FFFFFF" />
        </View>
      </View>
    </LinearGradient>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <View style={styles.progressWrap}>
      {steps.map((label, index) => (
        <View key={label} style={styles.progressItem}>
          <View style={[styles.progressBar, index <= step && styles.progressBarActive]}>
            {index === step ? <View style={styles.progressGlow} /> : null}
          </View>
          <Text style={[styles.progressLabel, index === step && styles.progressLabelActive]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function RouteStep({
  pickupLabel,
  pickupAddress,
  dropoffLabel,
  dropoffAddress,
  onPickup,
  onDropoff,
}: {
  pickupLabel: string | null;
  pickupAddress: string | null;
  dropoffLabel: string | null;
  dropoffAddress: string | null;
  onPickup: () => void;
  onDropoff: () => void;
}) {
  return (
    <View style={styles.section}>
      <View>
        <Text style={styles.sectionEyebrow}>STEP 1 · MAP FIRST</Text>
        <Text style={styles.sectionTitle}>Where should we collect and deliver?</Text>
        <Text style={styles.sectionBody}>No perfect spelling needed. Search a landmark or street, then drag the pin to the exact gate.</Text>
      </View>

      <View style={styles.routeCard}>
        <LocationRow label="Pickup" icon="circle-slice-8" choiceLabel={pickupLabel} address={pickupAddress} brand onPress={onPickup} />
        <View style={styles.routeLine} />
        <LocationRow label="Drop-off" icon="map-marker-outline" choiceLabel={dropoffLabel} address={dropoffAddress} onPress={onDropoff} />
      </View>

      <View style={styles.mapPromise}>
        <View style={styles.mapPromiseIcon}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={22} color={v2Theme.colors.brandStrong} />
        </View>
        <View style={styles.mapPromiseCopy}>
          <Text style={styles.mapPromiseTitle}>Your exact pin guides the courier.</Text>
          <Text style={styles.mapPromiseBody}>Even when a house has no perfect street address, the courier gets the exact map point you selected.</Text>
        </View>
      </View>
    </View>
  );
}

function LocationRow({
  label,
  icon,
  choiceLabel,
  address,
  brand,
  onPress,
}: {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  choiceLabel: string | null;
  address: string | null;
  brand?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.locationRow, pressed && styles.pressed]}>
      <View style={[styles.locationRowIcon, brand && styles.locationRowIconBrand]}>
        <MaterialCommunityIcons name={icon} size={21} color={brand ? v2Theme.colors.brandStrong : v2Theme.colors.inkSecondary} />
      </View>
      <View style={styles.locationRowCopy}>
        <Text style={styles.locationRowLabel}>{label.toUpperCase()}</Text>
        <Text numberOfLines={1} style={[styles.locationRowTitle, !choiceLabel && styles.locationRowPlaceholder]}>
          {choiceLabel || `Choose ${label.toLowerCase()}`}
        </Text>
        {address && address !== choiceLabel ? <Text numberOfLines={1} style={styles.locationRowBody}>{address}</Text> : null}
      </View>
      <View style={styles.locationEdit}>
        <MaterialCommunityIcons name={choiceLabel ? "pencil-outline" : "chevron-right"} size={19} color={v2Theme.colors.inkSecondary} />
      </View>
    </Pressable>
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
        <Text style={styles.sectionBody}>Choose the closest match so the courier knows what kind of pickup to expect.</Text>
      </View>

      <View style={styles.packageGrid}>
        {packageTypes.map(([value, icon, label, supporting], index) => {
          const selected = packageType === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onPackageType(value)}
              style={({ pressed }) => [styles.packageCard, selected && styles.packageCardSelected, pressed && styles.pressed]}
            >
              <LinearGradient
                colors={index % 2 === 0 ? ["#F0F8F2", "#E4F1E8"] : ["#FFF5DE", "#F6E9C9"]}
                style={styles.packageArt}
              >
                <MaterialCommunityIcons name={icon} size={32} color={selected ? v2Theme.colors.brandStrong : v2Theme.colors.ink} />
              </LinearGradient>
              <View style={styles.packageCopy}>
                <Text style={styles.packageTitle}>{label}</Text>
                <Text style={styles.packageBody}>{supporting}</Text>
              </View>
              {selected ? <MaterialCommunityIcons name="check-circle" size={20} color={v2Theme.colors.brand} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.formCard}>
        <SimpleField label="Package description" placeholder="e.g. Small sealed box with clothing" value={description} onChangeText={onDescription} multiline />
        <View style={styles.formDivider} />
        <View style={styles.twoColumn}>
          <View style={styles.column}><SimpleField label="Weight (kg)" placeholder="Optional" value={weight} onChangeText={onWeight} keyboardType="decimal-pad" /></View>
          <View style={styles.columnDivider} />
          <View style={styles.column}><SimpleField label="Declared value (USD)" placeholder="Optional" value={declaredValue} onChangeText={onDeclaredValue} keyboardType="decimal-pad" /></View>
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
        <Text style={styles.sectionBody}>The courier uses these details only for the pickup and delivery handoff.</Text>
      </View>
      <View style={styles.formCard}>
        <SimpleField label="Recipient name" placeholder="Full name" value={recipientName} onChangeText={onRecipientName} autoCapitalize="words" />
        <View style={styles.formDivider} />
        <SimpleField label="Recipient phone" placeholder="e.g. +263 77 123 4567" value={recipientPhone} onChangeText={onRecipientPhone} keyboardType="phone-pad" />
      </View>
      <View style={styles.formCard}>
        <SimpleField label="Pickup note" placeholder="Gate, desk, landmark or collection instruction" value={pickupNote} onChangeText={onPickupNote} multiline />
        <View style={styles.formDivider} />
        <SimpleField label="Drop-off note" placeholder="Handoff instruction or exact entrance" value={dropoffNote} onChangeText={onDropoffNote} multiline />
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
        <Text style={styles.sectionTitle}>Everything look right?</Text>
        <Text style={styles.sectionBody}>The price comes from the live route. We verify the route again when you confirm.</Text>
      </View>
      <View style={styles.reviewRouteCard}>
        <ReviewLocation icon="circle-slice-8" label="PICKUP" value={quote?.pickup_address || pickupAddress} brand />
        <View style={styles.reviewRouteConnector} />
        <ReviewLocation icon="map-marker" label="DROP-OFF" value={quote?.dropoff_address || dropoffAddress} />
      </View>

      {quoting ? (
        <View style={styles.quoteLoadingCard}>
          <View style={styles.radarWrap}>
            <View style={styles.radarOuter}><View style={styles.radarInner}><MaterialCommunityIcons name="routes" size={22} color={v2Theme.colors.brandStrong} /></View></View>
          </View>
          <View style={styles.quoteLoadingCopy}>
            <Text style={styles.quoteLoadingTitle}>Building your real route…</Text>
            <Text style={styles.quoteLoadingBody}>Road distance, drive time and delivery pricing are being checked now.</Text>
          </View>
        </View>
      ) : quote ? (
        <View style={styles.quoteCard}>
          <View style={styles.quoteTop}>
            <View>
              <Text style={styles.quoteEyebrow}>YOUR DELIVERY</Text>
              <Text style={styles.quotePrice}>${quote.price_usd.toFixed(2)}</Text>
              <Text style={styles.quoteCurrency}>{quote.currency}</Text>
            </View>
            <View style={styles.quoteVerified}>
              <MaterialCommunityIcons name="check-decagram" size={19} color="#A9F2C2" />
              <Text style={styles.quoteVerifiedText}>Live price</Text>
            </View>
          </View>
          <View style={styles.quoteFacts}>
            <QuoteFact icon="map-marker-distance" label="Distance" value={`${quote.distance_km.toFixed(1)} km`} />
            <View style={styles.quoteFactDivider} />
            <QuoteFact icon="clock-outline" label="Drive" value={`${quote.estimated_duration_minutes} min`} />
            <View style={styles.quoteFactDivider} />
            <QuoteFact icon="package-variant" label="Package" value={packageType.replaceAll("_", " ")} />
          </View>
          <Pressable accessibilityRole="button" onPress={onRefreshQuote} style={({ pressed }) => [styles.refreshQuote, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="refresh" size={16} color="rgba(255,255,255,0.68)" />
            <Text style={styles.refreshQuoteText}>Refresh route & price</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={onRefreshQuote} style={({ pressed }) => [styles.quoteUnavailableCard, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="calculator-variant-outline" size={25} color={v2Theme.colors.brandStrong} />
          <View style={styles.quoteLoadingCopy}><Text style={styles.quoteLoadingTitle}>Get a live delivery price</Text><Text style={styles.quoteLoadingBody}>LetsGoRide will not invent a fee if the real route cannot be calculated.</Text></View>
          <MaterialCommunityIcons name="arrow-right" size={20} color={v2Theme.colors.brandStrong} />
        </Pressable>
      )}

      <View style={styles.reviewMetaCard}>
        <ReviewMeta icon="account-outline" label="Recipient" value={recipientName} />
        <ReviewMeta icon="package-variant-closed" label="Service" value="Courier delivery" />
        <ReviewMeta icon="map-marker-path" label="Tracking" value="Live after courier assignment" />
      </View>
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
  return <View style={styles.quoteFact}><MaterialCommunityIcons name={icon} size={18} color="rgba(255,255,255,0.66)" /><Text style={styles.quoteFactLabel}>{label}</Text><Text style={styles.quoteFactValue}>{value}</Text></View>;
}

function ReviewMeta({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.reviewMetaRow}><View style={styles.reviewMetaIcon}><MaterialCommunityIcons name={icon} size={19} color={v2Theme.colors.inkSecondary} /></View><View style={styles.reviewMetaCopy}><Text style={styles.reviewMetaLabel}>{label}</Text><Text style={styles.reviewMetaValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 178,
    borderRadius: 30,
    padding: 18,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#113D28",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
  heroCopy: { flex: 1, gap: 7, justifyContent: "center", paddingRight: 4 },
  heroEyebrow: { color: "#BFE9CD", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  heroTitle: { color: "#FFFFFF", fontSize: 28, lineHeight: 31, fontWeight: "900", letterSpacing: -1 },
  heroBody: { color: "rgba(255,255,255,0.76)", fontSize: 11, lineHeight: 16, maxWidth: 225 },
  heroArt: { width: 105, position: "relative", justifyContent: "center" },
  artTile: { position: "absolute", width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  artTileBack: { backgroundColor: "#FFE9B1", right: 30, top: 17, transform: [{ rotate: "-12deg" }] },
  artTileMiddle: { backgroundColor: "#E6F7EB", right: 0, top: 46, transform: [{ rotate: "10deg" }] },
  artTileFront: { backgroundColor: "#102E21", right: 22, bottom: 16, transform: [{ rotate: "-3deg" }] },
  progressWrap: { flexDirection: "row", gap: 7 },
  progressItem: { flex: 1, gap: 6 },
  progressBar: { height: 5, borderRadius: 4, backgroundColor: v2Theme.colors.lineStrong, overflow: "hidden" },
  progressBarActive: { backgroundColor: v2Theme.colors.brand },
  progressGlow: { flex: 1, backgroundColor: "rgba(255,255,255,0.28)" },
  progressLabel: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "800" },
  progressLabelActive: { color: v2Theme.colors.ink, fontWeight: "900" },
  errorCard: { borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  errorAction: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },
  stepStage: { gap: 14 },
  section: { gap: 14 },
  sectionEyebrow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 4 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 25, lineHeight: 30, fontWeight: "900", letterSpacing: -0.7 },
  sectionBody: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  routeCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong },
  locationRow: { minHeight: 88, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  locationRowIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  locationRowIconBrand: { backgroundColor: v2Theme.colors.brandSoft },
  locationRowCopy: { flex: 1, gap: 3 },
  locationRowLabel: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  locationRowTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  locationRowPlaceholder: { color: v2Theme.colors.inkSecondary },
  locationRowBody: { color: v2Theme.colors.inkSecondary, fontSize: 10 },
  locationEdit: { width: 36, height: 36, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  routeLine: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginLeft: 70 },
  mapPromise: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  mapPromiseIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  mapPromiseCopy: { flex: 1, gap: 3 },
  mapPromiseTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  mapPromiseBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  packageGrid: { gap: 10 },
  packageCard: { minHeight: 104, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, padding: 10, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong },
  packageCardSelected: { borderColor: v2Theme.colors.brand, backgroundColor: v2Theme.colors.brandSofter },
  packageArt: { width: 78, height: 78, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  packageCopy: { flex: 1, gap: 4 },
  packageTitle: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" },
  packageBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 14 },
  formCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong },
  formDivider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginHorizontal: 14 },
  simpleField: { paddingHorizontal: 15, paddingVertical: 13, gap: 5, minHeight: 72 },
  simpleLabel: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.55 },
  simpleInput: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "800", paddingVertical: 4 },
  simpleInputMultiline: { minHeight: 52 },
  twoColumn: { flexDirection: "row" },
  column: { flex: 1 },
  columnDivider: { width: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginVertical: 12 },
  reviewRouteCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong },
  reviewLocation: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 61 },
  reviewLocationIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  reviewLocationIconBrand: { backgroundColor: v2Theme.colors.brandSoft },
  reviewLocationCopy: { flex: 1, gap: 3 },
  reviewLocationLabel: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  reviewLocationValue: { color: v2Theme.colors.ink, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  reviewRouteConnector: { width: 1, height: 14, backgroundColor: v2Theme.colors.lineStrong, marginLeft: 20 },
  quoteLoadingCard: { minHeight: 98, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  radarWrap: { width: 58, height: 58, alignItems: "center", justifyContent: "center" },
  radarOuter: { width: 58, height: 58, borderRadius: 29, backgroundColor: "rgba(18,139,68,0.09)", alignItems: "center", justifyContent: "center" },
  radarInner: { width: 42, height: 42, borderRadius: 21, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  quoteUnavailableCard: { minHeight: 92, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  quoteLoadingCopy: { flex: 1, gap: 4 },
  quoteLoadingTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  quoteLoadingBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  quoteCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: "#102E21", padding: 17, gap: 15 },
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
  refreshQuoteText: { color: "rgba(255,255,255,0.68)", fontSize: 9, fontWeight: "800" },
  reviewMetaCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong },
  reviewMetaRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line },
  reviewMetaIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  reviewMetaCopy: { flex: 1, gap: 2 },
  reviewMetaLabel: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" },
  reviewMetaValue: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  footerActions: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  secondaryButton: { minHeight: 58, minWidth: 92, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  secondaryButtonText: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  primaryButton: { flex: 1, minHeight: 58, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  primaryButtonSub: { color: "rgba(255,255,255,0.7)", fontSize: 8, marginTop: 2 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  trustRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 3 },
  trustText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
});
