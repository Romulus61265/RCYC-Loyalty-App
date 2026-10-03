/**
 * Rules-based stand-in for the personalization platform. NOT a real
 * recommender: it scores each catalogue experience against the guest's
 * signals with transparent weights, and explains the strongest match in
 * plain language. Curated recommendations in the dataset take precedence.
 *
 * Production replaces this with the decisioning service behind the same
 * `PersonalizationService.getRecommendations` contract.
 */
import type { Recommendation, SignalKind } from '@/domain';
import { mergeRecommendations } from '@/services/shared/recommendations';
import { formatLongDate } from '@/utils/format';
import { data } from './support';

interface Driver {
  kind: SignalKind;
  weight: number;
  reason: string;
}

/** Guest interests → experience tags that express them. */
const INTEREST_TAGS: { match: RegExp; tags: string[]; phrase: string }[] = [
  { match: /fine dining/i, tags: ['fine-dining', 'tasting', 'chef'], phrase: 'fine dining' },
  { match: /^wine/i, tags: ['wine', 'red-wine'], phrase: 'wine' },
  { match: /cultur/i, tags: ['culture', 'architecture', 'art', 'gardens'], phrase: 'private cultural experiences' },
  { match: /spa/i, tags: ['spa', 'massage', 'thalassotherapy', 'wellness', 'yoga', 'recovery'], phrase: 'time in the spa' },
  { match: /yacht|sail/i, tags: ['yachting', 'sailing', 'boat'], phrase: 'life at sea' },
];

const GENERIC_TAGS = new Set(['private', 'evening', 'morning']);
const SHORE_CATEGORIES = new Set(['excursion', 'culture', 'wine', 'private', 'wellness']);

const year = (iso: string) => iso.slice(0, 4);

export function scoreExperiences(): Recommendation[] {
  const { profile } = data.guest;
  const { signals } = data.personalization;
  const { catalogue } = data.experiences;
  const pastVoyages = new Map(data.voyage.pastVoyages.map((v) => [v.id, v]));
  const itinerary = data.voyage.voyage.itinerary;
  const companion = profile.companions[0]?.firstName;
  const occasion = profile.occasions.find((o) => o.date >= data.voyage.voyage.startDate && o.date <= data.voyage.voyage.endDate && o.recognition !== 'private');
  const avoidGroups = signals.some((s) => s.tags.includes('avoid') && s.tags.includes('small-group'));
  const companionTags = signals.filter((s) => s.kind === 'travel-companions').flatMap((s) => s.tags);
  const firstVisit = signals.some((s) => s.kind === 'future-itinerary' && s.tags.includes('first-visit'));
  const memories = signals.filter((s) => s.memory && (s.rating ?? 5) >= 4 && s.voyageId && pastVoyages.has(s.voyageId));

  const scored: Recommendation[] = [];
  for (const e of catalogue) {
    if (e.category === 'transfer') continue;
    const drivers: Driver[] = [];
    const tags = new Set(e.tags);

    // 1 · Something they loved before, with the voyage it happened on.
    const best = memories
      .map((s) => ({ s, overlap: s.tags.filter((t) => !GENERIC_TAGS.has(t) && tags.has(t)).length, sameCategory: s.category === e.category }))
      .filter((m) => m.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || Number(b.sameCategory) - Number(a.sameCategory) || b.s.weight - a.s.weight)[0];
    if (best) {
      const v = pastVoyages.get(best.s.voyageId!)!;
      drivers.push({
        kind: best.s.kind,
        weight: 0.35 + 0.1 * Math.min(best.overlap, 3) * best.s.weight,
        reason: `Recommended because you enjoyed ${best.s.memory} on your ${v.region} voyage in ${year(v.startDate)}.`,
      });
    }

    // 2 · The occasion this voyage, on the day itself where possible.
    if (occasion && tags.has('occasion')) {
      const port = itinerary.find((p) => p.date === occasion.date);
      const sameDay = !e.portCallId || e.portCallId === port?.id || itinerary.find((p) => p.id === e.portCallId)?.portName === port?.portName;
      drivers.push({
        kind: 'special-occasion',
        weight: sameDay ? 0.5 : 0.3,
        reason: `For your ${occasion.label} on ${formatLongDate(occasion.date)}${port && sameDay ? `, in ${port.portName}` : ''}.`,
      });
    }

    // 3 · The person they travel with.
    if (companion && companionTags.some((t) => tags.has(t))) {
      drivers.push({ kind: 'travel-companions', weight: 0.3, reason: `${companion} loves gardens and art. We thought of you both.` });
    }

    // 4 · Stated interests.
    const interest = INTEREST_TAGS.find((i) => profile.preferences.activityInterests.some((a) => i.match.test(a)) && i.tags.some((t) => tags.has(t)));
    if (interest) {
      drivers.push({
        kind: 'suite-preference',
        weight: 0.2,
        reason: e.category === 'wellness' ? 'Chosen to complement your time in the spa.' : `Because ${interest.phrase} is one of your passions.`,
      });
    }

    // 5 · Preferences: private style, window tables.
    if (profile.preferences.excursions.style === 'private' && e.format === 'private' && SHORE_CATEGORIES.has(e.category)) {
      drivers.push({ kind: 'excursion-history', weight: 0.12, reason: 'Private, as you prefer: just the two of you and your guide.' });
    }
    if (e.category === 'dining' && profile.preferences.dining.tablePreference === 'window' && tags.has('window')) {
      drivers.push({ kind: 'dining-history', weight: 0.15, reason: 'Your window table is held here each evening.' });
    }

    // 6 · A first visit to this port.
    const port = e.portCallId ? itinerary.find((p) => p.id === e.portCallId) : undefined;
    if (firstVisit && port) drivers.push({ kind: 'future-itinerary', weight: 0.05, reason: `Your first time in ${port.portName}.` });

    // Penalty: group formats after a disappointing group tour.
    const penalty = avoidGroups && SHORE_CATEGORIES.has(e.category) && (e.format === 'small-group' || e.format === 'shared') ? 0.3 : 0;

    const score = drivers.reduce((sum, d) => sum + d.weight, 0) - penalty;
    if (score < 0.25 || drivers.length === 0) continue;
    const primary = [...drivers].sort((a, b) => b.weight - a.weight)[0]!;
    scored.push({
      id: `dev_rec_auto_${e.id.replace(/^dev_exp_/, '')}`,
      surface: 'discover',
      kind: 'experience',
      experienceId: e.id,
      category: e.category,
      title: e.title,
      rationale: primary.reason,
      score: Math.min(1, Number(score.toFixed(3))),
      drivers: [...new Set(drivers.map((d) => d.kind))],
      audience: 'guest',
    });
  }
  return scored;
}

/** Curated recommendations win; the engine fills in the rest. Highest score first. */
export function mergedRecommendations(curated: Recommendation[]): Recommendation[] {
  return mergeRecommendations(scoreExperiences(), curated);
}
