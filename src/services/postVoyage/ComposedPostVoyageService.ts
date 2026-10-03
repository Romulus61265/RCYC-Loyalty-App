/**
 * PostVoyageService over the other services' contracts, so mock and
 * Supabase modes share it. The recap is planned afresh from the voyage's
 * data each time; reflections are kept in a PostVoyageStore.
 */
import type { FeedbackPatch, ID, VoyageFeedback, VoyageRecap } from '@/domain';
import { FEEDBACK_WORDS } from '@/domain';
import type { PostVoyageService, Services } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { buildRecap, emptyFeedback, isVoyageComplete, type RecapInput } from './recap';
import type { PostVoyageStore } from './store';

type Deps = Pick<Services, 'profile' | 'loyalty' | 'voyage' | 'experience' | 'requests' | 'clock'>;

const MAX = { favourites: 5, words: 3, note: 300, better: 1500, nextTime: 1000 };

export class ComposedPostVoyageService implements PostVoyageService {
  constructor(
    private readonly s: Deps,
    private readonly store: PostVoyageStore,
  ) {}

  private async input(guestId: ID, reservationId: ID): Promise<RecapInput | null> {
    const now = this.s.clock.now();
    if (!isVoyageComplete(await this.s.voyage.getJourneyPhase(reservationId, now))) return null;
    const overview = await this.s.voyage.getOverview(reservationId);
    const v = overview.voyage;
    const [profile, membership, past, catalogue, destinations, bookings, active, history, inspirations, stored] = await Promise.all([
      this.s.profile.getProfile(guestId),
      this.s.loyalty.getMembership(guestId).catch(() => null),
      this.s.voyage.getPastVoyages(guestId).catch(() => []),
      this.s.experience.listCatalogue(v.id),
      this.s.experience.listDestinations(v.id).catch(() => []),
      this.s.experience.listBookings(reservationId),
      this.s.requests.listActive(reservationId).catch(() => []),
      this.s.requests.listHistory(reservationId).catch(() => []),
      this.store.listInspirations().catch(() => []),
      this.store.getFeedback(guestId, reservationId),
    ]);
    const contact = overview.reservation.suiteAmbassadorContact;
    const name = contact?.name ?? overview.reservation.suiteAmbassador ?? 'Your Suite Ambassador';
    return {
      now,
      guest: { id: guestId, firstName: profile.guest.preferredName ?? profile.guest.firstName, companions: profile.companions.filter((c) => !c.isMinor).map((c) => c.firstName) },
      occasions: profile.occasions,
      voyage: v,
      yachtName: overview.yacht.name,
      suite: `${overview.suite.name} ${overview.suite.number}`,
      reservationId,
      ambassador: { name, firstName: name.split(' ')[0] ?? name, title: contact?.title ?? 'Suite Ambassador' },
      bookings,
      catalogue,
      destinations,
      requests: [...active, ...history],
      membership,
      pastVoyages: past.filter((p) => p.id !== v.id),
      preferences: profile.preferences,
      inspirations,
      feedback: stored ?? emptyFeedback(guestId, reservationId, now.toISOString()),
    };
  }

  async getRecap(guestId: ID, reservationId: ID): Promise<VoyageRecap | null> {
    const input = await this.input(guestId, reservationId);
    return input ? buildRecap(input) : null;
  }

  private async recapOrRefuse(guestId: ID, reservationId: ID): Promise<VoyageRecap> {
    const recap = await this.getRecap(guestId, reservationId);
    if (!recap) throw new ServiceError('validation', 'Reflections open once the voyage is over');
    if (recap.feedback.status === 'sent') throw new ServiceError('conflict', 'Your reflections have already been sent');
    return recap;
  }

  async saveFeedback(guestId: ID, reservationId: ID, patch: FeedbackPatch, opts?: { expectedVersion?: number }): Promise<VoyageFeedback> {
    const recap = await this.recapOrRefuse(guestId, reservationId);
    const current = recap.feedback;
    if (opts?.expectedVersion !== undefined && opts.expectedVersion !== current.version) throw new ServiceError('conflict', 'Your reflections changed elsewhere');
    const memories = new Set(recap.days.flatMap((d) => d.memories.map((m) => m.id)));
    const crew = new Set(recap.crew.map((c) => c.id));
    const next: VoyageFeedback = { ...current, updatedAt: this.s.clock.now().toISOString() };
    if (patch.favourites) {
      if (patch.favourites.length > MAX.favourites || patch.favourites.some((id) => !memories.has(id))) throw new ServiceError('validation', `Choose up to ${MAX.favourites} moments from the voyage`);
      next.favourites = [...new Set(patch.favourites)];
    }
    if (patch.words) {
      if (patch.words.length > MAX.words || patch.words.some((w) => !(FEEDBACK_WORDS as readonly string[]).includes(w))) throw new ServiceError('validation', `Choose up to ${MAX.words} words`);
      next.words = [...new Set(patch.words)];
    }
    if (patch.thanks) {
      if (patch.thanks.some((t) => !crew.has(t.crewId) || (t.note?.length ?? 0) > MAX.note)) throw new ServiceError('validation', `Thank someone from the voyage, in under ${MAX.note} characters`);
      next.thanks = patch.thanks.map((t) => (t.note?.trim() ? { crewId: t.crewId, note: t.note.trim() } : { crewId: t.crewId }));
    }
    for (const k of ['better', 'nextTime'] as const) {
      if (patch[k] === undefined) continue;
      const v = patch[k]!.trim();
      if (v.length > MAX[k]) throw new ServiceError('validation', `Please keep it under ${MAX[k]} characters`);
      if (v) next[k] = v;
      else delete next[k];
    }
    if (patch.followUp !== undefined) next.followUp = patch.followUp;
    if (!next.better) next.followUp = false;
    return this.store.putFeedback(next, current.version);
  }

  async sendFeedback(guestId: ID, reservationId: ID): Promise<VoyageFeedback> {
    const recap = await this.recapOrRefuse(guestId, reservationId);
    const f = recap.feedback;
    if (!f.favourites.length && !f.words.length && !f.thanks.length && !f.better && !f.nextTime) throw new ServiceError('validation', 'Share a thought or two first, or simply close this');
    const sent: VoyageFeedback = { ...f, status: 'sent', sentAt: this.s.clock.now().toISOString(), updatedAt: this.s.clock.now().toISOString() };
    if (f.better && f.followUp) {
      // A person gets in touch: a request for the Suite Ambassador, in the guest's words.
      const r = await this.s.requests.submit({ reservationId, category: 'concierge', priority: 'priority', description: `After the voyage, I would like someone to get in touch.\n\n${f.better}` });
      sent.followUpRequestId = r.id;
    }
    return this.store.putFeedback(sent, f.version);
  }
}
