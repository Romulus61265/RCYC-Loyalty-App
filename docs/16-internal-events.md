# 16 · Internal event model

One envelope for everything that happens to a guest's journey, whoever noticed it. Producers **publish** to `EventService`; **handlers**, one per service, react and may publish follow-up events. It is the backbone behind continuity ([15](15-shoreside-continuity.md)), recovery ([14](14-service-recovery.md)) and notifications ([13](13-notifications.md)).

It is an MVP: in-process, in memory, sequential. It is enough to make the flow explicit, traceable and testable now. The contract does not change when a durable queue replaces it (see the end of this page).

## Events

| `event_type` | Payload | Default severity | Journey-event type |
|---|---|---|---|
| `FLIGHT_DELAYED` | `flight_number`, `departure_date`, `scheduled_arrival`, `estimated_arrival`, `delay_minutes`, `observation_id`, `simulated` | notice | `flight.delayed` |
| `TRANSFER_DELAYED` | `booking_id`, `previous_start`, `new_start`, `new_end?`, `reason` | notice | `transfer.delayed` |
| `EMBARKATION_UPDATED` | `window_start`, `window_end`, `luggage_delivered_by?`, `reason` | notice | `embarkation.changed` |
| `PORT_CHANGED` | `port_call_id`, `from_port`, `to_port`, `date`, `reason?` | action | `itinerary.port_changed` |
| `EXCURSION_CANCELLED` | `booking_id`, `experience_id?`, `reason?` | action | `excursion.cancelled` |
| `DINING_UPDATED` | `booking_id`, `change` (confirmed · moved · cancelled), `start?`, `reason?` | info | `dining.updated` |
| `SPA_UPDATED` | as dining | info | `spa.updated` |
| `GUEST_REQUEST_CREATED` | `request_id`, `category`, `priority` | info | `service.request_created` |
| `GUEST_REQUEST_RESOLVED` | `request_id`, `resolution?` | info | `service.request_resolved` |
| `SPECIAL_OCCASION_DETECTED` | `occasion_key`, `kind`, `date` | info | `occasion.detected` |
| `LOYALTY_MILESTONE` | `programme`, `milestone`, `value?` | info | `loyalty.milestone` |
| `SERVICE_FAILURE` | `kind`, `subject_id?`, `detail?` | action | `service.failure` |

### The envelope (`InternalEvent`, `src/domain/internalEvents.ts`)

The fields are snake_case, because this is the wire and storage shape.

| Field | |
|---|---|
| `event_id` | Assigned on publish |
| `event_type` | One of the twelve |
| `timestamp` | When it happened; defaults to the bus clock |
| `guest_id`, `voyage_id` | Whose journey |
| `source` | Who reported it: `mock-flight-status`, `TravelDisruptionHandler`, `crew-console`… |
| `payload` | Typed per event type (`InternalEventPayloads`) |
| `severity` | `info` · `notice` · `action` · `urgent`; defaults per type |
| `status` | `received` → `processing` → `handled` · `partially_handled` · `failed` · `unhandled` |

**Extensions** for tracing and idempotency:

* `reservation_id`;
* `correlation_id`: the first event of the chain;
* `causation_id`: the event that caused this one;
* `dedupe_key`: publishing it twice is a no-op.

`JOURNEY_EVENT_TYPE` maps each type to the dotted vocabulary of `journey_events`, so the internal model and the stored events stay one stream.

## Interfaces (`src/services/contracts`)

```ts
interface EventService {
  publish(event: NewInternalEvent): Promise<PublishResult>;   // { event, runs, duplicate }
  register(handler: EventHandler): Unsubscribe;
  get(eventId) · list({ guest_id?, voyage_id?, event_type?, status?, correlation_id? }) · runs(eventId)
  subscribe(listener): Unsubscribe;                           // every processed event
}

interface EventHandler<T extends InternalEventType> {
  name: string;
  handles: readonly T[];
  handle(event: InternalEvent<T>, ctx: HandlerContext): Promise<{ outcome: 'done' | 'requested' | 'skipped' | 'failed'; detail? }>;
}

interface HandlerContext {
  emit(event): Promise<PublishResult>;   // a follow-up event in the same chain; its handlers run before this resolves
  now(): Date;
}
```

**`InMemoryEventService` (the MVP).** On publish it:

1. validates the envelope;
2. assigns the id and time;
3. ignores a repeated `dedupe_key`;
4. runs the handlers for the type **one after another, in registration order**, so a later handler may rely on an earlier one's work.

Each run is recorded as a `HandlerRun` (handler, outcome, detail, events it emitted, times).

* **Failures.** A handler that throws is recorded as failed, and the others still run. If some fail, the event is `partially_handled`; if all fail, it is `failed`.
* **Loops.** A chain deeper than four is refused (and recorded as a failure).

**Outcomes say what really happened.**

