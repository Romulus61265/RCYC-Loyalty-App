import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { dataVersion } from '@/services/dataVersion';

/** After this long, a screen refreshes on return even if nothing was changed in the app. */
export const REFRESH_AFTER_MS = 30_000;

/**
 * Re-fetches when a tab regains focus (not on the first focus), so changes
 * made elsewhere (preferences saved in Profile, a booking from the
 * concierge) appear on return. Previous data stays on screen while
 * refreshing.
 *
 * Only when something may have changed: the guest changed something
 * through a service since this screen last loaded (dataVersion), or the
 * data is more than REFRESH_AFTER_MS old. Measured: returning to Home
 * re-ran 13 service calls (about 47 requests in Supabase mode) and some
 * 4,300 component renders on every tab switch. Live changes arrive
 * through their own subscriptions either way.
 */
export function useRefreshOnFocus(reload: () => void) {
  const first = useRef(true);
  // Set on the first focus, when the screen's first load starts.
  const loaded = useRef({ version: 0, at: 0 });
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        loaded.current = { version: dataVersion(), at: Date.now() };
        return;
      }
      const stale = dataVersion() !== loaded.current.version || Date.now() - loaded.current.at > REFRESH_AFTER_MS;
      if (!stale) return;
      loaded.current = { version: dataVersion(), at: Date.now() };
      reload();
    }, [reload]),
  );
}
