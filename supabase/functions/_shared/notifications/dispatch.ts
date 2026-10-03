// Push dispatch, runtime-agnostic (the notifications-dispatch Edge Function
// runs it on a schedule; tests run it in Node against PostgREST).
//
//   for each guest with a push device and a voyage in progress or about to begin:
//     load inputs → engine → decide (preferences, quiet hours)
//     → due in (since, until] and not already sent (dedupe key)
//     → send to every enabled device → record → disable dead tokens
//
// Sending is behind PushSender: ExpoPushSender (Expo push API) or
// DryRunPushSender (the default until push is switched on). Every push is
// recorded once in `notifications` with its engine key, which is what makes
// re-runs and overlapping windows safe, and lets the app's inbox show the
// sent notification instead of regenerating it.
import { contextualNotifications, dueForPush } from './engine.ts';
import type { DecidedNotification, NotificationPreferences, NotificationType, NotifyInput } from './types.ts';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Read by the app when the push is tapped (key for read state, internal route). */
  data: { key: string; route?: string; type: NotificationType };
  sound: 'default' | null;
  priority: 'high' | 'normal';
  /** Android notification channel, one per type, so guests can tune them in system settings. */
  channelId: string;
  /** Seconds the push stays worth delivering. */
  ttl?: number;
}

export type PushTicket = { status: 'ok'; id: string } | { status: 'error'; message: string; error?: string };

export interface PushSender {
  readonly name: string;
  send(messages: PushMessage[]): Promise<PushTicket[]>;
}

/** Records what it would send. The default until push is switched on. */
export class DryRunPushSender implements PushSender {
  readonly name = 'dry-run';
  readonly sent: PushMessage[] = [];
  send(messages: PushMessage[]): Promise<PushTicket[]> {
    this.sent.push(...messages);
    return Promise.resolve(messages.map((_, i) => ({ status: 'ok' as const, id: `dry-run-${this.sent.length - messages.length + i}` })));
  }
}

/**
 * Expo push API (https://exp.host/--/api/v2/push/send): batches of 100, with
 * the project's access token when "enhanced push security" is on. One ticket
 * per message, in order.
 */
export class ExpoPushSender implements PushSender {
  readonly name = 'expo';
  constructor(
    private readonly accessToken?: string,
    private readonly endpoint = 'https://exp.host/--/api/v2/push/send',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}) },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        tickets.push(...batch.map(() => ({ status: 'error' as const, message: `HTTP ${res.status}` })));
        continue;
      }
      const json = (await res.json()) as { data?: { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } }[] };
      const data = json.data ?? [];
      batch.forEach((_, k) => {
        const t = data[k];
        tickets.push(t?.status === 'ok' && t.id ? { status: 'ok', id: t.id } : { status: 'error', message: t?.message ?? 'no ticket', ...(t?.details?.error ? { error: t.details.error } : {}) });
      });
    }
    return tickets;
  }
}

export interface GuestToNotify {
  guestId: string;
  reservationId: string;
}

export interface DispatchPorts {
  /** Guests with an enabled push device and a voyage in progress or about to begin. */
  guests(now: Date): Promise<GuestToNotify[]>;
  load(g: GuestToNotify, now: Date): Promise<{ input: NotifyInput; prefs: NotificationPreferences; zoneFor: (iso: string) => string } | null>;
  /** Which of these keys were already sent to this guest. */
  sentKeys(guestId: string, keys: string[]): Promise<Set<string>>;
  devices(guestId: string): Promise<{ id: string; token: string }[]>;
  record(rows: { g: GuestToNotify; n: DecidedNotification; status: 'sent' | 'dry-run'; ticket?: string; zone: string; sentAt: Date }[]): Promise<void>;
  disableDevice(deviceId: string, reason: string): Promise<void>;
}

export interface DispatchSummary {
  guests: number;
  due: number;
  sent: number;
  failed: number;
  skippedAlreadySent: number;
  disabledDevices: number;
}

const channelFor = (t: NotificationType) => `rcyc-${t}`;

export function toMessages(n: DecidedNotification, tokens: string[], now: Date): PushMessage[] {
  const ttl = n.expiresAt ? Math.max(60, Math.floor((Date.parse(n.expiresAt) - now.getTime()) / 1000)) : undefined;
  return tokens.map((to) => ({
    to,
    title: n.title,
    body: n.body,
    data: { key: n.key, type: n.type, ...(n.deepLink ? { route: n.deepLink } : {}) },
    sound: n.type === 'urgent' || n.timeSensitive ? 'default' : null,
    priority: n.type === 'urgent' || n.timeSensitive ? 'high' : 'normal',
    channelId: channelFor(n.type),
    ...(ttl ? { ttl } : {}),
  }));
}

export async function dispatch(ports: DispatchPorts, sender: PushSender, window: { since: Date; until: Date }): Promise<DispatchSummary> {
  const summary: DispatchSummary = { guests: 0, due: 0, sent: 0, failed: 0, skippedAlreadySent: 0, disabledDevices: 0 };
  for (const g of await ports.guests(window.until)) {
    const loaded = await ports.load(g, window.until);
    if (!loaded) continue;
    summary.guests += 1;
    const due = dueForPush(contextualNotifications(loaded.input, loaded.prefs), window.since, window.until);
    if (!due.length) continue;
    const already = await ports.sentKeys(g.guestId, due.map((n) => n.key));
    const fresh = due.filter((n) => !already.has(n.key));
    summary.skippedAlreadySent += due.length - fresh.length;
    summary.due += fresh.length;
    if (!fresh.length) continue;
    const devices = await ports.devices(g.guestId);
    if (!devices.length) continue;

    const rows: Parameters<DispatchPorts['record']>[0] = [];
    for (const n of fresh) {
      const messages = toMessages(n, devices.map((d) => d.token), window.until);
      const tickets = await sender.send(messages);
      const ok = tickets.find((t): t is { status: 'ok'; id: string } => t.status === 'ok');
      // A token Expo no longer knows is disabled, never retried.
      for (const [i, t] of tickets.entries()) {
        if (t.status === 'error' && t.error === 'DeviceNotRegistered') {
          await ports.disableDevice(devices[i]!.id, 'DeviceNotRegistered');
          summary.disabledDevices += 1;
        }
      }
      // Not recorded when every device failed: the next run (overlapping window) retries it.
      if (!ok) {
        summary.failed += 1;
        continue;
      }
      summary.sent += 1;
      rows.push({ g, n, status: sender.name === 'dry-run' ? 'dry-run' : 'sent', ticket: ok.id, zone: loaded.zoneFor(n.at), sentAt: window.until });
    }
    if (rows.length) await ports.record(rows);
  }
  return summary;
}
