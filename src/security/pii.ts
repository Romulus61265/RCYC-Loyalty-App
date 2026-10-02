/**
 * PII helpers. The app prefers *receiving* already-masked values from the
 * API; these helpers exist for defence in depth (logs, crash reports).
 */

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9])[A-Za-z0-9.-]*(\.[A-Za-z]{2,})/g;
const LONG_DIGITS = /\b\d{6,}\b/g;

export function maskEmail(email: string): string {
  return email.replace(EMAIL, (_m, a: string, b: string, tld: string) => `${a}•••@${b}•••${tld}`);
}

/** Scrubs free text before it reaches logs, analytics or a third-party AI. */
export function redact(text: string): string {
  return maskEmail(text).replace(LONG_DIGITS, (d) => `${'•'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`);
}

/** Keys that must never be serialised into logs or telemetry. */
export const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'passportNumber',
  'dateOfBirth',
  'email',
  'phone',
  'medical',
  'allergies',
]);

export function scrub<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, SENSITIVE_KEYS.has(k) ? '[redacted]' : typeof v === 'string' ? redact(v) : v]),
  );
}
