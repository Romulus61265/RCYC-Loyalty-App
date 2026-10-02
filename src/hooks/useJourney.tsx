import { createContext, useContext, type ReactNode } from 'react';
import type { JourneyPhase } from '@/domain';
import type { AuthSession } from '@/services/contracts';
import { useServices } from '@/services/ServiceProvider';
import { useAsync } from './useAsync';

export interface JourneyContextValue {
  session: AuthSession;
  guestId: string;
  reservationId: string;
  voyageId: string;
  phase: JourneyPhase;
}

const JourneyContext = createContext<JourneyContextValue | null>(null);

/**
 * Resolves "who is the guest and where are they in the journey" once, so
 * every tab can render contextually (prepare vs. sail vs. remember).
 */
export function JourneyProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const services = useServices();
  const { data } = useAsync(async () => {
    const session = await services.auth.getSession();
    if (!session) return null;
    const reservation = await services.voyage.getUpcomingReservation(session.guestId);
    if (!reservation) return null;
    const phase = await services.voyage.getJourneyPhase(reservation.id);
    return { session, guestId: session.guestId, reservationId: reservation.id, voyageId: reservation.voyageId, phase };
  }, [services]);

  if (!data) return <>{fallback}</>;
  return <JourneyContext.Provider value={data}>{children}</JourneyContext.Provider>;
}

export function useJourney(): JourneyContextValue {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error('useJourney must be used inside <JourneyProvider>');
  return ctx;
}
