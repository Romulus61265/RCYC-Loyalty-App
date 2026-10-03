// Hallucination protection and the "never claim a change" rule.
//
// 1. Parse: the output must match the schema exactly (also checked when the
//    provider enforces structured output).
// 2. Ground: every handle must exist in this request's context; every time
//    and price in the reply must appear in the context or the guest's words.
// 3. Claims: the reply may not say a change has happened. Only a booking
//    service result can, and then the server writes the words (pipeline).
// 4. Transactions: a proposed change must name a real record and a real,
//    open slot; it becomes an action card for the guest to confirm. A
//    "guest_confirmed" is honoured only for an action actually offered.
import type { HandleMap, ModelContext, ModelOutput, OfferedAction, RawContext, TransactionType } from './types.ts';

// ─── Parse ─────────────────────────────────────────────────────────────────

const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrOrNull = (v: unknown) => v === null || typeof v === 'string';
const TX: TransactionType[] = ['change_booking', 'request_experience', 'cancel_booking', 'service_request'];
const TEAMS = ['suite-ambassador', 'concierge-team', 'medical'];

export function parseOutput(raw: unknown): { ok: true; value: ModelOutput } | { ok: false; error: string } {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'not_json' };
    }
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'not_object' };
  const o = raw as Record<string, unknown>;
  if (!['information', 'recommendation', 'transactional'].includes(o.classification as string)) return { ok: false, error: 'classification' };
  if (!isStr(o.reply)) return { ok: false, error: 'reply' };
  if (!Array.isArray(o.grounding) || !o.grounding.every(isStr)) return { ok: false, error: 'grounding' };
  if (!Array.isArray(o.recommendations) || !o.recommendations.every((r) => r && isStr((r as { experience?: unknown }).experience) && isStr((r as { reason?: unknown }).reason))) return { ok: false, error: 'recommendations' };
  const t = o.transaction as Record<string, unknown> | null;
  if (t !== null) {
    if (!t || typeof t !== 'object') return { ok: false, error: 'transaction' };
    if (!TX.includes(t.type as TransactionType) || !isStrOrNull(t.booking) || !isStrOrNull(t.experience) || !isStrOrNull(t.start_local)) return { ok: false, error: 'transaction_fields' };
    if (!(t.party_size === null || (Number.isInteger(t.party_size) && (t.party_size as number) > 0))) return { ok: false, error: 'party_size' };
    if (!isStr(t.summary) || typeof t.guest_confirmed !== 'boolean') return { ok: false, error: 'transaction_summary' };
  }
  const h = o.needs_human as Record<string, unknown>;
  if (!h || typeof h.required !== 'boolean' || !(h.team === null || TEAMS.includes(h.team as string)) || !isStrOrNull(h.reason)) return { ok: false, error: 'needs_human' };
  if (typeof o.confidence !== 'number' || Number.isNaN(o.confidence)) return { ok: false, error: 'confidence' };
  return { ok: true, value: { ...(o as unknown as ModelOutput), confidence: Math.max(0, Math.min(1, o.confidence)) } };
}

// ─── Claims ────────────────────────────────────────────────────────────────

const DONE = '(booked|reserved|moved|changed|rescheduled|cancell?ed|confirmed|arranged|secured|upgraded|amended|updated|added|requested for you)';
const CLAIMS = [
  new RegExp(`\\bI(?:'ve| have| just)?\\s+(?:now\\s+|already\\s+|gone ahead and\\s+)?${DONE}\\b`, 'i'),
  new RegExp(`\\b(?:has|have)\\s+(?:now\\s+|already\\s+)?been\\s+${DONE}\\b`, 'i'),
  new RegExp(`\\b(?:is|are)\\s+now\\s+${DONE}\\b`, 'i'),
  /(?:^|[.!?]\s+)(?:all )?(?:done|sorted)\s*[.!,:—-]/i,
  /\byour (?:new )?(?:booking|reservation|table) is (?:all )?set\b/i,
  /\bconfirmation (?:number|code) is\b/i,
];

/** True when the reply says a change has been made. */
export function claimsChange(reply: string): boolean {
  return CLAIMS.some((r) => r.test(reply));
}

// ─── Guard ─────────────────────────────────────────────────────────────────

export interface GuardResult {
  output: ModelOutput;
  findings: string[];
  /** Worth one corrective retry. */
  repairable: string[];
  /** A change the guest may confirm (real IDs). */
  offer?: { action: OfferedAction; title: string; detail: string; subject: { bookingId?: string; experienceId?: string } };
  /** The guest said yes to an action that was actually offered. */
  confirmed?: OfferedAction;
  /** Suggestions as cards with request buttons (real IDs, open slots only). */
  suggestionCards: { experienceId: string; title: string; detail: string; actions: OfferedAction[] }[];
}

