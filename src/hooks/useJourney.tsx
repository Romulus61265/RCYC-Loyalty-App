import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  /** Ends the session; the sign-in screen is shown. */
  signOut: () => Promise<void>;
}

const JourneyContext = createContext<JourneyContextValue | null>(null);

/**
 * Resolves "who is the guest and where are they in the journey" once, so
 * every tab can render contextually (prepare vs. sail vs. remember). Without
 * a session it shows the sign-in screen instead of the app.
 */
export function JourneyProvider({ children, fallback, signIn }: { children: ReactNode; fallback: ReactNode; signIn: (onSignedIn: () => void) => ReactNode }) {
  const services = useServices();
  // Reload only when the signed-in identity changes (not on token refresh).
  const [identity, setIdentity] = useState(0);
  const userRef = useRef<string | null | undefined>(undefined);
  useEffect(
    () =>
      services.auth.onSessionChange((s) => {
        const user = s?.userId ?? null;
        if (userRef.current !== undefined && user === userRef.current) return;
        userRef.current = user;
        setIdentity((n) => n + 1);
      }),
    [services],
  );

  const { data, error, reload } = useAsync(async () => {
    const session = await services.auth.getSession();
    userRef.current = session?.userId ?? null;
    if (!session) return null;
    const reservation = await services.voyage.getUpcomingReservation(session.guestId);
    if (!reservation) throw new AppError('not_found', 'No upcoming reservation');
    const phase = await services.voyage.getJourneyPhase(reservation.id);
    return { session, guestId: session.guestId, reservationId: reservation.id, voyageId: reservation.voyageId, phase };
  }, [services, identity]);

  // Let the nearest Expo Router ErrorBoundary render a calm, retryable fallback.
  if (error) throw error;
  if (data === undefined) return <>{fallback}</>;
  if (data === null) return <>{signIn(reload)}</>;
  const value: JourneyContextValue = { ...data, signOut: () => services.auth.signOut().then(reload) };
  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useJourney(): JourneyContextValue {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error('useJourney must be used inside <JourneyProvider>');
  return ctx;
}
