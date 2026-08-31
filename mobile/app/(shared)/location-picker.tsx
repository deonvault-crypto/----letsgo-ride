import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LocationPickerMap, LocationPickerMapHandle, MapRegion as Region } from "../../components/maps/LocationPickerMap";
import { LocationSelectionMarker } from "../../components/maps/LocationSelectionMarker";
import { AppNotice } from "../../components/ui/AppNotice";
import { v2Theme } from "../../constants/v2Theme";
import { LocationChoice, useLocationDraft } from "../../contexts/LocationDraftContext";
import { getCurrentDeviceLocation } from "../../services/locationService";
import {
  getLocationMemory,
  rememberLocation,
  saveNamedLocation,
} from "../../services/locationMemoryService";
import type { LocationMemory } from "../../services/locationMemoryService";
import { autocompletePlaces, getPlaceDetail, reverseGeocodeLocation } from "../../services/routingService";
import { PlaceSuggestion } from "../../types/routing.types";

const HARARE_REGION: Region = {
  latitude: -17.824858,
  longitude: 31.053028,
  latitudeDelta: 0.16,
  longitudeDelta: 0.16,
};

const emptyMemory: LocationMemory = { home: null, work: null, recent: [] };
const RIDE_ACCENT = "#111111";
const FOOD_ACCENT = "#B65E16";
const COURIER_ACCENT = "#2E68A2";

type PickerKind = "pickup" | "dropoff" | "food";

