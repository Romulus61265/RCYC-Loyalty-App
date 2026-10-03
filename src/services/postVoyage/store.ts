/**
 * Where reflections and voyage inspirations live: memory in the mock,
 * voyage_feedback and voyage_inspirations in Supabase.
 */
import type { ID, VoyageFeedback, VoyageInspiration } from '@/domain';
import { ServiceError } from '@/services/contracts';

export interface PostVoyageStore {
  getFeedback(guestId: ID, reservationId: ID): Promise<VoyageFeedback | null>;
  /** Writes when the stored version is `expectedVersion` (0 for none yet); otherwise conflict. */
  putFeedback(feedback: VoyageFeedback, expectedVersion: number): Promise<VoyageFeedback>;
  listInspirations(): Promise<VoyageInspiration[]>;
}

export class MemoryPostVoyageStore implements PostVoyageStore {
  private readonly feedback = new Map<string, VoyageFeedback>();

  constructor(private readonly inspirations: VoyageInspiration[]) {}

  async getFeedback(guestId: ID, reservationId: ID) {
    const f = this.feedback.get(`${guestId}:${reservationId}`);
    return f ? structuredClone(f) : null;
  }

  async putFeedback(f: VoyageFeedback, expectedVersion: number) {
    const key = `${f.guestId}:${f.reservationId}`;
    if ((this.feedback.get(key)?.version ?? 0) !== expectedVersion) throw new ServiceError('conflict', 'Your reflections changed elsewhere');
    const saved = { ...structuredClone(f), version: expectedVersion + 1 };
    this.feedback.set(key, saved);
    return structuredClone(saved);
  }

  async listInspirations() {
    return structuredClone(this.inspirations);
  }
}
