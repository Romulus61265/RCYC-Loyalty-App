/**
 * Journey alerts, notifications and recommendations from Supabase.
 *
 * Alerts and notifications are written server-side (journey-events function,
 * messaging jobs). The guest may only acknowledge an alert or mark a
 * notification read; column grants allow nothing else.
 */
import type { GuestNotification, ID, JourneyAlert, JourneyEvent, JourneyEventType, PersonalizedRecommendation, Recommendation, RecommendationSurface } from '@/domain';
import type { JourneyEventService, PersonalizationService, Unsubscribe } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { curatedFor, mergeRecommendations } from '@/services/shared/recommendations';
import {
  ALERT_COLUMNS,
  NOTIFICATION_COLUMNS,
  RECOMMENDATION_COLUMNS,
  toAlert,
  toNotification,
  toRecommendation,
  type AlertRow,
  type NotificationRow,
  type RecommendationRow,
} from './rows';
import { many, manyPaged, run, uuid, type SupabaseDeps } from './support';

export class SupabaseJourneyEventService implements JourneyEventService {
  constructor(private readonly deps: SupabaseDeps) {}

  async listAlerts(reservationId: ID): Promise<JourneyAlert[]> {
    const rows = await many<AlertRow>(
      this.deps.db().from('journey_alerts_local').select(ALERT_COLUMNS).eq('reservation_id', uuid(reservationId, 'Reservation')).is('acknowledged_at', null).order('created_ts'),
    );
    return rows.map(toAlert);
  }

  async listNotifications(guestId: ID, opts?: { includeScheduled?: boolean; now?: Date }): Promise<GuestNotification[]> {
    const id = uuid(guestId, 'Guest');
    const until = (opts?.now ?? this.deps.clock.now()).toISOString();
    // Builders mutate in place, so each page starts a fresh query.
    const query = () => {
      const q = this.deps.db().from('notifications_local').select(NOTIFICATION_COLUMNS).eq('guest_id', id);
      return opts?.includeScheduled ? q : q.lte('scheduled_at', until);
    };
    const rows = await manyPaged<NotificationRow>((from, to) => query().order('scheduled_at', { ascending: false }).order('id').range(from, to));
    return rows.map(toNotification);
  }

  async acknowledge(alertId: ID): Promise<void> {
    const id = uuid(alertId, 'Alert');
    const rows = await many<{ id: string }>(this.deps.db().from('journey_alerts').update({ acknowledged_at: new Date().toISOString() }).eq('id', id).select('id'));
    if (!rows.length) throw new ServiceError('not_found', `Alert ${id} not found`);
  }

  subscribe(reservationId: ID, listener: (event: JourneyEvent, alert?: JourneyAlert) => void, types?: JourneyEventType[]): Unsubscribe {
    const id = uuid(reservationId, 'Reservation');
    const db = this.deps.db();
    const channel = db
      .channel(`journey:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'journey_alerts', filter: `reservation_id=eq.${id}` }, (payload) => {
        const row = payload.new as AlertRow;
        const type = (row.event_type ?? 'service.request_updated') as JourneyEventType;
        if (types && !types.includes(type)) return;
        // Guests never read raw events; this is the alert's guest-safe envelope.
        const event: JourneyEvent = {
          id: row.event_id,
          type,
          reservationId: id,
          guestIds: [],
          occurredAt: row.created_at,
          severity: row.severity,
          source: 'journey-events',
          payload: {},
          dedupeKey: row.event_id,
        };
        listener(event, toAlert(row));
      })
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }
}

const CURATED = 'curated';

export class SupabasePersonalizationService implements PersonalizationService {
  constructor(private readonly deps: SupabaseDeps) {}

  /**
   * Recommendations are materialised server-side (curated by the crew and
   * scored by the personalization job). Crew-audience rows are filtered by
   * RLS and again here.
   */
  async getRecommendations(guestId: ID, surface: RecommendationSurface, opts?: { reservationId?: ID; limit?: number }): Promise<Recommendation[]> {
    let q = this.deps
      .db()
      .from('recommendations')
      .select(RECOMMENDATION_COLUMNS)
      .eq('guest_id', uuid(guestId, 'Guest'))
      .eq('audience', 'guest')
      .or(`expires_at.is.null,expires_at.gt.${this.deps.clock.now().toISOString()}`);
    if (opts?.reservationId) q = q.or(`reservation_id.is.null,reservation_id.eq.${uuid(opts.reservationId, 'Reservation')}`);
    // Catalogue order first, so equal scores rank as they do everywhere else.
    const rows = (await many<RecommendationRow>(q)).sort((a, b) => (a.experience?.sort_order ?? Infinity) - (b.experience?.sort_order ?? Infinity));
    const curated = rows.filter((r) => r.model_version === CURATED).map(toRecommendation);
    const scored = rows.filter((r) => r.model_version !== CURATED).map(toRecommendation);
    const list = surface === 'discover' || surface === 'voyage' ? mergeRecommendations(scored, curated) : curatedFor(curated, surface);
    return list.slice(0, opts?.limit ?? 3);
  }

  /**
   * The engine runs in the personalization-next-best Edge Function, which can
   * read history and the internal value segment (the guest cannot). It
   * returns guest-safe recommendations: internal signals removed.
   */
  async getPersonalizedRecommendations(guestId: ID, reservationId: ID, opts?: { limit?: number; includeBooked?: boolean }): Promise<PersonalizedRecommendation[]> {
    const body = { guestId: uuid(guestId, 'Guest'), reservationId: uuid(reservationId, 'Reservation'), limit: Math.max(1, Math.min(50, opts?.limit ?? 10)), includeBooked: opts?.includeBooked ?? false };
    const { data, error } = await this.deps.db().functions.invoke<{ recommendations: PersonalizedRecommendation[] }>('personalization-next-best', { body });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 401) throw new ServiceError('unauthenticated', 'Session expired');
      if (status === 403) throw new ServiceError('forbidden', 'Not your recommendations');
      if (status === 404) throw new ServiceError('not_found', 'Reservation not found');
      if (status === 422) throw new ServiceError('validation', 'Request not accepted');
      throw new ServiceError('unavailable', 'Recommendations unavailable', true);
    }
    // Defence in depth: nothing internal is kept even if the server sent it.
    return (data?.recommendations ?? []).map((r) => ({ ...r, sourceSignals: (r.sourceSignals ?? []).filter((s) => s.visibility === 'guest') }));
  }

  async recordFeedback(guestId: ID, recommendationId: ID, signal: 'viewed' | 'dismissed' | 'saved' | 'booked'): Promise<void> {
    await run(this.deps.db().from('recommendation_feedback').insert({ guest_id: uuid(guestId, 'Guest'), recommendation_id: uuid(recommendationId, 'Recommendation'), signal }));
  }
}