export default function LocationPickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: string; flow?: string; focus?: string }>();
  const kind: PickerKind = params.kind === "food" ? "food" : params.kind === "dropoff" ? "dropoff" : "pickup";
  const hailingFlow = params.flow === "hailing";
  const shouldAutoFocus = params.focus === "1";
  const accentColor = hailingFlow ? RIDE_ACCENT : kind === "food" ? FOOD_ACCENT : COURIER_ACCENT;
  const {
    pickup,
    dropoff,
    foodDropoff,
    setPickup,
    setDropoff,
    setFoodDropoff,
  } = useLocationDraft();
  const existing = kind === "pickup" ? pickup : kind === "dropoff" ? dropoff : foodDropoff;
  const mapRef = useRef<LocationPickerMapHandle | null>(null);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const reverseGeneration = useRef(0);
  const initialRegion = useRef<Region>(existing
    ? { ...existing.location, latitudeDelta: 0.018, longitudeDelta: 0.018 }
    : HARARE_REGION);
  const [query, setQuery] = useState(existing?.address || "");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [selected, setSelected] = useState<LocationChoice | null>(existing || null);
  const [memory, setMemory] = useState<LocationMemory>(emptyMemory);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pinLookingUp, setPinLookingUp] = useState(false);
  const [saving, setSaving] = useState<"home" | "work" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLocationMemory().then(setMemory).catch(() => undefined);
    return () => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
    };
  }, []);

  useEffect(() => {
    const clean = query.trim();
    const generation = ++searchGeneration.current;
    if (clean.length < 2 || clean === selected?.address) {
      if (suggestions.length > 0) setSuggestions([]);
      if (searching) setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        setError(null);
        const nextSuggestions = await autocompletePlaces(clean);
        if (generation === searchGeneration.current) setSuggestions(nextSuggestions);
      } catch (err) {
        if (generation === searchGeneration.current) {
          setSuggestions([]);
          setError(err instanceof Error ? err.message : "Unable to search places right now.");
        }
      } finally {
        if (generation === searchGeneration.current) setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, selected?.address]);

  function focusMap(choice: LocationChoice) {
    mapRef.current?.focus({
      ...choice.location,
      latitudeDelta: 0.018,
      longitudeDelta: 0.018,
    });
  }

  function useChoice(choice: LocationChoice, expectedSelectionGeneration?: number) {
    if (expectedSelectionGeneration !== undefined && expectedSelectionGeneration !== selectionGeneration.current) return false;
    if (expectedSelectionGeneration === undefined) selectionGeneration.current += 1;
    reverseGeneration.current += 1;
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    setSelected(choice);
    setQuery(choice.address);
    setSuggestions([]);
    setError(null);
    focusMap(choice);
    return true;
  }

  async function chooseSuggestion(suggestion: PlaceSuggestion) {
    const generation = ++selectionGeneration.current;
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
      useChoice(choice, generation);
    } catch (err) {
      if (generation === selectionGeneration.current) {
        setError(err instanceof Error ? err.message : "Unable to open that place.");
      }
    } finally {
      if (generation === selectionGeneration.current) setResolving(false);
    }
  }

  async function useCurrentLocation() {
    const selection = ++selectionGeneration.current;
    try {
      setLocating(true);
      setError(null);
      const current = await getCurrentDeviceLocation();
      if (selection !== selectionGeneration.current) return;
      const coordinate = { latitude: current.latitude, longitude: current.longitude };
      const choice: LocationChoice = {
        label: "Current location",
        address: "Finding the nearest address…",
        location: coordinate,
        placeId: null,
      };
      if (!useChoice(choice, selection)) return;
      const generation = ++reverseGeneration.current;
      setPinLookingUp(true);
      try {
        const result = await reverseGeocodeLocation(coordinate);
        if (generation === reverseGeneration.current) {
          const resolved = {
            label: result.formatted_address.split(",")[0] || "Current location",
            address: result.formatted_address,
            location: coordinate,
            placeId: result.place_id,
          };
          setSelected(resolved);
          setQuery(resolved.address);
        }
      } catch {
        if (generation === reverseGeneration.current) {
          setSelected({ ...choice, address: "Current map location" });
          setQuery("Current map location");
        }
      } finally {
        if (generation === reverseGeneration.current) setPinLookingUp(false);
      }
    } catch (err) {
      if (selection === selectionGeneration.current) {
        setError(err instanceof Error ? err.message : "Unable to get your current location.");
      }
    } finally {
      if (selection === selectionGeneration.current) setLocating(false);
    }
  }

  const adjustPin = useCallback((latitude: number, longitude: number) => {
    selectionGeneration.current += 1;
    const generation = ++reverseGeneration.current;
    const next: LocationChoice = {
      label: "Pinned location",
      address: "Finding the nearest address…",
      location: { latitude, longitude },
      placeId: null,
    };
    setSelected(next);
    setQuery("");
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    reverseTimer.current = setTimeout(async () => {
      try {
        if (generation !== reverseGeneration.current) return;
        setPinLookingUp(true);
        const result = await reverseGeocodeLocation({ latitude, longitude });
        const resolved: LocationChoice = {
          label: result.formatted_address.split(",")[0] || "Pinned location",
          address: result.formatted_address,
          location: { latitude, longitude },
          placeId: result.place_id,
        };
        if (generation === reverseGeneration.current) {
          setSelected(resolved);
          setQuery(resolved.address);
        }
      } catch {
        if (generation === reverseGeneration.current) {
          setSelected({ ...next, address: "Pinned map location" });
          setQuery("Pinned map location");
        }
      } finally {
        if (generation === reverseGeneration.current) setPinLookingUp(false);
      }
    }, 280);
  }, []);

  const mapSettled = useCallback((region: Region) => {
    adjustPin(region.latitude, region.longitude);
  }, [adjustPin]);

  const mapMovementStarted = useCallback(() => {
    selectionGeneration.current += 1;
    reverseGeneration.current += 1;
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    setPinLookingUp(false);
  }, []);

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

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (hailingFlow) {
      router.replace("/(customer)/hail" as never);
      return;
    }
    router.replace((kind === "food" ? "/(shared)/food/checkout" : "/(shared)/courier") as never);
  }

  async function confirm() {
    if (!selected) {
      setError("Search for a place, use your location, or place the pin first.");
      return;
    }

    if (kind === "pickup") setPickup(selected);
    else if (kind === "dropoff") setDropoff(selected);
    else setFoodDropoff(selected);
    rememberLocation(selected).catch(() => undefined);

    if (hailingFlow && kind === "pickup") {
      router.replace("/(shared)/location-picker?kind=dropoff&flow=hailing" as never);
      return;
    }
    if (hailingFlow && kind === "dropoff") {
      router.replace("/(customer)/hail" as never);
      return;
    }
    router.back();
  }

  const showShortcuts = suggestions.length === 0 && query.trim().length < 2;
  const screenTitle = kind === "pickup" ? "Choose pickup" : kind === "dropoff" ? "Choose destination" : "Delivery location";
  const eyebrow = kind === "pickup" ? "PICKUP" : kind === "dropoff" ? "DESTINATION" : "DELIVERY";
  const markerLabel = kind === "pickup" ? "Selected pickup coordinate" : kind === "dropoff" ? "Selected destination coordinate" : "Selected delivery coordinate";

  return (
    <View style={styles.root}>
      <LocationPickerMap
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion.current}
        onMovementStart={mapMovementStarted}
        onRegionChangeComplete={mapSettled}
      />

      {Platform.OS !== "web" ? <LocationSelectionMarker accessibilityLabel={markerLabel} /> : null}

      <View pointerEvents="box-none" style={[styles.topLayer, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={goBack}
            hitSlop={8}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="chevron-left" size={27} color={v2Theme.colors.ink} />
          </Pressable>
          <View style={styles.titlePill}>
            <Text style={styles.screenTitle}>{screenTitle}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.searchCard}>
          <MaterialCommunityIcons name="magnify" size={22} color={v2Theme.colors.inkSecondary} />
          <TextInput
            value={query}
            onChangeText={(value) => {
              selectionGeneration.current += 1;
              reverseGeneration.current += 1;
              if (reverseTimer.current) clearTimeout(reverseTimer.current);
              setPinLookingUp(false);
              setQuery(value);
              if (value !== selected?.address) setSelected(null);
            }}
            placeholder="Search a place, street or landmark"
            placeholderTextColor={v2Theme.colors.inkTertiary}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus={shouldAutoFocus}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {searching || resolving ? <ActivityIndicator size="small" color={accentColor} /> : null}
        </View>

        {suggestions.length > 0 ? (
          <View style={styles.resultsCard}>
            {suggestions.slice(0, 5).map((item, index) => (
              <Pressable
                key={item.place_id || `${item.description}-${index}`}
                accessibilityRole="button"
                onPress={() => chooseSuggestion(item)}
                style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
              >
                <View style={styles.resultIcon}>
                  <MaterialCommunityIcons name="map-marker-outline" size={20} color={v2Theme.colors.ink} />
                </View>
                <View style={styles.resultCopy}>
                  <Text numberOfLines={1} style={styles.resultTitle}>{item.primary_text}</Text>
                  <Text numberOfLines={1} style={styles.resultBody}>{item.secondary_text || item.description}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={locating}
              onPress={useCurrentLocation}
              style={({ pressed }) => [styles.currentPill, pressed && styles.pressed]}
            >
              {locating
                ? <ActivityIndicator size="small" color={accentColor} />
                : <MaterialCommunityIcons name="crosshairs-gps" size={19} color={accentColor} />}
              <Text style={styles.currentPillText}>{locating ? "Finding you…" : "Use my current location"}</Text>
            </Pressable>

            {showShortcuts && (memory.home || memory.work || memory.recent.length > 0) ? (
              <View style={styles.shortcutsCard}>
                {memory.home ? <QuickPlace icon="home-outline" label="Home" choice={memory.home} onPress={useChoice} accentColor={accentColor} /> : null}
                {memory.work ? <QuickPlace icon="briefcase-outline" label="Work" choice={memory.work} onPress={useChoice} accentColor={accentColor} /> : null}
                {memory.recent.slice(0, 1).map((choice, index) => (
                  <QuickPlace key={`${choice.address}-${index}`} icon="history" label="Recent" choice={choice} onPress={useChoice} accentColor={accentColor} />
                ))}
              </View>
            ) : null}
          </>
        )}

        {error ? <View style={styles.noticeWrap}><AppNotice message={error} onDismiss={() => setError(null)} /></View> : null}
      </View>

      {pinLookingUp && Platform.OS !== "web" ? (
        <View pointerEvents="none" style={[styles.mapStatus, { bottom: 188 + insets.bottom }]}>
          <ActivityIndicator size="small" color={accentColor} />
          <Text style={styles.mapStatusText}>Finding this address…</Text>
        </View>
      ) : null}

      <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 12) + 10 }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.selectedCopy}>
          <Text style={[styles.selectedEyebrow, { color: accentColor }]}>{eyebrow}</Text>
          <Text numberOfLines={1} style={styles.selectedTitle}>{selected?.label || "Choose a location"}</Text>
          <Text numberOfLines={2} style={styles.selectedBody}>
            {selected?.address || "Search above, use your location, or move the map to the exact spot."}
          </Text>
        </View>

        {selected ? (
          <View style={styles.saveRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => saveAs("home")}
              disabled={Boolean(saving)}
              style={({ pressed }) => [styles.saveChip, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="home-outline" size={16} color={v2Theme.colors.ink} />
              <Text numberOfLines={1} style={styles.saveChipText}>
                {saving === "home" ? "Saving…" : memory.home?.address === selected.address ? "Home saved" : "Save Home"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => saveAs("work")}
              disabled={Boolean(saving)}
              style={({ pressed }) => [styles.saveChip, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="briefcase-outline" size={16} color={v2Theme.colors.ink} />
              <Text numberOfLines={1} style={styles.saveChipText}>
                {saving === "work" ? "Saving…" : memory.work?.address === selected.address ? "Work saved" : "Save Work"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!selected}
          onPress={confirm}
          style={({ pressed }) => [styles.confirmButton, { backgroundColor: accentColor }, !selected && styles.disabled, pressed && selected && styles.pressed]}
        >
          <Text style={styles.confirmText}>
            {kind === "pickup" && hailingFlow ? "Confirm pickup" : kind === "dropoff" && hailingFlow ? "Confirm destination" : "Use this location"}
          </Text>
          <MaterialCommunityIcons name="arrow-right" size={21} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

function QuickPlace({
  icon,
  label,
  choice,
  onPress,
  accentColor,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  choice: LocationChoice;
  onPress: (choice: LocationChoice) => void;
  accentColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(choice)}
      style={({ pressed }) => [styles.quickPlace, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={17} color={accentColor} />
      <Text style={styles.quickPlaceLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: v2Theme.colors.surfaceMuted },
  map: { ...StyleSheet.absoluteFillObject },
  topLayer: { position: "absolute", left: 14, right: 14, top: 0, zIndex: 20 },
  headerRow: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.96)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(12,17,13,0.10)", shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.08, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  titlePill: { minHeight: 42, maxWidth: "64%", paddingHorizontal: 18, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.96)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(12,17,13,0.08)" },
  screenTitle: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  headerSpacer: { width: 44, height: 44 },
  searchCard: { marginTop: 10, minHeight: 56, borderRadius: 20, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.98)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(12,17,13,0.10)", shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.09, shadowRadius: 13, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  searchInput: { flex: 1, color: v2Theme.colors.ink, fontSize: 15, fontWeight: "700", paddingVertical: 11 },
  currentPill: { alignSelf: "flex-start", minHeight: 42, marginTop: 9, paddingHorizontal: 13, borderRadius: 21, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(12,17,13,0.09)" },
  currentPillText: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  shortcutsCard: { alignSelf: "flex-start", marginTop: 8, padding: 6, borderRadius: 18, flexDirection: "row", flexWrap: "wrap", gap: 5, backgroundColor: "rgba(255,255,255,0.94)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(12,17,13,0.08)" },
  quickPlace: { minHeight: 35, paddingHorizontal: 10, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: v2Theme.colors.surfaceMuted },
  quickPlaceLabel: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  resultsCard: { marginTop: 7, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.99)", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden", shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 8 },
  resultRow: { minHeight: 58, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line },
  resultIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: v2Theme.colors.surfaceMuted },
  resultCopy: { flex: 1, gap: 2 },
  resultTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  resultBody: { color: v2Theme.colors.inkSecondary, fontSize: 10 },
  noticeWrap: { marginTop: 8 },
  mapStatus: { position: "absolute", alignSelf: "center", zIndex: 10, minHeight: 38, paddingHorizontal: 12, borderRadius: 19, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(12,17,13,0.08)" },
  mapStatusText: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" },
  bottomSheet: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 15, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 9, paddingHorizontal: 18, gap: 10, backgroundColor: "rgba(255,255,255,0.985)", borderTopWidth: StyleSheet.hairlineWidth, borderColor: "rgba(12,17,13,0.10)", shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.11, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
  sheetHandle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: v2Theme.colors.lineStrong, marginBottom: 1 },
  selectedCopy: { gap: 2 },
  selectedEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.15 },
  selectedTitle: { color: v2Theme.colors.ink, fontSize: 19, lineHeight: 23, fontWeight: "900", letterSpacing: -0.35 },
  selectedBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16 },
  saveRow: { flexDirection: "row", gap: 7 },
  saveChip: { flex: 1, minHeight: 36, borderRadius: 14, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: v2Theme.colors.surfaceMuted },
  saveChipText: { flexShrink: 1, color: v2Theme.colors.ink, fontSize: 9, fontWeight: "900" },
  confirmButton: { minHeight: 54, borderRadius: 18, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  confirmText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.992 }] },
});