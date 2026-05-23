import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "../../constants/colors";
import { routeCities } from "../../constants/routes";
import { spacing } from "../../constants/spacing";
import { AppButton } from "./AppButton";

type LocationPickerProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
};

export function LocationPicker({ label, value, onChangeText, placeholder }: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const filteredCities = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return routeCities;
    return routeCities.filter((city) => city.toLowerCase().includes(normalized));
  }, [query]);

  function closeWith(valueToSave: string) {
    onChangeText(valueToSave.trim());
    setOpen(false);
  }

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={label} style={styles.field} onPress={() => {
        setQuery("");
        setOpen(true);
      }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, !value && styles.placeholder]}>{value || placeholder || "Select location"}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search or type a location"
              placeholderTextColor={colors.mutedText}
              style={styles.search}
              autoFocus
            />
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={filteredCities}
              keyExtractor={(item) => item}
              style={styles.list}
              renderItem={({ item }) => (
                <Pressable style={styles.option} onPress={() => closeWith(item)}>
                  <Text style={styles.optionText}>{item}</Text>
                </Pressable>
              )}
              ListEmptyComponent={(
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>Use "{query.trim()}"</Text>
                  <AppButton title="Use this location" onPress={() => closeWith(query)} disabled={!query.trim()} />
                </View>
              )}
            />
            {filteredCities.length > 0 ? (
              <AppButton title="Use typed location" variant="secondary" onPress={() => closeWith(query)} disabled={!query.trim()} />
            ) : null}
            <AppButton title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 62,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 4,
  },
  label: {
    color: colors.mutedText,
    fontWeight: "800",
    fontSize: 12,
  },
  value: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 16,
  },
  placeholder: {
    color: colors.mutedText,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(17,20,23,0.2)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "82%",
    backgroundColor: colors.appBackground,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: spacing.xl,
    gap: spacing.md,
  },
  sheetTitle: {
    color: colors.whiteText,
    fontSize: 24,
    fontWeight: "900",
  },
  search: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    color: colors.whiteText,
    fontSize: 16,
  },
  list: {
    maxHeight: 340,
  },
  option: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: {
    color: colors.whiteText,
    fontWeight: "800",
    fontSize: 16,
  },
  empty: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  emptyText: {
    color: colors.mutedText,
  },
});
