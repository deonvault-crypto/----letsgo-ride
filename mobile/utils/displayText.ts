export function displayPlace(value: string) {
  const normalized = value.trim().replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ");
  if (!normalized || normalized !== normalized.toLowerCase()) return normalized;
  return normalized.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function displayDeliveryReference(id: string) {
  return `Delivery #${id.slice(0, 8).toUpperCase()}`;
}
