import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

export function isIdentityVerified(user?: { verification_status?: string } | null) {
  return user?.verification_status === "verified";
}

export function VerifiedBadge({
  verified,
  size = "small",
  label = false,
}: {
  verified?: boolean;
  size?: "small" | "medium";
  label?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!verified) return null;

  const badgeSize = size === "medium" ? 22 : 18;
  const iconSize = size === "medium" ? 15 : 12;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Verified identity"
        onPress={() => setOpen(true)}
        style={styles.inline}
      >
        <View style={[styles.badge, { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 }]}>
          <MaterialCommunityIcons name="check-bold" size={iconSize} color="#FFFFFF" />
        </View>
        {label ? <Text style={styles.label}>Identity verified</Text> : null}
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalTitleRow}>
              <View style={styles.modalBadge}>
                <MaterialCommunityIcons name="check-bold" size={18} color="#FFFFFF" />
              </View>
              <Text style={styles.modalTitle}>Verified identity</Text>
            </View>
            <Text style={styles.modalBody}>
              This person has completed LetsGoRide identity verification.
              Verification helps build trust, reduce impersonation, and make
              passengers and drivers feel safer before sharing a ride.
            </Text>
            <Text style={styles.modalBody}>
              Driver verification may include identity and vehicle document
              review before they can post rides. Passenger verification helps
              drivers know the booking request comes from a real person.
            </Text>
            <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  badge: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1D7FF2",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
  },
  label: {
    color: "#1D7FF2",
    fontWeight: "900",
    fontSize: 12,
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(17,20,23,0.28)",
  },
  modalCard: {
    borderRadius: 28,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  modalBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1D7FF2",
  },
  modalTitle: {
    color: colors.whiteText,
    fontSize: 22,
    fontWeight: "900",
  },
  modalBody: {
    color: colors.mutedText,
    lineHeight: 22,
  },
  closeButton: {
    minHeight: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.charcoal,
    marginTop: spacing.sm,
  },
  closeText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
});
