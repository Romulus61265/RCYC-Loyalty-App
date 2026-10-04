/** Words for voyage history. Pure. */
import type { VoyageHistoryEntry } from '@/domain';

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];

/** "Evrima · 2 – 9 December 2023 · 7 nights". */
export const voyageLine = (e: VoyageHistoryEntry) => [e.yachtName, e.dates, `${e.nights} nights`].filter(Boolean).join(' · ');

/** "Bridgetown, the Grenadines and St Barths". */
export function placesLine(e: VoyageHistoryEntry): string {
  const names = e.destinations.map((d) => (d.name.startsWith('The ') ? `the ${d.name.slice(4)}` : d.name));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** A sentence across every voyage: "Three voyages, 24 nights, aboard Evrima and Ilma." */
export function historySummary(entries: VoyageHistoryEntry[]): string {
  if (!entries.length) return '';
  const nights = entries.reduce((n, e) => n + e.nights, 0);
  const yachts = [...new Set(entries.map((e) => e.yachtName).filter(Boolean))];
  const n = NUMBERS[entries.length] ?? String(entries.length);
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} voyage${entries.length === 1 ? '' : 's'}, ${nights} nights${yachts.length ? `, aboard ${yachts.join(' and ')}` : ''}.`;
}

/** The voyage's favourites: what they rated highest. */
export const isFavourite = (rating?: number) => (rating ?? 0) >= 5;
