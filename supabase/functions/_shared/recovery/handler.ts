// Service recovery, server side: record a disruption once, with its plan,
// its guest-safe notice and any goodwill proposals for the crew.
//
// Called by journey-events (operational systems report a disruption) and by
// service-recovery-scan (disruptions visible in the guest's own data). The
// ports are structural, so this runs in Deno and in Node (the integration
// test) alike.
import { detectDisruptions, planRecovery, toGuestDisruption, withSubjectSnapshot } from './engine.ts';
import { evaluateGoodwill } from './goodwill.ts';
import type { Disruption, GoodwillPolicy, GoodwillProposal, GoodwillRule, GoodwillSkip, GuestDisruption, RecoveryContext, RecoveryPlan } from './types.ts';
import { MVP_GOODWILL_POLICY } from './types.ts';

export interface RecordedRecovery {
  eventId: string;
  noticeId: string;
}

export interface RecoveryPorts {
  /** Already recorded under this key? */
  find(disruptionKey: string): Promise<RecordedRecovery | null>;
  /** The guest's context, as the app sees it; null when the reservation is unknown. */
  context(d: Pick<Disruption, 'reservationId' | 'guestIds'>, now: Date): Promise<RecoveryContext | null>;
  rules(): Promise<GoodwillRule[]>;
  /** Approved proposals on the reservation, per rule id. */
  approvedByRule(reservationId: string): Promise<Record<string, number>>;
  /**
   * Writes the event, the notice and the proposals together. Must be
   * idempotent on the disruption key: a concurrent run that recorded it first
   * returns its ids.
   */
  save(record: { plan: RecoveryPlan; notice: GuestDisruption; title: string; proposals: GoodwillProposal[]; journeyEventId?: string }): Promise<RecordedRecovery>;
  audit(entry: { action: string; resourceId?: string; outcome: 'success' | 'failure'; metadata: Record<string, string | number | boolean> }): Promise<void>;
}

export interface ProcessResult {
  status: 'recorded' | 'duplicate' | 'skipped';
  eventId?: string;
  noticeId?: string;
  severity?: string;
  alternatives?: number;
  proposals?: number;
  skipped?: GoodwillSkip[];
}

export async function processDisruption(
  ports: RecoveryPorts,
  d: Disruption,
  opts: { now: Date; policy?: GoodwillPolicy; journeyEventId?: string },
): Promise<ProcessResult> {
  const existing = await ports.find(d.key);
  if (existing) return { status: 'duplicate', ...existing };
  const ctx = await ports.context(d, opts.now);
  if (!ctx) return { status: 'skipped' };

  d = withSubjectSnapshot(d, ctx);
  const plan = planRecovery(d, ctx);
  const [rules, approvedByRule] = await Promise.all([ports.rules(), ports.approvedByRule(d.reservationId)]);
  const { proposals, skipped } = evaluateGoodwill({ plan, ctx, rules, policy: opts.policy ?? MVP_GOODWILL_POLICY, approvedByRule });
  const saved = await ports.save({ plan, notice: toGuestDisruption(d), title: plan.message.title, proposals, journeyEventId: opts.journeyEventId });
  // Counts and kinds only: never the guest's words or the reason.
  await ports.audit({
    action: 'service_recovery.record',
    resourceId: saved.eventId,
    outcome: 'success',
    metadata: { kind: d.kind, source: d.source, severity: plan.assessment.severity, alternatives: plan.alternatives.length, proposals: proposals.length, escalate: plan.assessment.escalate },
  });
  return { status: 'recorded', ...saved, severity: plan.assessment.severity, alternatives: plan.alternatives.length, proposals: proposals.length, skipped };
}

/** Disruptions in the guest's own data (missed updates, suite issues, complaints), each recorded once. */
export async function scanReservation(ports: RecoveryPorts, reservation: { reservationId: string; guestIds: string[] }, opts: { now: Date; policy?: GoodwillPolicy }): Promise<ProcessResult[]> {
  const ctx = await ports.context(reservation, opts.now);
  if (!ctx) return [];
  const out: ProcessResult[] = [];
  for (const d of detectDisruptions(ctx, reservation.reservationId, reservation.guestIds)) out.push(await processDisruption(ports, d, opts));
  return out;
}
