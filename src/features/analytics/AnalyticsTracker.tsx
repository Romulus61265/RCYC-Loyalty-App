/**
 * Screen views and consent, for the whole app. Screens are recorded as
 * route patterns (`/history/[id]`), never with the ids in the address.
 * Consent comes from the guest's privacy preference ("Anonymous app
 * analytics"); until it is read, events wait on the device. Batches go
 * when full, every FLUSH_MS, and when the app goes to the background.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSegments } from 'expo-router';
import { useJourney } from '@/hooks/useJourney';
import { useServices } from '@/services/ServiceProvider';

const FLUSH_MS = 15_000;

export function AnalyticsTracker() {
  const services = useServices();
  const { guestId } = useJourney();
  const segments = useSegments();
  const path = `/${segments.filter((s) => !/^\(.*\)$/.test(s)).join('/')}`;

  useEffect(() => {
    // Reading preferences sets consent (see withAnalytics).
    void services.profile.getPreferences(guestId).catch(() => services.analytics.setConsent(false));
  }, [services, guestId]);

  useEffect(() => {
    services.analytics.screen(path);
  }, [services, path]);

  useEffect(() => {
    const timer = setInterval(() => void services.analytics.flush(), FLUSH_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void services.analytics.flush();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [services]);

  return null;
}
