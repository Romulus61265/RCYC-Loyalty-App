/**
 * Service requests over the shared mock store. New requests start as
 * Submitted with no one assigned; with `simulateCrew`, a crew member
 * acknowledges and starts them after a few seconds, as on board.
 */
import type { GuestServiceRequest, ID, NewServiceRequest, ServiceRequest } from '@/domain';
import type { ServiceRequestService, Unsubscribe, VoyageService } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { byUpdated, isActive, routeFor, titleFrom, toGuestRequest, typeFor, validateNewRequest } from '@/services/shared/serviceRequests';
import { guestOffset, isoAt } from './concierge/snapshot';
import { MockVoyageService } from './MockVoyageService';
import { MockRequestStore } from './requestStore';
import { data, failIf, latency, mockEventTime, mockId, mockNow, notFound } from './support';

export interface MockServiceRequestDeps {
  store: MockRequestStore;
  voyage: Pick<VoyageService, 'getOverview'>;
  /** Acknowledge after `acknowledgeMs` and start after `startMs` (app only). */
  simulateCrew?: { acknowledgeMs: number; startMs: number };
}

const { profile } = data.guest;
const people = new Map<string, string>([
  [profile.guest.id, `${profile.guest.preferredName ?? profile.guest.firstName} ${profile.guest.lastName}`],
  ...profile.companions.filter((c) => c.guestId).map((c) => [c.guestId!, `${c.firstName} ${c.lastName}`] as [string, string]),
]);

export class MockServiceRequestService implements ServiceRequestService {
  private readonly deps: MockServiceRequestDeps;

  constructor(deps: Partial<MockServiceRequestDeps> = {}) {
    this.deps = { store: deps.store ?? new MockRequestStore(), voyage: deps.voyage ?? new MockVoyageService(), simulateCrew: deps.simulateCrew };
  }

  private async context(reservationId: ID) {
    const overview = await this.deps.voyage.getOverview(reservationId);
    const offset = guestOffset({ overview }, mockNow());
    const embark = Date.parse(overview.embarkation.arrivalWindowStart) - 12 * 3_600_000;
    const end = Date.parse(`${overview.voyage.endDate}T18:00:00Z`);
    const now = mockNow().getTime();
    return {
      overview,
      stamp: (plusMs = 0) => isoAt(mockEventTime().getTime() + plusMs, offset),
      where: (now >= embark && now <= end ? 'aboard' : 'home') as 'home' | 'aboard',
    };
  }

  private async view(r: ServiceRequest): Promise<GuestServiceRequest> {
    const { overview, where } = await this.context(r.reservationId);
    const guestId = r.guestId ?? overview.reservation.leadGuestId;
    return toGuestRequest(r, { guest: { id: guestId, name: people.get(guestId) ?? 'Guest' }, voyage: { id: overview.voyage.id, name: overview.voyage.name }, where });
  }

  private async all(reservationId: ID): Promise<GuestServiceRequest[]> {
    failIf('optional', 'service requests');
    const list = await Promise.all(this.deps.store.items.filter((r) => r.reservationId === reservationId).map((r) => this.view(r)));
    return list.sort(byUpdated);
  }

  async submit(input: NewServiceRequest): Promise<GuestServiceRequest> {
    const errors = validateNewRequest(input);
    const first = Object.values(errors)[0];
    if (first) throw new ServiceError('validation', first);
    const { overview, stamp, where } = await this.context(input.reservationId);
    const route = routeFor(input.category, where);
    const description = input.description.trim();
    const title = titleFrom(description);
    const now = stamp();
    const priority = input.priority ?? 'routine';
    const request: ServiceRequest = {
      id: mockId('srq'),
      reservationId: overview.reservation.id,
      guestId: profile.guest.id,
      type: typeFor(input.category),
      category: input.category,
      summary: title,
      details: description === title ? undefined : description,
      status: 'received',
      priority,
      assignedTeam: route.team,
      createdAt: now,
      updatedAt: now,
      ...(input.occasionStep ? { occasionStep: input.occasionStep.slice(0, 120) } : {}),
      nextUpdateBy: stamp(priority === 'urgent' ? 15 * 60_000 : priority === 'priority' ? 60 * 60_000 : 4 * 3_600_000),
    };
    this.deps.store.add(request);
    this.simulate(request.id, stamp, route.label);
    return latency(await this.view(request), 400);
  }

  /** On board, someone picks it up and starts on it. */
  private simulate(id: ID, stamp: (plus?: number) => string, department: string) {
    const sim = this.deps.simulateCrew;
    if (!sim) return;
    const who = department === 'Suite Ambassador' ? `${data.voyage.reservation.suiteAmbassador ?? 'Your Suite Ambassador'}, Suite Ambassador` : `${department} team`;
    setTimeout(() => {
      const r = this.deps.store.find(id);
      if (r?.status === 'received' && !r.closedAt) this.deps.store.update(id, { acknowledgedAt: stamp(), updatedAt: stamp(), assignedTo: who });
    }, sim.acknowledgeMs);
    setTimeout(() => {
      const r = this.deps.store.find(id);
      if (r?.status === 'received' && !r.closedAt) this.deps.store.update(id, { status: 'in_progress', startedAt: stamp(), updatedAt: stamp() });
    }, sim.startMs);
  }

  async listActive(reservationId: ID) {
    return latency((await this.all(reservationId)).filter((r) => isActive(r.status)));
  }

  async listHistory(reservationId: ID) {
    return latency((await this.all(reservationId)).filter((r) => !isActive(r.status)));
  }

  async get(requestId: ID) {
    const r = this.deps.store.find(requestId) ?? notFound('Service request', requestId);
    return latency(await this.view(r));
  }

  async close(requestId: ID) {
    const r = this.deps.store.find(requestId) ?? notFound('Service request', requestId);
    const current = await this.view(r);
    if (!current.canClose) throw new ServiceError('conflict', current.status === 'closed' ? 'This request is already closed' : 'The team has already started on this request');
    const { stamp } = await this.context(r.reservationId);
    const now = stamp();
    this.deps.store.update(requestId, current.status === 'resolved' ? { closedAt: now, updatedAt: now } : { status: 'cancelled', closedAt: now, updatedAt: now, resolutionNotes: r.resolutionNotes ?? 'Withdrawn by you.' });
    return latency(await this.view(this.deps.store.find(requestId)!));
  }

  subscribe(reservationId: ID, listener: (request: GuestServiceRequest) => void): Unsubscribe {
    return this.deps.store.onChange((r) => {
      if (r.reservationId === reservationId) void this.view(r).then(listener);
    });
  }
}
