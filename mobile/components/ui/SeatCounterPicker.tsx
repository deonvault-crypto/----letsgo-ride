import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { AppButton } from "./AppButton";

type SeatCounterPickerProps = {
  visible: boolean;
  title: string;
  value: number;
  min: number;
  max: number;
  helperText: string;
  confirmLabel?: string;
  onConfirm: (value: number) => void;
  onClose: () => void;
};

export function SeatCounterPicker({
  visible,
  title,
  value,
  min,
  max,
  helperText,
  confirmLabel = "Confirm",
  onConfirm,
  onClose,
}: SeatCounterPickerProps) {
  const [draft, setDraft] = useState(clamp(value || min, min, max));

  useEffect(() => {
    if (visible) setDraft(clamp(value || min, min, max));
  }, [visible, value, min, max]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={21} color={colors.whiteText} />
            </Pressable>
          </View>
          <Text style={styles.helper}>{helperText}</Text>
          <View style={styles.counterRow}>
            <CounterButton icon="minus" disabled={draft <= min} onPress={() => setDraft((current) => clamp(current - 1, min, max))} />
            <Text style={styles.number}>{draft}</Text>
            <CounterButton icon="plus" disabled={draft >= max} onPress={() => setDraft((current) => clamp(current + 1, min, max))} />
          </View>
          <Text style={styles.range}>Choose between {min} and {max}.</Text>
          <AppButton title={confirmLabel} onPress={() => onConfirm(draft)} />
          <AppButton title="Cancel" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function CounterButton({ icon, disabled, onPress }: { icon: "minus" | "plus"; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon === "plus" ? "Increase seats" : "Decrease seats"}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.counterButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={28} color={disabled ? colors.mutedText : colors.primaryGreen} />
    </Pressable>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(17,20,23,0.24)",
  },
  sheet: {
    backgroundColor: colors.appBackground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: colors.whiteText,
    fontSize: 25,
    fontWeight: "900",
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  helper: {
    color: colors.mutedText,
    lineHeight: 22,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
    paddingVertical: spacing.md,
  },
  counterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  number: {
    minWidth: 72,
    textAlign: "center",
    color: colors.whiteText,
    fontSize: 58,
    fontWeight: "900",
  },
  range: {
    color: colors.mutedText,
    textAlign: "center",
    fontWeight: "700",
  },
});
