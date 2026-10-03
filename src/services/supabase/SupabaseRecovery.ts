/**
 * Service recovery on Supabase.
 *
 *  • SupabaseRecoveryNoticeStore: the guest's notices (recovery_notices,
 *    guest-safe, written by the Edge Functions), answered through
 *    respond_to_recovery_notice(). Under RLS to the party.
 *  • SupabaseRecoveryOperations: recorded events and goodwill proposals for
 *    crew assigned to the reservation, decided through
 *    decide_goodwill_proposal(), which checks the deciding person's role.
 */
import type { GoodwillProposal, ID, RecoveryRecord } from '@/domain';
import type { ServiceRecoveryOperations, Unsubscribe } from '@/services/contracts';
import type { NoticeAnswer, NoticeResponse, RecoveryNoticeStore, StoredNotice } from '@/services/recovery/store';
import type { GuestDisruption } from '../../../supabase/functions/_shared/recovery/types';
import { many, toServiceError, uuid, type SupabaseDeps } from './support';

interface NoticeRow {
  id: string;
  reservation_id: string;
  disruption: GuestDisruption;
  title: string;
  status: 'open' | 'resolved';
  created_at: string;
  response: NoticeResponse | null;
}

export class SupabaseRecoveryNoticeStore implements RecoveryNoticeStore {
  constructor(private readonly deps: SupabaseDeps) {}

  private get db() {
    return this.deps.db();
  }

  async list(reservationId: ID): Promise<StoredNotice[]> {
    const rows = await many<NoticeRow>(
      this.db.from('recovery_notices').select('id, reservation_id, disruption, title, status, created_at, response').eq('reservation_id', uuid(reservationId, 'Reservation')).order('created_at').order('id'),
    );
    return rows.map((r) => ({ id: r.id, reservationId: r.reservation_id, disruption: r.disruption, title: r.title, status: r.status, createdAt: r.created_at, response: r.response ?? {} }));
  }

  async respond(noticeId: ID, answer: NoticeAnswer): Promise<void> {
    const { error } = await this.db.rpc('respond_to_recovery_notice', {
      p_notice: uuid(noticeId, 'Notice'),
      p_kind: answer.kind,
      p_alternative: answer.kind === 'accepted' ? answer.alternativeId : null,
      p_title: answer.kind === 'accepted' ? answer.title : null,
      p_booking: answer.kind === 'accepted' ? (answer.bookingId ?? null) : null,
      p_request: answer.requestId ?? null,
    });
    if (error) throw toServiceError(error);
  }

  subscribe(reservationId: ID, onChange: () => void): Unsubscribe {
    const id = uuid(reservationId, 'Reservation');
    const db = this.db;
    const channel = db
      .channel(`recovery:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recovery_notices', filter: `reservation_id=eq.${id}` }, () => onChange())
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }
}

interface EventRow {
  id: string;
  disruption_key: string;
  reservation_id: string;
  kind: RecoveryRecord['kind'];
  source: RecoveryRecord['source'];
  severity: RecoveryRecord['assessment']['severity'];
  owner: RecoveryRecord['assessment']['owner'];
  escalate: boolean;
  follow_up_by: string;
  status: RecoveryRecord['status'];
  plan: { steps: RecoveryRecord['steps']; crewBrief: string[]; alternatives: { title: string }[]; factors: string[] };
  engine_version: string;
  occurred_at: string;
  recorded_at: string;
}

interface ProposalRow {
  id: string;
  proposal_key: string;
  reservation_id: string;
  rule_id: string;
  rule_version: number;
  action: GoodwillProposal['action'];
  financial: boolean;
  approval_role: GoodwillProposal['approvalRole'];
  rationale: string;
  status: GoodwillProposal['status'];
  proposed_at: string;
  decided_at: string | null;
  decided_by: string | null;
  note: string | null;
  recovery: { disruption_key: string } | null;
}

const PROPOSAL_COLUMNS = 'id, proposal_key, reservation_id, rule_id, rule_version, action, financial, approval_role, rationale, status, proposed_at, decided_at, decided_by, note, recovery:service_recovery_events(disruption_key)';

/** Proposals are addressed by their row id here; `id` in the engine is the stable key. */
const toProposal = (p: ProposalRow): GoodwillProposal => ({
  id: p.id,
  disruptionKey: p.recovery?.disruption_key ?? p.proposal_key.replace(/:[^:]+@\d+$/, ''),
  reservationId: p.reservation_id,
  ruleId: p.rule_id,
  ruleVersion: p.rule_version,
  action: p.action,
  financial: p.financial,
  approvalRole: p.approval_role,
  rationale: p.rationale,
  status: p.status,
  proposedAt: p.proposed_at,
  ...(p.decided_at ? { decidedAt: p.decided_at } : {}),
  ...(p.decided_by ? { decidedBy: p.decided_by } : {}),
  ...(p.note ? { note: p.note } : {}),
});

export class SupabaseRecoveryOperations implements ServiceRecoveryOperations {
  constructor(private readonly deps: SupabaseDeps) {}

  private get db() {
    return this.deps.db();
  }

  async listRecords(reservationId: ID): Promise<RecoveryRecord[]> {
    const rows = await many<EventRow>(
      this.db
        .from('service_recovery_events')
        .select('id, disruption_key, reservation_id, kind, source, severity, owner, escalate, follow_up_by, status, plan, engine_version, occurred_at, recorded_at')
        .eq('reservation_id', uuid(reservationId, 'Reservation'))
        .order('recorded_at'),
    );
    return rows.map((r) => ({
      id: r.id,
      disruptionKey: r.disruption_key,
      reservationId: r.reservation_id,
      kind: r.kind,
      source: r.source,
      assessment: { severity: r.severity, factors: r.plan.factors, owner: r.owner, escalate: r.escalate, followUpBy: r.follow_up_by },
      steps: r.plan.steps,
      crewBrief: r.plan.crewBrief,
      alternativesOffered: r.plan.alternatives.map((a) => a.title),
      status: r.status,
      occurredAt: r.occurred_at,
      recordedAt: r.recorded_at,
      engineVersion: r.engine_version,
    }));
  }

  async listProposals(reservationId: ID): Promise<GoodwillProposal[]> {
    const rows = await many<ProposalRow>(this.db.from('goodwill_proposals').select(PROPOSAL_COLUMNS).eq('reservation_id', uuid(reservationId, 'Reservation')).order('proposed_at').order('id'));
    return rows.map(toProposal);
  }

  async decideProposal(proposalId: ID, decision: { approve: boolean; note?: string }): Promise<GoodwillProposal> {
    const { error } = await this.db.rpc('decide_goodwill_proposal', { p_proposal: uuid(proposalId, 'Proposal'), p_approve: decision.approve, p_note: decision.note?.trim() || null });
    if (error) throw toServiceError(error);
    const [row] = await many<ProposalRow>(this.db.from('goodwill_proposals').select(PROPOSAL_COLUMNS).eq('id', proposalId));
    if (!row) throw toServiceError({ code: 'P0002', message: 'Proposal not found' });
    return toProposal(row);
  }
}
