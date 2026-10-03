/**
 * OccasionService over the other services' contracts, so mock and Supabase
 * modes share it: it reads the guest, voyage, bookings and requests, plans
 * with the pure engine, and carries out a step only on explicit approval —
 * as a booking request (status 'received', for the team to confirm) or a
 * service request. It never books, buys or charges anything itself.
 */
import type { CelebrationApproval, CelebrationApprovalResult, CelebrationPlan, ID } from '@/domain';
import type { OccasionService, Services } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { detectCelebrations, planCelebration, type CelebrationInput } from './celebrations';

type Deps = Pick<Services, 'profile' | 'loyalty' | 'voyage' | 'experience' | 'requests' | 'clock'>;

export class ComposedOccasionService implements OccasionService {
  constructor(private readonly s: Deps) {}

  private async input(guestId: ID, reservationId: ID): Promise<CelebrationInput> {
    const { profile, loyalty, voyage, experience, requests, clock } = this.s;
    const overview = await voyage.getOverview(reservationId);
    const [p, membership, relationship, catalogue, availability, bookings, active, history] = await Promise.all([
      profile.getProfile(guestId),
      loyalty.getMembership(guestId).catch(() => null),
      loyalty.getRelationship(guestId).catch(() => undefined),
      experience.listCatalogue(overview.voyage.id),
      experience.listAvailability(overview.voyage.id).catch(() => []),
      experience.listBookings(reservationId),
      // Not optional: without them, something already requested could be offered again.
      requests.listActive(reservationId),
      requests.listHistory(reservationId),
    ]);
    const contact = overview.reservation.suiteAmbassadorContact;
    const ambassador = contact?.name ?? overview.reservation.suiteAmbassador ?? 'Your Suite Ambassador';
    return {
      now: clock.now(),
      guest: { id: p.guest.id, firstName: p.guest.firstName, preferredName: p.guest.preferredName },
      companions: p.companions,
      occasions: p.occasions,
      preferences: p.preferences,
      membership,
      relationship,
      voyage: overview.voyage,
      yachtName: overview.yacht.name,
      ambassador: { firstName: ambassador.split(' ')[0] ?? ambassador, title: contact?.title ?? 'Suite Ambassador' },
      catalogue,
      availability,
      bookings,
      requests: [...active, ...history],
    };
  }

  async listCelebrations(guestId: ID, reservationId: ID): Promise<CelebrationPlan[]> {
    const input = await this.input(guestId, reservationId);
    return detectCelebrations(input).map((c) => planCelebration(c, input));
  }

  async getPlan(guestId: ID, reservationId: ID, celebrationKey: string): Promise<CelebrationPlan> {
    const plan = (await this.listCelebrations(guestId, reservationId)).find((p) => p.celebration.key === celebrationKey);
    if (!plan) throw new ServiceError('not_found', 'This celebration is not part of the voyage');
    return plan;
  }

  async approveStep(guestId: ID, reservationId: ID, celebrationKey: string, approval: CelebrationApproval): Promise<CelebrationApprovalResult> {
    // The guest's yes is required, every time; nothing is assumed.
    if (!approval || approval.approved !== true) throw new ServiceError('validation', 'Please confirm before we arrange anything');
    const plan = await this.getPlan(guestId, reservationId, celebrationKey);
    const step = plan.steps.find((s) => s.id === approval.stepId);
    if (!step) throw new ServiceError('not_found', 'That suggestion is no longer available');
    if (step.state === 'in-hand' || !step.proposal) throw new ServiceError('conflict', 'This is already in hand');
    if (step.chargeable && approval.acknowledgedCharge !== true) throw new ServiceError('validation', 'Please confirm you are happy with the price before we request it');
    const note = approval.note?.trim().slice(0, 500);

    let result: Omit<CelebrationApprovalResult, 'step'>;
    const p = step.proposal;
    if (p.kind === 'request-experience') {
      // A request for the team to confirm; the price is charged only once confirmed.
      const booking = await this.s.experience.requestBooking(reservationId, p.experienceId, p.start, p.partySize, note || undefined);
      result = { bookingId: booking.id };
    } else {
      const request = await this.s.requests.submit({ reservationId, category: p.category, description: note ? `${p.description}\n\n${note}` : p.description, priority: p.priority, occasionStep: step.id });
      result = { requestId: request.id };
    }
    // Now in hand: requested, for the team to take from here.
    const { proposal: _sent, actionLabel: _label, price: _price, ...rest } = step;
    const inHand: NonNullable<typeof step.inHand> = result.bookingId ? { label: 'Requested', tone: 'pending', bookingId: result.bookingId } : { label: 'Requested', tone: 'pending', requestId: result.requestId };
    return { step: { ...rest, state: 'in-hand', inHand, chargeable: false }, ...result };
  }
}
