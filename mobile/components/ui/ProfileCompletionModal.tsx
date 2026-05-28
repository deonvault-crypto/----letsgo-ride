import { Modal, StyleSheet, Text, View } from "react-native";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { AppButton } from "./AppButton";
import { AppInput } from "./AppInput";
import { isValidPhone } from "../../utils/validation";

export function ProfileCompletionModal({
  visible,
  phone,
  saving,
  onChangePhone,
  onSave,
  onClose,
}: {
  visible: boolean;
  phone: string;
  saving?: boolean;
  onChangePhone: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Add your phone number to continue</Text>
          <Text style={styles.body}>
            Passengers and drivers need a reachable number for pickup
            coordination and trip safety.
          </Text>
          <AppInput
            label="Phone number"
            value={phone}
            onChangeText={onChangePhone}
            keyboardType="phone-pad"
            placeholder="+263700000000"
          />
          <Text style={styles.hint}>Use country code format, for example +263700000000.</Text>
          <AppButton title="Save phone number" loading={saving} disabled={!isValidPhone(phone)} onPress={onSave} />
          <AppButton title="Not now" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(17,20,23,0.22)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    backgroundColor: colors.appBackground,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontSize: 24,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
  hint: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
});