* `done`: carried out.
* `requested`: asked of a person, who confirms.
* `skipped`: nothing to do.

Guest-facing words follow the outcomes. Nothing is reported as done until it is.

## Demonstration: `FLIGHT_DELAYED`

```
MockTravelDisruptionService ── observation ──▶ flightDelayedEvent() ──▶ EventService.publish(FLIGHT_DELAYED)
                                                                              │ (handlers in order)
  1. VoyageEventHandler        VoyageService    the flight carries its new estimate (11:10)
  2. TravelDisruptionHandler   continuity rules decide what moves, then reaches each team by event:
       ├─ emit TRANSFER_DELAYED ─────▶ TransferEventHandler   TransferService: 10:00 → 12:00 (confirmed by the mock operator)
       ├─ emit EMBARKATION_UPDATED ──▶ VoyageEventHandler     VoyageService: window 15:30–16:00, luggage 17:30
       └─ the visit en route: a change request (12:45, the team confirms); the arrival update is saved
  3. NotificationEventHandler  NotificationService: "We've adjusted your arrival arrangements." in the inbox, opening /arrival
  4. ConciergeEventHandler     ConciergeService: Elena writes in the thread
```

Elena's message in the thread:

> "Alexander, I'm following AA 7412: it now lands at 11:10. Your driver will meet you at 12:00. We expect you at the yacht by about 15:30. The Sagrada Família, privately: we have asked to move it to 12:45, after you land. The team will confirm. If you would rather change anything, just tell me here."

* `TRANSFER_DELAYED` and `EMBARKATION_UPDATED` carry the flight event as `causation_id`, and share its `correlation_id`. The whole chain is one query: `list({ correlation_id })`.
* `TravelDisruptionHandler` turns each team handler's outcome into the continuity rules' terms: `done` → confirmed or notified, `requested` → requested, failed → failed. So the guest's headline and steps stay honest.
* **The same estimate again** is one event (`dedupe_key`). Nothing moves twice, and no second message or concierge note is sent.
* **When the transfer operator is down,** `TRANSFER_DELAYED` fails. The flight event is still handled, as *requested*, and:
  * the window still moves;
  * the guest reads "We're adjusting your arrival arrangements." with "Elena is arranging your driver for 12:00 personally";
  * Elena writes "I have asked for your driver to meet you at 12:00, and will confirm."

**Run it.** `?demo=flight-delay` in the web build ([15](15-shoreside-continuity.md)). These all come through this bus:

* the Home card;
* the transfer and window;
* the inbox message (bell);
* Elena's note in the concierge.

**Files:**

| File | Contents |
|---|---|
| `src/services/events/InMemoryEventService.ts` | The bus |
| `src/services/events/flightDelay.ts` | `flightDelayedEvent` (the source adapter) and `registerFlightDelayHandlers` (the order above) |
| `src/services/events/handlers/` | `TravelDisruptionHandler`, `TransferEventHandler`, `VoyageEventHandler`, `NotificationEventHandler`, `ConciergeEventHandler` |

**Mock seams.** These stand in for systems that do not exist yet:

* `MockTransferService`, the mock operator;
* `MockVoyageService.applyFlightStatus` and `applyEmbarkationChange`;
* `MockJourneyEventService.deliver`, the outbox;
* `MockConciergeService.postTeamMessage`.

No transfer-supplier, flight-data or PMS integration exists.

## Beyond the MVP

* **Durable.** Put the same `EventService` contract over `journey_events` (insert with `dedupe_key`, then process) and a queue, with retries per handler run. The server already records the continuity chain there ([15](15-shoreside-continuity.md)).
* **Server-side handlers.** Today the Edge Functions call the shared continuity and recovery engines directly from `journey-events`. Moving them behind this bus changes no rules.
* **Other producers.** These would publish the other types, which have no handlers in the MVP; the bus records them as `unhandled`.

  | Event | Producer |
  |---|---|
  | `GUEST_REQUEST_CREATED` and `GUEST_REQUEST_RESOLVED` | the request lifecycle trigger |
  | `SPECIAL_OCCASION_DETECTED` | the occasion detectors |
  | `SERVICE_FAILURE` | service recovery |
  | `LOYALTY_MILESTONE` | the Bonvoy adapter |

## Tests

**`check:events`** (42 checks):

* the twelve types, severities and the journey-event mapping;
* the envelope; validation;
* handler order, statuses (`unhandled`, `handled`, `partially_handled`, `failed`) and isolation of failures;
* duplicates;
* follow-up events with correlation and causation;
* the loop guard; subscribers and runs;
* the demonstration end to end:
  * the handler order and outcomes, and the emitted events;
  * the effects on the voyage, transfer, visit, arrival update, inbox and concierge thread;
  * repeats;
  * the transfer operator down.

The browser check `arrtest` also confirms Elena's note in the concierge and the message in the inbox.
