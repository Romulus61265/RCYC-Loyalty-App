/**
 * Orchestrates the concierge: AI answers, actions the guest chooses, service
 * requests and hand-offs to people. The AI provider decides; this service
 * acts, through the same Voyage / Experience / Loyalty / Profile services
 * the app uses, so a table moved here is moved everywhere.
 */
import type {
  ConciergeAction,
  ConciergeMessage,
  EscalationRequest,
  EscalationResult,
  EscalationTarget,
  GuestContext,
  ID,
  ServiceRequest,
  ServiceRequestType,
} from '@/domain';
import type { ConciergeService, GuestProfileService, LoyaltyService, PersonalizationService, Unsubscribe, VoyageService } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';
import { formatShortDate, formatTime } from '@/utils/format';
import { handoffAnswer } from './concierge/answers';
import { bookingMoved, experienceRequested, handoffCard, humanJoins, requestRaised, type Confirmation } from './concierge/confirmations';
import { guestOffset, isoAt, loadSnapshot, partyFor, placesNeeded, type ConciergeSnapshot } from './concierge/snapshot';
import { MockConciergeAI, toMessage } from './MockConciergeAI';
import { MockExperienceService } from './MockExperienceService';
import { MockLoyaltyService } from './MockLoyaltyService';
import { MockGuestRecordSource, MockPersonalizationService } from './MockMiscServices';
import { MockVoyageService } from './MockVoyageService';
import { MockRequestStore } from './requestStore';
import { categoryOf } from '@/services/shared/serviceRequests';
import { data, latency, mockEventTime, mockId, mockNow, notFound } from './support';

export interface MockConciergeDeps {
  voyage: VoyageService;
  /** The concrete mock, so accepted requests can be confirmed. */
  experience: MockExperienceService;
  loyalty: LoyaltyService;
  profile: GuestProfileService;
  personalization: PersonalizationService;
  /** Shared with MockServiceRequestService. */
  requests: MockRequestStore;
}

const HOUR = 3_600_000;

type Lite = Pick<ConciergeSnapshot, 'now' | 'overview' | 'team' | 'ambassador'>;

/** What the person who joins picks up, from the last concierge answer's intent. */
const TOPIC: Partial<Record<NonNullable<ConciergeMessage['intent']>, string>> = {
  'dining.modify': 'your dinner reservation',
  'transport.arrange': 'transport',
  'experience.discover': 'experiences ashore',
  'schedule.query': 'your plans',
  'request.status': 'your requests',
  'loyalty.benefits': 'your privileges',
};

export class MockConciergeService implements ConciergeService {
  private conversations = new Map<ID, ConciergeMessage[]>();
  private listeners = new Map<ID, Set<(m: ConciergeMessage) => void>>();
  private readonly deps: MockConciergeDeps;
  private readonly ai: MockConciergeAI;
  private seq = 0;

