/**
 * EventService for the MVP: in-process and in memory.
 *
 *  • publish validates the envelope, assigns `event_id` and `timestamp`,
 *    ignores a repeated `dedupe_key`, then runs the handlers for its type
 *    one after another, in registration order (so a later handler may rely
 *    on an earlier one's work).
 *  • A handler's follow-up events (ctx.emit) carry the chain's
 *    correlation_id and this event as causation_id. They are processed
 *    before emit resolves, to a bounded depth (no loops).
 *  • A handler that throws is recorded as failed; the others still run.
 *
 * Production would put the same contract over a durable queue and the
 * journey_events table (see docs/16-internal-events.md). Handlers don't change.
 */
import type { HandlerRun, ID, InternalEvent, InternalEventType, NewInternalEvent } from '@/domain';
import { DEFAULT_SEVERITY, INTERNAL_EVENT_TYPES } from '@/domain';
import type { EventHandler, EventService, HandlerContext, PublishResult, Unsubscribe } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';

/** A chain deeper than this is a loop. */
export const MAX_DEPTH = 4;

let seq = 0;
const nextId = () => {
  seq += 1;
  return `evt_${Date.now().toString(36)}_${seq}`;
};

export class InMemoryEventService implements EventService {
  private readonly events: InternalEvent[] = [];
  private readonly handlerRuns = new Map<ID, HandlerRun[]>();
  private readonly handlers: EventHandler[] = [];
  private readonly listeners = new Set<(e: InternalEvent) => void>();

  constructor(private readonly clock: { now: () => Date } = { now: () => new Date() }) {}

  register(handler: EventHandler): Unsubscribe {
    if (this.handlers.some((h) => h.name === handler.name)) throw new ServiceError('conflict', `Handler ${handler.name} is already registered`);
    this.handlers.push(handler);
    return () => {
      const i = this.handlers.indexOf(handler);
      if (i >= 0) this.handlers.splice(i, 1);
    };
  }

  publish<T extends InternalEventType>(input: NewInternalEvent<T>): Promise<PublishResult<T>> {
    return this.process(input, undefined, 0);
  }

  private async process<T extends InternalEventType>(input: NewInternalEvent<T>, cause: InternalEvent | undefined, depth: number): Promise<PublishResult<T>> {
    validate(input);
    if (depth > MAX_DEPTH) throw new ServiceError('validation', `Event chain deeper than ${MAX_DEPTH}: ${input.event_type}`);
    if (input.dedupe_key) {
      const seen = this.events.find((e) => e.dedupe_key === input.dedupe_key) as InternalEvent<T> | undefined;
      if (seen) return { event: { ...seen }, runs: this.handlerRuns.get(seen.event_id) ?? [], duplicate: true };
    }
    const event_id = nextId();
    const event: InternalEvent<T> = {
      event_id,
      event_type: input.event_type,
      timestamp: input.timestamp ?? this.clock.now().toISOString(),
      guest_id: input.guest_id,
      voyage_id: input.voyage_id,
      source: input.source,
      payload: input.payload,
      severity: input.severity ?? DEFAULT_SEVERITY[input.event_type],
      status: 'received',
      correlation_id: cause?.correlation_id ?? event_id,
      ...(cause ? { causation_id: cause.event_id } : {}),
      ...(input.reservation_id ? { reservation_id: input.reservation_id } : {}),
      ...(input.dedupe_key ? { dedupe_key: input.dedupe_key } : {}),
    };
    this.events.push(event);

    const runs: HandlerRun[] = [];
    this.handlerRuns.set(event_id, runs);
    const mine = this.handlers.filter((h) => (h.handles as readonly string[]).includes(event.event_type));
    event.status = 'processing';
    for (const h of mine) {
      const emitted: ID[] = [];
      const ctx: HandlerContext = {
        now: () => this.clock.now(),
        emit: async (child) => {
          const r = await this.process(child, event, depth + 1);
          emitted.push(r.event.event_id);
          return r;
        },
      };
      const started_at = this.clock.now().toISOString();
      try {
        const result = await h.handle(event as InternalEvent, ctx);
        runs.push({ event_id, handler: h.name, outcome: result.outcome, ...(result.detail ? { detail: result.detail } : {}), emitted, started_at, finished_at: this.clock.now().toISOString() });
      } catch (e) {
        runs.push({ event_id, handler: h.name, outcome: 'failed', detail: e instanceof Error ? e.message : 'failed', emitted, started_at, finished_at: this.clock.now().toISOString() });
      }
    }
    const failed = runs.filter((r) => r.outcome === 'failed').length;
    event.status = runs.length === 0 ? 'unhandled' : failed === 0 ? 'handled' : failed === runs.length ? 'failed' : 'partially_handled';
    for (const l of this.listeners) l({ ...event });
    return { event: { ...event }, runs: [...runs], duplicate: false };
  }

  async get(eventId: ID): Promise<InternalEvent | null> {
    const e = this.events.find((x) => x.event_id === eventId);
    return e ? { ...e } : null;
  }

  async list(filter: Parameters<EventService['list']>[0] = {}): Promise<InternalEvent[]> {
    return this.events
      .filter((e) => (!filter.guest_id || e.guest_id === filter.guest_id) && (!filter.voyage_id || e.voyage_id === filter.voyage_id) && (!filter.event_type || e.event_type === filter.event_type) && (!filter.status || e.status === filter.status) && (!filter.correlation_id || e.correlation_id === filter.correlation_id))
      .map((e) => ({ ...e }));
  }

  async runs(eventId: ID): Promise<HandlerRun[]> {
    return [...(this.handlerRuns.get(eventId) ?? [])];
  }

  subscribe(listener: (e: InternalEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function validate(e: NewInternalEvent): void {
  if (!(INTERNAL_EVENT_TYPES as readonly string[]).includes(e.event_type)) throw new ServiceError('validation', `Unknown event type ${String(e.event_type)}`);
  if (!e.guest_id || !e.voyage_id || !e.source) throw new ServiceError('validation', 'guest_id, voyage_id and source are required');
  if (!e.payload || typeof e.payload !== 'object') throw new ServiceError('validation', 'payload must be an object');
  if (e.timestamp && Number.isNaN(Date.parse(e.timestamp))) throw new ServiceError('validation', 'timestamp must be ISO 8601');
}
