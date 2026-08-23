import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function LegacyCourierDetailRedirect() {
  const router = useRouter();
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();

  useEffect(() => {
    if (deliveryId) router.replace(`/(customer)/courier/${deliveryId}` as never);
  }, [deliveryId, router]);

  return null;
}
