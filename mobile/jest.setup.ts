import { expect } from "@jest/globals";
import * as matchers from "@testing-library/react-native/matchers";
import type { ReactNode } from "react";

expect.extend(matchers);

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) => name,
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExpoPushToken[test]" })),
}));

jest.mock("expo-task-manager", () => ({
  isTaskDefined: jest.fn(() => false),
  defineTask: jest.fn(),
}));

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3, High: 4 },
  ActivityType: { AutomotiveNavigation: 1 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: -17.8252, longitude: 31.0335, accuracy: 20, heading: null, speed: null },
  })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));

jest.mock("react-native-maps", () => {
  const { View } = jest.requireActual("react-native");
  const Marker = View as typeof View & { Animated?: typeof View };
  Marker.Animated = View;
  class AnimatedRegion {
    timing() { return { start: jest.fn(), stop: jest.fn(), reset: jest.fn() }; }
  }
  return {
    __esModule: true,
    default: View,
    Marker,
    Polyline: View,
    AnimatedRegion,
  };
});

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { version: "1.0.0", extra: { eas: { projectId: "test-project" } } },
    easConfig: { projectId: "test-project" },
  },
}));
