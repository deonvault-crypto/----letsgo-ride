import { UserRole } from "../types/user.types";

export function announcementAction(action: unknown, role?: UserRole | null): { title: string; route: string } | null {
  if (!role) return null;
  if (action === "support") return { title: "Contact support", route: "/(shared)/support" };
  if (action === "app_updates") return { title: "App updates", route: "/(shared)/app-updates" };
  if (role !== "passenger") return null;
  if (action === "ride") return { title: "Book a ride", route: "/(customer)/hail" };
  if (action === "food") return { title: "Browse food", route: "/(customer)/food" };
  if (action === "courier") return { title: "Send a parcel", route: "/(shared)/courier" };
  return null;
}

export function announcementExpired(item: { expired?: boolean; expires_at?: string }, now = Date.now()) {
  if (item.expired) return true;
  if (!item.expires_at) return false;
  const expiry = new Date(item.expires_at).getTime();
  return !Number.isFinite(expiry) || expiry <= now;
}
