import * as SecureStore from "expo-secure-store";

import type { LocationChoice } from "../contexts/LocationDraftContext";

const STORAGE_KEY = "letsgo_ride_location_memory_v1";
const MAX_RECENT = 5;

export type LocationMemory = {
  home: LocationChoice | null;
  work: LocationChoice | null;
  recent: LocationChoice[];
};

const emptyMemory: LocationMemory = {
  home: null,
  work: null,
  recent: [],
};

function isChoice(value: unknown): value is LocationChoice {
  if (!value || typeof value !== "object") return false;
  const item = value as LocationChoice;
  return Boolean(
    item.address &&
    item.label &&
    item.location &&
    Number.isFinite(item.location.latitude) &&
    Number.isFinite(item.location.longitude),
  );
}

export async function getLocationMemory(): Promise<LocationMemory> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return emptyMemory;
    const parsed = JSON.parse(raw) as Partial<LocationMemory>;
    return {
      home: isChoice(parsed.home) ? parsed.home : null,
      work: isChoice(parsed.work) ? parsed.work : null,
      recent: Array.isArray(parsed.recent) ? parsed.recent.filter(isChoice).slice(0, MAX_RECENT) : [],
    };
  } catch {
    return emptyMemory;
  }
}

async function write(memory: LocationMemory) {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(memory));
  return memory;
}

function samePlace(a: LocationChoice, b: LocationChoice) {
  const sameCoordinates =
    Math.abs(a.location.latitude - b.location.latitude) < 0.00005 &&
    Math.abs(a.location.longitude - b.location.longitude) < 0.00005;
  return sameCoordinates || a.address.trim().toLowerCase() === b.address.trim().toLowerCase();
}

export async function rememberLocation(choice: LocationChoice): Promise<LocationMemory> {
  const current = await getLocationMemory();
  const recent = [choice, ...current.recent.filter((item) => !samePlace(item, choice))].slice(0, MAX_RECENT);
  return write({ ...current, recent });
}

export async function saveNamedLocation(
  kind: "home" | "work",
  choice: LocationChoice,
): Promise<LocationMemory> {
  const current = await getLocationMemory();
  const recent = [choice, ...current.recent.filter((item) => !samePlace(item, choice))].slice(0, MAX_RECENT);
  return write({ ...current, [kind]: choice, recent });
}
