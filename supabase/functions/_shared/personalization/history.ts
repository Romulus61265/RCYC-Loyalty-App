// Past voyages as the engine's history: every moment we learned from (one
// with a weight) becomes a HistoryItem, tied to its voyage. Shared by the
// app (mock) and the server (supabaseInputs), so both read the same history.
import type { HistoryItem } from './types.ts';

export interface VoyageRecordLike {
  voyageId: string;
  moments: { id: string; kind: HistoryItem['kind']; memory?: string; category?: string; rating?: number; weight?: number; tags: string[] }[];
}

export function historyFromVoyages(records: VoyageRecordLike[]): HistoryItem[] {
  return records.flatMap((r) =>
    r.moments
      .filter((m) => typeof m.weight === 'number' && m.weight > 0)
      .map((m) => ({
        id: m.id,
        kind: m.kind,
        ...(m.memory ? { memory: m.memory } : {}),
        ...(m.category ? { category: m.category } : {}),
        voyageId: r.voyageId,
        ...(m.rating !== undefined ? { rating: m.rating } : {}),
        weight: m.weight!,
        tags: m.tags,
      })),
  );
}

/** History from both sources: voyage records, then any older signals not already there. */
export function mergeHistory(fromVoyages: HistoryItem[], fromSignals: HistoryItem[]): HistoryItem[] {
  const seen = new Set(fromVoyages.map((h) => h.id));
  return [...fromVoyages, ...fromSignals.filter((h) => !seen.has(h.id))];
}
