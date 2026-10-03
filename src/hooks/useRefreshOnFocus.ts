import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Re-fetches when a tab regains focus (not on the first focus), so changes
 * made elsewhere — e.g. preferences saved in Profile — appear on return.
 * Previous data stays on screen while refreshing.
 */
export function useRefreshOnFocus(reload: () => void) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      reload();
    }, [reload]),
  );
}
