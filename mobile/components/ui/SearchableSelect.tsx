import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { v2Theme } from "../../constants/v2Theme";

export type SelectOption = { id: string; name: string; aliases?: string[] };

export function SearchableSelect({ label, value, options, placeholder, disabled = false, onSelect }: { label: string; value: string; options: SelectOption[]; placeholder?: string; disabled?: boolean; onSelect: (option: SelectOption) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.id === value || option.name === value);
  const results = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return options;
    return options.filter((option) => [option.name, option.id, ...(option.aliases || [])].some((candidate) => candidate.toLowerCase().includes(clean)));
  }, [options, query]);

  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={() => setOpen(true)} style={[styles.control, disabled && styles.disabled]}>
      <Text style={[styles.value, !selected && styles.placeholder]}>{selected?.name || placeholder || "Choose"}</Text>
      <MaterialCommunityIcons name="chevron-down" size={20} color={v2Theme.colors.inkSecondary} />
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close selector" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <View style={styles.header}><Text style={styles.title}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} style={styles.close}><MaterialCommunityIcons name="close" size={22} color={v2Theme.colors.ink} /></Pressable></View>
          <View style={styles.search}><MaterialCommunityIcons name="magnify" size={20} color={v2Theme.colors.inkSecondary} /><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={v2Theme.colors.inkTertiary} style={styles.input} /></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
            {results.map((option) => <Pressable key={option.id} accessibilityRole="button" onPress={() => { onSelect(option); setOpen(false); setQuery(""); }} style={[styles.option, selected?.id === option.id && styles.optionSelected]}><Text style={styles.optionText}>{option.name}</Text>{selected?.id === option.id ? <MaterialCommunityIcons name="check" size={20} color={v2Theme.colors.brandStrong} /> : null}</Pressable>)}
            {results.length === 0 ? <Text style={styles.empty}>No matching option</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({ field: { gap: 5 }, label: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "900", textTransform: "uppercase" }, control: { minHeight: 48, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }, value: { flex: 1, color: v2Theme.colors.ink, fontSize: 11, fontWeight: "700" }, placeholder: { color: v2Theme.colors.inkTertiary }, disabled: { opacity: 0.62 }, backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(14,17,15,0.36)" }, sheet: { maxHeight: "76%", borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: v2Theme.colors.canvas, padding: 18, gap: 12 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { color: v2Theme.colors.ink, fontSize: 21, fontWeight: "900" }, close: { width: 42, height: 42, borderRadius: 15, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" }, search: { minHeight: 50, borderRadius: 16, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }, input: { flex: 1, color: v2Theme.colors.ink, fontSize: 13 }, results: { gap: 6, paddingBottom: 20 }, option: { minHeight: 51, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", backgroundColor: v2Theme.colors.surface, gap: 8 }, optionSelected: { backgroundColor: v2Theme.colors.brandSofter }, optionText: { flex: 1, color: v2Theme.colors.ink, fontSize: 12, fontWeight: "800" }, empty: { color: v2Theme.colors.inkSecondary, textAlign: "center", padding: 22 } });
