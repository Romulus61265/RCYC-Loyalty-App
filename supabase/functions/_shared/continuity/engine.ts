// Shoreside-to-yacht continuity: the rules.
//
// Pure and deterministic: the same flight observation and context always
// give the same plan, the same events and the same words for the guest.
import type { ActionOutcome, ArrivalContext, ArrivalPlan, ArrivalStep, ArrivalUpdate, ContinuityAction, ContinuityEvent, ExecutedAction, FlightStatusUpdate, ISODateTime } from './types.ts';
import { ALL_ABOARD_MARGIN_MINUTES, DELAY_THRESHOLD_MINUTES, MIN_MEET_MINUTES } from './types.ts';

export const ENGINE_VERSION = 'continuity-rules-v1';

const MIN = 60_000;
const ms = (iso: string) => Date.parse(iso);
export const hhmm = (iso: string) => iso.slice(11, 16);
const minutesBetween = (from: string, to: string) => Math.round((ms(to) - ms(from)) / MIN);

/** `iso` moved by `minutes`, keeping its offset (local time stays local). */
export function shift(iso: ISODateTime, minutes: number): ISODateTime {
  const m = /([+-])(\d{2}):(\d{2})$|Z$/.exec(iso);
  const suffix = m?.[0] ?? 'Z';
  const offset = m && m[1] ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const local = new Date(ms(iso) + (minutes + offset) * MIN).toISOString().slice(0, 19);
  return `${local}${suffix}`;
}

/** Up to the next five minutes: drivers are told round times. */
function roundUp5(iso: ISODateTime): ISODateTime {
  const into = (Number(iso.slice(14, 16)) % 5) * 60 + Number(iso.slice(17, 19));
  const whole = shift(`${iso.slice(0, 17)}00${iso.slice(19)}`, -(Number(iso.slice(14, 16)) % 5));
  return into === 0 ? whole : shift(whole, 5);
}

/** "about 2 hours", "about 45 minutes", "about 1 hour 30 minutes". */
export function aboutDuration(minutes: number): string {
  const r = Math.round(minutes / 5) * 5;
  const h = Math.floor(r / 60);
  const m = r % 60;
  const hs = h ? `${h} hour${h === 1 ? '' : 's'}` : '';
  const mstr = m ? `${m} minutes` : '';
  return `about ${[hs, mstr].filter(Boolean).join(' ')}`;
}

/**
 * The plan for one flight observation, or null when it is not about this
 * guest's flight (or says nothing new).
 */
export function planArrival(update: FlightStatusUpdate, ctx: ArrivalContext): ArrivalPlan | null {
  if (update.flightNumber.replace(/\s/g, '') !== ctx.flight.flightNumber.replace(/\s/g, '')) return null;
  const scheduled = ctx.flight.scheduledArrival;
  if (update.status === 'cancelled' || update.status === 'diverted') {
    return {
      key: `arrival:${ctx.flight.id}:${update.status}`,
      reservationId: ctx.reservationId,
      flightId: ctx.flight.id,
      delayMinutes: 0,
      newArrival: scheduled,
      minor: false,
      allAboardAtRisk: true,
      actions: [{ kind: 'alert-crew', reason: 'flight-cancelled', detail: `${ctx.flight.flightNumber} is ${update.status}. Rebook with the guest personally.` }],
    };
  }
  const est = update.estimatedArrival;
  if (!est) return null;
  const delay = minutesBetween(scheduled, est);
  const base = { key: `arrival:${ctx.flight.id}:${est}`, reservationId: ctx.reservationId, flightId: ctx.flight.id, delayMinutes: delay, newArrival: est };
  if (delay < DELAY_THRESHOLD_MINUTES) return { ...base, minor: true, allAboardAtRisk: false, actions: [] };

  const actions: ContinuityAction[] = [];
  const t = ctx.transfer;
  const e = ctx.embarkation;
  if (!t) {
    const atRisk = ms(shift(est, 120)) > ms(e.allAboard) - ALL_ABOARD_MARGIN_MINUTES * MIN;
    actions.push({ kind: 'alert-crew', reason: 'no-transfer', detail: `${ctx.flight.flightNumber} now lands ${hhmm(est)} and no transfer is booked. Offer one.` });
    return { ...base, minor: false, allAboardAtRisk: atRisk, actions };
  }

  // Keep the meeting time the guest had after landing (never under the minimum).
  const meet = Math.max(MIN_MEET_MINUTES, minutesBetween(scheduled, t.start));
  const newPickup = roundUp5(shift(est, meet));
  const moveBy = Math.max(0, minutesBetween(t.start, newPickup));
  const transferEnd = t.end ? shift(t.end, moveBy) : undefined;
  if (moveBy > 0) actions.push({ kind: 'retime-transfer', bookingId: t.bookingId, start: newPickup, ...(transferEnd ? { end: transferEnd } : {}) });

  // Whatever happens on the way moves with it, as a request.
  for (const b of ctx.enRoute) {
    if (moveBy > 0) actions.push({ kind: 'request-experience-change', bookingId: b.bookingId, title: b.title, start: shift(b.start, moveBy) });
  }

  const atTerminal = transferEnd ?? shift(newPickup, 60);
  const windowLength = Math.max(30, minutesBetween(e.windowStart, e.windowEnd));
  const late = ms(atTerminal) > ms(e.windowEnd);
  const window = late ? { start: atTerminal, end: shift(atTerminal, windowLength) } : { start: e.windowStart, end: e.windowEnd };
  // The gangway always hears of a delay, even when the window still holds.
  actions.push({
    kind: 'notify-embarkation',
    windowStart: window.start,
    windowEnd: window.end,
    ...(e.luggageDeliveredBy ? { luggageDeliveredBy: shift(e.luggageDeliveredBy, moveBy) } : {}),
  });
  const allAboardAtRisk = ms(window.start) > ms(e.allAboard) - ALL_ABOARD_MARGIN_MINUTES * MIN;
  if (allAboardAtRisk) actions.push({ kind: 'alert-crew', reason: 'all-aboard-at-risk', detail: `Now at the terminal about ${hhmm(atTerminal)}; all aboard is ${hhmm(e.allAboard)}. Call the guest.` });

  return { ...base, minor: false, newPickup, atTerminal, window, allAboardAtRisk, actions };
}

