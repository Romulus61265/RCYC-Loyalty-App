/** Past-voyage records (voyage_history), the signed-in guest's own under RLS. */
import type { ID, PastVoyageRecord } from '@/domain';
import type { VoyageHistoryStore } from '@/services/history/ComposedVoyageHistoryService';
import { many, uuid, type SupabaseDeps } from './support';

interface Row {
  guest_id: string;
  voyage_id: string;
  yacht_name: string;
  suite_label: string;
  destinations: PastVoyageRecord['destinations'];
  moments: PastVoyageRecord['moments'];
  saved_preferences: PastVoyageRecord['savedPreferences'];
  photos: PastVoyageRecord['photos'];
}

export class SupabaseVoyageHistoryStore implements VoyageHistoryStore {
  constructor(private readonly deps: SupabaseDeps) {}

  async list(guestId: ID): Promise<PastVoyageRecord[]> {
    const rows = await many<Row>(this.deps.db().from('voyage_history').select('*').eq('guest_id', uuid(guestId, 'Guest')));
    return rows.map((r) => ({ guestId: r.guest_id, voyageId: r.voyage_id, yachtName: r.yacht_name, suite: r.suite_label, destinations: r.destinations, moments: r.moments, savedPreferences: r.saved_preferences, photos: r.photos }));
  }
}
