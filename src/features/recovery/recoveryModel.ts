/**
 * View models for a recovery notice: the message, the reason, the
 * alternatives and the words of the approval the guest gives before anything
 * is requested. Pure.
 */
import type { GuestRecoveryAlternative, RecoveryNotice } from '@/domain';
import { formatLongDate, formatShortDate } from '@/utils/format';

export interface RecoveryAlternativeModel {
  id: string;
  title: string;
  detail: string;
  /** "Tuesday 18 May · 10:00 · Saint-Tropez" */
  meta?: string;
  price?: string;
  chargeable: boolean;
  label: string;
  /** What will be sent, in plain words, before the guest agrees. */
  summary: string;
  /** For chargeable alternatives: the line the guest ticks. */
  acknowledgement?: string;
  confirmLabel: string;
}

export interface RecoveryModel {
  id: string;
  eyebrow: string;
  title: string;
  body: string[];
  explanation?: string;
  signature: string;
  alternatives: RecoveryAlternativeModel[];
  accepted?: { title: string; line: string; bookingId?: string; requestId?: string };
  assistance: { label: string; requested: boolean; requestId?: string; line: string };
  assurance: string;
  resolved: boolean;
}

const partyWords = (n: number) => (n === 1 ? 'one' : n === 2 ? 'two' : String(n));

function alternativeModel(a: GuestRecoveryAlternative, subject: string, party: number): RecoveryAlternativeModel {
  const meta = [a.date ? formatLongDate(a.date) : undefined, a.time, a.destination].filter(Boolean).join(' · ') || undefined;
  const summary = a.experienceId
    ? `A request for ${a.title}${a.date ? ` on ${formatLongDate(a.date)}` : ''}${a.time ? ` at ${a.time}` : ''}, for ${partyWords(party)}, in place of “${subject}”. The team will confirm it with you; nothing is booked until they do.`
    : `A request to the team: ${a.title.charAt(0).toLowerCase()}${a.title.slice(1)}${a.date ? ` on ${formatLongDate(a.date)}` : ''}${a.time ? ` at ${a.time}` : ''}, in place of “${subject}”.`;
  return {
    id: a.id,
    title: a.title,
    detail: a.detail,
    ...(meta ? { meta } : {}),
    ...(a.price ? { price: a.price } : {}),
    chargeable: a.chargeable,
    label: a.actionLabel,
    summary,
    ...(a.chargeable && a.price ? { acknowledgement: `I understand ${a.price} will be charged to my account once the team confirms it.` } : {}),
    confirmLabel: a.experienceId ? 'Send the request' : 'Send to the team',
  };
}

export function buildRecoveryModel(n: RecoveryNotice, party: number): RecoveryModel {
  const ambassador = n.assistance.label.replace(/^Ask /, '');
  return {
    id: n.id,
    eyebrow: n.eyebrow,
    title: n.title,
    body: n.body,
    ...(n.explanation ? { explanation: n.explanation } : {}),
    signature: n.signature,
    alternatives: n.alternatives.map((a) => alternativeModel(a, n.subject.title, party)),
    ...(n.accepted
      ? {
          accepted: {
            title: n.accepted.title,
            line: n.accepted.bookingId ? 'The team will confirm it with you; nothing is booked until they do.' : 'With the team. You will see each update in Your requests.',
            ...(n.accepted.bookingId ? { bookingId: n.accepted.bookingId } : {}),
            ...(n.accepted.requestId ? { requestId: n.accepted.requestId } : {}),
          },
        }
      : {}),
    assistance: {
      label: n.assistance.label,
      requested: n.assistance.requested,
      ...(n.assistance.requestId ? { requestId: n.assistance.requestId } : {}),
      line: n.assistance.requested
        ? `${ambassador} has this in hand and will come back to you personally.`
        : n.accepted
          ? `If you would like anything else, ${ambassador} is here.`
          : n.alternatives.length
          ? `Or ${ambassador} can arrange something else entirely.`
          : `${ambassador} is ready to help, with anything at all.`,
    },
    assurance: n.assurance,
    resolved: n.status === 'resolved',
  };
}

/** The Home card for an open notice. */
export interface RecoveryCardModel {
  id: string;
  eyebrow: string;
  title: string;
  line: string;
  cta: string;
}

export function recoveryCard(n: RecoveryNotice): RecoveryCardModel {
  const ambassador = n.assistance.label.replace(/^Ask /, '');
  const count = n.alternatives.length;
  return {
    id: n.id,
    eyebrow: n.subject.date ? `${n.eyebrow} · ${formatShortDate(n.subject.date)}` : n.eyebrow,
    title: n.title,
    line: count ? `${ambassador} has ${count === 1 ? 'an alternative' : `${count} comparable alternatives`} for you.` : `${ambassador} is ready to help.`,
    cta: count ? 'See the alternatives' : 'Read more',
  };
}

export const recoveryHref = (id: string) => `/recovery/${encodeURIComponent(id)}` as const;
