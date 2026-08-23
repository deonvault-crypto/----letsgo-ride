import { Redirect } from "expo-router";

export default function LegacyPassengerHomeRedirect() {
  return <Redirect href="/(customer)/home" />;
}
