/**
 * FLIGHT_DELAYED → the Suite Ambassador writes to the guest in the
 * concierge thread, so the conversation already knows: the new landing time,
 * the driver, the window, and anything still being confirmed. Short delays
 * (the driver simply waits) need no message.
 */
import type { InternalEvent } from '@/domain';
import type { ContinuityService, EventHandler, GuestProfileService, HandlerResult } from '@/services/contracts';

/** How a crew message reaches the thread (MockConciergeService in the mock; the crew console in production). */
export interface ConciergeBriefing {
  postTeamMessage(reservationId: string, message: { authorName: string; body: string }): Promise<unknown>;
}

export class ConciergeEventHandler implements EventHandler<'FLIGHT_DELAYED'> {
  readonly name = 'ConciergeEventHandler';
  readonly handles = ['FLIGHT_DELAYED'] as const;
  private readonly briefed = new Set<string>();

  constructor(
    private readonly continuity: Pick<ContinuityService, 'getArrivalUpdate'>,
    private readonly concierge: ConciergeBriefing,
    private readonly people: { profile: Pick<GuestProfileService, 'getProfile'>; ambassador: () => Promise<{ firstName: string; title: string }> },
  ) {}

  async handle(event: InternalEvent<'FLIGHT_DELAYED'>): Promise<HandlerResult> {
    if (!event.reservation_id) return { outcome: 'skipped', detail: 'No reservation' };
    const u = await this.continuity.getArrivalUpdate(event.reservation_id);
    if (!u || u.steps.length <= 2) return { outcome: 'skipped', detail: 'Nothing moved' };
    if (this.briefed.has(u.key)) return { outcome: 'skipped', detail: 'Already briefed' };
    const value = (k: string) => u.steps.find((s) => s.kind === k)?.value;
    const pending = (k: string) => u.steps.find((s) => s.kind === k)?.state === 'pending';
    const [profile, amb] = await Promise.all([this.people.profile.getProfile(event.guest_id), this.people.ambassador()]);
    const first = profile.guest.preferredName ?? profile.guest.firstName;
    const parts = [`${first}, I’m following ${u.flightNumber}: it now lands at ${value('flight-delay')}.`];
    const pickup = value('transfer-time');
    if (pickup) parts.push(pending('transfer-updated') ? `I have asked for your driver to meet you at ${pickup}, and will confirm.` : `Your driver will meet you at ${pickup}.`);
    const eta = value('arrival-estimate');
    if (eta) parts.push(`We expect you at the yacht by about ${eta}.`);
    for (const a of u.alsoAffected) if (a.state === 'pending') parts.push(`${a.title}: ${a.detail.charAt(0).toLowerCase()}${a.detail.slice(1)}`);
    parts.push('If you would rather change anything, just tell me here.');
    const body = parts.join(' ');
    await this.concierge.postTeamMessage(event.reservation_id, { authorName: `${amb.firstName}, ${amb.title}`, body });
    this.briefed.add(u.key);
    return { outcome: 'done', detail: 'Briefed the guest in the concierge thread' };
  }
}
