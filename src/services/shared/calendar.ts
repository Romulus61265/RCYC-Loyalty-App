/**
 * Builds the guest's combined calendar from the voyage programme, the
 * party's bookings, port times and flights. Pure: every ScheduleService
 * implementation feeds it the same inputs from its own backend.
 */
import type { CalendarDay, CalendarEntry, CalendarEntryKind, DaySchedule, ExperienceBooking, ExperienceCategory, FlightSegment, ScheduleItem, Voyage } from '@/domain';

export interface CalendarInputs {
  voyage: Voyage;
  yachtName: string;
  flights: FlightSegment[];
  bookings: ExperienceBooking[];
  daySchedules: DaySchedule[];
}

const KIND_BY_CATEGORY: Record<ExperienceCategory, CalendarEntryKind> = {
  dining: 'dining',
  spa: 'spa',
  wellness: 'spa',
  excursion: 'excursion',
  culture: 'excursion',
  wine: 'excursion',
  shopping: 'excursion',
  private: 'private',
  transfer: 'transport',
  marina: 'yacht-event',
  entertainment: 'yacht-event',
  event: 'yacht-event',
};

function fromBooking(b: ExperienceBooking): CalendarEntry {
  return {
    id: `cal_${b.id}`,
    kind: KIND_BY_CATEGORY[b.category],
    start: b.start,
    end: b.end,
    title: b.title,
    location: b.venue,
    bookingId: b.id,
    status: b.status,
    note: b.note,
    suggestion: false,
  };
}

function fromItem(i: ScheduleItem): CalendarEntry {
  const kind: CalendarEntryKind = i.kind === 'port' ? 'port' : i.category ? KIND_BY_CATEGORY[i.category] : 'yacht-event';
  return { id: `cal_${i.id}`, kind, start: i.start, end: i.end, title: i.title, location: i.location, suggestion: i.kind === 'recommendation' };
}

export function buildCalendar({ voyage, yachtName, flights, bookings, daySchedules }: CalendarInputs): CalendarDay[] {
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const days = new Map<string, CalendarDay>();

  const dayFor = (date: string): CalendarDay => {
    const existing = days.get(date);
    if (existing) return existing;
    const port = voyage.itinerary.find((p) => p.date === date);
    const schedule = daySchedules.find((d) => d.date === date);
    const day: CalendarDay = {
      date,
      dayNumber: port?.day ?? null,
      portCallId: port?.id,
      title: schedule?.headline ?? (date < voyage.startDate ? 'Before you sail' : 'Journey home'),
      dressCode: schedule?.dressCode,
      sunset: schedule?.sunset,
      entries: [],
    };
    days.set(date, day);
    return day;
  };

  // Programme items (booking items use the full booking record).
  for (const d of daySchedules) {
    const day = dayFor(d.date);
    for (const i of d.items) {
      const b = i.bookingId ? bookingById.get(i.bookingId) : undefined;
      day.entries.push(b ? fromBooking(b) : fromItem(i));
    }
  }
  // Bookings not already in the programme.
  const placed = new Set([...days.values()].flatMap((d) => d.entries.map((e) => e.bookingId).filter(Boolean)));
  for (const b of bookings) if (!placed.has(b.id)) dayFor(b.start.slice(0, 10)).entries.push(fromBooking(b));

  // Port arrivals and sailings not already listed.
  for (const p of voyage.itinerary) {
    const day = dayFor(p.date);
    if (p.arrival && p.type !== 'embark') day.entries.push({ id: `cal_arr_${p.id}`, kind: 'port', start: p.arrival, title: `Arrive in ${p.portName}`, location: p.type === 'tender' ? 'At anchor, by tender' : 'Alongside', suggestion: false });
    if (p.departure) day.entries.push({ id: `cal_dep_${p.id}`, kind: 'port', start: p.departure, title: `Sail from ${p.portName}`, location: yachtName, suggestion: false });
  }

  // Flights sit on the day they depart (local date at origin).
  for (const f of flights) {
    dayFor(f.departure.slice(0, 10)).entries.push({
      id: `cal_${f.id}`,
      kind: 'flight',
      start: f.departure,
      end: f.arrival,
      title: `${f.carrier} ${f.flightNumber}`,
      location: `${f.origin} → ${f.destination}`,
      note: f.direction === 'inbound' ? 'Your driver tracks this flight.' : 'Your car leaves the yacht in good time.',
      suggestion: false,
    });
  }

  return [...days.values()]
    .map((d) => ({ ...d, entries: d.entries.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
