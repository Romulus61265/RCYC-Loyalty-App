// Service recovery's ports over Supabase (service role). The context is read
// from the same views the app's services read, so the recorded plan and the
// guest's notice agree.
import { categoryFromType, statusOf, type Category, type RequestStatus } from '../requests/rules.ts';
import { voyageNow } from './engine.ts';
import type { RecordedRecovery, RecoveryPorts } from './handler.ts';
import type { GoodwillRule, RecoveryContext } from './types.ts';

// deno-lint-ignore no-explicit-any
type Query = any;
export interface Db {
  from(table: string): Query;
}

type Result = PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
async function rows<T>(q: Result): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}
async function row<T>(q: Result): Promise<T | null> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? null) as T | null;
}

export async function loadRecoveryContext(db: Db, reservationId: string, now: Date): Promise<RecoveryContext | null> {
  const res = await row<{ id: string; voyage_id: string; lead_guest_id: string; suite_ambassador: string | null; suite_ambassador_contact: { name?: string; title?: string } | null }>(
    db.from('reservations').select('id, voyage_id, lead_guest_id, suite_ambassador, suite_ambassador_contact').eq('id', reservationId).maybeSingle(),
  );
  if (!res) return null;
  const [guest, party, membership, ports, bookings, catalogue, requests, occasions, prior] = await Promise.all([
    row<{ first_name: string; preferred_name: string | null }>(db.from('guests').select('first_name, preferred_name').eq('id', res.lead_guest_id).maybeSingle()),
    rows<{ guest_id: string }>(db.from('reservation_guests').select('guest_id').eq('reservation_id', reservationId)),
    row<{ tier: string }>(db.from('loyalty_memberships').select('tier').eq('guest_id', res.lead_guest_id).maybeSingle()),
    rows<{ id: string; day: number; call_date: string; type: string; port_name: string; time_zone: string }>(db.from('port_calls_local').select('id, day, call_date, type, port_name, time_zone').eq('voyage_id', res.voyage_id).order('day')),
    rows<{ id: string; experience_id: string; title: string; category: string; venue: string | null; start_local: string; end_local: string | null; party_size: number; status: string }>(
      db.from('experience_bookings_local').select('id, experience_id, title, category, venue, start_local, end_local, party_size, status').eq('reservation_id', reservationId).order('starts_at').order('id'),
    ),
    rows<{ id: string; category: string; title: string; subtitle: string | null; port_call_id: string | null; destination: string | null; duration_minutes: number | null; inclusive: boolean; price_minor: number | null; currency: string | null; format: string; tags: string[] | null }>(
      db.from('experiences').select('id, category, title, subtitle, port_call_id, destination, duration_minutes, inclusive, price_minor, currency, format, tags').or(`voyage_id.eq.${res.voyage_id},voyage_id.is.null`).eq('active', true).order('sort_order'),
    ),
    rows<{ id: string; type: string; category: Category | null; summary: string; details: string | null; status: RequestStatus; created_at: string; next_update_by: string | null; experience_id: string | null; occasion_step: string | null; acknowledged_at: string | null; closed_at: string | null }>(
      db.from('service_requests_local').select('id, type, category, summary, details, status, created_at, next_update_by, experience_id, occasion_step, acknowledged_at, closed_at').eq('reservation_id', reservationId),
    ),
    rows<{ occasion_date: string; recognition: string }>(db.from('guest_occasions').select('occasion_date, recognition').eq('guest_id', res.lead_guest_id)),
    rows<{ id: string }>(db.from('service_recovery_events').select('id').eq('reservation_id', reservationId)),
  ]);
  const ids = catalogue.map((e) => e.id);
  const slots = ids.length
    ? await rows<{ experience_id: string; start_local: string; end_local: string | null; remaining: number }>(
        db.from('experience_slots_local').select('experience_id, start_local, end_local, remaining').in('experience_id', ids).order('starts_at').order('id'),
      )
    : [];
  const byExperience = new Map<string, { start: string; end?: string; remaining: number }[]>();
  for (const s of slots) byExperience.set(s.experience_id, [...(byExperience.get(s.experience_id) ?? []), { start: s.start_local, ...(s.end_local ? { end: s.end_local } : {}), remaining: s.remaining }]);
  const name = res.suite_ambassador_contact?.name ?? res.suite_ambassador ?? 'Your Suite Ambassador';
  const dates = new Set(ports.map((p) => p.call_date));

  return {
    now: voyageNow(now, ports.map((p) => ({ date: p.call_date, timeZone: p.time_zone }))),
    guest: { firstName: guest?.preferred_name ?? guest?.first_name ?? 'Guest', partySize: Math.max(1, party.length), ...(membership ? { tier: membership.tier } : {}) },
    ambassador: { firstName: name.split(' ')[0] ?? name, title: res.suite_ambassador_contact?.title ?? 'Suite Ambassador' },
    itinerary: ports.map((p) => ({ id: p.id, day: p.day, date: p.call_date, type: p.type, portName: p.port_name })),
    bookings: bookings.map((b) => ({ id: b.id, experienceId: b.experience_id, title: b.title, category: b.category, venue: b.venue ?? '', start: b.start_local, ...(b.end_local ? { end: b.end_local } : {}), partySize: b.party_size, status: b.status })),
    catalogue: catalogue.map((e) => ({
      id: e.id,
      category: e.category,
      title: e.title,
      ...(e.subtitle ? { subtitle: e.subtitle } : {}),
      ...(e.port_call_id ? { portCallId: e.port_call_id } : {}),
      ...(e.destination ? { destination: e.destination } : {}),
      ...(e.duration_minutes ? { durationMinutes: e.duration_minutes } : {}),
      inclusive: e.inclusive,
      ...(e.price_minor !== null && e.currency ? { price: { amountMinor: e.price_minor, currency: e.currency } } : {}),
      format: e.format,
      tags: e.tags ?? [],
    })),
    availability: catalogue.map((e) => ({ experienceId: e.id, slots: byExperience.get(e.id) ?? [] })),
    requests: requests.map((r) => ({
      id: r.id,
      title: r.summary,
      category: r.category ?? categoryFromType(r.type),
      description: r.details ? `${r.summary}\n\n${r.details}` : r.summary,
      status: statusOf({ status: r.status, acknowledgedAt: r.acknowledged_at ?? undefined, closedAt: r.closed_at ?? undefined }),
      createdAt: r.created_at,
      ...(r.next_update_by ? { nextUpdateBy: r.next_update_by } : {}),
      ...(r.experience_id ? { experienceId: r.experience_id } : {}),
      ...(r.occasion_step ? { occasionStep: r.occasion_step } : {}),
    })),
    occasionDates: occasions.filter((o) => o.recognition !== 'private' && dates.has(o.occasion_date)).map((o) => o.occasion_date),
    priorRecoveries: prior.length,
  };
}

