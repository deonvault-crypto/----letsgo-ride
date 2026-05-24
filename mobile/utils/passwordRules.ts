export type PasswordRule = {
  key: string;
  label: string;
  valid: boolean;
};

export function getPasswordRules(password: string): PasswordRule[] {
  return [
    { key: "length", label: "8+ characters", valid: password.length >= 8 },
    { key: "uppercase", label: "Uppercase letter", valid: /[A-Z]/.test(password) },
    { key: "lowercase", label: "Lowercase letter", valid: /[a-z]/.test(password) },
    { key: "number", label: "Number", valid: /\d/.test(password) },
    { key: "symbol", label: "Symbol", valid: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function isStrongPassword(password: string) {
  return getPasswordRules(password).every((rule) => rule.valid);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
