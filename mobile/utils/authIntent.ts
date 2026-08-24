import type { Href } from "expo-router";

export const APPLICATION_INTENTS = [
  "customer_signup",
  "courier_application",
  "driver_application",
  "merchant_application",
] as const;

export type ApplicationIntent = typeof APPLICATION_INTENTS[number];

const CUSTOMER_RETURN_PREFIXES = [
  "/(shared)/courier",
  "/(shared)/food",
  "/(customer)/request/",
  "/(customer)/ride/",
] as const;

const WORKER_DESTINATIONS: Record<Exclude<ApplicationIntent, "customer_signup">, Href> = {
  courier_application: {
    pathname: "/(shared)/worker-application",
    params: { product: "courier" },
  },
  driver_application: {
    pathname: "/(shared)/worker-application",
    params: { product: "driver" },
  },
  merchant_application: {
    pathname: "/(shared)/worker-application",
    params: { product: "merchant" },
  },
};

export function parseApplicationIntent(value?: string | string[] | null): ApplicationIntent {
  const candidate = Array.isArray(value) ? value[0] : value;
  return APPLICATION_INTENTS.includes(candidate as ApplicationIntent)
    ? candidate as ApplicationIntent
    : "customer_signup";
}

export function intentForProduct(product: "courier" | "driver" | "merchant"): ApplicationIntent {
  return `${product}_application` as ApplicationIntent;
}

export function workerProductForIntent(intent: ApplicationIntent) {
  if (intent === "courier_application") return "courier" as const;
  if (intent === "driver_application") return "driver" as const;
  if (intent === "merchant_application") return "merchant" as const;
  return null;
}

export function destinationForIntent(intent: ApplicationIntent): Href | null {
  return intent === "customer_signup" ? null : WORKER_DESTINATIONS[intent];
}

export function safeCustomerReturnTo(value?: string | string[] | null): Href | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || candidate.includes("..") || candidate.includes(":") || candidate.includes("?") || candidate.includes("#") || candidate.includes("\\") || candidate.startsWith("//")) return null;
  return CUSTOMER_RETURN_PREFIXES.some((prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`))
    ? candidate as Href
    : null;
}

export function destinationAfterAuth(
  role: string | null | undefined,
  intent: ApplicationIntent,
  returnTo?: string | string[] | null,
): Href {
  if (role === "admin") return "/(admin)/dashboard";
  if (role === "driver") return "/(driver)/home";
  if (role === "courier") return "/(courier)/home";
  if (role === "merchant") return "/(merchant)/home";
  return destinationForIntent(intent) || safeCustomerReturnTo(returnTo) || "/(customer)/home";
}

export function intentCopy(intent: ApplicationIntent) {
  if (intent === "courier_application") {
    return {
      title: "Apply to deliver",
      authBody: "Create an account or sign in to continue your Courier application.",
      registerTitle: "Start your Courier application",
      registerButton: "Create account & continue",
      verifiedBody: "Your email is verified. Continue with your Courier profile and documents.",
    };
  }
  if (intent === "driver_application") {
    return {
      title: "Become a Driver",
      authBody: "Create an account or sign in to continue your Driver application.",
      registerTitle: "Start your Driver application",
      registerButton: "Create account & continue",
      verifiedBody: "Your email is verified. Continue with your licence, vehicle and identity details.",
    };
  }
  if (intent === "merchant_application") {
    return {
      title: "Partner with LetsGoRide",
      authBody: "Create an account or sign in to continue your business application.",
      registerTitle: "Start your business application",
      registerButton: "Create account & continue",
      verifiedBody: "Your email is verified. Continue with your business details and documents.",
    };
  }
  return {
    title: "Welcome to LetsGoRide",
    authBody: "Sign in to book rides, order food and arrange deliveries.",
    registerTitle: "Create your account",
    registerButton: "Create account",
    verifiedBody: "Your email is verified. You’re ready to use LetsGoRide.",
  };
}