const timesIn = (s: string) => [...s.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].map((m) => `${m[1]!.padStart(2, '0')}:${m[2]}`);
const pricesIn = (s: string) => [...s.matchAll(/[€$£]\s?(\d[\d,.]*)/g)].map((m) => m[1]!.replace(/[,.]\d{2}$/, '').replace(/[,.]/g, ''));
const longDate = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()]} ${d.getUTCDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()]}`;
};

export function guard(output: ModelOutput, model: ModelContext, handles: HandleMap, raw: RawContext, guestText: string, now: Date): GuardResult {
  const findings: string[] = [];
  const repairable: string[] = [];
  const out: ModelOutput = JSON.parse(JSON.stringify(output));
  const known = new Set([...handles.bookings.keys(), ...handles.experiences.keys(), ...handles.ports.keys(), ...handles.requests.keys(), ...handles.pending.keys()]);
  const party = Math.max(1, 1 + raw.companionFirstNames.length);

  // Grounding: handles.
  const unknown = out.grounding.filter((h) => !known.has(h));
  if (unknown.length) findings.push('grounding.unknown_handle');
  out.grounding = out.grounding.filter((h) => known.has(h));

  // Grounding: times and prices in the reply.
  const contextText = JSON.stringify(model) + ' ' + guestText;
  const knownTimes = new Set([...timesIn(contextText), ...[...contextText.matchAll(/T(\d{2}:\d{2})/g)].map((m) => m[1]!)]);
  const strayTimes = timesIn(out.reply).filter((t) => !knownTimes.has(t));
  if (strayTimes.length) {
    findings.push('grounding.unknown_time');
    repairable.push(`The reply mentions ${strayTimes.join(', ')}, which is not in the context. Use only times from the context.`);
  }
  const knownPrices = new Set(pricesIn(contextText));
  const strayPrices = pricesIn(out.reply).filter((p) => !knownPrices.has(p));
  if (strayPrices.length) {
    findings.push('grounding.unknown_price');
    repairable.push('The reply mentions a price that is not in the context. Use only prices from the context, or none.');
  }

  // Claims of a change.
  if (claimsChange(out.reply)) {
    findings.push('claim.unconfirmed_change');
    repairable.push('The reply says a change has been made. Nothing has been changed: describe it as an offer for the guest to confirm.');
  }

  // Recommendations: real, unbooked experiences only; cards with open slots.
  const suggestionCards: GuardResult['suggestionCards'] = [];
  const bookedIds = new Set(raw.bookings.filter((b) => b.status !== 'cancelled').map((b) => b.experienceId));
  out.recommendations = out.recommendations.filter((r) => {
    const e = handles.experiences.get(r.experience);
    if (!e) {
      findings.push('grounding.unknown_recommendation');
      return false;
    }
    if (bookedIds.has(e.id)) {
      findings.push('grounding.recommended_booked');
      return false;
    }
    const slots = model.experiences.find((x) => x.handle === r.experience)?.openSlots ?? [];
    if (suggestionCards.length < 3) {
      suggestionCards.push({
        experienceId: e.id,
        title: e.title,
        detail: [e.destination ?? `Aboard ${raw.voyage.yacht}`, r.reason.slice(0, 160)].join(' · '),
        actions: slots.slice(0, 2).map((s) => {
          const slot = raw.slots.find((x) => x.experienceId === e.id && x.start.startsWith(s))!;
          return { kind: 'request-experience', label: `Request ${s.slice(11, 16)}`, experienceId: e.id, start: slot.start, partySize: e.format === 'private' ? party : Math.min(party, slot.remaining) };
        }),
      });
    }
    return true;
  });
  if (out.classification === 'recommendation' && !out.recommendations.length) {
    findings.push('classification.recommendation_without_items');
    out.classification = 'information';
  }

  // Transactions.
  let offer: GuardResult['offer'];
  let confirmed: OfferedAction | undefined;
  const t = out.transaction;
  if (t && out.classification !== 'transactional') {
    findings.push('classification.corrected_to_transactional');
    out.classification = 'transactional';
  }
  if (!t && out.classification === 'transactional') {
    findings.push('classification.transaction_missing');
    repairable.push('classification is "transactional" but "transaction" is null. Describe the change in "transaction".');
  }
  if (t) {
    const slotFor = (experienceId: string, startLocal: string | null, need: number) =>
      startLocal ? raw.slots.find((s) => s.experienceId === experienceId && s.start.slice(0, 16) === startLocal && s.remaining >= need && Date.parse(s.start) > now.getTime()) : undefined;
    if (t.type === 'change_booking') {
      const b = t.booking ? handles.bookings.get(t.booking) : undefined;
      const exp = b && raw.catalogue.find((e) => e.id === b.experienceId);
      const slot = b && slotFor(b.experienceId, t.start_local, exp?.format === 'private' ? 1 : b.partySize);
      if (!b) {
        findings.push('transaction.unknown_booking');
        repairable.push('The transaction names a booking that is not in the context.');
      } else if (!slot || slot.start === b.start) {
        // Not a free time: offer a person instead of a change that cannot happen.
        findings.push('transaction.slot_unavailable');
        offer = { action: { kind: 'service-request', label: 'Ask for another time', type: b.category === 'dining' ? 'dining-change' : 'excursion', summary: `Another time for ${b.title.toLowerCase()}, ${longDate(b.start)}`.slice(0, 200) }, title: b.title, detail: `${longDate(b.start)} · now ${b.start.slice(11, 16)}`, subject: { bookingId: b.id } };
      } else {
        offer = { action: { kind: 'change-booking', label: `Move to ${slot.start.slice(11, 16)}`, bookingId: b.id, start: slot.start }, title: b.title, detail: `${longDate(slot.start)} · party of ${b.partySize}`, subject: { bookingId: b.id } };
      }
    } else if (t.type === 'request_experience') {
      const e = t.experience ? handles.experiences.get(t.experience) : undefined;
      const size = Math.max(1, Math.min(12, t.party_size ?? party));
      const slot = e && slotFor(e.id, t.start_local, e.format === 'private' ? 1 : size);
      if (!e) {
        findings.push('transaction.unknown_experience');
        repairable.push('The transaction names an experience that is not in the context.');
      } else if (!slot) {
        findings.push('transaction.slot_unavailable');
        offer = { action: { kind: 'service-request', label: 'Ask about availability', type: 'excursion', summary: `${e.title}: is there any availability${t.start_local ? ` around ${t.start_local.slice(11, 16)} on ${longDate(t.start_local)}` : ''}?`.slice(0, 200) }, title: e.title, detail: e.destination ?? `Aboard ${raw.voyage.yacht}`, subject: { experienceId: e.id } };
      } else {
        offer = { action: { kind: 'request-experience', label: `Request ${slot.start.slice(11, 16)}`, experienceId: e.id, start: slot.start, partySize: size }, title: e.title, detail: `${longDate(slot.start)} · party of ${size}`, subject: { experienceId: e.id } };
      }
    } else if (t.type === 'cancel_booking') {
      const b = t.booking ? handles.bookings.get(t.booking) : undefined;
      if (!b) findings.push('transaction.unknown_booking');
      // Cancellations go to a person to confirm (fees, suppliers).
      else offer = { action: { kind: 'service-request', label: 'Ask to cancel', type: b.category === 'dining' ? 'dining-change' : 'excursion', summary: `Cancel ${b.title.toLowerCase()}, ${longDate(b.start)}`.slice(0, 200) }, title: b.title, detail: longDate(b.start), subject: { bookingId: b.id } };
    } else {
      const summary = t.summary.trim().slice(0, 200);
      if (summary) offer = { action: { kind: 'service-request', label: 'Send this request', type: /car|transfer|helicopter|taxi|driver/i.test(summary) ? 'transport' : /flower|anniversary|birthday|celebrat/i.test(summary) ? 'occasion' : 'general', summary }, title: summary, detail: `To ${raw.ambassador.firstName}, your ${raw.ambassador.title}`, subject: {} };
    }

    // "Yes, please": honoured only for an action we actually offered.
    if (t.guest_confirmed) {
      // A change or request must match the offered action exactly (same record, same time,
      // re-checked against open slots above); a service request is matched by its handle.
      const referenced = output.grounding.map((h) => handles.pending.get(h)).filter((a): a is OfferedAction => Boolean(a));
      const match = [...handles.pending.values()].find((a) => sameAction(a, offer?.action)) ?? (t.type === 'service_request' ? referenced.find((a) => a.kind === 'service-request') : undefined);
      if (match) confirmed = match;
      else findings.push('transaction.confirmation_not_offered');
    }
  }

  // People.
  if (out.needs_human.required && !out.needs_human.team) out.needs_human.team = 'suite-ambassador';

  return { output: out, findings, repairable, offer, confirmed, suggestionCards };
}

export function sameAction(a: OfferedAction | undefined, b: OfferedAction | undefined): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'change-booking' && b.kind === 'change-booking') return a.bookingId === b.bookingId && a.start === b.start;
  if (a.kind === 'request-experience' && b.kind === 'request-experience') return a.experienceId === b.experienceId && a.start === b.start;
  if (a.kind === 'service-request' && b.kind === 'service-request') return a.summary === b.summary;
  return false;
}
