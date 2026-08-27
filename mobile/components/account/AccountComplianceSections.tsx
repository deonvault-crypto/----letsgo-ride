import { Alert, Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";

import { legalUrls } from "../../constants/legal";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { deleteAccount, logoutToGuest } from "../../services/authService";
import { disableBiometricLogin } from "../../services/biometricService";
import { openExternalUrl } from "../../utils/openExternalUrl";
import { AppButton } from "../ui/AppButton";
import { ListTile } from "../ui/ListTile";

export type PublicAccountProduct = "customer" | "driver" | "courier" | "merchant";

export function AccountComplianceSections({ product }: { product: PublicAccountProduct }) {
  const router = useRouter();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleteSaving, setDeleteSaving] = useState(false);

  function confirmSignOut() {
    Alert.alert("Sign out", "You will be signed out of this LetsGoRide account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => logoutToGuest(router),
      },
    ]);
  }

  async function confirmDeleteAccount() {
    if (deleteText.trim().toUpperCase() !== "DELETE") return;
    try {
      setDeleteSaving(true);
      await deleteAccount();
      await disableBiometricLogin();
      setDeleteModalOpen(false);
      Alert.alert(
        "Account deleted",
        "Your account access and non-retained profile data have been removed.",
      );
      router.replace("/(customer)/home" as never);
    } catch (error) {
      Alert.alert(
        "Delete account",
        error instanceof Error
          ? error.message
          : "Could not delete your account. Please try again or contact support.",
      );
    } finally {
      setDeleteSaving(false);
    }
  }

  function openDeleteConfirmation() {
    setDeleteText("");
    setDeleteModalOpen(true);
  }

  return (
    <>
      <Modal
        visible={deleteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete account?</Text>
            <Text style={styles.body}>
              This permanently closes your LetsGoRide account and removes or de-identifies your profile,
              contact details, saved preferences, device registrations and messages you sent. Limited
              completed service, safety, support, verification, fraud-prevention and legal records may be
              retained as described in the Privacy Policy.
            </Text>
            <Text style={styles.modalHelper}>Type DELETE to confirm.</Text>
            <TextInput
              accessibilityLabel="Type DELETE to confirm account deletion"
              value={deleteText}
              onChangeText={setDeleteText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="DELETE"
              placeholderTextColor={colors.mutedText}
              style={styles.confirmInput}
            />
            <View style={styles.modalActions}>
              <AppButton title="Cancel" variant="secondary" onPress={() => setDeleteModalOpen(false)} />
              <AppButton
                title="Delete account"
                variant="danger"
                loading={deleteSaving}
                disabled={deleteText.trim().toUpperCase() !== "DELETE"}
                onPress={confirmDeleteAccount}
              />
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal &amp; support</Text>
        <ListTile icon="lock-outline" title="Privacy Policy" onPress={() => openExternalUrl(legalUrls.privacy)} />
        <ListTile icon="file-document-outline" title="Terms of Service" onPress={() => openExternalUrl(legalUrls.terms)} />
        <ListTile icon="shield-outline" title="Safety" onPress={() => openExternalUrl(legalUrls.safety)} />
        <ListTile
          icon="lifebuoy"
          title="Help & Support"
          subtitle="Contact LetsGoRide in the app"
          onPress={() => router.push({ pathname: "/(shared)/support", params: { product } } as never)}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <ListTile
          icon="delete-outline"
          title="Delete Account"
          subtitle="Permanently close this account"
          onPress={openDeleteConfirmation}
          danger
        />
        <ListTile icon="logout" title="Sign Out" subtitle="Sign out on this device" onPress={confirmSignOut} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.whiteText, fontSize: 18, fontWeight: "900", paddingHorizontal: 2 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(17,20,23,0.26)",
  },
  modalCard: {
    gap: spacing.md,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.xl,
  },
  modalTitle: { color: colors.whiteText, fontWeight: "900", fontSize: 24 },
  body: { color: colors.mutedText, lineHeight: 21 },
  modalHelper: { color: colors.whiteText, fontWeight: "800" },
  confirmInput: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.elevated,
    paddingHorizontal: spacing.lg,
    color: colors.whiteText,
    fontSize: 16,
    fontWeight: "900",
  },
  modalActions: { gap: spacing.sm },
});
