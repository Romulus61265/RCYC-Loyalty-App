/**
 * Moves the screen reader (and, on the web, keyboard focus) to an element
 * when `key` changes, but not on first render. For content that changes in
 * place: the next step of a flow, an editor that opens. Without it, focus
 * stays on the button just pressed and the new content goes unheard.
 *
 * Give the target `focusTarget` on the web so it can take focus without
 * joining the tab order.
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useFocusOnChange<T>(key: unknown, { onMount = false }: { onMount?: boolean } = {}) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current && !onMount) {
      first.current = false;
      return;
    }
    first.current = false;
    const node = ref.current;
    if (!node) return;
    // After the new content has rendered.
    const t = setTimeout(() => {
      if (Platform.OS === 'web') (node as unknown as { focus?: () => void }).focus?.();
      else AccessibilityInfo.sendAccessibilityEvent(node as unknown as Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0], 'focus');
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of key moves focus
  }, [key]);
  return ref;
}

/** Focusable by script on the web, but not a stop in the tab order. */
export const focusTarget = Platform.OS === 'web' ? ({ tabIndex: -1 } as object) : {};
