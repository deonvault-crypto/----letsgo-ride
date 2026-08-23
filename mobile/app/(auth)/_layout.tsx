import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", gestureEnabled: true }}>
      <Stack.Screen name="welcome" options={{ gestureEnabled: false, animation: "fade" }} />
    </Stack>
  );
}
