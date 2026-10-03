/**
 * Reflections (voyage_feedback, the guest's own, under RLS) and voyage
 * inspirations (voyage_inspirations, read by any signed-in guest).
 */
import type { ID, VoyageFeedback, VoyageInspiration } from '@/domain';
import { ServiceError } from '@/services/contracts';
import type { PostVoyageStore } from '@/services/postVoyage/store';
import { many, toServiceError, uuid, type SupabaseDeps } from './support';

interface FeedbackRow {
  guest_id: string;
  reservation_id: string;
  reflections: Pick<VoyageFeedback, 'favourites' | 'words' | 'thanks' | 'better' | 'followUp' | 'nextTime' | 'followUpRequestId'>;
  status: 'draft' | 'sent';
  version: number;
  updated_at: string;
  sent_at: string | null;
}

const toFeedback = (r: FeedbackRow): VoyageFeedback => ({
  guestId: r.guest_id,
  reservationId: r.reservation_id,
  favourites: r.reflections.favourites ?? [],
  words: r.reflections.words ?? [],
  thanks: r.reflections.thanks ?? [],
  ...(r.reflections.better ? { better: r.reflections.better } : {}),
  followUp: r.reflections.followUp === true,
  ...(r.reflections.nextTime ? { nextTime: r.reflections.nextTime } : {}),
  ...(r.reflections.followUpRequestId ? { followUpRequestId: r.reflections.followUpRequestId } : {}),
  status: r.status,
  version: r.version,
  updatedAt: r.updated_at,
  ...(r.sent_at ? { sentAt: r.sent_at } : {}),
});

interface InspirationRow {
  id: string;
  name: string;
  region: string;
  yacht_name: string;
  start_date: string;
  end_date: string;
  nights: number;
  ports: string[];
  tags: string[];
  standfirst: string;
  highlight: string;
  hooks: Record<string, string>;
  hero: VoyageInspiration['hero'];
}

export class SupabasePostVoyageStore implements PostVoyageStore {
  constructor(private readonly deps: SupabaseDeps) {}

  private get db() {
    return this.deps.db();
  }

  async getFeedback(guestId: ID, reservationId: ID): Promise<VoyageFeedback | null> {
    const [row] = await many<FeedbackRow>(this.db.from('voyage_feedback').select('*').eq('guest_id', uuid(guestId, 'Guest')).eq('reservation_id', uuid(reservationId, 'Reservation')));
    return row ? toFeedback(row) : null;
  }

  async putFeedback(f: VoyageFeedback, expectedVersion: number): Promise<VoyageFeedback> {
    const reflections = { favourites: f.favourites, words: f.words, thanks: f.thanks, better: f.better ?? null, followUp: f.followUp, nextTime: f.nextTime ?? null, followUpRequestId: f.followUpRequestId ?? null };
    const values = { reflections, status: f.status, version: expectedVersion + 1, sent_at: f.sentAt ?? null };
    const { data, error } =
      expectedVersion === 0
        ? await this.db.from('voyage_feedback').insert({ guest_id: f.guestId, reservation_id: f.reservationId, ...values }).select('*')
        : await this.db.from('voyage_feedback').update(values).eq('guest_id', f.guestId).eq('reservation_id', f.reservationId).eq('version', expectedVersion).select('*');
    if (error) throw toServiceError(error);
    const [row] = (data ?? []) as FeedbackRow[];
    // No row: changed elsewhere (or already sent, which the database refuses to edit).
    if (!row) throw new ServiceError('conflict', 'Your reflections changed elsewhere');
    return toFeedback(row);
  }

  async listInspirations(): Promise<VoyageInspiration[]> {
    const rows = await many<InspirationRow>(this.db.from('voyage_inspirations').select('*').eq('active', true).order('start_date'));
    return rows.map((r) => ({ id: r.id, name: r.name, region: r.region, yachtName: r.yacht_name, startDate: r.start_date, endDate: r.end_date, nights: r.nights, ports: r.ports, tags: r.tags, standfirst: r.standfirst, highlight: r.highlight, hooks: r.hooks, hero: r.hero }));
  }
}
