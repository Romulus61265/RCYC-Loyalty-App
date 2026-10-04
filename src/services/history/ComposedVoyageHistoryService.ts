/**
 * VoyageHistoryService over the voyage and profile contracts and a store of
 * past-voyage records (memory in the mock; voyage_history in Supabase).
 */
import type { GuestPreferences, ID, PastVoyageRecord, SavedPreference, Voyage, VoyageHistoryEntry } from '@/domain';
import type { Services, VoyageHistoryService } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { formatDateRange } from '@/utils/format';

export interface VoyageHistoryStore {
  list(guestId: ID): Promise<PastVoyageRecord[]>;
}

export class MemoryVoyageHistoryStore implements VoyageHistoryStore {
  constructor(private readonly records: PastVoyageRecord[]) {}
  async list(guestId: ID) {
    return structuredClone(this.records.filter((r) => r.guestId === guestId));
  }
}

const has = (list: string[] | undefined, v: string) => (list ?? []).some((x) => x.toLowerCase().includes(v.toLowerCase()));

/** Whether something learned on that voyage is still how they like it today. */
export function stillStands(p: SavedPreference, prefs: GuestPreferences): boolean {
  if (!p.key || !p.value) return false;
  switch (p.key) {
    case 'dining.tablePreference':
      return prefs.dining.tablePreference === p.value;
    case 'excursions.style':
      return prefs.excursions.style === p.value;
    case 'spa.pressure':
      return prefs.spa.pressure === p.value;
    case 'suite.pillow':
      return (prefs.suite.pillow ?? '').toLowerCase().includes(p.value.toLowerCase());
    case 'beverage.wine':
      return has(prefs.beverage.wine, p.value);
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function toEntry(v: Voyage, r: PastVoyageRecord | undefined, prefs: GuestPreferences | undefined): VoyageHistoryEntry {
  const moments = [...(r?.moments ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  return {
    voyageId: v.id,
    name: v.name,
    region: v.region,
    yachtName: r?.yachtName ?? '',
    dates: formatDateRange(v.startDate, v.endDate),
    startDate: v.startDate,
    nights: v.nights,
    suite: r?.suite ?? '',
    destinations: r?.destinations ?? [],
    experiences: moments.filter((m) => m.kind !== 'dining'),
    dining: moments.filter((m) => m.kind === 'dining'),
    savedPreferences: (r?.savedPreferences ?? []).map((p) => ({ ...p, status: prefs && stillStands(p, prefs) ? 'kept' : 'noted' })),
    memories: moments.flatMap((m) => (m.memory ? [cap(m.memory)] : [])),
    photos: { count: r?.photos.length ?? 0, placeholder: 'Photographs from this voyage will appear here. Your Suite Ambassador can add those the crew took, with your permission.' },
    hero: v.hero,
  };
}

export class ComposedVoyageHistoryService implements VoyageHistoryService {
  constructor(
    private readonly s: Pick<Services, 'voyage' | 'profile'>,
    private readonly store: VoyageHistoryStore,
  ) {}

  async listVoyages(guestId: ID): Promise<VoyageHistoryEntry[]> {
    const [voyages, records, prefs] = await Promise.all([
      this.s.voyage.getPastVoyages(guestId),
      this.store.list(guestId),
      this.s.profile.getPreferences(guestId).then((v) => v.preferences).catch(() => undefined),
    ]);
    return voyages
      .map((v) => toEntry(v, records.find((r) => r.voyageId === v.id), prefs))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  async getVoyage(guestId: ID, voyageId: ID): Promise<VoyageHistoryEntry> {
    const found = (await this.listVoyages(guestId)).find((e) => e.voyageId === voyageId);
    if (!found) throw new ServiceError('not_found', 'This voyage is not in your history');
    return found;
  }
}
