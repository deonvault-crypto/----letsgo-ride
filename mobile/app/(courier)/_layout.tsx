import { Stack } from "expo-router";

import { CourierWorkspaceProvider } from "../../contexts/CourierWorkspaceContext";

export default function CourierLayout() {
  return (
    <CourierWorkspaceProvider>
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", gestureEnabled: true }}>
        <Stack.Screen name="home" options={{ gestureEnabled: false, animation: "fade" }} />
      </Stack>
    </CourierWorkspaceProvider>
  );
}
