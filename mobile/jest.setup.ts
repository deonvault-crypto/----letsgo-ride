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
