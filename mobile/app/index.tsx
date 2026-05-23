import { useEffect } from "react";
import { useRouter } from "expo-router";

import { LoadingState } from "../components/states/LoadingState";
import { Screen } from "../components/ui/Screen";
import { hasSession } from "../services/authService";

export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    async function decideRoute() {
      const session = await hasSession();
      router.replace(session ? ("/(passenger)/home" as never) : ("/(auth)/welcome" as never));
    }
    decideRoute();
  }, [router]);

  return (
    <Screen showHeader={false}>
      <LoadingState label="Preparing LetsGo Ride..." />
    </Screen>
  );
}