interface RuleRow {
  id: string;
  version: number;
  status: GoodwillRule['status'];
  name: string;
  applies_to: GoodwillRule['appliesTo'];
  min_severity: GoodwillRule['minSeverity'];
  conditions: GoodwillRule['conditions'] | null;
  action: GoodwillRule['action'];
  approval: GoodwillRule['approval'];
  authorized_by: string | null;
  authorized_at: string | null;
  effective_from: string | null;
  effective_to: string | null;
}

export const ruleFromRow = (r: RuleRow): GoodwillRule => ({
  id: r.id,
  version: r.version,
  status: r.status,
  name: r.name,
  appliesTo: r.applies_to,
  minSeverity: r.min_severity,
  ...(r.conditions ? { conditions: r.conditions } : {}),
  action: r.action,
  approval: r.approval,
  ...(r.authorized_by ? { authorizedBy: r.authorized_by } : {}),
  ...(r.authorized_at ? { authorizedAt: r.authorized_at } : {}),
  ...(r.effective_from ? { effectiveFrom: r.effective_from } : {}),
  ...(r.effective_to ? { effectiveTo: r.effective_to } : {}),
});

export function supabaseRecoveryPorts(db: Db): RecoveryPorts {
  const find = async (key: string): Promise<RecordedRecovery | null> => {
    const ev = await row<{ id: string; notice: { id: string }[] | { id: string } | null }>(db.from('service_recovery_events').select('id, notice:recovery_notices(id)').eq('disruption_key', key).maybeSingle());
    if (!ev) return null;
    const n = Array.isArray(ev.notice) ? ev.notice[0] : ev.notice;
    return { eventId: ev.id, noticeId: n?.id ?? '' };
  };
  return {
    find,
    context: (d, now) => loadRecoveryContext(db, d.reservationId, now),
    async rules() {
      return (await rows<RuleRow>(db.from('goodwill_rules').select('*'))).map(ruleFromRow);
    },
    async approvedByRule(reservationId) {
      const list = await rows<{ rule_id: string }>(db.from('goodwill_proposals').select('rule_id').eq('reservation_id', reservationId).eq('status', 'approved'));
      const out: Record<string, number> = {};
      for (const p of list) out[p.rule_id] = (out[p.rule_id] ?? 0) + 1;
      return out;
    },
    async save({ plan, notice, title, proposals, journeyEventId }) {
      const d = plan.disruption;
      const a = plan.assessment;
      const { data: ev, error } = await db
        .from('service_recovery_events')
        .insert({
          disruption_key: d.key,
          reservation_id: d.reservationId,
          kind: d.kind,
          source: d.source,
          journey_event_id: journeyEventId ?? null,
          severity: a.severity,
          owner: a.owner,
          escalate: a.escalate,
          follow_up_by: a.followUpBy,
          disruption: d,
          plan: { steps: plan.steps, crewBrief: plan.crewBrief, alternatives: plan.alternatives, factors: a.factors, message: plan.message },
          engine_version: plan.engineVersion,
          occurred_at: d.occurredAt,
        })
        .select('id')
        .single();
      if (error) {
        // Recorded by a concurrent run: one recovery per disruption.
        if (error.code === '23505') {
          const found = await find(d.key);
          if (found) return found;
        }
        throw new Error(error.message);
      }
      const { data: n, error: nErr } = await db.from('recovery_notices').insert({ recovery_event_id: ev.id, reservation_id: d.reservationId, disruption: notice, title: title.slice(0, 200), occurred_at: d.occurredAt }).select('id').single();
      if (nErr) throw new Error(nErr.message);
      if (proposals.length) {
        const { error: pErr } = await db.from('goodwill_proposals').insert(
          proposals.map((p) => ({
            proposal_key: p.id,
            recovery_event_id: ev.id,
            reservation_id: p.reservationId,
            rule_id: p.ruleId,
            rule_version: p.ruleVersion,
            action: p.action,
            financial: p.financial,
            approval_role: p.approvalRole,
            rationale: p.rationale,
          })),
        );
        if (pErr) throw new Error(pErr.message);
      }
      return { eventId: ev.id, noticeId: n.id };
    },
    async audit(entry) {
      await db.from('audit_log').insert({ action: entry.action, resource: 'service_recovery', resource_id: entry.resourceId ?? null, outcome: entry.outcome, metadata: entry.metadata });
    },
  };
}

/** Reservations a scan looks at: in progress, or beginning within three days. */
export async function reservationsToScan(db: Db, now: Date): Promise<{ reservationId: string; guestIds: string[] }[]> {
  const from = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
  const list = await rows<{ id: string; status: string; voyage: { start_date: string; end_date: string } | null; reservation_guests: { guest_id: string }[] }>(
    db.from('reservations').select('id, status, voyage:voyages(start_date, end_date), reservation_guests(guest_id)').neq('status', 'cancelled'),
  );
  return list.filter((r) => r.voyage && r.voyage.start_date <= to && r.voyage.end_date >= from).map((r) => ({ reservationId: r.id, guestIds: r.reservation_guests.map((g) => g.guest_id) }));
}
