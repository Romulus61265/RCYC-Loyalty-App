/**
 * Catalogue, availability, bookings and the daily programme from Supabase.
 *
 * Guests create bookings only as requests (`status = 'received'`, enforced by
 * RLS). Changes and cancellations go through the `request_experience_booking_change`
 * and `cancel_experience_booking` functions, which allow nothing else.
 */
import type { DaySchedule, ExperienceAvailability, ExperienceBooking, ExperienceCategory, ID, ISODateTime } from '@/domain';
import type { AvailabilityQuery, AvailabilitySlot, ExperienceService } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import {
  ACTIVITY_COLUMNS,
  BOOKING_COLUMNS,
  COLLECTION_COLUMNS,
  DESTINATION_COLUMNS,
  EXPERIENCE_COLUMNS,
  VOYAGE_DAY_COLUMNS,
  toBooking,
  toCollection,
  toDestination,
  toExperience,
  toScheduleItem,
  toSlot,
  type ActivityRow,
  type BookingRow,
  type CollectionRow,
  type DestinationRow,
  type ExperienceRow,
  type SlotRow,
  type VoyageDayRow,
} from './rows';
import { compact, many, manyPaged, one, opt, run, uuid, type SupabaseDeps } from './support';

const NOTE_MAX = 1000;
const PARTY_MAX = 50;

export class SupabaseExperienceService implements ExperienceService {
  constructor(private readonly deps: SupabaseDeps) {}

  private get db() {
    return this.deps.db();
  }

  private async voyageOf(reservationId: ID): Promise<{ voyageId: string; yachtName: string }> {
    const id = uuid(reservationId, 'Reservation');
    const row = await one<{ voyage_id: string; voyage: { yacht: { name: string } | null } | null }>(
      this.db.from('reservations').select('voyage_id, voyage:voyages(yacht:yachts(name))').eq('id', id).maybeSingle(),
      'Reservation',
      id,
    );
    return { voyageId: row.voyage_id, yachtName: row.voyage?.yacht?.name ?? 'the yacht' };
  }

  private async getBooking(bookingId: ID): Promise<ExperienceBooking> {
    const id = uuid(bookingId, 'Booking');
    return toBooking(await one<BookingRow>(this.db.from('experience_bookings_local').select(BOOKING_COLUMNS).eq('id', id).maybeSingle(), 'Booking', id));
  }

  async listBookings(reservationId: ID, filter?: { category?: ExperienceCategory }) {
    const res = uuid(reservationId, 'Reservation');
    // Builders mutate in place, so each page starts a fresh query.
    const query = () => {
      const q = this.db.from('experience_bookings_local').select(BOOKING_COLUMNS).eq('reservation_id', res).neq('status', 'cancelled');
      return filter?.category ? q.eq('category', filter.category) : q;
    };
    const rows = await manyPaged<BookingRow>((from, to) => query().order('starts_at').order('title').order('id').range(from, to));
    return rows.map(toBooking);
  }

  async getNextBooking(reservationId: ID, category?: ExperienceCategory, now: Date = this.deps.clock.now()) {
    const list = await this.listBookings(reservationId, category ? { category } : undefined);
    return list.find((b) => Date.parse(b.start) >= now.getTime()) ?? null;
  }

  async listDaySchedules(reservationId: ID): Promise<DaySchedule[]> {
    const res = uuid(reservationId, 'Reservation');
    const { voyageId } = await this.voyageOf(res);
    const [days, items] = await Promise.all([
      many<VoyageDayRow>(this.db.from('voyage_days_local').select(VOYAGE_DAY_COLUMNS).eq('voyage_id', voyageId).order('day')),
      // Ship-wide programme plus this party's own lines.
      manyPaged<ActivityRow>((from, to) =>
        this.db.from('activities_local').select(ACTIVITY_COLUMNS).eq('voyage_id', voyageId).or(`reservation_id.is.null,reservation_id.eq.${res}`).order('starts_at').order('title').order('id').range(from, to),
      ),
    ]);
    return days.map((d) =>
      compact({
        date: d.day_date,
        dayNumber: d.day,
        portCallId: d.port_call_id ?? '',
        headline: d.headline,
        dressCode: opt(d.dress_code),
        sunset: opt(d.sunset),
        items: items.filter((i) => i.day === d.day).map(toScheduleItem),
      }),
    );
  }

  async getDaySchedule(reservationId: ID, dayNumber: number) {
    const day = (await this.listDaySchedules(reservationId)).find((d) => d.dayNumber === dayNumber);
    if (!day) throw new ServiceError('not_found', `Day ${dayNumber} not found`);
    return day;
  }

