import type { ID, ISODate, ISODateTime, MediaAsset } from './common';

/** A future voyage to inspire the next one (fictional in development). */
export interface VoyageInspiration {
  id: ID;
  name: string;
  region: string;
  yachtName: string;
  startDate: ISODate;
  endDate: ISODate;
  nights: number;
  ports: string[];
  tags: string[];
  standfirst: string;
  highlight: string;
  /** A sentence per interest it answers ("wine" → "Etna’s volcanic vineyards…"). */
  hooks: Record<string, string>;
  hero: MediaAsset;
}

/** One remembered moment: something that took place, or the occasion itself. */
export interface RecapMemory {
  id: string;
  kind: 'experience' | 'dining' | 'occasion';
  title: string;
  /** "Sagrada Família, Passion façade entrance", or the occasion's place. */
  line: string;
  date: ISODate;
  time?: string;
  experienceId?: ID;
}

export interface RecapDay {
  dayNumber: number;
  date: ISODate;
  /** "Barcelona", "At sea". */
  place: string;
  memories: RecapMemory[];
}

export interface RecapDestination {
  portName: string;
  country: string;
  /** "16 May", "19 – 20 May". */
  when: string;
  standfirst?: string;
}

export interface VoyageRecommendation {
  inspirationId: ID;
  name: string;
  region: string;
  /** "10 – 17 June 2028 · 7 nights · Evrima". */
  when: string;
  ports: string[];
  /** What it offers the guest, in the house voice. */
  reason: string;
  /** The guest's own moment it follows from ("Binissalem vineyards & lunch in Deià"). */
  because?: string;
  standfirst: string;
  highlight: string;
  hero: MediaAsset;
}

export interface CrewToThank {
  id: string;
  name: string;
  role: string;
}

/** The guest's reflections. Everything is optional; nothing is a score. */
export interface VoyageFeedback {
  guestId: ID;
  reservationId: ID;
  /** Memory ids that stay with them. */
  favourites: string[];
  /** A word or two for the voyage. */
  words: string[];
  /** Crew to thank, with an optional note for each. */
  thanks: { crewId: string; note?: string }[];
  /** What could have been better, if anything (read by a person). */
  better?: string;
  /** The guest would like someone to get in touch about `better`. */
  followUp: boolean;
  /** Anything to remember for next time. */
  nextTime?: string;
  status: 'draft' | 'sent';
  version: number;
  updatedAt: ISODateTime;
  sentAt?: ISODateTime;
  /** The request raised when the guest asked to be contacted. */
  followUpRequestId?: ID;
}

export type FeedbackPatch = Partial<Pick<VoyageFeedback, 'favourites' | 'words' | 'thanks' | 'better' | 'followUp' | 'nextTime'>>;

/** Everything shown after the voyage. */
export interface VoyageRecap {
  reservationId: ID;
  voyageId: ID;
  welcome: { eyebrow: string; title: string; line: string };
  summary: { voyageName: string; dates: string; line: string; voyageNumber?: number };
  days: RecapDay[];
  destinations: RecapDestination[];
  /** Suggested until the guest chooses their own. */
  favourites: { chosen: boolean; memories: RecapMemory[] };
  bonvoy: { tierLabel?: string; lifetimeStatus?: string; note: string; connected: false };
  thankYou: { title: string; body: string[]; signature: string };
  recommendations: VoyageRecommendation[];
  inspiration: { eyebrow: string; title: string; standfirst: string; voyage: VoyageRecommendation; closing: string } | null;
  crew: CrewToThank[];
  feedback: VoyageFeedback;
}

/** Words offered to describe the voyage (the guest picks up to three). */
export const FEEDBACK_WORDS = ['Restful', 'Celebratory', 'Effortless', 'Intimate', 'Unhurried', 'Delicious', 'Romantic', 'Curious', 'Adventurous', 'Generous'] as const;
