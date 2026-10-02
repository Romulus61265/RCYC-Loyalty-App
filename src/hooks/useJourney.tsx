import { createContext, useContext, type ReactNode } from 'react';
import type { JourneyPhase } from '@/domain';
import { AppError } from '@/core/errors';
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
  const { data, error } = useAsync(async () => {
    const session = await services.auth.getSession();
    // Sign-in screens arrive in a later iteration; until then these surface via the route ErrorBoundary.
    if (!session) throw new AppError('unauthenticated', 'No active session');
    const reservation = await services.voyage.getUpcomingReservation(session.guestId);
    if (!reservation) throw new AppError('not_found', 'No upcoming reservation');
    const phase = await services.voyage.getJourneyPhase(reservation.id);
    return { session, guestId: session.guestId, reservationId: reservation.id, voyageId: reservation.voyageId, phase };
  }, [services]);

  // Let the nearest Expo Router ErrorBoundary render a calm, retryable fallback.
  if (error) throw error;
  if (!data) return <>{fallback}</>;
  return <JourneyContext.Provider value={data}>{children}</JourneyContext.Provider>;
}

export function useJourney(): JourneyContextValue {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error('useJourney must be used inside <JourneyProvider>');
  return ctx;
}
