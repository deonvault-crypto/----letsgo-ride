import { Stack } from "expo-router";

export default function CustomerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", gestureEnabled: true }}>
      <Stack.Screen name="home" options={{ gestureEnabled: false, animation: "fade" }} />
    </Stack>
  );
}
