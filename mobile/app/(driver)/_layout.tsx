import { Stack } from "expo-router";

import { HailingDriverLocationSync } from "../../components/hailing/HailingDriverLocationSync";
import { DriverWorkspaceProvider } from "../../contexts/DriverWorkspaceContext";

export default function DriverLayout() {
  return (
    <DriverWorkspaceProvider>
      <HailingDriverLocationSync />
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", gestureEnabled: true }}>
        <Stack.Screen name="home" options={{ gestureEnabled: false, animation: "fade" }} />
      </Stack>
    </DriverWorkspaceProvider>
  );
}
