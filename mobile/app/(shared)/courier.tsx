import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";

const packageTypes = [
  ["package-variant", "Parcel"],
  ["shopping-outline", "Shopping"],
  ["file-document-outline", "Documents"],
  ["dots-horizontal", "Other"],
] as const;

export default function CourierScreen() {
  return (
    <Screen showBack fallbackRoute="/(passenger)/home" title="Courier" showNotifications={false}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LETSGORIDE COURIER</Text>
        <Text style={styles.title}>Send it across town.</Text>
        <Text style={styles.body}>
          Set the pickup, choose the drop-off and tell us what is being sent. Pricing and courier matching plug into this flow next.
        </Text>
      </View>

      <View style={styles.routeCard}>
        <LocationRow
          icon="circle-outline"
          label="Pickup"
          value="Choose pickup location"
          first
        />
        <View style={styles.routeDivider} />
        <LocationRow
          icon="map-marker-outline"
          label="Drop-off"
          value="Choose delivery destination"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What are you sending?</Text>
        <View style={styles.packageGrid}>
          {packageTypes.map(([icon, label]) => (
            <Pressable key={label} style={({ pressed }) => [styles.packageCard, pressed && styles.pressed]}>
              <View style={styles.packageIcon}>
                <MaterialCommunityIcons name={icon} size={24} color={v2Theme.colors.ink} />
              </View>
              <Text style={styles.packageLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoIcon}>
          <MaterialCommunityIcons name="shield-check-outline" size={25} color={v2Theme.colors.brandStrong} />
        </View>
        <View style={styles.infoCopy}>
          <Text style={styles.infoTitle}>Built for accountable delivery</Text>
          <Text style={styles.infoBody}>
            Each delivery will have a lifecycle, courier assignment, status history and tracking events instead of a loose chat-based workflow.
          </Text>
        </View>
      </View>

      <Pressable accessibilityRole="button" style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        <Text style={styles.primaryButtonText}>Continue</Text>
        <MaterialCommunityIcons name="arrow-right" size={21} color="#FFFFFF" />
      </Pressable>
    </Screen>
  );
}

function LocationRow({
  icon,
  label,
  value,
  first = false,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  first?: boolean;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.locationRow, pressed && styles.pressed]}>
      <View style={[styles.dot, first && styles.pickupDot]}>
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={first ? v2Theme.colors.brandStrong : v2Theme.colors.ink}
        />
      </View>
      <View style={styles.locationCopy}>
        <Text style={styles.locationLabel}>{label}</Text>
        <Text style={styles.locationValue}>{value}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 7 },
  eyebrow: {
    color: v2Theme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  title: {
    color: v2Theme.colors.ink,
    fontSize: 32,
    lineHeight: 37,
    fontWeight: "900",
    letterSpacing: -1.05,
  },
  body: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  routeCard: {
    borderRadius: v2Theme.radius.xxl,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.lineStrong,
    overflow: "hidden",
  },
  locationRow: {
    minHeight: 82,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  routeDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: v2Theme.colors.line,
    marginLeft: 72,
  },
  dot: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  pickupDot: {
    backgroundColor: v2Theme.colors.brandSoft,
  },
  locationCopy: { flex: 1, gap: 3 },
  locationLabel: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 11,
    fontWeight: "800",
  },
  locationValue: {
    color: v2Theme.colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  section: { gap: 12 },
  sectionTitle: {
    color: v2Theme.colors.ink,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  packageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  packageCard: {
    width: "48%",
    minHeight: 102,
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surfaceMuted,
    padding: 13,
    justifyContent: "space-between",
  },
  packageIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  packageLabel: {
    color: v2Theme.colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  infoCard: {
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.brandSofter,
    padding: 16,
    flexDirection: "row",
    gap: 12,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCopy: { flex: 1, gap: 5 },
  infoTitle: {
    color: v2Theme.colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  infoBody: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: v2Theme.control.primaryHeight,
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.brand,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.995 }],
  },
});
