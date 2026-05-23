export function isValidPhone(value: string) {
  const phone = value.trim().replace(/\s|-/g, "");
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

export function hasRequiredValues(values: string[]) {
  return values.every((value) => value.trim().length > 0);
}
