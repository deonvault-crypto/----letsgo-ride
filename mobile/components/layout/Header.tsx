import { Href } from "expo-router";

import { AppTopBar } from "./AppTopBar";
import { BrandLogo } from "./BrandLogo";

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return <BrandLogo size={compact ? "small" : "regular"} />;
}

export function Header({
  title,
  showBack,
  fallbackRoute,
  showNotifications,
}: {
  title?: string;
  showBack?: boolean;
  fallbackRoute?: Href;
  showNotifications?: boolean;
}) {
  return (
    <AppTopBar
      title={title}
      showBack={showBack}
      fallbackRoute={fallbackRoute}
      showNotifications={showNotifications}
    />
  );
}
