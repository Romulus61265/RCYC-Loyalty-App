/**
 * The system "reduce motion" setting (iOS, Android, and prefers-reduced-motion
 * on the web), kept current while the app runs. When it is on, nothing
 * pulses, fades in or slides: changes simply appear.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (live) setReduce(v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => setReduce(v));
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}
