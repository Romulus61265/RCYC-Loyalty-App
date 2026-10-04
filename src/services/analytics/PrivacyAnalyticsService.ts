/**
 * AnalyticsService: screens events through the allow-list and privacy
 * filter, waits for consent, batches, and hands batches to a provider.
 *
 *  • No consent yet: events wait (at most MAX_PENDING). Consent off: they
 *    are discarded and nothing more is kept.
 *  • Envelopes carry a random session id, the app's version, platform and
 *    mode, and a time to the minute; never a guest or reservation id.
 *  • A provider that fails loses that batch (analytics are not worth a retry
 *    queue on a guest's phone) and never surfaces an error.
 */
import type { AnalyticsEnvelope, AnalyticsEventName, AnalyticsEventProps } from '@/domain';
import type { AnalyticsProvider, AnalyticsService } from '@/services/contracts';
import { sanitize, screenPattern } from './schema';

const BATCH = 20;
const MAX_PENDING = 100;

const randomId = () => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `s${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

export class PrivacyAnalyticsService implements AnalyticsService {
  private consent: boolean | undefined;
  private pending: AnalyticsEnvelope[] = [];
  private readonly sessionId = randomId();
  private lastScreen: string | undefined;

  constructor(
    private readonly provider: AnalyticsProvider,
    private readonly opts: { clock: { now: () => Date }; app: AnalyticsEnvelope['app']; batch?: number },
  ) {}

  track<E extends AnalyticsEventName>(event: E, props: AnalyticsEventProps[E]): void {
    try {
      if (this.consent === false) return;
      const { props: clean, dropped } = sanitize(event, props as Record<string, unknown>);
      const at = new Date(this.opts.clock.now());
      at.setUTCSeconds(0, 0);
      const envelope: AnalyticsEnvelope = { event, props: clean, at: at.toISOString(), session_id: this.sessionId, app: this.opts.app, ...(dropped.length ? { dropped } : {}) };
      this.pending.push(envelope);
      if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
      if (this.consent && this.pending.length >= (this.opts.batch ?? BATCH)) void this.flush();
    } catch {
      // Never let analytics break a screen.
    }
  }

  screen(path: string): void {
    // The same screen twice in a row (a re-render, another id) is one view.
    const pattern = screenPattern(path);
    if (pattern === this.lastScreen) return;
    this.lastScreen = pattern;
    this.track('screen_viewed', { screen: pattern });
  }

  setConsent(granted: boolean): void {
    this.consent = granted;
    if (!granted) this.pending = [];
    else void this.flush();
  }

  async flush(): Promise<void> {
    if (!this.consent || !this.pending.length) return;
    const batch = this.pending;
    this.pending = [];
    try {
      await this.provider.send(batch);
    } catch {
      // Dropped: see the note above.
    }
  }
}
