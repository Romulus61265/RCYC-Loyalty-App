/**
 * FLIGHT_DELAYED → once the arrival is adjusted, tell the guest: one
 * message, "We've adjusted your arrival arrangements.", opening /arrival.
 * NotificationService shows it in the inbox (and push sends it, where
 * enabled). Runs after TravelDisruptionHandler, whose update it reads.
 */
import type { GuestNotification, InternalEvent } from '@/domain';
import type { ContinuityService, EventHandler, HandlerContext, HandlerResult } from '@/services/contracts';

/** Where outbound messages go (MockJourneyEventService in the mock; `notifications` on the server). */
export interface NotificationOutbox {
  deliver(n: GuestNotification): 'sent' | 'duplicate' | Promise<'sent' | 'duplicate'>;
}

export class NotificationEventHandler implements EventHandler<'FLIGHT_DELAYED'> {
  readonly name = 'NotificationEventHandler';
  readonly handles = ['FLIGHT_DELAYED'] as const;

  constructor(
    private readonly continuity: Pick<ContinuityService, 'getArrivalUpdate'>,
    private readonly outbox: NotificationOutbox,
  ) {}

  async handle(event: InternalEvent<'FLIGHT_DELAYED'>, ctx: HandlerContext): Promise<HandlerResult> {
    if (!event.reservation_id) return { outcome: 'skipped', detail: 'No reservation' };
    const u = await this.continuity.getArrivalUpdate(event.reservation_id);
    if (!u || u.flightNumber.replace(/\s/g, '') !== event.payload.flight_number.replace(/\s/g, '')) return { outcome: 'skipped', detail: 'No arrival update' };
    const at = ctx.now().toISOString();
    const result = await this.outbox.deliver({
      id: `ntf_${event.event_id}`,
      guestId: event.guest_id,
      reservationId: event.reservation_id,
      channel: 'push',
      category: 'travel',
      type: 'itinerary-change',
      title: u.headline,
      body: u.intro,
      deepLink: '/arrival',
      scheduledFor: at,
      deliveredAt: at,
      bypassQuietHours: false,
      dedupeKey: `arrival:${u.key}`,
    });
    return result === 'sent' ? { outcome: 'done', detail: u.headline } : { outcome: 'skipped', detail: 'Already told' };
  }
}
