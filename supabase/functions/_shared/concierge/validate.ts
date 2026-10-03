// Request validation. Everything from the client is untrusted: shape, sizes,
// IDs. The guest is never taken from the body: it comes from the JWT.
import type { Caller, ConciergeRequestBody } from './types.ts';

export const MAX_BODY_CHARS = 2000;
export const MAX_REQUEST_BYTES = 8 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Validation = { ok: true; value: ConciergeRequestBody } | { ok: false; status: 400 | 403 | 413 | 422; error: string };

/** Strips control characters (except new lines) and normalises whitespace. */
export function cleanText(s: string): string {
  return s
    .normalize('NFC')
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateRequest(rawText: string, caller: Caller): Validation {
  if (new TextEncoder().encode(rawText).length > MAX_REQUEST_BYTES) return { ok: false, status: 413, error: 'too_large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, status: 400, error: 'invalid_body' };
  const b = parsed as Record<string, unknown>;
  const allowed = new Set(['conversationId', 'body', 'requestId', 'guestId']);
  if (Object.keys(b).some((k) => !allowed.has(k))) return { ok: false, status: 422, error: 'unknown_field' };
  if (typeof b.conversationId !== 'string' || !UUID.test(b.conversationId)) return { ok: false, status: 422, error: 'conversation_id' };
  if (typeof b.requestId !== 'string' || !UUID.test(b.requestId)) return { ok: false, status: 422, error: 'request_id' };
  if (typeof b.body !== 'string') return { ok: false, status: 422, error: 'body' };
  const body = cleanText(b.body);
  if (!body) return { ok: false, status: 422, error: 'body_empty' };
  if (body.length > MAX_BODY_CHARS) return { ok: false, status: 413, error: 'body_too_long' };
  // A guestId in the body may only ever be the caller's own.
  if (b.guestId !== undefined && (typeof b.guestId !== 'string' || b.guestId !== caller.guestId)) return { ok: false, status: 403, error: 'guest_mismatch' };
  return { ok: true, value: { conversationId: b.conversationId, body, requestId: b.requestId, guestId: caller.guestId ?? undefined } };
}

/** Only guests and travel companions with a linked guest record use the guest concierge. */
export function authorize(caller: Caller): { ok: true } | { ok: false; status: 403; error: string } {
  if (!caller.guestId) return { ok: false, status: 403, error: 'no_guest' };
  if (!caller.roles.some((r) => r === 'guest' || r === 'travel_companion')) return { ok: false, status: 403, error: 'role' };
  return { ok: true };
}
