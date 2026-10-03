/**
 * Where recovery notices live. Supabase: recovery_notices, written by the
 * Edge Functions, answered through an RPC. Mock: MemoryRecoveryStore, which
 * also stands in for the server, recording each disruption with the same
 * shared handler the Edge Functions use.
 */
import type { GoodwillProposal, ID, ISODateTime, RecoveryRecord } from '@/domain';
import type { ServiceRecoveryOperations, Unsubscribe } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { decideProposal } from '../../../supabase/functions/_shared/recovery/goodwill';
import { processDisruption, type ProcessResult, type RecoveryPorts } from '../../../supabase/functions/_shared/recovery/handler';
import type { Disruption, GoodwillPolicy, GoodwillRule, GuestDisruption, RecoveryPlan } from '../../../supabase/functions/_shared/recovery/types';
import { MVP_GOODWILL_POLICY } from '../../../supabase/functions/_shared/recovery/types';
import { buildRecoveryContext, type RecoveryDeps } from './buildContext';

export interface NoticeResponse {
  accepted?: { alternativeId: string; title: string; bookingId?: ID; requestId?: ID; at: ISODateTime };
  assistance?: { requestId: ID; at: ISODateTime };
}

export interface StoredNotice {
  id: ID;
  reservationId: ID;
  disruption: GuestDisruption;
  title: string;
  status: 'open' | 'resolved';
  /** When it was recorded (orders repeat disruptions). */
  createdAt: ISODateTime;
  response: NoticeResponse;
}

export type NoticeAnswer =
  | { kind: 'accepted'; alternativeId: string; title: string; bookingId?: ID; requestId?: ID }
  | { kind: 'assistance'; requestId: ID };

export interface RecoveryNoticeStore {
  list(reservationId: ID): Promise<StoredNotice[]>;
  respond(noticeId: ID, answer: NoticeAnswer): Promise<void>;
  subscribe(reservationId: ID, onChange: () => void): Unsubscribe;
}

let seq = 0;

export class MemoryRecoveryStore implements RecoveryNoticeStore {
  private notices: StoredNotice[] = [];
  private records: (RecoveryRecord & { plan: RecoveryPlan })[] = [];
  private proposals: GoodwillProposal[] = [];
  private listeners = new Set<{ reservationId: ID; fn: () => void }>();

  constructor(
    private readonly s: RecoveryDeps,
    private readonly opts: {
      rules: GoodwillRule[];
      policy?: GoodwillPolicy;
      /** Runs once, before the first read (the mock demo reports its disruption here). */
      prepare?: (store: MemoryRecoveryStore) => Promise<void>;
    },
  ) {}

  private prepared?: Promise<void>;
  private ready(): Promise<void> {
    this.prepared ??= this.opts.prepare ? this.opts.prepare(this).catch(() => undefined) : Promise.resolve();
    return this.prepared;
  }

  private notify(reservationId: ID) {
    for (const l of this.listeners) if (l.reservationId === reservationId) l.fn();
  }

  /** The server side, in memory: the same handler the Edge Functions run. */
  private ports(): RecoveryPorts {
    return {
      find: async (key) => {
        const r = this.records.find((x) => x.disruptionKey === key);
        const n = r && this.notices.find((x) => x.disruption.key === key);
        return r && n ? { eventId: r.id, noticeId: n.id } : null;
      },
      context: async (d) => {
        const overview = await this.s.voyage.getOverview(d.reservationId);
        return buildRecoveryContext(this.s, overview.reservation.leadGuestId, d.reservationId, this.records.filter((r) => r.reservationId === d.reservationId).length);
      },
      rules: async () => this.opts.rules,
      approvedByRule: async (reservationId) => {
        const out: Record<string, number> = {};
        for (const p of this.proposals) if (p.reservationId === reservationId && p.status === 'approved') out[p.ruleId] = (out[p.ruleId] ?? 0) + 1;
        return out;
      },
      save: async ({ plan, notice, title, proposals }) => {
        const d = plan.disruption;
        const at = this.s.clock.now().toISOString();
        seq += 1;
        const eventId = `rcv_${seq}`;
        const noticeId = `ntc_${seq}`;
        this.records.push({
          id: eventId,
          disruptionKey: d.key,
          reservationId: d.reservationId,
          kind: d.kind,
          source: d.source,
          assessment: plan.assessment,
          steps: plan.steps,
          crewBrief: plan.crewBrief,
          alternativesOffered: plan.alternatives.map((a) => a.title),
          status: 'open',
          occurredAt: d.occurredAt,
          recordedAt: at,
          engineVersion: plan.engineVersion,
          plan,
        });
        this.notices.push({ id: noticeId, reservationId: d.reservationId, disruption: notice, title, status: 'open', createdAt: at, response: {} });
        this.proposals.push(...proposals);
        this.notify(d.reservationId);
        return { eventId, noticeId };
      },
      audit: async () => {},
    };
  }

