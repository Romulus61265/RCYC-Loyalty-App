/**
 * View models for a celebration: the message, the steps, and the words of
 * the approval the guest gives before anything is requested. Pure.
 */
import type { CelebrationPlan, CelebrationStep } from '@/domain';
import { categoryLabel } from '@/services/shared/serviceRequests';
import { formatLongDate, formatShortDate } from '@/utils/format';
import type { Tone } from '@/features/shared/status';

export interface CelebrationStepModel {
  id: string;
  heading: string;
  title: string;
  detail: string;
  /** "Thursday 20 May · 20:30 · Aboard Evrima in Monte Carlo" */
  meta?: string;
  status?: { label: string; tone: Tone };
  /** The request it became, when there is one. */
  requestId?: string;
  action?: {
    label: string;
    price?: string;
    chargeable: boolean;
    /** What will be sent, in plain words, before the guest agrees. */
    summary: string;
    /** For chargeable steps: the line the guest ticks. */
    acknowledgement?: string;
    confirmLabel: string;
  };
}

export interface CelebrationModel {
  key: string;
  eyebrow: string;
  title: string;
  body: string[];
  signature: string;
  steps: CelebrationStepModel[];
  inHand: number;
  assurance: string;
}

function summaryFor(s: CelebrationStep, party: number): string {
  const p = s.proposal!;
  if (p.kind === 'request-experience') {
    return `A request for ${s.title} on ${formatLongDate(p.start)} at ${p.start.slice(11, 16)}, for ${party === 1 ? 'one' : party === 2 ? 'two' : party}. The team will confirm it with you; nothing is booked until they do.`;
  }
  return `A ${categoryLabel(p.category).toLowerCase()} request, in your words: “${p.description}”`;
}

export function stepModel(s: CelebrationStep, party: number): CelebrationStepModel {
  const meta = [s.date ? formatLongDate(s.date) : undefined, s.time, s.destination].filter(Boolean).join(' · ') || undefined;
  const model: CelebrationStepModel = { id: s.id, heading: s.heading, title: s.title, detail: s.detail, ...(meta ? { meta } : {}) };
  if (s.state === 'in-hand' && s.inHand) {
    model.status = { label: s.inHand.label, tone: s.inHand.tone };
    if (s.inHand.requestId) model.requestId = s.inHand.requestId;
  } else if (s.proposal && s.actionLabel) {
    model.action = {
      label: s.actionLabel,
      ...(s.price ? { price: s.price } : {}),
      chargeable: s.chargeable,
      summary: summaryFor(s, party),
      ...(s.chargeable && s.price ? { acknowledgement: `I understand ${s.price} will be charged to my account once the team confirms it.` } : {}),
      confirmLabel: s.proposal.kind === 'request-experience' ? 'Send the request' : 'Send to the team',
    };
  }
  return model;
}

export function buildCelebrationModel(plan: CelebrationPlan, party: number): CelebrationModel {
  return {
    key: plan.celebration.key,
    eyebrow: plan.message.eyebrow,
    title: plan.message.title,
    body: plan.message.body,
    signature: plan.message.signature,
    steps: plan.steps.map((s) => stepModel(s, party)),
    inHand: plan.steps.filter((s) => s.state === 'in-hand').length,
    assurance: plan.assurance,
  };
}

/** The Home card for the next celebration. */
export interface CelebrationCardModel {
  key: string;
  eyebrow: string;
  title: string;
  line: string;
  cta: string;
}

export function celebrationCard(plan: CelebrationPlan): CelebrationCardModel {
  const c = plan.celebration;
  const inHand = plan.steps.filter((s) => s.state === 'in-hand').length;
  const ideas = plan.steps.length - inHand;
  return {
    key: c.key,
    eyebrow: `${formatShortDate(c.date)} · ${c.atSea ? 'At sea' : (c.port ?? 'Aboard')}`,
    title: plan.message.title,
    line: inHand ? `${inHand} already in hand${ideas ? `, ${ideas} more ${ideas === 1 ? 'idea' : 'ideas'} for the day` : ''}.` : 'A few ideas for the day.',
    cta: c.kind === 'anniversary' ? 'Plan your anniversary' : c.kind === 'birthday' ? 'Plan your birthday' : c.kind === 'honeymoon' ? 'Plan your honeymoon' : 'See the ideas',
  };
}

/** Celebration keys contain ':'; they travel in the URL encoded. */
export const celebrationHref = (key: string) => `/celebration/${encodeURIComponent(key)}` as const;
