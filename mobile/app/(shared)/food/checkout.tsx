import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import { useFoodBasket } from "../../../contexts/FoodBasketContext";
import { useLocationDraft } from "../../../contexts/LocationDraftContext";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { createFoodOrder } from "../../../services/foodService";

export default function FoodCheckoutScreen() {
  const router = useRouter();
  const basket = useFoodBasket();
  const { user } = useCurrentUser();
  const { foodDropoff, clearFoodDropoff } = useLocationDraft();

  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name && !recipientName) setRecipientName(user.name);
    if (user?.phone && !recipientPhone) setRecipientPhone(user.phone);
  }, [user?.name, user?.phone, recipientName, recipientPhone]);

  const canSubmit = useMemo(
    () => Boolean(
      basket.restaurant &&
      basket.lines.length > 0 &&
      foodDropoff &&
      recipientName.trim().length >= 2 &&
      recipientPhone.trim().length >= 5 &&
      !submitting,
    ),
    [basket.restaurant, basket.lines.length, foodDropoff, recipientName, recipientPhone, submitting],
  );

  async function placeOrder() {
    if (!canSubmit || !basket.restaurant || !foodDropoff) return;
    try {
      setSubmitting(true);
      setError(null);
      const order = await createFoodOrder({
        restaurant_id: basket.restaurant.id,
        delivery_address: foodDropoff.address,
        delivery_location: {
          latitude: foodDropoff.location.latitude,
          longitude: foodDropoff.location.longitude,
        },
        recipient_name: recipientName.trim(),
        recipient_phone: recipientPhone.trim(),
        items: basket.lines.map((line) => ({
          menu_item_id: line.item.id,
          quantity: line.quantity,
        })),
        customer_note: customerNote.trim() || null,
        payment_method: "CASH_ON_DELIVERY",
      });
      basket.clearBasket();
      clearFoodDropoff();
      router.replace(`/(shared)/food/order/${order.id}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to place your order.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!basket.restaurant || basket.lines.length === 0) {
    return (
      <Screen showBack fallbackRoute="/(shared)/food" title="Checkout" showNotifications={false}>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><MaterialCommunityIcons name="basket-outline" size={30} color={v2Theme.colors.brandStrong} /></View>
          <Text style={styles.emptyTitle}>Your basket is empty</Text>
          <Text style={styles.emptyBody}>Choose a restaurant and add something you want before checking out.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace("/(shared)/food" as never)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Browse restaurants</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen showBack fallbackRoute={`/(shared)/food/${basket.restaurant.id}` as never} title="Checkout" showNotifications={false}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><MaterialCommunityIcons name="shopping-outline" size={25} color="#FFFFFF" /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>READY TO ORDER</Text>
          <Text style={styles.title}>Confirm and go.</Text>
          <Text style={styles.body}>If the restaurant is open and the items are available, your order enters the kitchen immediately while we start finding a courier.</Text>
        </View>
      </View>

      <View style={styles.restaurantCard}>
        <View style={styles.restaurantIcon}><MaterialCommunityIcons name="storefront-outline" size={24} color={v2Theme.colors.brandStrong} /></View>
        <View style={styles.restaurantCopy}>
          <Text style={styles.restaurantLabel}>Ordering from</Text>
          <Text numberOfLines={1} style={styles.restaurantName}>{basket.restaurant.name}</Text>
          <Text numberOfLines={1} style={styles.restaurantAddress}>{basket.restaurant.address}</Text>
        </View>
        <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>OPEN</Text></View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delivery location</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose delivery location"
          onPress={() => router.push("/(shared)/location-picker?kind=food" as never)}
          style={({ pressed }) => [styles.locationCard, pressed && styles.pressed]}
        >
          <View style={styles.locationIcon}>
            <MaterialCommunityIcons name={foodDropoff ? "map-marker" : "map-marker-outline"} size={24} color={v2Theme.colors.brandStrong} />
          </View>
          <View style={styles.locationCopy}>
            <Text style={styles.locationLabel}>{foodDropoff ? "Deliver to" : "Choose where to deliver"}</Text>
            <Text numberOfLines={1} style={styles.locationTitle}>{foodDropoff?.label || "Search, use GPS or move the pin"}</Text>
            <Text numberOfLines={2} style={styles.locationBody}>{foodDropoff?.address || "Use an exact map pin so the courier does not have to guess your location."}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recipient</Text>
        <Field icon="account-outline" label="Name" value={recipientName} onChangeText={setRecipientName} placeholder="Recipient name" autoCapitalize="words" />
        <Field icon="phone-outline" label="Phone" value={recipientPhone} onChangeText={setRecipientPhone} placeholder="Recipient phone number" keyboardType="phone-pad" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment</Text>
        <View style={styles.paymentCard}>
          <View style={styles.paymentIcon}><MaterialCommunityIcons name="cash" size={24} color={v2Theme.colors.brandStrong} /></View>
          <View style={styles.paymentCopy}>
            <Text style={styles.paymentTitle}>Pay on delivery</Text>
            <Text style={styles.paymentBody}>Cash payment at handoff. Card and wallet payments will appear here once their payment rails are connected.</Text>
          </View>
          <MaterialCommunityIcons name="check-circle" size={23} color={v2Theme.colors.success} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Order note</Text>
        <View style={styles.noteField}>
          <MaterialCommunityIcons name="note-text-outline" size={21} color={v2Theme.colors.inkSecondary} />
          <TextInput
            accessibilityLabel="Order note"
            multiline
            maxLength={400}
            value={customerNote}
            onChangeText={setCustomerNote}
            placeholder="Gate number, landmark, allergies or delivery instructions"
            placeholderTextColor={v2Theme.colors.inkTertiary}
            style={styles.noteInput}
          />
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>Order summary</Text>
          <Text style={styles.summaryCount}>{basket.itemCount} items</Text>
        </View>
        <View style={styles.lines}>
          {basket.lines.map((line) => (
            <View key={line.item.id} style={styles.lineRow}>
              <Text style={styles.lineQty}>{line.quantity}×</Text>
              <Text numberOfLines={1} style={styles.lineName}>{line.item.name}</Text>
              <Text style={styles.linePrice}>${(line.item.price_usd * line.quantity).toFixed(2)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.divider} />
        <View style={styles.priceRow}><Text style={styles.priceLabel}>Items subtotal</Text><Text style={styles.priceValue}>${basket.subtotalUsd.toFixed(2)}</Text></View>
        <View style={styles.priceRow}><Text style={styles.priceLabel}>Delivery fee</Text><Text style={styles.pendingPrice}>Calculated from route</Text></View>
        <View style={styles.securityNote}>
          <MaterialCommunityIcons name="shield-check-outline" size={18} color={v2Theme.colors.brandStrong} />
          <Text style={styles.securityText}>Prices, item availability and delivery pricing are checked again by the server before the order starts.</Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Place food order"
        accessibilityState={{ disabled: !canSubmit }}
        disabled={!canSubmit}
        onPress={placeOrder}
        style={({ pressed }) => [styles.primaryButton, !canSubmit && styles.primaryButtonDisabled, pressed && canSubmit && styles.pressed]}
      >
        <View>
          <Text style={styles.primaryButtonText}>{submitting ? "Starting your order…" : "Place order"}</Text>
          <Text style={styles.primaryButtonSub}>{foodDropoff ? "Kitchen + courier dispatch start automatically" : "Choose a delivery location first"}</Text>
        </View>
        <MaterialCommunityIcons name="arrow-right" size={22} color="#FFFFFF" />
      </Pressable>
    </Screen>
  );
}

function Field({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "sentences",
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldIcon}><MaterialCommunityIcons name={icon} size={21} color={v2Theme.colors.inkSecondary} /></View>
      <View style={styles.fieldCopy}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={v2Theme.colors.inkTertiary} keyboardType={keyboardType} autoCapitalize={autoCapitalize} style={styles.input} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 17, flexDirection: "row", gap: 13, alignItems: "flex-start" },
  heroIcon: { width: 49, height: 49, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, gap: 5 }, eyebrow: { color: "#8FE6AE", fontSize: 9, fontWeight: "900", letterSpacing: 1.15 },
  title: { color: "#FFFFFF", fontSize: 27, lineHeight: 31, fontWeight: "900", letterSpacing: -0.8 }, body: { color: "rgba(255,255,255,0.68)", fontSize: 11, lineHeight: 17 },
  restaurantCard: { minHeight: 82, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  restaurantIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, restaurantCopy: { flex: 1, gap: 3 }, restaurantLabel: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" }, restaurantName: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" }, restaurantAddress: { color: v2Theme.colors.inkSecondary, fontSize: 10 },
  livePill: { borderRadius: 999, backgroundColor: v2Theme.colors.brandSofter, paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 5 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.success }, liveText: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900" },
  section: { gap: 10 }, sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  locationCard: { minHeight: 92, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  locationIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, locationCopy: { flex: 1, gap: 3 }, locationLabel: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900" }, locationTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" }, locationBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  field: { minHeight: 72, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 }, fieldIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, fieldCopy: { flex: 1, gap: 2 }, fieldLabel: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" }, input: { minHeight: 32, color: v2Theme.colors.ink, fontSize: 14, fontWeight: "800", paddingVertical: 0 },
  paymentCard: { minHeight: 82, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }, paymentIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, paymentCopy: { flex: 1, gap: 3 }, paymentTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" }, paymentBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  noteField: { minHeight: 108, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 }, noteInput: { flex: 1, minHeight: 76, color: v2Theme.colors.ink, fontSize: 13, lineHeight: 19, paddingVertical: 0, textAlignVertical: "top" },
  summaryCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 16, gap: 12 }, summaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, summaryTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" }, summaryCount: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" }, lines: { gap: 8 }, lineRow: { flexDirection: "row", alignItems: "center", gap: 8 }, lineQty: { width: 25, color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "900" }, lineName: { flex: 1, color: v2Theme.colors.ink, fontSize: 12, fontWeight: "800" }, linePrice: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line }, priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, priceLabel: { color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "800" }, priceValue: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" }, pendingPrice: { color: v2Theme.colors.warning, fontSize: 10, fontWeight: "900" }, securityNote: { borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.brandSofter, padding: 11, flexDirection: "row", alignItems: "center", gap: 9 }, securityText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  errorCard: { borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 }, errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" },
  primaryButton: { minHeight: 62, borderRadius: 20, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, primaryButtonDisabled: { opacity: 0.42 }, primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" }, primaryButtonSub: { color: "rgba(255,255,255,0.72)", fontSize: 9, fontWeight: "700", marginTop: 3 },
  emptyCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 22, alignItems: "center", gap: 10 }, emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, emptyTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900" }, emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 17, textAlign: "center" }, secondaryButton: { minHeight: 44, borderRadius: 15, backgroundColor: v2Theme.colors.ink, paddingHorizontal: 15, alignItems: "center", justifyContent: "center" }, secondaryButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
