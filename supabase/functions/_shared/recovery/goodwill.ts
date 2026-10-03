// Goodwill: authorised business rules decide; the engine only proposes.
//
//  • Only approved rules count, and only once someone has authorised them,
//    inside their effective dates.
//  • A match is a proposal for the crew. It is never carried out
//    automatically, and the guest never sees it.
//  • Financial actions (credits, refunds, points) are never proposed while the
//    policy keeps them off, which is how the MVP ships.
//  • A proposal is approved only by someone holding the role its rule names
//    (or an admin); financial ones by an admin alone, up to the rule's limit
//    per reservation.
import { atLeast } from './engine.ts';
import type { CrewRole, GoodwillPolicy, GoodwillProposal, GoodwillRule, GoodwillSkip, RecoveryContext, RecoveryPlan } from './types.ts';
import { FINANCIAL_ACTIONS } from './types.ts';

export const isFinancial = (rule: Pick<GoodwillRule, 'action'>) => FINANCIAL_ACTIONS.includes(rule.action.kind);

export function isActive(rule: GoodwillRule, now: string): GoodwillSkip['reason'] | null {
  if (rule.status !== 'approved') return 'not-approved';
  if (!rule.authorizedBy || !rule.authorizedAt) return 'not-authorized';
  const t = Date.parse(now);
  if ((rule.effectiveFrom && Date.parse(rule.effectiveFrom) > t) || (rule.effectiveTo && Date.parse(rule.effectiveTo) <= t)) return 'not-effective';
  return null;
}

export interface GoodwillInput {
  plan: RecoveryPlan;
  ctx: Pick<RecoveryContext, 'now' | 'guest' | 'occasionDates' | 'priorRecoveries' | 'bookings' | 'catalogue'>;
  rules: GoodwillRule[];
  policy: GoodwillPolicy;
  /** Proposals already approved on this reservation, per rule id. */
  approvedByRule: Record<string, number>;
}

export function evaluateGoodwill(input: GoodwillInput): { proposals: GoodwillProposal[]; skipped: GoodwillSkip[] } {
  const { plan, ctx, rules, policy } = input;
  const d = plan.disruption;
  const proposals: GoodwillProposal[] = [];
  const skipped: GoodwillSkip[] = [];
  const booking = d.subject.bookingId ? ctx.bookings.find((b) => b.id === d.subject.bookingId) : undefined;
  const experience = ctx.catalogue.find((x) => x.id === (d.subject.experienceId ?? booking?.experienceId));
  const date = d.details?.date ?? booking?.start.slice(0, 10);

  for (const rule of [...rules].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const inactive = isActive(rule, ctx.now);
    if (inactive) {
      skipped.push({ ruleId: rule.id, reason: inactive });
      continue;
    }
    if (!rule.appliesTo.includes(d.kind)) {
      skipped.push({ ruleId: rule.id, reason: 'kind' });
      continue;
    }
    if (!atLeast(plan.assessment.severity, rule.minSeverity)) {
      skipped.push({ ruleId: rule.id, reason: 'severity' });
      continue;
    }
    const c = rule.conditions ?? {};
    const met =
      (!c.tiers || (ctx.guest.tier !== undefined && c.tiers.includes(ctx.guest.tier))) &&
      (!c.occasionDay || (date !== undefined && ctx.occasionDates.includes(date))) &&
      (c.minRecoveries === undefined || ctx.priorRecoveries + 1 >= c.minRecoveries) &&
      (!c.privateOrPaid || Boolean(experience && (experience.format === 'private' || !experience.inclusive)));
    if (!met) {
      skipped.push({ ruleId: rule.id, reason: 'conditions' });
      continue;
    }
    const financial = isFinancial(rule);
    if (financial && !policy.financialEnabled) {
      skipped.push({ ruleId: rule.id, reason: 'financial-disabled' });
      continue;
    }
    if ((input.approvedByRule[rule.id] ?? 0) >= rule.approval.maxPerReservation) {
      skipped.push({ ruleId: rule.id, reason: 'limit' });
      continue;
    }
    proposals.push({
      id: `${d.key}:${rule.id}@${rule.version}`,
      disruptionKey: d.key,
      reservationId: d.reservationId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      action: rule.action,
      financial,
      approvalRole: financial ? 'admin' : rule.approval.role,
      rationale: `${rule.name} (v${rule.version}, authorised by ${rule.authorizedBy}): ${plan.assessment.severity} ${d.kind}; ${plan.assessment.factors.join('; ')}.`,
      status: 'proposed',
      proposedAt: ctx.now,
    });
  }
  return { proposals, skipped };
}

export interface GoodwillDecision {
  approve: boolean;
  actor: { id: string; roles: string[] };
  note?: string;
  now: string;
}

export type DecisionRefusal = 'already-decided' | 'forbidden' | 'rule-inactive' | 'financial-disabled' | 'limit';

/**
 * A person's decision on a proposal. Approving records the authority to
 * carry the gesture out; it does not carry it out.
 */
export function decideProposal(
  proposal: GoodwillProposal,
  rule: GoodwillRule | undefined,
  decision: GoodwillDecision,
  ctx: { policy: GoodwillPolicy; approvedForRule: number },
): { ok: true; proposal: GoodwillProposal } | { ok: false; reason: DecisionRefusal } {
  if (proposal.status !== 'proposed') return { ok: false, reason: 'already-decided' };
  const roles = decision.actor.roles;
  const may = (role: CrewRole) => roles.includes('admin') || roles.includes(role);
  if (!may(proposal.approvalRole)) return { ok: false, reason: 'forbidden' };
  const decided = { ...proposal, decidedAt: decision.now, decidedBy: decision.actor.id, ...(decision.note?.trim() ? { note: decision.note.trim().slice(0, 500) } : {}) };
  if (!decision.approve) return { ok: true, proposal: { ...decided, status: 'declined' } };
  // Approval re-checks the rule as it stands now, not as it stood when proposed.
  if (!rule || rule.version !== proposal.ruleVersion || isActive(rule, decision.now)) return { ok: false, reason: 'rule-inactive' };
  if (proposal.financial && (!ctx.policy.financialEnabled || !roles.includes('admin'))) return { ok: false, reason: proposal.financial && !ctx.policy.financialEnabled ? 'financial-disabled' : 'forbidden' };
  if (ctx.approvedForRule >= rule.approval.maxPerReservation) return { ok: false, reason: 'limit' };
  return { ok: true, proposal: { ...decided, status: 'approved' } };
}
