import { Stack } from "expo-router";

export default function DriverLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="home" options={{ gestureEnabled: false, animation: "fade" }} />
    </Stack>
  );
}
