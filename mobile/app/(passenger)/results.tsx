import { Redirect, useLocalSearchParams } from "expo-router";

export default function LegacyPassengerResultsRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();
  return <Redirect href={{ pathname: "/(customer)/results", params } as never} />;
}
