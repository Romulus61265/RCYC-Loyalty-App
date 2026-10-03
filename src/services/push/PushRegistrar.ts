/**
 * The device side of push notifications, behind one small interface so the
 * app does not depend on how a device gets its token.
 *
 * Today: UnsupportedPushRegistrar (web, and until expo-notifications is
 * added to native builds). The Expo implementation is designed in
 * docs/13-notifications.md: it asks the OS for permission, reads the Expo
 * push token (with the EAS project ID), registers it through
 * NotificationService.registerDevice, sets Android channels per type, and
 * routes a tapped notification through `routeFromPush`. The server side
 * (notifications-dispatch) is already in place.
 */
import type { PushPermission } from '@/domain';
import { safeRoute } from '../../../supabase/functions/_shared/notifications/engine';

export interface PushRegistrar {
  readonly platform: 'ios' | 'android' | 'web';
  readonly supported: boolean;
  permission(): Promise<PushPermission>;
  /** Asks the OS (once); returns the Expo push token when granted. */
  enable(): Promise<{ permission: PushPermission; token?: string }>;
  /** A push was tapped: its data (key and in-app route). */
  onOpen(handler: (data: { key?: string; route?: string }) => void): () => void;
}

export class UnsupportedPushRegistrar implements PushRegistrar {
  readonly supported = false;
  constructor(readonly platform: 'ios' | 'android' | 'web' = 'web') {}
  async permission(): Promise<PushPermission> {
    return 'unsupported';
  }
  async enable() {
    return { permission: 'unsupported' as const };
  }
  onOpen() {
    return () => undefined;
  }
}

/** The route a tapped push opens: internal routes only, else Home. */
export function routeFromPush(data: unknown): string {
  const route = data && typeof data === 'object' ? (data as { route?: unknown }).route : undefined;
  return (typeof route === 'string' && safeRoute(route)) || '/';
}
