/** Merge rules for recommendations, shared by PersonalizationService implementations. */
import type { ExperienceCategory, PersonalizedRecommendation, Recommendation, SignalKind, SourceSignalKind } from '@/domain';

/**
 * Curated recommendations win over scored ones for the same experience (and
 * keep the higher score); the scorer fills in the rest. Highest score first.
 * Crew-audience items never pass.
 */
export function mergeRecommendations(scored: Recommendation[], curated: Recommendation[]): Recommendation[] {
  const byExperience = new Map<string, Recommendation>();
  for (const r of scored) if (r.experienceId && r.audience === 'guest') byExperience.set(r.experienceId, r);
  for (const r of curated) {
    if (!r.experienceId || r.audience !== 'guest') continue;
    byExperience.set(r.experienceId, { ...r, score: Math.max(r.score, byExperience.get(r.experienceId)?.score ?? 0) });
  }
  return [...byExperience.values()].sort((a, b) => b.score - a.score);
}

/** Home shows only its own curated picks. */
export function curatedFor(curated: Recommendation[], surface: Recommendation['surface']): Recommendation[] {
  return curated.filter((r) => r.audience === 'guest' && r.surface === surface).sort((a, b) => b.score - a.score);
}

/** Engine signal kinds → the drivers recorded on a Recommendation. Internal kinds are dropped. */
const DRIVER: Record<SourceSignalKind, SignalKind | null> = {
  'bonvoy-status': 'bonvoy-status',
  'previous-voyages': 'voyage-history',
  'current-itinerary': 'future-itinerary',
  'dining-preferences': 'dining-history',
  'spa-preferences': 'spa-history',
  'excursion-history': 'excursion-history',
  'destination-interests': 'suite-preference',
  'travel-companion': 'travel-companions',
  'special-occasion': 'special-occasion',
  'current-reservations': 'future-itinerary',
  'value-segment': null,
};

/** An engine recommendation as a surface Recommendation (for Discover and Voyage). */
export function fromPersonalized(r: PersonalizedRecommendation, surface: Recommendation['surface']): Recommendation {
  return {
    id: `dev_rec_auto_${r.experienceId.replace(/^dev_exp_/, '')}`,
    surface,
    kind: 'experience',
    experienceId: r.experienceId,
    category: r.category as ExperienceCategory,
    title: r.recommendation,
    rationale: r.reason,
    score: r.relevanceScore,
    drivers: [...new Set(r.sourceSignals.filter((s) => s.visibility === 'guest').map((s) => DRIVER[s.kind]).filter((k): k is SignalKind => k !== null))],
    audience: 'guest',
  };
}
