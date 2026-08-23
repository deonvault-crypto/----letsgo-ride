import { Stack } from "expo-router";
import { MerchantRestaurantProvider } from "../../contexts/MerchantRestaurantContext";

export default function MerchantLayout() {
  return <MerchantRestaurantProvider><Stack screenOptions={{ headerShown: false, animation: "slide_from_right", gestureEnabled: true }}><Stack.Screen name="home" options={{ gestureEnabled: false, animation: "fade" }} /></Stack></MerchantRestaurantProvider>;
}
