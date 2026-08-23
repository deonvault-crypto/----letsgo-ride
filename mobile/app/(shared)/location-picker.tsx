import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { LocationChoice, useLocationDraft } from "../../contexts/LocationDraftContext";
import { getCurrentDeviceLocation } from "../../services/locationService";
import {
  getLocationMemory,
  rememberLocation,
  saveNamedLocation,
} from "../../services/locationMemoryService";
import type { LocationMemory } from "../../services/locationMemoryService";
import { autocompletePlaces, getPlaceDetail } from "../../services/routingService";
import { PlaceSuggestion } from "../../types/routing.types";

const HARARE_REGION: Region = {
  latitude: -17.824858,
  longitude: 31.053028,
  latitudeDelta: 0.16,
  longitudeDelta: 0.16,
};

const emptyMemory: LocationMemory = { home: null, work: null, recent: [] };

export default function LocationPickerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === "dropoff" ? "dropoff" : "pickup";
  const { pickup, dropoff, setPickup, setDropoff } = useLocationDraft();
  const existing = kind === "pickup" ? pickup : dropoff;
  const mapRef = useRef<MapView | null>(null);
  const [query, setQuery] = useState(existing?.address || "");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [selected, setSelected] = useState<LocationChoice | null>(existing || null);
  const [memory, setMemory] = useState<LocationMemory>(emptyMemory);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState<"home" | "work" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLocationMemory().then(setMemory).catch(() => undefined);
  }, []);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2 || clean === selected?.address) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        setError(null);
        setSuggestions(await autocompletePlaces(clean));
      } catch (err) {
        setSuggestions([]);
        setError(err instanceof Error ? err.message : "Unable to search places right now.");
      } finally {
        setSearching(false);
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [query, selected?.address]);

  function focusMap(choice: LocationChoice) {
    mapRef.current?.animateToRegion(
      {
        ...choice.location,
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      },
      320,
    );
  }

  function useChoice(choice: LocationChoice) {
    setSelected(choice);
    setQuery(choice.address);
    setSuggestions([]);
    setError(null);
    focusMap(choice);
  }

  async function chooseSuggestion(suggestion: PlaceSuggestion) {
    try {
      setResolving(true);
      setError(null);
      let choice: LocationChoice;
      if (suggestion.location) {
        choice = {
          label: suggestion.primary_text,
          address: suggestion.description,
          location: suggestion.location,
          placeId: suggestion.place_id,
        };
      } else {
        if (!suggestion.place_id) throw new Error("That place could not be opened.");
        const detail = await getPlaceDetail(suggestion.place_id);
        choice = {
          label: detail.display_name || suggestion.primary_text,
          address: detail.formatted_address,
          location: detail.location,
          placeId: detail.place_id,
        };
      }
      useChoice(choice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open that place.");
    } finally {
      setResolving(false);
    }
  }

  async function useCurrentLocation() {
    try {
      setLocating(true);
      setError(null);
      const current = await getCurrentDeviceLocation();
      const choice: LocationChoice = {
        label: "Current location",
        address: "Current location",
        location: { latitude: current.latitude, longitude: current.longitude },
        placeId: null,
      };
      useChoice(choice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to get your current location.");
    } finally {
      setLocating(false);
    }
  }

  function adjustPin(latitude: number, longitude: number) {
    const base = selected || {
      label: "Pinned location",
      address: "Pinned location",
      location: { latitude, longitude },
      placeId: null,
    };
    const next: LocationChoice = {
      ...base,
      label: base.label === "Current location" ? "Pinned current location" : base.label,
      address: base.address === "Current location" ? "Pinned current location" : base.address,
      location: { latitude, longitude },
      placeId: null,
    };
    setSelected(next);
  }

  async function saveAs(placeKind: "home" | "work") {
    if (!selected || saving) return;
    try {
      setSaving(placeKind);
      setMemory(await saveNamedLocation(placeKind, selected));
    } catch {
      setError(`Unable to save ${placeKind} right now.`);
    } finally {
      setSaving(null);
    }
  }

  async function confirm() {
    if (!selected) {
      setError("Search for a place, use your location, or place the pin first.");
      return;
    }
    if (kind === "pickup") setPickup(selected);
    else setDropoff(selected);
    rememberLocation(selected).catch(() => undefined);
    router.back();
  }

  const initialRegion = selected
    ? { ...selected.location, latitudeDelta: 0.018, longitudeDelta: 0.018 }
    : HARARE_REGION;
  const showShortcuts = suggestions.length === 0 && query.trim().length < 2;

  return (
    <Screen
      title={kind === "pickup" ? "Choose pickup" : "Choose drop-off"}
      showBack
      fallbackRoute="/(shared)/courier"
      showNotifications={false}
      scroll={false}
    >
      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <MaterialCommunityIcons name="magnify" size={22} color={v2Theme.colors.inkSecondary} />
          <TextInput
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              if (value !== selected?.address) setSelected(null);
            }}
            placeholder="Search a place, street or landmark"
            placeholderTextColor={v2Theme.colors.inkTertiary}
            autoCapitalize="words"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {searching || resolving ? <ActivityIndicator size="small" color={v2Theme.colors.brandStrong} /> : null}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={locating}
          onPress={useCurrentLocation}
          style={({ pressed }) => [styles.currentRow, pressed && styles.pressed]}
        >
          <View style={styles.currentIcon}>
            <MaterialCommunityIcons name="crosshairs-gps" size={20} color={v2Theme.colors.brandStrong} />
          </View>
          <View style={styles.currentCopy}>
            <Text style={styles.currentTitle}>{locating ? "Finding you…" : "Use my current location"}</Text>
            <Text style={styles.currentBody}>Best when the street address is hard to describe</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={v2Theme.colors.inkTertiary} />
        </Pressable>
      </View>

      {showShortcuts && (memory.home || memory.work || memory.recent.length > 0) ? (
        <View style={styles.shortcutsCard}>
          <Text style={styles.shortcutsTitle}>Quick places</Text>
          <View style={styles.shortcutRowWrap}>
            {memory.home ? <QuickPlace icon="home-outline" label="Home" choice={memory.home} onPress={useChoice} /> : null}
            {memory.work ? <QuickPlace icon="briefcase-outline" label="Work" choice={memory.work} onPress={useChoice} /> : null}
            {memory.recent.slice(0, 3).map((choice, index) => (
              <QuickPlace key={`${choice.address}-${index}`} icon="history" label={index === 0 ? "Recent" : "Recent place"} choice={choice} onPress={useChoice} />
            ))}
          </View>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {suggestions.length > 0 ? (
        <View style={styles.resultsCard}>
          {suggestions.slice(0, 6).map((item, index) => (
            <Pressable
              key={item.place_id || `${item.description}-${index}`}
              accessibilityRole="button"
              onPress={() => chooseSuggestion(item)}
              style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
            >
              <View style={styles.resultIcon}>
                <MaterialCommunityIcons name="map-marker-outline" size={21} color={v2Theme.colors.ink} />
              </View>
              <View style={styles.resultCopy}>
                <Text numberOfLines={1} style={styles.resultTitle}>{item.primary_text}</Text>
                <Text numberOfLines={2} style={styles.resultBody}>{item.secondary_text || item.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.mapCard}>
        <MapView ref={mapRef} style={styles.map} initialRegion={initialRegion}>
          {selected ? (
            <Marker
              coordinate={selected.location}
              draggable
              onDragEnd={(event) => adjustPin(event.nativeEvent.coordinate.latitude, event.nativeEvent.coordinate.longitude)}
              pinColor={v2Theme.colors.brandStrong}
            />
          ) : null}
        </MapView>
        <View pointerEvents="none" style={styles.mapHint}>
          <MaterialCommunityIcons name="gesture-tap-hold" size={18} color={v2Theme.colors.inkSecondary} />
          <Text style={styles.mapHintText}>Drag the pin to the exact gate or pickup point</Text>
        </View>
      </View>

      <View style={styles.confirmArea}>
        <View style={styles.selectedCopy}>
          <Text style={styles.selectedEyebrow}>{kind === "pickup" ? "PICKUP" : "DROP-OFF"}</Text>
          <Text numberOfLines={1} style={styles.selectedTitle}>{selected?.label || "Choose a location"}</Text>
          <Text numberOfLines={2} style={styles.selectedBody}>
            {selected?.address || "Search above or use your current GPS position."}
          </Text>
        </View>

        {selected ? (
          <View style={styles.saveRow}>
            <Pressable accessibilityRole="button" onPress={() => saveAs("home")} disabled={Boolean(saving)} style={({ pressed }) => [styles.saveChip, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="home-outline" size={17} color={v2Theme.colors.ink} />
              <Text style={styles.saveChipText}>{saving === "home" ? "Saving…" : memory.home && memory.home.address === selected.address ? "Home saved" : "Save as Home"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => saveAs("work")} disabled={Boolean(saving)} style={({ pressed }) => [styles.saveChip, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="briefcase-outline" size={17} color={v2Theme.colors.ink} />
              <Text style={styles.saveChipText}>{saving === "work" ? "Saving…" : memory.work && memory.work.address === selected.address ? "Work saved" : "Save as Work"}</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!selected}
          onPress={confirm}
          style={({ pressed }) => [styles.confirmButton, !selected && styles.disabled, pressed && selected && styles.pressed]}
        >
          <Text style={styles.confirmText}>Use this location</Text>
          <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </Screen>
  );
}

function QuickPlace({
  icon,
  label,
  choice,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  choice: LocationChoice;
  onPress: (choice: LocationChoice) => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={() => onPress(choice)} style={({ pressed }) => [styles.quickPlace, pressed && styles.pressed]}>
      <View style={styles.quickPlaceIcon}><MaterialCommunityIcons name={icon} size={19} color={v2Theme.colors.brandStrong} /></View>
      <View style={styles.quickPlaceCopy}>
        <Text style={styles.quickPlaceLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.quickPlaceAddress}>{choice.label || choice.address}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden" },
  searchRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: v2Theme.colors.ink, fontSize: 15, fontWeight: "700", paddingVertical: 12 },
  currentRow: { minHeight: 66, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 13 },
  currentIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  currentCopy: { flex: 1, gap: 2 }, currentTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" }, currentBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 14 },
  shortcutsCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 12, gap: 9 },
  shortcutsTitle: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" }, shortcutRowWrap: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  quickPlace: { minWidth: 145, flexGrow: 1, flexBasis: "46%", borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 }, quickPlaceIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, quickPlaceCopy: { flex: 1, gap: 2 }, quickPlaceLabel: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" }, quickPlaceAddress: { color: v2Theme.colors.inkSecondary, fontSize: 8, lineHeight: 12 },
  errorCard: { borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 11, flexDirection: "row", gap: 8, alignItems: "center" }, errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  resultsCard: { position: "absolute", left: 0, right: 0, top: 136, zIndex: 20, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden", shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  resultRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line }, resultIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, resultCopy: { flex: 1, gap: 2 }, resultTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" }, resultBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 14 },
  mapCard: { flex: 1, minHeight: 300, borderRadius: v2Theme.radius.xxl, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, backgroundColor: v2Theme.colors.surfaceMuted }, map: { flex: 1 },
  mapHint: { position: "absolute", left: 12, right: 12, bottom: 12, minHeight: 42, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.94)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12 }, mapHintText: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" },
  confirmArea: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 12 }, selectedCopy: { gap: 3 }, selectedEyebrow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1 }, selectedTitle: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" }, selectedBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16 },
  saveRow: { flexDirection: "row", gap: 8 }, saveChip: { flex: 1, minHeight: 42, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }, saveChipText: { color: v2Theme.colors.ink, fontSize: 9, fontWeight: "900" },
  confirmButton: { minHeight: 52, borderRadius: 18, backgroundColor: v2Theme.colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 17 }, confirmText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" }, disabled: { opacity: 0.4 }, pressed: { opacity: 0.72 },
});
