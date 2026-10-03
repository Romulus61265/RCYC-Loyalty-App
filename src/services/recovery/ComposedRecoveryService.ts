/**
 * ServiceRecoveryService over the other services' contracts, so mock and
 * Supabase modes share it. Each stored notice is planned afresh with the
 * shared engine, so its alternatives are what is free now, not when the
 * disruption was recorded. An alternative becomes a booking request or a
 * service request only on the guest's explicit approval; nothing is ever
 * purchased, charged or compensated here.
 */
import type { ID, RecoveryAcceptance, RecoveryApproval, RecoveryNotice } from '@/domain';
import type { ServiceRecoveryService, Unsubscribe } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { isCategory } from '@/services/shared/serviceRequests';
import { planRecovery, recoveryTag } from '../../../supabase/functions/_shared/recovery/engine';
import type { RecoveryPlan } from '../../../supabase/functions/_shared/recovery/types';
import { buildRecoveryContext, type RecoveryDeps } from './buildContext';
import type { RecoveryNoticeStore, StoredNotice } from './store';

const categoryOf = (c: string) => (isCategory(c) ? c : 'concierge');

const byRecorded = (a: StoredNotice, b: StoredNotice) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : 1);

export function toNotice(stored: StoredNotice, plan: RecoveryPlan): RecoveryNotice {
  const accepted = stored.response.accepted;
  const assistance = stored.response.assistance;
  const notice: RecoveryNotice = {
    id: stored.id,
    kind: stored.disruption.kind,
    occurredAt: stored.disruption.occurredAt,
    eyebrow: plan.message.eyebrow,
    title: plan.message.title,
    body: plan.message.body,
    signature: plan.message.signature,
    subject: { title: plan.subject.title, ...(plan.subject.date ? { date: plan.subject.date } : {}), ...(plan.subject.bookingId ? { bookingId: plan.subject.bookingId } : {}) },
    // Once one is chosen, the others are no longer on offer.
    alternatives: accepted ? [] : plan.alternatives.map(({ proposal: _p, ...a }) => a),
    assistance: { label: plan.assistance.label, requested: Boolean(assistance), ...(assistance ? { requestId: assistance.requestId } : {}) },
    assurance: plan.assurance,
    status: accepted || stored.status === 'resolved' ? 'resolved' : 'open',
  };
  if (plan.explanation) notice.explanation = plan.explanation;
  if (accepted) notice.accepted = { alternativeId: accepted.alternativeId, title: accepted.title, ...(accepted.bookingId ? { bookingId: accepted.bookingId } : {}), ...(accepted.requestId ? { requestId: accepted.requestId } : {}) };
  return notice;
}

export class ComposedRecoveryService implements ServiceRecoveryService {
  constructor(
    private readonly s: RecoveryDeps,
    private readonly store: RecoveryNoticeStore,
  ) {}

  private async planned(guestId: ID, reservationId: ID): Promise<{ stored: StoredNotice; plan: RecoveryPlan }[]> {
    const stored = (await this.store.list(reservationId)).sort(byRecorded);
    if (!stored.length) return [];
    // One read of the guest's data for every notice; only the count of earlier recoveries differs.
    const ctx = await buildRecoveryContext(this.s, guestId, reservationId, 0);
    return stored.map((n, i) => ({ stored: n, plan: planRecovery(n.disruption, { ...ctx, priorRecoveries: i }) }));
  }

  async listNotices(guestId: ID, reservationId: ID): Promise<RecoveryNotice[]> {
    const list = (await this.planned(guestId, reservationId)).map(({ stored, plan }) => toNotice(stored, plan));
    return list.sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  }

  private async one(guestId: ID, reservationId: ID, noticeId: ID) {
    const found = (await this.planned(guestId, reservationId)).find((p) => p.stored.id === noticeId);
    if (!found) throw new ServiceError('not_found', 'This notice is no longer available');
    return found;
  }

  async getNotice(guestId: ID, reservationId: ID, noticeId: ID): Promise<RecoveryNotice> {
    const { stored, plan } = await this.one(guestId, reservationId, noticeId);
    return toNotice(stored, plan);
  }

  async acceptAlternative(guestId: ID, reservationId: ID, noticeId: ID, approval: RecoveryApproval): Promise<RecoveryAcceptance> {
    // The guest's yes is required, every time; nothing is assumed.
    if (!approval || approval.approved !== true) throw new ServiceError('validation', 'Please confirm before we arrange anything');
    const { stored, plan } = await this.one(guestId, reservationId, noticeId);
    if (stored.response.accepted) throw new ServiceError('conflict', 'An alternative is already in hand');
    const alt = plan.alternatives.find((a) => a.id === approval.alternativeId);
    if (!alt) throw new ServiceError('not_found', 'That alternative is no longer available');
    if (alt.chargeable && approval.acknowledgedCharge !== true) throw new ServiceError('validation', 'Please confirm you are happy with the price before we request it');
    const note = approval.note?.trim().slice(0, 500);
    const why = `In place of ${plan.subject.title}.`;

    let ids: { bookingId?: ID; requestId?: ID };
    const p = alt.proposal;
    if (p.kind === 'request-experience') {
      // A request for the team to confirm; any price is charged only once confirmed.
      const booking = await this.s.experience.requestBooking(reservationId, p.experienceId, p.start, p.partySize, note ? `${why} ${note}` : why);
      ids = { bookingId: booking.id };
    } else {
      const request = await this.s.requests.submit({ reservationId, category: categoryOf(p.category), description: note ? `${p.description}\n\n${note}` : p.description, priority: p.priority, occasionStep: recoveryTag(noticeId, alt.experienceId ?? 'in-suite') });
      ids = { requestId: request.id };
    }
    await this.store.respond(noticeId, { kind: 'accepted', alternativeId: alt.id, title: alt.title, ...ids });
    return { notice: await this.getNotice(guestId, reservationId, noticeId), ...ids };
  }

  async requestAssistance(guestId: ID, reservationId: ID, noticeId: ID, note?: string): Promise<RecoveryAcceptance> {
    const { stored, plan } = await this.one(guestId, reservationId, noticeId);
    if (stored.response.assistance) throw new ServiceError('conflict', `${plan.assistance.label.replace(/^Ask /, '')} already has this in hand`);
    const words = note?.trim().slice(0, 500);
    const request = await this.s.requests.submit({
      reservationId,
      category: categoryOf(plan.assistance.category),
      description: words ? `${plan.assistance.description}\n\n${words}` : plan.assistance.description,
      priority: plan.assistance.priority,
      occasionStep: recoveryTag(noticeId, 'assist'),
    });
    await this.store.respond(noticeId, { kind: 'assistance', requestId: request.id });
    return { notice: await this.getNotice(guestId, reservationId, noticeId), requestId: request.id };
  }

  subscribe(reservationId: ID, listener: () => void): Unsubscribe {
    return this.store.subscribe(reservationId, listener);
  }
}
