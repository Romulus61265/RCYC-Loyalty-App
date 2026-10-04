/**
 * The analytics allow-list and the privacy filter.
 *
 * Every event declares its properties and their shape. Anything not
 * declared is dropped. Every value is also screened, whatever its key, for
 * things that must never be logged: tokens, card numbers, passport-like
 * numbers, e-mail addresses, phone numbers and free text. A value that
 * fails is dropped, never sent redacted. Pure.
 */
import type { AnalyticsEventName, AnalyticsEventProps } from '@/domain';

type Shape = 'id' | 'label' | 'count' | 'route';

export const ANALYTICS_SCHEMA: { [E in AnalyticsEventName]: Record<keyof AnalyticsEventProps[E] & string, Shape> } = {
  screen_viewed: { screen: 'route' },
  experience_viewed: { experience_id: 'id', category: 'label', surface: 'label' },
  experience_saved: { experience_id: 'id', category: 'label', saved: 'label' },
  experience_booked: { experience_id: 'id', category: 'label', party_size: 'count', source: 'label' },
  concierge_opened: { entry: 'label' },
  concierge_request_submitted: { kind: 'label', action: 'label', team: 'label' },
  service_request_created: { category: 'label', priority: 'label', source: 'label' },
  recommendation_viewed: { recommendation_id: 'id', surface: 'label', position: 'count' },
  recommendation_accepted: { recommendation_id: 'id', surface: 'label', action: 'label' },
  preference_updated: { group: 'label' },
};

export const ANALYTICS_EVENTS = Object.keys(ANALYTICS_SCHEMA) as AnalyticsEventName[];

/** Property names that must never exist, as a guard on the schema itself. */
export const FORBIDDEN_KEY = /passport|document|card|payment|iban|cvv|pan\b|token|password|secret|auth|medical|health|diagnos|allerg|medic|message|body|text|note|description|details|summary|email|phone|name|address|guest_id|reservation_id|user_id/i;

const SHAPES: Record<Shape, RegExp> = {
  // Fixture ids (dev_exp_…), UUIDs, engine keys (event:…:dev_exp_…).
  id: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/,
  // Lower-case labels: categories, surfaces, kinds.
  label: /^[a-z][a-z0-9_.-]{0,39}$/,
  count: /^\d{1,3}$/,
  // Route patterns, never with real ids or a query: /history/[id].
  route: /^\/[a-z0-9\-/[\]]{0,79}$/,
};

/** Values that must never leave the device, whatever the property. */
const NEVER: { what: string; test: (v: string) => boolean }[] = [
  { what: 'jwt', test: (v) => /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\./.test(v) },
  { what: 'bearer', test: (v) => /bearer\s+/i.test(v) },
  { what: 'push-token', test: (v) => /Expo(nent)?PushToken\[/.test(v) },
  { what: 'email', test: (v) => /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(v) },
  { what: 'card', test: (v) => luhnRun(v) },
  { what: 'phone', test: (v) => /\+?\d[\d\s().-]{8,}\d/.test(v) && v.replace(/\D/g, '').length >= 9 && !/^[0-9a-f-]{36}$/i.test(v) },
  // Passport-like: a letter or two and six or more digits, alone (not part of a longer id).
  { what: 'passport', test: (v) => /(^|[^A-Za-z0-9_])[A-Z]{1,2}\d{6,9}([^A-Za-z0-9_]|$)/.test(v) },
  { what: 'free-text', test: (v) => /\s/.test(v.trim()) },
];

function luhnRun(v: string): boolean {
  for (const m of v.matchAll(/(?:\d[ -]?){13,19}/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) continue;
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = Number(digits[digits.length - 1 - i]);
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}

/** A screen path as a pattern: no ids, no query, no route groups. Anything but a plain word is an id. */
export function screenPattern(path: string): string {
  const clean = path.split('?')[0]!.split('#')[0]!;
  const parts = clean
    .split('/')
    .filter(Boolean)
    .filter((p) => !/^\(.*\)$/.test(p))
    .map((p) => (/^\[[a-z]+\]$/i.test(p) ? p.toLowerCase() : /^[a-z][a-z-]{0,29}$/i.test(p) ? p.toLowerCase() : '[id]'));
  return `/${parts.join('/')}`;
}

export interface Sanitized {
  props: Record<string, string | number>;
  dropped: string[];
}

export function sanitize<E extends AnalyticsEventName>(event: E, props: Record<string, unknown>): Sanitized {
  const schema = ANALYTICS_SCHEMA[event] as Record<string, Shape>;
  const out: Record<string, string | number> = {};
  const dropped: string[] = [];
  for (const [key, raw] of Object.entries(props ?? {})) {
    const shape = schema[key];
    if (!shape || FORBIDDEN_KEY.test(key)) {
      dropped.push(key);
      continue;
    }
    if (raw === undefined || raw === null) continue;
    if (shape === 'count') {
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 999) dropped.push(key);
      else out[key] = raw;
      continue;
    }
    if (typeof raw !== 'string') {
      dropped.push(key);
      continue;
    }
    const value = shape === 'route' ? screenPattern(raw) : raw;
    if (!SHAPES[shape].test(value) || NEVER.some((n) => n.test(value))) {
      dropped.push(key);
      continue;
    }
    out[key] = value;
  }
  return { props: out, dropped };
}

/** Which rule a value would trip (for tests and documentation). */
export const neverRule = (v: string) => NEVER.find((n) => n.test(v))?.what;
