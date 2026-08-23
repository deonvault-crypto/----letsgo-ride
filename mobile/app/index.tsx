import { useEffect } from "react";
import { useRouter } from "expo-router";

import { LoadingState } from "../components/states/LoadingState";
import { Screen } from "../components/ui/Screen";
import { getCurrentUser, hasSession, logout } from "../services/authService";

export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    async function decideRoute() {
      const session = await hasSession();

      if (!session) {
        router.replace("/(passenger)/home" as never);
        return;
      }

      try {
        const user = await getCurrentUser();
        if (user.role === "admin") router.replace("/(admin)/dashboard" as never);
        else if (user.role === "driver") router.replace("/(driver)/home" as never);
        else if (user.role === "courier") router.replace("/(courier)/home" as never);
        else if (user.role === "merchant") router.replace("/(merchant)/home" as never);
        else router.replace("/(passenger)/home" as never);
      } catch {
        await logout();
        router.replace("/(passenger)/home" as never);
      }
    }
    decideRoute();
  }, [router]);

  return (
    <Screen showHeader={false}>
      <LoadingState label="Preparing LetsGoRide..." />
    </Screen>
  );
}
