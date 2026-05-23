export function isValidPhone(value: string) {
  const phone = value.trim();
  return /^[+0-9\s-]{6,18}$/.test(phone);
}

export function hasRequiredValues(values: string[]) {
  return values.every((value) => value.trim().length > 0);
}
