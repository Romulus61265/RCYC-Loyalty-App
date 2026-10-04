/**
 * Speaks a message once when it appears or changes, for content that
 * arrives without the guest moving to it: an error under a field, a
 * confirmation, a reply. Android and the web announce live regions and
 * alerts themselves (`accessibilityLiveRegion`, `aria-live`, role
 * "alert"); iOS VoiceOver needs to be told.
 */
import { useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * iOS by default (Android reads the live region or alert the message sits
 * in). `everywhere` for an event with nothing on screen to read: "Saved",
 * "Device removed".
 */
export function announce(message: string, { everywhere = false }: { everywhere?: boolean } = {}): void {
  if (!message) return;
  if (Platform.OS === 'ios' || (everywhere && Platform.OS === 'android')) AccessibilityInfo.announceForAccessibility(message);
}

export function useAnnounce(message: string | undefined | false | null): void {
  useEffect(() => {
    if (message) announce(message);
  }, [message]);
}

/** Props for a region whose changes should be read out, on every platform. */
export const liveRegion = (politeness: 'polite' | 'assertive' = 'polite') =>
  ({ accessibilityLiveRegion: politeness, 'aria-live': politeness }) as const;

/**
 * Read a block as one item with these words (iOS and Android). The web
 * reads the block's own text in order, and an aria-label on a plain div is
 * not allowed, so nothing changes there. Only for blocks with no controls
 * inside: grouping hides them.
 */
export const readAs = (label: string) => (Platform.OS === 'web' ? {} : ({ accessible: true, accessibilityLabel: label } as const));
