import { Redirect, useLocalSearchParams } from "expo-router";

export default function LegacyPassengerRequestRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/(customer)/request/${id}` as never} />;
}
