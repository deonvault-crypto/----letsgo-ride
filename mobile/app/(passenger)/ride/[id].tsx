import { Redirect, useLocalSearchParams } from "expo-router";

export default function LegacyPassengerRideRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/(customer)/ride/${id}` as never} />;
}
