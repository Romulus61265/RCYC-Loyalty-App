/**
 * Maps the app's domain objects to the personalization engine's inputs.
 *
 * Shared by every PersonalizationService that runs the engine where the
 * inputs are already loaded (the mock today). In production the same mapping
 * runs server-side, where history and the value segment are readable.
 */
import type {
  Experience,
  ExperienceAvailability,
  ExperienceBooking,
  GuestProfile,
  GuestRelationship,
  LoyaltyMembership,
  PersonalizationInput,
  PersonalizationSignal,
  Voyage,
} from '@/domain';

export interface PersonalizationSources {
  profile: GuestProfile;
  membership: LoyaltyMembership | null;
  relationship?: GuestRelationship;
  pastVoyages: Voyage[];
  voyage: Voyage;
  yachtName: string;
  catalogue: Experience[];
  availability: ExperienceAvailability[];
  bookings: ExperienceBooking[];
  /** Observed history (server-side data in production). */
  signals: PersonalizationSignal[];
}

const HISTORY: Partial<Record<PersonalizationSignal['kind'], 'dining' | 'spa' | 'excursion'>> = {
  'dining-history': 'dining',
  'spa-history': 'spa',
  'excursion-history': 'excursion',
};

/** Companion interests from the CRM signal, else from the companion's notes. */
const NOTE_INTERESTS = ['art', 'gardens', 'music', 'wine', 'sailing', 'architecture', 'walking', 'swimming'];

export function buildPersonalizationInput(src: PersonalizationSources): PersonalizationInput {
  const p = src.profile.preferences;
  const companionTags = src.signals.filter((s) => s.kind === 'travel-companions').flatMap((s) => s.tags);
  const visited = src.signals
    .filter((s) => s.kind === 'destinations-visited')
    .flatMap((s) => s.summary.split(','))
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  return {
    bonvoy: src.membership ? { tier: src.membership.tier } : null,
    previousVoyages: src.pastVoyages.map((v) => ({ id: v.id, name: v.name, region: v.region, startDate: v.startDate })),
    history: src.signals.flatMap((s) => {
      const kind = HISTORY[s.kind];
      if (!kind) return [];
      return [{ id: s.id, kind, memory: s.memory, category: s.category, voyageId: s.voyageId, rating: s.rating, weight: s.weight, tags: s.tags }];
    }),
    destinationsVisited: visited,
    voyage: { id: src.voyage.id, yachtName: src.yachtName, startDate: src.voyage.startDate, endDate: src.voyage.endDate },
    itinerary: src.voyage.itinerary.map((d) => ({ id: d.id, day: d.day, date: d.date, type: d.type, portName: d.portName, country: d.country })),
    catalogue: src.catalogue.map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      portCallId: e.portCallId,
      destination: e.destination,
      durationMinutes: e.durationMinutes,
      format: e.format,
      privateAvailable: e.privateAvailable,
      tags: e.tags,
    })),
    slots: src.availability.filter((a) => a.status !== 'unavailable').flatMap((a) => a.slots.map((s) => ({ experienceId: a.experienceId, start: s.start, end: s.end, remaining: s.remaining }))),
    soldOut: src.availability.filter((a) => a.status === 'unavailable').map((a) => a.experienceId),
    preferences: {
      dining: { cuisines: p.dining.cuisines, tablePreference: p.dining.tablePreference, preferredTime: p.dining.preferredTime },
      wine: p.beverage.wine,
      spa: { favouriteTreatments: p.spa.favouriteTreatments, pressure: p.spa.pressure, preferredTime: p.spa.preferredTime },
      excursions: { style: p.excursions.style, pace: p.excursions.pace, maxDurationMinutes: p.excursions.maxDurationMinutes },
      activityInterests: p.activityInterests,
      preferredDestinations: p.preferredDestinations,
      mobility: p.accessibility.mobility,
      personalisedRecommendations: p.privacy.personalisedRecommendations,
    },
    companions: src.profile.companions.map((c) => ({
      firstName: c.firstName,
      relationship: c.relationship,
      isMinor: c.isMinor,
      interests: companionTags.length ? companionTags.filter((t) => t !== 'couple') : NOTE_INTERESTS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(c.notes ?? '')),
    })),
    occasions: src.profile.occasions.map((o) => ({ id: o.id, type: o.type, label: o.label, date: o.date, recognition: o.recognition })),
    bookings: src.bookings.map((b) => ({ id: b.id, experienceId: b.experienceId, category: b.category, start: b.start, end: b.end, status: b.status })),
    valueSegment: src.relationship?.valueSegment,
  };
}
