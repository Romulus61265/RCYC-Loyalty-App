import type { ID, ISODateTime, MediaAsset, Money, RequestStatus } from './common';

export type ExperienceCategory =
  | 'dining'
  | 'spa'
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
  capacity?: number;
  tags: string[];
  hero: MediaAsset;
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
