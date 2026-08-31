import { Stack } from "expo-router";

import { DriverBackgroundLocationPrompt } from "../../components/hailing/DriverBackgroundLocationPrompt";
import { HailingDriverLocationSync } from "../../components/hailing/HailingDriverLocationSync";
import { DriverWorkspaceProvider } from "../../contexts/DriverWorkspaceContext";

export const unstable_settings = {
  initialRouteName: "home",
};

export default function DriverLayout() {
  return (
    <DriverWorkspaceProvider>
      <HailingDriverLocationSync />
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", gestureEnabled: true }}>
        <Stack.Screen name="home" options={{ gestureEnabled: false, animation: "fade" }} />
      </Stack>
      <DriverBackgroundLocationPrompt />
    </DriverWorkspaceProvider>
  );
}