  /** Records a disruption, once (as journey-events or the scan would). */
  report(d: Disruption, policy: GoodwillPolicy = this.opts.policy ?? MVP_GOODWILL_POLICY): Promise<ProcessResult> {
    return processDisruption(this.ports(), d, { now: this.s.clock.now(), policy });
  }

  async list(reservationId: ID): Promise<StoredNotice[]> {
    await this.ready();
    return this.notices.filter((n) => n.reservationId === reservationId).map((n) => JSON.parse(JSON.stringify(n)) as StoredNotice);
  }

  async respond(noticeId: ID, answer: NoticeAnswer): Promise<void> {
    await this.ready();
    const n = this.notices.find((x) => x.id === noticeId);
    if (!n) throw new ServiceError('not_found', 'This notice is no longer available');
    const at = this.s.clock.now().toISOString();
    if (answer.kind === 'accepted') {
      if (n.response.accepted) throw new ServiceError('conflict', 'An alternative is already in hand');
      const { kind: _k, ...rest } = answer;
      n.response.accepted = { ...rest, at };
      n.status = 'resolved';
    } else {
      n.response.assistance = { requestId: answer.requestId, at };
    }
    const r = this.records.find((x) => x.disruptionKey === n.disruption.key);
    if (r && r.status === 'open') r.status = 'in-hand';
    this.notify(n.reservationId);
  }

  subscribe(reservationId: ID, onChange: () => void): Unsubscribe {
    const l = { reservationId, fn: onChange };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** The crew's view, for a crew member with these roles. */
  operations(actor: { id: string; roles: string[] }): ServiceRecoveryOperations {
    const crew = actor.roles.some((r) => ['suite_ambassador', 'concierge_agent', 'shore_ops', 'admin'].includes(r));
    const guard = () => {
      if (!crew) throw new ServiceError('forbidden', 'Crew only');
    };
    return {
      listRecords: async (reservationId) => {
        guard();
        return this.records.filter((r) => r.reservationId === reservationId).map(({ plan: _p, ...r }) => JSON.parse(JSON.stringify(r)) as RecoveryRecord);
      },
      listProposals: async (reservationId) => {
        guard();
        return this.proposals.filter((p) => p.reservationId === reservationId).map((p) => ({ ...p }));
      },
      decideProposal: async (proposalId, decision) => {
        guard();
        const i = this.proposals.findIndex((p) => p.id === proposalId);
        const p = this.proposals[i];
        if (!p) throw new ServiceError('not_found', 'No such proposal');
        const rule = this.opts.rules.find((r) => r.id === p.ruleId);
        const approvedForRule = this.proposals.filter((x) => x.reservationId === p.reservationId && x.ruleId === p.ruleId && x.status === 'approved').length;
        const out = decideProposal(p, rule, { ...decision, actor, now: this.s.clock.now().toISOString() }, { policy: this.opts.policy ?? MVP_GOODWILL_POLICY, approvedForRule });
        if (!out.ok) throw new ServiceError(out.reason === 'forbidden' ? 'forbidden' : 'conflict', `Not decided: ${out.reason}`);
        this.proposals[i] = out.proposal;
        return { ...out.proposal };
      },
    };
  }
}
