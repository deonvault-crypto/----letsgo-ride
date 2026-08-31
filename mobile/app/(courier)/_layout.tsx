import { Stack } from "expo-router";

import { CourierBackgroundLocationPrompt } from "../../components/courier/CourierBackgroundLocationPrompt";
import { CourierLocationSync } from "../../components/courier/CourierLocationSync";
import { CourierWorkspaceProvider } from "../../contexts/CourierWorkspaceContext";

export default function CourierLayout() {
  return (
    <CourierWorkspaceProvider>
      <CourierLocationSync />
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", gestureEnabled: true }}>
        <Stack.Screen name="home" options={{ gestureEnabled: false, animation: "fade" }} />
      </Stack>
      <CourierBackgroundLocationPrompt />
    </CourierWorkspaceProvider>
  );
}