/** Airports the fictional voyages use; anything else reads as its code. */
const CITIES: Record<string, string> = { MIA: 'Miami', JFK: 'New York', LHR: 'London', CDG: 'Paris', BCN: 'Barcelona', FCO: 'Rome', NCE: 'Nice' };
const cityOf = (iata: string) => CITIES[iata] ?? iata;

const doneOrPending = (o: ActionOutcome | undefined): 'done' | 'pending' => (o === 'confirmed' || o === 'notified' ? 'done' : 'pending');

/** What the guest reads, from the plan and what each team's port reported. */
export function toArrivalUpdate(plan: ArrivalPlan, executed: ExecutedAction[], ctx: ArrivalContext, update: FlightStatusUpdate, meta: { id: string; createdAt: string }): ArrivalUpdate {
  const first = ctx.guest.firstName;
  const amb = ctx.ambassador.firstName;
  const outcome = (kind: ContinuityAction['kind']) => executed.find((x) => x.action.kind === kind)?.outcome;
  const flightStep: ArrivalStep = {
    kind: 'flight-delay',
    label: 'Inbound flight delay detected',
    detail: plan.minor
      ? `${ctx.flight.flightNumber} is now expected at ${hhmm(plan.newArrival)}, a few minutes late.`
      : `${ctx.flight.flightNumber} from ${cityOf(ctx.flight.origin)} is now expected at ${hhmm(plan.newArrival)}, ${aboutDuration(plan.delayMinutes)} later than planned.`,
    state: 'done',
    value: hhmm(plan.newArrival),
  };
  const concierge: ArrivalStep = {
    kind: 'concierge',
    label: 'Concierge available',
    detail: `${amb} is following your flight and is here if you would like anything changed.`,
    state: 'info',
  };
  const base = { id: meta.id, key: plan.key, reservationId: plan.reservationId, flightNumber: ctx.flight.flightNumber, simulated: update.simulated, createdAt: meta.createdAt };

  if (plan.minor) {
    return { ...base, headline: 'Your flight is running a little late', intro: `${first}, your driver is following the flight and will simply wait for you. Nothing else changes.`, steps: [flightStep, concierge], alsoAffected: [] };
  }

  const steps: ArrivalStep[] = [flightStep];
  const t = ctx.transfer;
  const transferOutcome = outcome('retime-transfer');
  if (t && plan.newPickup) {
    const state = transferOutcome ? doneOrPending(transferOutcome) : 'done';
    const moved = plan.newPickup !== t.start;
    steps.push({
      kind: 'transfer-updated',
      label: state === 'done' ? 'Private transfer updated' : 'Private transfer being updated',
      detail: !moved
        ? 'Your driver is following the flight; the pick-up time still works.'
        : state === 'done'
          ? `Your driver will meet you at ${hhmm(plan.newPickup)} instead of ${hhmm(t.start)}, and is following the flight.`
          : transferOutcome === 'failed'
            ? `${amb} is arranging your driver for ${hhmm(plan.newPickup)} personally.`
            : `We have asked your transfer team to meet you at ${hhmm(plan.newPickup)} instead of ${hhmm(t.start)}. They will confirm.`,
      state,
    });
  }
  const embarkOutcome = outcome('notify-embarkation');
  const e = ctx.embarkation;
  if (plan.window) {
    const moved = plan.window.start !== e.windowStart;
    const suite = ctx.guest.suiteName ?? 'Your suite';
    const ready = ms(e.suiteReadyAt) <= ms(plan.window.start) ? `${suite} will be ready when you arrive.` : `${suite} is ready from ${hhmm(e.suiteReadyAt)}.`;
    steps.push({
      kind: 'embarkation-notified',
      label: doneOrPending(embarkOutcome) === 'done' ? 'Embarkation team notified' : 'Embarkation team being told',
      detail: moved ? `They now expect you between ${hhmm(plan.window.start)} and ${hhmm(plan.window.end)}. ${ready}` : `Your arrival window of ${hhmm(plan.window.start)} to ${hhmm(plan.window.end)} still stands. ${ready}`,
      state: doneOrPending(embarkOutcome),
    });
  }
  if (t && plan.newPickup) {
    steps.push({
      kind: 'transfer-time',
      label: 'New transfer time',
      detail: `${hhmm(plan.newPickup)}, ${t.venue}. Your driver will be holding a card with your name.`,
      state: transferOutcome ? doneOrPending(transferOutcome) : 'done',
      value: hhmm(plan.newPickup),
    });
  }
  if (plan.atTerminal) {
    steps.push({
      kind: 'arrival-estimate',
      label: 'Updated arrival estimate',
      detail: plan.allAboardAtRisk
        ? `${e.terminalName} by about ${hhmm(plan.atTerminal)}. That is close to all aboard at ${hhmm(e.allAboard)}, so ${amb} will call you to plan the rest of the day.`
        : `${e.terminalName} by about ${hhmm(plan.atTerminal)}. All aboard is at ${hhmm(e.allAboard)}, so there is time to spare.`,
      state: 'info',
      value: hhmm(plan.atTerminal),
    });
  }
  steps.push(concierge);

  const alsoAffected = executed
    .filter((x): x is ExecutedAction & { action: Extract<ContinuityAction, { kind: 'request-experience-change' }> } => x.action.kind === 'request-experience-change')
    .map((x) => ({
      title: x.action.title,
      detail: x.outcome === 'confirmed' ? `Now at ${hhmm(x.action.start)}, after you land.` : `We have asked to move it to ${hhmm(x.action.start)}, after you land. The team will confirm.`,
      state: doneOrPending(x.outcome),
    }));

  // The arrival arrangements are the transfer and the embarkation window; plans en route are listed on their own.
  const allDone = executed.filter((x) => x.action.kind === 'retime-transfer' || x.action.kind === 'notify-embarkation').every((x) => x.outcome === 'confirmed' || x.outcome === 'notified');
  return {
    ...base,
    headline: allDone ? "We've adjusted your arrival arrangements." : "We're adjusting your arrival arrangements.",
    intro: allDone
      ? `${first}, your flight is running late, so we have moved everything that depends on it. There is nothing you need to do.`
      : `${first}, your flight is running late, so we are moving everything that depends on it. There is nothing you need to do; we will tell you as each change is confirmed.`,
    steps,
    alsoAffected,
    ...(plan.allAboardAtRisk ? { attention: `${amb} will call you to plan the rest of the day.` } : {}),
  };
}

