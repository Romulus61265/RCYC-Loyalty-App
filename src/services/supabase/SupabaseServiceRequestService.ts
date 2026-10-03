/**
 * Guest service requests on Supabase (the same `service_requests` the
 * concierge writes, so everything appears in one place).
 *
 *  • Submitting inserts a 'received' row; RLS accepts nothing else, and a
 *    trigger fills in the category default and the guest who raised it.
 *  • Status, assignment, notes and lifecycle stamps are the crew's (a trigger
 *    stamps acknowledged/started/resolved/closed on every status change).
 *  • The guest's only change is close_service_request(): withdraw before work
 *    starts, or close once resolved.
 *  • Times are shown in the zone the request was made in: the port's while
 *    aboard, the device's at home.
 */
import type { GuestServiceRequest, ID, NewServiceRequest } from '@/domain';
import type { ServiceRequestService, Unsubscribe } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { byUpdated, isActive, routeFor, titleFrom, toGuestRequest, typeFor, validateNewRequest, type RequestContext } from '@/services/shared/serviceRequests';
import { REQUEST_COLUMNS, toRequest, type RequestRow } from './rows';
import { many, maybe, one, run, uuid, type SupabaseDeps } from './support';

interface ReservationContextRow {
  id: string;
  lead_guest_id: string;
  voyage: { id: string; name: string; start_date: string; end_date: string } | null;
}

export class SupabaseServiceRequestService implements ServiceRequestService {
  constructor(private readonly deps: SupabaseDeps) {}

  private get db() {
    return this.deps.db();
  }

  private async context(reservationId: string): Promise<RequestContext & { leadGuestId: string; names: Map<string, string>; today: string }> {
    const res = await one<ReservationContextRow>(
      this.db.from('reservations').select('id, lead_guest_id, voyage:voyages(id, name, start_date, end_date)').eq('id', reservationId).maybeSingle(),
      'Reservation',
      reservationId,
    );
    const party = await many<{ guest_id: string }>(this.db.from('reservation_guests').select('guest_id').eq('reservation_id', reservationId));
    const people = party.length ? await many<{ id: string; preferred_name: string | null; first_name: string; last_name: string }>(this.db.from('guests').select('id, preferred_name, first_name, last_name').in('id', party.map((p) => p.guest_id))) : [];
    const names = new Map(people.map((g) => [g.id, `${g.preferred_name ?? g.first_name} ${g.last_name}`]));
    const today = this.deps.clock.now().toISOString().slice(0, 10);
    const voyage = res.voyage ?? { id: '', name: 'Your voyage', start_date: '', end_date: '' };
    return {
      leadGuestId: res.lead_guest_id,
      names,
      today,
      guest: { id: res.lead_guest_id, name: names.get(res.lead_guest_id) ?? 'Guest' },
      voyage: { id: voyage.id, name: voyage.name },
      where: today >= voyage.start_date && today <= voyage.end_date ? 'aboard' : 'home',
    };
  }

  private view(row: RequestRow, ctx: Awaited<ReturnType<SupabaseServiceRequestService['context']>>): GuestServiceRequest {
    const r = toRequest(row);
    const guestId = r.guestId ?? ctx.leadGuestId;
    return toGuestRequest(r, { ...ctx, guest: { id: guestId, name: ctx.names.get(guestId) ?? ctx.guest.name } });
  }

  private async all(reservationId: ID): Promise<GuestServiceRequest[]> {
    const id = uuid(reservationId, 'Reservation');
    const [rows, ctx] = await Promise.all([many<RequestRow>(this.db.from('service_requests_local').select(REQUEST_COLUMNS).eq('reservation_id', id).order('created_ts', { ascending: false })), this.context(id)]);
    return rows.map((r) => this.view(r, ctx)).sort(byUpdated);
  }

  /** The zone a request's times are shown in. */
  private async zoneFor(voyageId: string, today: string, where: 'home' | 'aboard'): Promise<string> {
    if (where === 'aboard') {
      const port = await maybe<{ time_zone: string }>(this.db.from('port_calls').select('time_zone').eq('voyage_id', voyageId).eq('call_date', today).limit(1).maybeSingle());
      if (port?.time_zone) return port.time_zone;
    }
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }

  async submit(input: NewServiceRequest): Promise<GuestServiceRequest> {
    const errors = validateNewRequest(input);
    const first = Object.values(errors)[0];
    if (first) throw new ServiceError('validation', first);
    const reservationId = uuid(input.reservationId, 'Reservation');
    const ctx = await this.context(reservationId);
    const route = routeFor(input.category, ctx.where);
    const description = input.description.trim();
    const title = titleFrom(description);
    const inserted = await one<{ id: string }>(
      this.db
        .from('service_requests')
        .insert({
          reservation_id: reservationId,
          type: typeFor(input.category),
          category: input.category,
          summary: title,
          details: description === title ? null : description.slice(0, 2000),
          priority: input.priority ?? 'routine',
          assigned_team: route.team,
          status: 'received',
          occasion_step: input.occasionStep ? input.occasionStep.slice(0, 120) : null,
          time_zone: await this.zoneFor(ctx.voyage.id, ctx.today, ctx.where),
        })
        .select('id')
        .maybeSingle(),
      'Service request',
      'new',
    );
    return this.get(inserted.id);
  }

  async listActive(reservationId: ID) {
    return (await this.all(reservationId)).filter((r) => isActive(r.status));
  }

  async listHistory(reservationId: ID) {
    return (await this.all(reservationId)).filter((r) => !isActive(r.status));
  }

  async get(requestId: ID): Promise<GuestServiceRequest> {
    const id = uuid(requestId, 'Service request');
    const row = await one<RequestRow & { reservation_id: string }>(this.db.from('service_requests_local').select(REQUEST_COLUMNS).eq('id', id).maybeSingle(), 'Service request', id);
    return this.view(row, await this.context(row.reservation_id));
  }

  async close(requestId: ID): Promise<GuestServiceRequest> {
    const current = await this.get(requestId);
    if (!current.canClose) throw new ServiceError('conflict', current.status === 'closed' ? 'This request is already closed' : 'The team has already started on this request');
    await run(this.db.rpc('close_service_request', { p_request: current.id }));
    return this.get(current.id);
  }

  subscribe(reservationId: ID, listener: (request: GuestServiceRequest) => void): Unsubscribe {
    const id = uuid(reservationId, 'Reservation');
    const db = this.db;
    const channel = db
      .channel(`requests:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests', filter: `reservation_id=eq.${id}` }, (payload) => {
        const row = payload.new as { id?: string } | null;
        if (row?.id) void this.get(row.id).then(listener, () => undefined);
      })
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }
}
