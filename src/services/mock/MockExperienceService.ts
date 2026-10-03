import type { ExperienceBooking, ExperienceCategory, ID, ISODateTime } from '@/domain';
import type { AvailabilityQuery, ExperienceService } from '@/services/contracts';
import { addMinutes } from '@/utils/format';
import { data, failIf, isEmptyScenario, latency, mockId, mockNow, notFound } from './support';

const { bookings, catalogue, collections, daySchedules, destinations, availability } = data.experiences;

export class MockExperienceService implements ExperienceService {
  private bookings: ExperienceBooking[] = [...bookings];

  listBookings(reservationId: ID, filter?: { category?: ExperienceCategory }) {
    failIf('optional', 'bookings');
    if (isEmptyScenario()) return latency<ExperienceBooking[]>([]);
    return latency(
      this.bookings
        .filter((b) => b.reservationId === reservationId && b.status !== 'cancelled')
        .filter((b) => !filter?.category || b.category === filter.category)
        .sort((a, b) => a.start.localeCompare(b.start)),
    );
  }

  async getNextBooking(reservationId: ID, category?: ExperienceCategory, now: Date = mockNow()) {
    const list = await this.listBookings(reservationId, category ? { category } : undefined);
    return list.find((b) => Date.parse(b.start) >= now.getTime()) ?? null;
  }

  getDaySchedule(_reservationId: ID, dayNumber: number) {
    const day = daySchedules.find((d) => d.dayNumber === dayNumber);
    return day ? latency(day) : notFound('Day', String(dayNumber));
  }

  listDaySchedules(_reservationId: ID) {
    failIf('optional', 'day schedules');
    if (isEmptyScenario()) return latency(daySchedules.map((d) => ({ ...d, items: [] })));
    return latency(daySchedules);
  }

  listCatalogue(_voyageId: ID, filter?: { category?: ExperienceCategory; portCallId?: ID }) {
    return latency(
      catalogue
        .filter((e) => !filter?.category || e.category === filter.category)
        .filter((e) => !filter?.portCallId || e.portCallId === filter.portCallId),
    );
  }

  getExperience(experienceId: ID) {
    const found = catalogue.find((e) => e.id === experienceId);
    return found ? latency(found) : notFound('Experience', experienceId);
  }

  listAvailability(_voyageId: ID) {
    failIf('optional', 'availability');
    return latency(availability);
  }

  listCollections(_voyageId: ID) {
    return latency(collections);
  }

  listDestinations(_voyageId: ID) {
    return latency(destinations);
  }

  checkAvailability(query: AvailabilityQuery) {
    const times = ['10:00', '14:00', '17:30'];
    return latency(times.map((t) => ({ start: `${query.date}T${t}:00+02:00`, remaining: 4 })));
  }

  async requestBooking(reservationId: ID, experienceId: ID, slot: ISODateTime, partySize: number, note?: string) {
    const exp = await this.getExperience(experienceId);
    const booking: ExperienceBooking = {
      id: mockId('bkg'),
      reservationId,
      experienceId,
      category: exp.category,
      title: exp.title,
      venue: exp.destination ?? `Aboard ${data.voyage.yacht.name}`,
      start: slot,
      end: exp.durationMinutes ? addMinutes(slot, exp.durationMinutes) : undefined,
      partySize,
      status: 'received',
      note,
    };
    this.bookings.push(booking);
    return latency(booking, 500);
  }

  async requestChange(bookingId: ID, change: { start?: ISODateTime; partySize?: number; note?: string }) {
    const booking = this.bookings.find((b) => b.id === bookingId) ?? notFound('Booking', bookingId);
    // A new start moves the end with it.
    const end = change.start && booking.end ? addMinutes(change.start, (Date.parse(booking.end) - Date.parse(booking.start)) / 60_000) : booking.end;
    Object.assign(booking, change, { end, status: 'in_progress' as const });
    return latency(booking, 500);
  }

  /**
   * Mock-only: the venue accepts a request (in production the crew or the
   * reservations system confirms). Used by MockConciergeService.
   */
  async confirm(bookingId: ID) {
    const booking = this.bookings.find((b) => b.id === bookingId) ?? notFound('Booking', bookingId);
    booking.status = 'confirmed';
    return latency(booking, 150);
  }

  async cancelBooking(bookingId: ID) {
    const booking = this.bookings.find((b) => b.id === bookingId) ?? notFound('Booking', bookingId);
    booking.status = 'cancelled';
    await latency(undefined, 400);
  }
}
