import * as SecureStore from "expo-secure-store";

const LOCATION_REMINDER_KEY = "permission-reminder:location-until";

export async function locationReminderDue() {
  const value = await SecureStore.getItemAsync(LOCATION_REMINDER_KEY);
  const until = Number(value || 0);
  return !Number.isFinite(until) || Date.now() >= until;
}

export async function snoozeLocationReminder(days = 7) {
  const until = Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000;
  await SecureStore.setItemAsync(LOCATION_REMINDER_KEY, String(until));
}

export async function clearLocationReminderSnooze() {
  await SecureStore.deleteItemAsync(LOCATION_REMINDER_KEY);
}
