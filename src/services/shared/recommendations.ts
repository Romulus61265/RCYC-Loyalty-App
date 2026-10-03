/** Merge rules for recommendations, shared by PersonalizationService implementations. */
import type { Recommendation } from '@/domain';

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
