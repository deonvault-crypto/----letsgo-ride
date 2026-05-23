const genericAccountNames = new Set([
  ["passenger", "account"].join(" "),
  ["letsgo", "ride", "user"].join(" "),
  ["letsgoride", "user"].join(" "),
]);

export function isGenericAccountName(name?: string | null) {
  const normalized = (name || "").trim().toLowerCase().replace(/\s+/g, " ");
  return genericAccountNames.has(normalized);
}

export function firstNameOrFallback(name?: string | null, fallback = "there") {
  if (!name || isGenericAccountName(name)) return fallback;
  return name.trim().split(" ")[0] || fallback;
}

export function displayNameOrFallback(name?: string | null, fallback = "Your account") {
  if (!name || isGenericAccountName(name)) return fallback;
  return name;
}