  async listCatalogue(voyageId: ID, filter?: { category?: ExperienceCategory; portCallId?: ID }) {
    let q = this.db.from('experiences').select(EXPERIENCE_COLUMNS).or(`voyage_id.eq.${uuid(voyageId, 'Voyage')},voyage_id.is.null`);
    if (filter?.category) q = q.eq('category', filter.category);
    if (filter?.portCallId) q = q.eq('port_call_id', uuid(filter.portCallId, 'Port call'));
    const rows = await many<ExperienceRow>(q.order('sort_order').order('title'));
    return rows.map(toExperience);
  }

  async getExperience(experienceId: ID) {
    const id = uuid(experienceId, 'Experience');
    return toExperience(await one<ExperienceRow>(this.db.from('experiences').select(EXPERIENCE_COLUMNS).eq('id', id).maybeSingle(), 'Experience', id));
  }

  async listCollections(voyageId: ID) {
    const rows = await many<CollectionRow>(this.db.from('discover_collections').select(COLLECTION_COLUMNS).eq('voyage_id', uuid(voyageId, 'Voyage')).order('sort_order'));
    return rows.map(toCollection);
  }

  async listDestinations(voyageId: ID) {
    const rows = await many<DestinationRow>(this.db.from('destinations').select(DESTINATION_COLUMNS).eq('voyage_id', uuid(voyageId, 'Voyage')).order('sort_order'));
    return rows.map(toDestination);
  }

  async checkAvailability(query: AvailabilityQuery): Promise<AvailabilitySlot[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date)) throw new ServiceError('validation', 'Date must be YYYY-MM-DD');
    const rows = await many<SlotRow>(
      this.db
        .from('experience_slots_local')
        .select('experience_id, start_local, end_local, remaining')
        .eq('experience_id', uuid(query.experienceId, 'Experience'))
        .eq('local_date', query.date)
        .gte('remaining', Math.max(1, Math.floor(query.partySize)))
        .order('starts_at'),
    );
    return rows.map(toSlot);
  }

  async listAvailability(voyageId: ID): Promise<ExperienceAvailability[]> {
    const experiences = await many<{ id: string; availability_status: ExperienceAvailability['status']; availability_note: string | null }>(
      this.db
        .from('experiences')
        .select('id, availability_status, availability_note')
        .or(`voyage_id.eq.${uuid(voyageId, 'Voyage')},voyage_id.is.null`)
        .not('availability_status', 'is', null)
        .order('sort_order'),
    );
    if (!experiences.length) return [];
    const ids = experiences.map((e) => e.id);
    const slots = await manyPaged<SlotRow>((from, to) =>
      this.db.from('experience_slots_local').select('experience_id, start_local, end_local, remaining').in('experience_id', ids).order('starts_at').order('id').range(from, to),
    );
    return experiences.map((e) =>
      compact({
        experienceId: e.id,
        status: e.availability_status,
        slots: slots.filter((s) => s.experience_id === e.id).map(toSlot),
        note: opt(e.availability_note),
      }),
    );
  }

  async requestBooking(reservationId: ID, experienceId: ID, slot: ISODateTime, partySize: number, note?: string) {
    const res = uuid(reservationId, 'Reservation');
    if (Number.isNaN(Date.parse(slot))) throw new ServiceError('validation', 'Invalid time');
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > PARTY_MAX) throw new ServiceError('validation', 'Invalid party size');
    if (note && note.length > NOTE_MAX) throw new ServiceError('validation', `Notes are limited to ${NOTE_MAX} characters`);
    const [experience, { yachtName }] = await Promise.all([this.getExperience(experienceId), this.voyageOf(res)]);
    // created_by, category, title defaults and time zone are set server-side.
    const inserted = await one<{ id: string }>(
      this.db
        .from('experience_bookings')
        .insert({
          reservation_id: res,
          experience_id: experience.id,
          starts_at: slot,
          party_size: partySize,
          venue: experience.destination ?? `Aboard ${yachtName}`,
          note: note?.trim() || null,
          status: 'received',
        })
        .select('id')
        .maybeSingle(),
      'Booking',
      'new',
    );
    return this.getBooking(inserted.id);
  }

  async requestChange(bookingId: ID, change: { start?: ISODateTime; partySize?: number; note?: string }) {
    const id = uuid(bookingId, 'Booking');
    if (change.start && Number.isNaN(Date.parse(change.start))) throw new ServiceError('validation', 'Invalid time');
    await run(this.db.rpc('request_experience_booking_change', { p_booking: id, p_starts_at: change.start ?? null, p_party_size: change.partySize ?? null, p_note: change.note ?? null }));
    return this.getBooking(id);
  }

  async cancelBooking(bookingId: ID) {
    await run(this.db.rpc('cancel_experience_booking', { p_booking: uuid(bookingId, 'Booking') }));
  }
}
