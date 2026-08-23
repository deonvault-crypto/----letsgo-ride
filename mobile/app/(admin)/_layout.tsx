import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", gestureEnabled: true }}>
      <Stack.Screen name="dashboard" options={{ gestureEnabled: false, animation: "fade" }} />
    </Stack>
  );
}