  constructor(deps: Partial<MockConciergeDeps> = {}, ai?: MockConciergeAI) {
    this.deps = {
      voyage: deps.voyage ?? new MockVoyageService(),
      experience: deps.experience ?? new MockExperienceService(),
      loyalty: deps.loyalty ?? new MockLoyaltyService(),
      profile: deps.profile ?? new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore())),
      personalization: deps.personalization ?? new MockPersonalizationService(),
      requests: deps.requests ?? new MockRequestStore(),
    };
    this.ai = ai ?? new MockConciergeAI((id) => this.snapshot(id));
  }

  private get requests(): ServiceRequest[] {
    return this.deps.requests.items;
  }

  private reservationOf(conversationId: ID): ID {
    if (!conversationId.startsWith('cnv_')) notFound('Conversation', conversationId);
    return conversationId.slice(4);
  }

  /** What the concierge knows right now about this conversation's guest. */
  snapshot(conversationId: ID): Promise<ConciergeSnapshot> {
    return loadSnapshot(
      { ...this.deps, requests: async (res) => this.requests.filter((r) => r.reservationId === res), team: data.concierge.team },
      this.reservationOf(conversationId),
      mockNow(),
    );
  }

  /** Just enough to own and time-stamp a request: the reservation and the people. */
  private async lite(reservationId: ID): Promise<Lite> {
    const overview = await this.deps.voyage.getOverview(reservationId);
    const contact = overview.reservation.suiteAmbassadorContact;
    const name = contact?.name ?? overview.reservation.suiteAmbassador ?? 'your Suite Ambassador';
    return { now: mockNow(), overview, team: data.concierge.team, ambassador: { name, title: contact?.title ?? 'Suite Ambassador', firstName: name.split(' ')[0] ?? name } };
  }

  private history(conversationId: ID): ConciergeMessage[] {
    const h = this.conversations.get(conversationId) ?? [];
    this.conversations.set(conversationId, h);
    return h;
  }

  private emit(conversationId: ID, m: ConciergeMessage) {
    this.listeners.get(conversationId)?.forEach((l) => l(m));
  }

  private stamp(s: Lite, plusMs = 0) {
    return isoAt(mockEventTime().getTime() + plusMs, guestOffset(s, s.now));
  }

  private reference(s: Lite): string {
    this.seq += 1;
    return `${s.overview.reservation.bookingReference}-${String(this.requests.length + this.seq).padStart(2, '0')}`;
  }

  /** Who owns a request of this type, as a display name. */
  private owner(s: Lite, team: ServiceRequest['assignedTeam']): string {
    if (team === 'suite-ambassador') return `${s.ambassador.name}, ${s.ambassador.title}`;
    if (team === 'medical') return `${s.team.medical.name}, ${s.team.medical.title}`;
    if (team === 'guest-services') return `${s.team.aboard.name}, ${s.team.aboard.title}`;
    if (team === 'shoreside-concierge') return `${s.team.shoreside.name}, ${s.team.shoreside.title}`;
    return 'Destination Services';
  }

  private record(s: Lite, r: Omit<ServiceRequest, 'id' | 'reservationId' | 'createdAt' | 'updatedAt'>): ServiceRequest {
    const now = this.stamp(s);
    const request: ServiceRequest = { id: mockId('srq'), reservationId: s.overview.reservation.id, createdAt: now, updatedAt: now, guestId: data.guest.profile.guest.id, category: categoryOf(r), ...r };
    return this.deps.requests.add(request);
  }

  private update(id: ID, change: Partial<ServiceRequest>, s: Lite) {
    this.deps.requests.update(id, { ...change, updatedAt: this.stamp(s) });
  }

  // ─── Conversation ────────────────────────────────────────────────────────

  async openConversation(reservationId: ID) {
    const conversationId = `cnv_${reservationId}`;
    if (!this.conversations.has(conversationId)) {
      // The earlier exchange (before the demo "now"), then today's opening.
      const history = data.concierge.history.map((m) => ({ ...m, conversationId }));
      this.conversations.set(conversationId, history);
      history.push(await this.ai.opening(conversationId, data.concierge.suggestedQuestions));
    }
    return latency({ conversationId, messages: this.history(conversationId) });
  }

  async sendMessage(conversationId: ID, body: string, context: GuestContext) {
    const text = body.trim();
    if (!text || text.length > 2000) throw new ServiceError('validation', 'Message must be 1–2000 characters');
    const history = this.history(conversationId);
    const prior = [...history];
    history.push({ id: mockId('msg'), conversationId, author: 'guest', body: text, createdAt: mockEventTime().toISOString() });

    const result = await this.ai.respond({ conversationId, body: text, context, history: prior });
    const out = [...result.messages];
    history.push(...result.messages);
    if (result.shouldEscalate && result.escalateTo) {
      const handoff = await this.escalateToHuman({ conversationId, reason: result.escalationReason ?? 'guest-request', preferredChannel: 'chat', to: result.escalateTo });
      const last = out[out.length - 1];
      if (last) last.attachments = [...(last.attachments ?? []), handoffCard(result.escalateTo, handoff, handoff.handoffId)];
    }
    // "21:00, please": the guest confirmed an action offered a moment ago.
    if (result.perform) out.push(...(await this.performAction(conversationId, result.perform)));
    return latency(out, 700);
  }

  async performAction(conversationId: ID, action: ConciergeAction): Promise<ConciergeMessage[]> {
    if (action.kind === 'open') throw new ServiceError('validation', 'Navigation is handled by the app');
    const s = await this.snapshot(conversationId);
    let reply: Confirmation;
    switch (action.kind) {
      case 'change-booking':
        reply = await this.changeBooking(s, action);
        break;
      case 'request-experience':
        reply = await this.requestExperience(s, action);
        break;
      case 'service-request': {
        const r = await this.createServiceRequest(s.overview.reservation.id, action);
        reply = requestRaised(s, r, this.reference(s));
        break;
      }
      case 'escalate': {
        const result = await this.escalateToHuman({ conversationId, reason: action.reason, preferredChannel: 'chat', to: action.to });
        reply = { body: handoffAnswer(s, action.to, action.reason).body, attachments: [handoffCard(action.to, result, result.handoffId)] };
        break;
      }
    }
    const message = toMessage(conversationId, { ...reply, intent: action.kind === 'escalate' ? 'human.handoff' : 'service.request' });
    this.history(conversationId).push(message);
    return latency([message], 500);
  }

  private async changeBooking(s: ConciergeSnapshot, action: Extract<ConciergeAction, { kind: 'change-booking' }>): Promise<Confirmation> {
    const before = s.bookings.find((b) => b.id === action.bookingId) ?? notFound('Booking', action.bookingId);
    const exp = s.catalogue.find((e) => e.id === before.experienceId);
    const slot = s.availability.find((a) => a.experienceId === before.experienceId)?.slots.find((x) => x.start === action.start && x.remaining >= placesNeeded(exp, before.partySize));
    let after = await this.deps.experience.requestChange(before.id, { start: action.start });
    // The restaurant accepts at once when the table is free; otherwise a person follows up.
    if (slot && exp?.inclusive) after = await this.deps.experience.confirm(before.id);
    const confirmed = after.status === 'confirmed';
    const venue = before.venue.split(',')[0] ?? before.title;
    this.record(s, {
      type: before.category === 'dining' ? 'dining-change' : 'excursion',
      summary: `${before.title}: ${formatTime(before.start)} → ${formatTime(action.start)}, ${formatShortDate(action.start)}`,
      status: confirmed ? 'confirmed' : 'in_progress',
      priority: 'routine',
      assignedTeam: confirmed ? 'guest-services' : 'suite-ambassador',
      assignedTo: confirmed ? venue : this.owner(s, 'suite-ambassador'),
      nextUpdateBy: confirmed ? undefined : this.stamp(s, HOUR),
      bookingId: before.id,
    });
    return bookingMoved(s, before, after, this.reference(s));
  }

  private async requestExperience(s: ConciergeSnapshot, action: Extract<ConciergeAction, { kind: 'request-experience' }>): Promise<Confirmation> {
    const exp = s.catalogue.find((e) => e.id === action.experienceId) ?? notFound('Experience', action.experienceId);
    const avail = s.availability.find((a) => a.experienceId === exp.id);
    const party = action.partySize || partyFor(s, exp);
    const slot = avail?.slots.find((x) => x.start === action.start && x.remaining >= placesNeeded(exp, party));
    if (!slot || avail?.status === 'waitlist' || avail?.status === 'unavailable') {
      // No place to hold: ask a person instead of pretending.
      const r = await this.createServiceRequest(s.overview.reservation.id, { type: 'excursion', summary: `${exp.title}, ${formatShortDate(action.start)} at ${formatTime(action.start)}` });
      this.update(r.id, { experienceId: exp.id }, s);
      return requestRaised(s, r, this.reference(s));
    }
    let booking = await this.deps.experience.requestBooking(s.overview.reservation.id, exp.id, action.start, party);
    // Included experiences with places free are confirmed at once; the rest are arranged by a person.
    if (exp.inclusive) booking = await this.deps.experience.confirm(booking.id);
    const confirmed = booking.status === 'confirmed';
    let request: ServiceRequest | undefined;
    if (action.requestId) {
      this.update(action.requestId, { status: confirmed ? 'confirmed' : 'in_progress', bookingId: booking.id, details: `${formatTime(action.start)}, ${formatShortDate(action.start)}` }, s);
      request = this.requests.find((r) => r.id === action.requestId);
    } else if (!confirmed) {
      request = this.record(s, {
        type: exp.category === 'dining' ? 'dining-change' : 'excursion',
        summary: `${exp.title}, ${formatShortDate(action.start)} at ${formatTime(action.start)}`,
        status: 'in_progress',
        priority: 'routine',
        assignedTeam: exp.portCallId ? 'destination-services' : 'suite-ambassador',
        assignedTo: this.owner(s, exp.portCallId ? 'destination-services' : 'suite-ambassador'),
        nextUpdateBy: this.stamp(s, HOUR),
        experienceId: exp.id,
        bookingId: booking.id,
      });
    }
    return experienceRequested(s, exp, booking, this.reference(s), request);
  }

  // ─── People ──────────────────────────────────────────────────────────────

  async escalateToHuman(request: EscalationRequest): Promise<EscalationResult> {
    const s = await this.snapshot(request.conversationId);
    const to: EscalationTarget = request.to ?? (request.reason === 'medical' ? 'medical' : 'suite-ambassador');
    const atHome = s.now.getTime() < Date.parse(s.overview.embarkation.arrivalWindowStart) - 12 * HOUR || s.now.getTime() > Date.parse(`${s.overview.voyage.endDate}T18:00:00Z`);
    const member = to === 'medical' ? s.team.medical : to === 'concierge-team' ? (atHome ? s.team.shoreside : s.team.aboard) : { name: s.ambassador.name, title: s.ambassador.title };
    const team: ServiceRequest['assignedTeam'] = to === 'medical' ? 'medical' : to === 'suite-ambassador' ? 'suite-ambassador' : atHome ? 'shoreside-concierge' : 'guest-services';
    const first = to === 'medical' ? member.name : (member.name.split(' ')[0] ?? member.name);
    const agentName = `${first}, ${member.title}`;
    const minutes = to === 'medical' ? 1 : to === 'concierge-team' ? 3 : 5;
    const r = this.record(s, {
      type: to === 'medical' ? 'medical' : 'general',
      summary: to === 'medical' ? 'Medical assistance requested via concierge' : `Speak with ${first}${to === 'concierge-team' ? ` (${member.title})` : ''}`,
      details: request.note,
      status: 'received',
      priority: to === 'medical' ? 'urgent' : request.reason === 'complaint' ? 'priority' : 'routine',
      assignedTeam: team,
      assignedTo: `${member.name}, ${member.title}`,
      nextUpdateBy: this.stamp(s, minutes * 60_000),
    });
    const history = this.history(request.conversationId);
    // The topic comes from this exchange only (the last few hours), not from weeks ago.
    const recent = history.filter((m) => Date.parse(m.createdAt) > mockEventTime().getTime() - 6 * HOUR).reverse();
    const lastIntent = recent.find((m) => m.author === 'ai' && m.intent && (TOPIC[m.intent] || m.intent === 'occasion.plan'))?.intent;
    const occasion = lastIntent === 'occasion.plan' ? s.profile.occasions.find((o) => o.date >= s.overview.voyage.startDate && o.date <= s.overview.voyage.endDate) : undefined;
    const topic = occasion ? `your ${occasion.label.charAt(0).toLowerCase()}${occasion.label.slice(1)}` : lastIntent ? TOPIC[lastIntent] : undefined;
    setTimeout(
      () => {
        const msg: ConciergeMessage = { id: mockId('msg'), conversationId: request.conversationId, author: 'human', authorName: agentName, createdAt: mockEventTime().toISOString(), body: humanJoins(s, to, topic, first) };
        history.push(msg);
        this.update(r.id, { status: 'in_progress' }, s);
        this.emit(request.conversationId, msg);
      },
      to === 'medical' ? 1200 : 2200,
    );
    return latency({ handoffId: r.id, team, agentName, expectedResponseMinutes: minutes }, 300);
  }

  // ─── Requests ────────────────────────────────────────────────────────────

  async createServiceRequest(reservationId: ID, input: { type: ServiceRequestType; summary: string; details?: string; priority?: ServiceRequest['priority'] }) {
    const summary = input.summary.trim();
    if (!summary || summary.length > 200) throw new ServiceError('validation', 'Summary must be 1–200 characters');
    const s = await this.lite(reservationId);
    const team: ServiceRequest['assignedTeam'] =
      input.type === 'medical' ? 'medical' : input.type === 'transport' || input.type === 'excursion' ? 'destination-services' : 'suite-ambassador';
    const priority = input.priority ?? (input.type === 'medical' ? 'urgent' : 'routine');
    const req = this.record(s, {
      type: input.type,
      summary,
      details: input.details,
      status: 'received',
      priority,
      assignedTeam: team,
      assignedTo: this.owner(s, team),
      nextUpdateBy: this.stamp(s, priority === 'urgent' ? 15 * 60_000 : 2 * HOUR),
    });
    return latency(req, 400);
  }

  listServiceRequests(reservationId: ID) {
    return latency(this.requests.filter((r) => r.reservationId === reservationId).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
  }

  getServiceRequest(requestId: ID) {
    const found = this.requests.find((r) => r.id === requestId);
    return found ? latency(found) : notFound('ServiceRequest', requestId);
  }

  subscribe(conversationId: ID, listener: (message: ConciergeMessage) => void): Unsubscribe {
    const set = this.listeners.get(conversationId) ?? new Set();
    set.add(listener);
    this.listeners.set(conversationId, set);
    return () => set.delete(listener);
  }
}
