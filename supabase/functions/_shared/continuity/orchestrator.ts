// Shoreside-to-yacht continuity: the orchestrator.
//
// One flight observation in; for each reservation travelling on that flight:
// plan with the rules, carry each action out through the port of the team
// that owns it, publish the events it set off, and save what the guest reads.
// Idempotent by plan key, so a source that repeats itself changes nothing.
//
// The ports are where integrations would go. What exists today:
//   • mock ports (the app's demonstration): a mock transfer operator that
//     confirms, a mock venue desk, a mock embarkation desk;
//   • Supabase ports: changes recorded as tasks for the teams, so every
//     outcome is "requested" until a person confirms. No supplier, PMS or
//     flight-status integration exists.
import { continuityEvents, planArrival, toArrivalUpdate } from './engine.ts';
import type { ActionOutcome, ArrivalContext, ArrivalUpdate, ContinuityAction, ContinuityEvent, ExecutedAction, FlightStatusUpdate } from './types.ts';

export interface ContinuityPorts {
  /** Already handled under this plan key? */
  find(key: string): Promise<ArrivalUpdate | null>;
  /** Every reservation travelling on this flight, with its arrival day. */
  contexts(update: FlightStatusUpdate, now: Date): Promise<ArrivalContext[]>;
  /** The ground-transport operator. */
  transfer: { retime(a: Extract<ContinuityAction, { kind: 'retime-transfer' }>, ctx: ArrivalContext): Promise<ActionOutcome> };
  /** The venue or guide of something booked on the way. */
  experiences: { requestChange(a: Extract<ContinuityAction, { kind: 'request-experience-change' }>, ctx: ArrivalContext): Promise<ActionOutcome> };
  /** The embarkation team at the terminal and the gangway. */
  embarkation: { notify(a: Extract<ContinuityAction, { kind: 'notify-embarkation' }>, ctx: ArrivalContext): Promise<ActionOutcome> };
  /** A person to call the guest (all aboard at risk, no transfer, cancellation). */
  crew: { alert(a: Extract<ContinuityAction, { kind: 'alert-crew' }>, ctx: ArrivalContext): Promise<ActionOutcome> };
  publish(events: ContinuityEvent[]): Promise<void>;
  /** Stores the guest's update; returns it with its id. */
  save(update: Omit<ArrivalUpdate, 'id'>): Promise<ArrivalUpdate>;
  audit(entry: { action: string; resourceId?: string; outcome: 'success' | 'failure'; metadata: Record<string, string | number | boolean> }): Promise<void>;
}

export interface ContinuityResult {
  reservationId: string;
  status: 'adjusted' | 'minor' | 'duplicate' | 'ignored';
  update?: ArrivalUpdate;
  outcomes?: ActionOutcome[];
}

async function run(ports: ContinuityPorts, a: ContinuityAction, ctx: ArrivalContext): Promise<ExecutedAction> {
  try {
    switch (a.kind) {
      case 'retime-transfer':
        return { action: a, outcome: await ports.transfer.retime(a, ctx), by: 'your driver' };
      case 'request-experience-change':
        return { action: a, outcome: await ports.experiences.requestChange(a, ctx), by: 'the team' };
      case 'notify-embarkation':
        return { action: a, outcome: await ports.embarkation.notify(a, ctx), by: 'the embarkation team' };
      case 'alert-crew':
        return { action: a, outcome: await ports.crew.alert(a, ctx), by: ctx.ambassador.firstName };
    }
  } catch {
    // A port that fails never stops the others; a person takes it from here.
    return { action: a, outcome: 'failed', by: ctx.ambassador.firstName };
  }
}

export async function handleFlightUpdate(ports: ContinuityPorts, update: FlightStatusUpdate, opts: { now: Date }): Promise<ContinuityResult[]> {
  const results: ContinuityResult[] = [];
  for (const ctx of await ports.contexts(update, opts.now)) {
    const plan = planArrival(update, ctx);
    if (!plan) {
      results.push({ reservationId: ctx.reservationId, status: 'ignored' });
      continue;
    }
    const existing = await ports.find(plan.key);
    if (existing) {
      results.push({ reservationId: ctx.reservationId, status: 'duplicate', update: existing });
      continue;
    }
    const executed: ExecutedAction[] = [];
    for (const a of plan.actions) executed.push(await run(ports, a, ctx));
    // A failed change is handed to a person.
    if (executed.some((x) => x.outcome === 'failed') && !plan.actions.some((a) => a.kind === 'alert-crew')) {
      const failed = executed.filter((x) => x.outcome === 'failed').map((x) => x.action.kind).join(', ');
      executed.push(await run(ports, { kind: 'alert-crew', reason: 'all-aboard-at-risk', detail: `Could not complete: ${failed}. Arrange personally.` }, ctx));
    }
    const draft = toArrivalUpdate(plan, executed, ctx, update, { id: '', createdAt: ctx.now });
    const { id: _none, ...rest } = draft;
    const saved = await ports.save(rest);
    await ports.publish(continuityEvents(plan, executed, ctx, update));
    await ports.audit({
      action: 'continuity.flight_delay',
      resourceId: saved.id,
      outcome: executed.some((x) => x.outcome === 'failed') ? 'failure' : 'success',
      metadata: { delayMinutes: plan.delayMinutes, actions: executed.length, simulated: update.simulated, source: update.source },
    });
    results.push({ reservationId: ctx.reservationId, status: plan.minor ? 'minor' : 'adjusted', update: saved, outcomes: executed.map((x) => x.outcome) });
  }
  return results;
}
