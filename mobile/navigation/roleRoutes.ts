import type { Href } from "expo-router";

import type { UserRole } from "../types/user.types";

export type ProductNavRole = "customer" | "driver" | "courier" | "merchant";
export type RoleShellGroup = "(customer)" | "(driver)" | "(courier)" | "(merchant)" | "(admin)";

const ROLE_HOME: Record<UserRole, Href> = {
  passenger: "/(customer)/home",
  driver: "/(driver)/home",
  courier: "/(courier)/home",
  merchant: "/(merchant)/home",
  admin: "/(admin)/dashboard",
};

const ROLE_GROUP: Record<UserRole, RoleShellGroup> = {
  passenger: "(customer)",
  driver: "(driver)",
  courier: "(courier)",
  merchant: "(merchant)",
  admin: "(admin)",
};

const PRODUCT_HOME: Record<ProductNavRole, Href> = {
  customer: ROLE_HOME.passenger,
  driver: ROLE_HOME.driver,
  courier: ROLE_HOME.courier,
  merchant: ROLE_HOME.merchant,
};

const PRODUCT_ACCOUNT: Record<ProductNavRole, Href> = {
  customer: "/(shared)/account",
  driver: "/(driver)/account",
  courier: "/(courier)/account",
  merchant: "/(merchant)/account",
};

const GROUP_HOME: Partial<Record<string, Href>> = {
  "(customer)": ROLE_HOME.passenger,
  "(driver)": ROLE_HOME.driver,
  "(courier)": ROLE_HOME.courier,
  "(merchant)": ROLE_HOME.merchant,
};

const ROOT_ROUTES: Record<string, ReadonlySet<string>> = {
  "(customer)": new Set(["home"]),
  "(driver)": new Set(["home", "trips", "post-trip", "availability", "account"]),
  "(courier)": new Set(["home", "offers", "schedule", "earnings", "account"]),
  "(merchant)": new Set(["home", "menu", "store", "insights", "account"]),
  "(shared)": new Set(["services", "activity", "account"]),
};

const ROLE_SHELL_GROUPS = new Set<RoleShellGroup>([
  "(customer)",
  "(driver)",
  "(courier)",
  "(merchant)",
  "(admin)",
]);

export function homeRouteForRole(role?: UserRole | null): Href {
  return ROLE_HOME[role ?? "passenger"];
}

export function shellGroupForRole(role?: UserRole | null): RoleShellGroup {
  return ROLE_GROUP[role ?? "passenger"];
}

export function isRoleShellGroup(group?: string): group is RoleShellGroup {
  return ROLE_SHELL_GROUPS.has(group as RoleShellGroup);
}

export function productHomeRoute(role?: ProductNavRole): Href | undefined {
  return role ? PRODUCT_HOME[role] : undefined;
}

export function productAccountRoute(role?: ProductNavRole): Href | undefined {
  return role ? PRODUCT_ACCOUNT[role] : undefined;
}

export function groupHomeRoute(group?: string): Href | undefined {
  return group ? GROUP_HOME[group] : undefined;
}

export function productRoleFromParam(value?: string): Exclude<ProductNavRole, "customer"> | undefined {
  return value === "driver" || value === "courier" || value === "merchant" ? value : undefined;
}

export function isProductGroup(group?: string): boolean {
  return Boolean(group && ROOT_ROUTES[group]);
}

export function isProductRootRoute(group: string | undefined, routeName: string): boolean {
  return Boolean(group && ROOT_ROUTES[group]?.has(routeName));
}
