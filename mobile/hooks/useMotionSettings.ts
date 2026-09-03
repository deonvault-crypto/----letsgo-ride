import { useSyncExternalStore } from "react";
import { AccessibilityInfo, AppState } from "react-native";

type MotionSettings = { reduceMotion: boolean; active: boolean };

// Keep content still until the system preference is known. All consumers share
// one pair of native listeners, including long conversation transcripts.
let settings: MotionSettings = { reduceMotion: true, active: AppState.currentState === "active" };
const listeners = new Set<() => void>();
let dispose: (() => void) | undefined;
let preferenceRevision = 0;

function update(next: MotionSettings) {
  if (next.reduceMotion === settings.reduceMotion && next.active === settings.active) return;
  settings = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    update({ ...settings, active: AppState.currentState === "active" });
    const revision = ++preferenceRevision;
    const motionSubscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (reduceMotion) => {
      preferenceRevision++;
      update({ ...settings, reduceMotion });
    });
    const appSubscription = AppState.addEventListener("change", (state) => {
      update({ ...settings, active: state === "active" });
    });
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .then((reduceMotion) => {
        if (revision === preferenceRevision) update({ ...settings, reduceMotion: reduceMotion !== false });
      })
      .catch(() => undefined);
    dispose = () => {
      preferenceRevision++;
      motionSubscription?.remove();
      appSubscription?.remove();
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      dispose?.();
      dispose = undefined;
      settings = { reduceMotion: true, active: AppState.currentState === "active" };
    }
  };
}

function getSnapshot() { return settings; }

export function useMotionSettings() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...snapshot, canAnimate: snapshot.active && !snapshot.reduceMotion };
}
