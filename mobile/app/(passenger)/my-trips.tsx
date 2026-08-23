import { Redirect } from "expo-router";

export default function LegacyPassengerTripsRedirect() {
  return <Redirect href="/(customer)/my-trips" />;
}
