import type { ID, ISODateTime, MediaAsset, Money, RequestStatus } from './common';

export type ExperienceCategory =
  | 'dining'
  | 'spa'
  | 'wellness'
  | 'excursion'
  | 'marina'
  | 'entertainment'
  | 'transfer'
  | 'private'
  | 'wine'
  | 'shopping'
  | 'culture'
  | 'event';

/** Catalogue item — something that *can* be booked or discovered. */
export interface Experience {
  id: ID;
  category: ExperienceCategory;
  title: string;
  subtitle: string;
  description: string;
  /** Port where the experience happens; absent for shipboard offerings. */
  portCallId?: ID;
  destination?: string;
  durationMinutes?: number;
  /** Price is shown discreetly, if at all; many are inclusive. */
  price?: Money;
  inclusive: boolean;
  privateAvailable: boolean;
  /**
   * How it is enjoyed: just the guest's party, a small group, a shared
   * yacht event, or either on request.
   */
  format: ExperienceFormat;
  capacity?: number;
  /** What the experience includes, e.g. "Private car and driver-guide". */
  includes?: string[];
  tags: string[];
  hero: MediaAsset;
}

export type ExperienceFormat = 'private' | 'small-group' | 'shared' | 'private-or-group';

export type AvailabilityStatus = 'available' | 'limited' | 'waitlist' | 'unavailable';

/** Bookable times for an experience across the voyage. */
export interface ExperienceAvailability {
  experienceId: ID;
  status: AvailabilityStatus;
  slots: { start: ISODateTime; end?: ISODateTime; remaining: number }[];
  /** e.g. "Two places left", "Opens 72 hours before the port day". */
  note?: string;
}

/** A booking the guest holds — dining, spa, excursion, transfer… */
export interface ExperienceBooking {
  id: ID;
  reservationId: ID;
  experienceId: ID;
  category: ExperienceCategory;
  title: string;
  venue: string;
  start: ISODateTime;
  end?: ISODateTime;
  partySize: number;
  status: RequestStatus;
  /** Free-text guest-facing note, e.g. "Terrace table, ocean side". */
  note?: string;
}

/** One line in the curated daily programme ("The Day Ahead"). */
export interface ScheduleItem {
  id: ID;
  start: ISODateTime;
  end?: ISODateTime;
  title: string;
  location: string;
  kind: 'booking' | 'ship-event' | 'port' | 'recommendation';
  bookingId?: ID;
  category?: ExperienceCategory;
}

export interface DaySchedule {
  date: string;
  dayNumber: number;
  portCallId: ID;
  headline: string;
  dressCode?: string;
  sunset?: ISODateTime;
  items: ScheduleItem[];
}

export interface DiscoverCollection {
  id: ID;
  title: string;
  /** Short editorial standfirst. */
  standfirst: string;
  category: ExperienceCategory | 'destination';
  experienceIds: ID[];
}

export interface Destination {
  id: ID;
  name: string;
  country: string;
  portCallId?: ID;
  standfirst: string;
  hero: MediaAsset;
}

/** Kinds shown in the guest's combined calendar. */
export type CalendarEntryKind = 'yacht-event' | 'dining' | 'spa' | 'excursion' | 'private' | 'transport' | 'port' | 'flight';

/**
 * One line in the chronological guest calendar: a booking, a yacht event,
 * a port time, a transfer or a flight. Times carry their local offset.
 */
export interface CalendarEntry {
  id: ID;
  kind: CalendarEntryKind;
  start: ISODateTime;
  end?: ISODateTime;
  title: string;
  location: string;
  /** Present for reservations the party holds. */
  bookingId?: ID;
  status?: RequestStatus;
  note?: string;
  /** Suggested by the programme or personalization, not booked. */
  suggestion: boolean;
}

export interface CalendarDay {
  date: string;
  /** Null for travel days before or after the voyage. */
  dayNumber: number | null;
  portCallId?: ID;
  title: string;
  dressCode?: string;
  sunset?: ISODateTime;
  entries: CalendarEntry[];
}
