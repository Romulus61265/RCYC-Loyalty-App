import type { ID, ISODateTime } from './common';
import type { ExperienceCategory } from './experience';

/** Signals feeding the personalization engine. All server-side in production. */
export type SignalKind =
  | 'bonvoy-status'
  | 'voyage-history'
  | 'suite-preference'
  | 'dining-history'
  | 'spa-history'
  | 'excursion-history'
  | 'destinations-visited'
  | 'future-itinerary'
  | 'travel-companions'
  | 'special-occasion'
  | 'lifetime-value'
  | 'feedback'
  | 'service-recovery';

/** An observed fact about the guest that feeds scoring. Server-side in production. */
export interface PersonalizationSignal {
  id: ID;
  guestId: ID;
  kind: SignalKind;
  /** What was observed, e.g. "Private sail aboard a classic yacht, Hvar". */
  summary: string;
  category?: ExperienceCategory;
  /** Voyage on which it was observed, if any. */
  voyageId?: ID;
  /** Guest rating 1–5 where captured. */
  rating?: number;
  /** Relative strength 0–1 used by the scorer. */
  weight: number;
  observedAt: ISODateTime;
  source: 'reservations' | 'shipboard-pos' | 'spa-system' | 'shore-ops' | 'crm' | 'survey' | 'bonvoy' | 'concierge';
  tags: string[];
}

export type RecommendationSurface = 'home' | 'discover' | 'concierge' | 'voyage' | 'crew-console';

/** A next-best experience or service opportunity. */
export interface Recommendation {
  id: ID;
  surface: RecommendationSurface;
  kind: 'experience' | 'service-gesture' | 'content' | 'rebook';
  experienceId?: ID;
  category?: ExperienceCategory;
  title: string;
  /** Human-sounding reason, e.g. "Because you loved the Barolo tasting in Portofino". */
  rationale: string;
  score: number;
  /** Signals that drove it — for explainability and audit, not display. */
  drivers: SignalKind[];
  /** Crew-only opportunities are never returned to the guest app. */
  audience: 'guest' | 'crew';
}