/** The events the delay sets off, each caused by the one before (correlated to the observation). */
export function continuityEvents(plan: ArrivalPlan, executed: ExecutedAction[], ctx: ArrivalContext, update: FlightStatusUpdate): ContinuityEvent[] {
  const root: ContinuityEvent = {
    type: 'flight.delayed',
    reservationId: plan.reservationId,
    correlationId: update.observationId,
    causationId: update.observationId,
    dedupeKey: `${plan.key}:flight`,
    occurredAt: update.observedAt,
    severity: plan.minor ? 'info' : 'notice',
    source: update.source,
    payload: { flightNumber: ctx.flight.flightNumber, scheduledArrival: ctx.flight.scheduledArrival, estimatedArrival: plan.newArrival, delayMinutes: plan.delayMinutes, simulated: update.simulated },
  };
  const derived = executed.map((x, i): ContinuityEvent => {
    const common = { reservationId: plan.reservationId, correlationId: update.observationId, causationId: root.dedupeKey, occurredAt: update.observedAt, source: 'continuity-orchestrator', dedupeKey: `${plan.key}:${x.action.kind}:${i}` };
    const a = x.action;
    switch (a.kind) {
      case 'retime-transfer':
        return { ...common, type: 'transfer.rescheduled', severity: 'notice', payload: { bookingId: a.bookingId, start: a.start, end: a.end, outcome: x.outcome } };
      case 'request-experience-change':
        return { ...common, type: 'experience.change_requested', severity: 'notice', payload: { bookingId: a.bookingId, start: a.start, outcome: x.outcome } };
      case 'notify-embarkation':
        return { ...common, type: 'embarkation.changed', severity: 'notice', payload: { windowStart: a.windowStart, windowEnd: a.windowEnd, luggageDeliveredBy: a.luggageDeliveredBy, guestTier: ctx.guest.tier, suite: ctx.guest.suiteName, outcome: x.outcome } };
      case 'alert-crew':
        return { ...common, type: 'continuity.crew_alert', severity: 'action', payload: { reason: a.reason, detail: a.detail, outcome: x.outcome } };
    }
  });
  return [root, ...derived];
}
