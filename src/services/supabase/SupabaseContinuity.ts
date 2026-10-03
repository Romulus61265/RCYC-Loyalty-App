/**
 * Arrival updates on Supabase: written by the journey-events Edge Function
 * (continuity orchestrator), read by the party under RLS.
 */
import type { ArrivalUpdate, ID } from '@/domain';
import type { ContinuityService, Unsubscribe } from '@/services/contracts';
import { many, uuid, type SupabaseDeps } from './support';

export class SupabaseContinuityService implements ContinuityService {
  constructor(private readonly deps: SupabaseDeps) {}

  private get db() {
    return this.deps.db();
  }

  async getArrivalUpdate(reservationId: ID): Promise<ArrivalUpdate | null> {
    const [latest] = await many<{ id: string; update: Omit<ArrivalUpdate, 'id'> }>(
      this.db.from('arrival_updates').select('id, update').eq('reservation_id', uuid(reservationId, 'Reservation')).order('created_at', { ascending: false }).limit(1),
    );
    return latest ? { ...latest.update, id: latest.id } : null;
  }

  subscribe(reservationId: ID, listener: () => void): Unsubscribe {
    const id = uuid(reservationId, 'Reservation');
    const db = this.db;
    const channel = db
      .channel(`arrival:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'arrival_updates', filter: `reservation_id=eq.${id}` }, () => listener())
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }
}
