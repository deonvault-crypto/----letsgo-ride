import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { addVehicle } from "../../services/driverService";

const VEHICLE_TYPES = ["Sedan", "Hatchback", "SUV", "Pickup", "Van", "Minibus"] as const;

export default function DriverVehicleSetupScreen() {
  const router = useRouter();
  const [vehicleType, setVehicleType] = useState<(typeof VEHICLE_TYPES)[number]>("Sedan");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [plate, setPlate] = useState("");
  const [seats, setSeats] = useState("4");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const valid = useMemo(() => {
    const seatCount = Number(seats);
    return make.trim().length >= 2 && model.trim().length >= 1 && color.trim().length >= 2 && plate.trim().length >= 2 && Number.isInteger(seatCount) && seatCount >= 1 && seatCount <= 20;
  }, [color, make, model, plate, seats]);

  function selectType(value: (typeof VEHICLE_TYPES)[number]) {
    setVehicleType(value);
    if (value === "Minibus") setSeats("12");
    else if (value === "Van") setSeats("7");
    else if (value === "SUV") setSeats("5");
    else setSeats("4");
  }

  async function save() {
    if (!valid) return;
    try {
      setSaving(true);
      setError("");
      await addVehicle({
        make: make.trim(),
        model: model.trim(),
        color: color.trim(),
        plate_number: plate.trim().toUpperCase(),
        seats: Number(seats),
      });
      router.replace("/(driver)/home" as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save this vehicle.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Your vehicle" showBack fallbackRoute="/(driver)/home" showNotifications={false} navRole="driver">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>DRIVER SETUP</Text>
        <Text style={styles.title}>What will you drive?</Text>
        <Text style={styles.body}>One quick vehicle step. No registration document is required here.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Vehicle type</Text>
        <View style={styles.typeGrid}>
          {VEHICLE_TYPES.map((item) => {
            const selected = item === vehicleType;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => selectType(item)}
                style={({ pressed }) => [styles.typeChip, selected && styles.typeChipSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.typeText, selected && styles.typeTextSelected]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Vehicle details</Text>
        <Text style={styles.helper}>Selected: {vehicleType}. These details help passengers recognise the correct car.</Text>
        <AppInput label="Make" value={make} onChangeText={setMake} placeholder="Toyota" />
        <AppInput label="Model" value={model} onChangeText={setModel} placeholder="Aqua" />
        <AppInput label="Color" value={color} onChangeText={setColor} placeholder="Black" />
        <AppInput label="Plate number" value={plate} onChangeText={setPlate} autoCapitalize="characters" placeholder="ABC 1234" />
        <AppInput label="Passenger seats" value={seats} onChangeText={setSeats} keyboardType="number-pad" placeholder="4" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton title={saving ? "Saving vehicle…" : "Save vehicle"} loading={saving} disabled={!valid} onPress={save} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 7, paddingVertical: 4 },
  eyebrow: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: v2Theme.colors.ink, fontSize: 30, lineHeight: 34, fontWeight: "900", letterSpacing: -0.8 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 20 },
  card: { gap: 13, borderRadius: 26, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 18 },
  section: { color: v2Theme.colors.ink, fontSize: 19, fontWeight: "900" },
  helper: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { minHeight: 44, minWidth: "30%", flexGrow: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  typeChipSelected: { backgroundColor: v2Theme.colors.ink, borderColor: v2Theme.colors.ink },
  typeText: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  typeTextSelected: { color: "#FFFFFF" },
  error: { color: v2Theme.colors.danger, fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.7 },
});
