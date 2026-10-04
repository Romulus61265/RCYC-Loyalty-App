/**
 * Analytics providers: where events go. The app only knows
 * AnalyticsProvider; replacing the vendor means writing one adapter that
 * maps AnalyticsEnvelope to that vendor's call, nothing else.
 */
import type { AnalyticsEnvelope } from '@/domain';
import type { AnalyticsProvider, AnalyticsService } from '@/services/contracts';
import type { Logger } from '@/core/logging';

/** Sends nothing (production until a vendor is chosen; tests). */
export class NoopAnalyticsProvider implements AnalyticsProvider {
  readonly name = 'noop';
  async send(): Promise<void> {}
}

/** Development: writes each event to the logger. */
export class ConsoleAnalyticsProvider implements AnalyticsProvider {
  readonly name = 'console';
  constructor(private readonly log: Logger) {}
  async send(batch: AnalyticsEnvelope[]): Promise<void> {
    for (const e of batch) this.log.debug(e.event, e.props);
  }
}

/** Tests and the in-app inspector: keeps what was sent. */
export class MemoryAnalyticsProvider implements AnalyticsProvider {
  readonly name = 'memory';
  readonly sent: AnalyticsEnvelope[] = [];
  async send(batch: AnalyticsEnvelope[]): Promise<void> {
    this.sent.push(...structuredClone(batch));
  }
}

/** Several destinations at once (e.g. a vendor and a warehouse). One failing does not stop the others. */
export class FanOutAnalyticsProvider implements AnalyticsProvider {
  readonly name: string;
  constructor(private readonly providers: AnalyticsProvider[]) {
    this.name = providers.map((p) => p.name).join('+');
  }
  async send(batch: AnalyticsEnvelope[]): Promise<void> {
    await Promise.allSettled(this.providers.map((p) => p.send(batch)));
  }
}

/** Analytics that record nothing: the default inside a service factory, before the app wires the real one. */
export const silentAnalytics: AnalyticsService = {
  track: () => undefined,
  screen: () => undefined,
  setConsent: () => undefined,
  flush: async () => undefined,
};
