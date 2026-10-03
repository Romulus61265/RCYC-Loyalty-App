# 15 · Shoreside-to-yacht continuity

When the guest's journey to the yacht changes, everything that depends on it moves with it. The guest is told once, plainly, what moved and what still waits for a person to confirm.

**What exists, and what does not.**

* **No flight-status integration exists.** The flight-status source is an interface (`TravelDisruptionService`) with one implementation: `MockTravelDisruptionService`.
* **No integration exists with a transfer supplier, venue system or embarkation/PMS system.** In the mock, stand-in ports play those parts. On Supabase, every change becomes a task for the team that owns it, and the guest is told "requested" until a person confirms.
* The app never claims otherwise. Whenever the source is simulated, the guest sees "Demonstration: this flight status is simulated. No flight-data service is connected."

## The demonstration

**The guest.** Alexander Laurent: Titanium Elite, Grand Suite 612. AA 7412 from Miami, landing in Barcelona at 09:10.

**What is arranged that morning:**

* a private transfer at 10:00, with the Sagrada Família visit on the way (10:45);
* an embarkation window of 13:30–14:00;
* all aboard at 19:00.

**Run it.** Open the web build with `?demo=flight-delay`. The demo clock starts at 07:30 on embarkation morning, with the flight in the air. About 2.5 seconds later, the mock source reports AA 7412 two hours late, and Home updates while the guest is looking.

> **We've adjusted your arrival arrangements.**
>
> | | |
> |---|---|
> | Inbound flight delay detected | 11:10. AA 7412 from Miami is now expected at 11:10, about 2 hours later than planned. |
> | Private transfer updated | Your driver will meet you at 12:00 instead of 10:00, and is following the flight. |
> | Embarkation team notified | They now expect you between 15:30 and 16:00. Grand Suite 612 will be ready when you arrive. |
> | New transfer time | 12:00, Barcelona–El Prat, Terminal 1 arrivals. |
> | Updated arrival estimate | 15:30. Port Vell Yacht Terminal by about 15:30. All aboard is at 19:00, so there is time to spare. |
> | Concierge available | Elena is following your flight and is here if you would like anything changed. |
>
> *Also moving with your flight:* The Sagrada Família, privately. We have asked to move it to 12:45, after you land. The team will confirm. **Requested.**

Home shows the headline and the six lines, with the times. **See what changed** opens `/arrival`. The rest of Home and Voyage update too:

* the transfer at 12:00;
* "Now landing 11:10, and your driver knows";
* the window 15:30–16:00, with a note in the embarkation details.

## Event architecture

```
 flight-status source            normalise              orchestrate (rules: continuity-rules-v1)
┌──────────────────────────┐   ┌─────────────────┐   ┌───────────────────────────────────────────────┐
│ TravelDisruptionService  │──▶│ FlightStatus    │──▶│ for each reservation on the flight:           │
│  • MockTravelDisruption- │   │ Update          │   │   context (transfer, en route, embarkation)   │
│    Service (only one)    │   │ (observationId, │   │   plan: new pick-up, moves, window, risk      │
│  • production adapter:   │   │  estimate,      │   │   act through each team's port ───────────┐   │
│    not built             │   │  simulated)     │   │   publish events · save guest update      │   │
└──────────────────────────┘   └─────────────────┘   └──────────────────────────────────────────│────┘
                                                                                                 ▼
         ports              mock (demonstration)                        Supabase (today)
         transfer           MockExperienceService.applyOperatorChange   continuity_tasks (team: transfer) → requested
                            → confirmed
         venue en route     ExperienceService.requestChange             continuity_tasks (team: venue) → requested
                            → requested
         embarkation        MockVoyageService.applyEmbarkationChange    continuity_tasks (team: embarkation) → requested
                            → notified
         crew               logged → notified                           continuity_tasks (team: crew) → requested
```

**Events.** Each is correlated to the observation (`correlationId`) and caused by the one before (`causationId`):

```
flight.delayed  ─┬─▶ transfer.rescheduled
 (observation)   ├─▶ experience.change_requested   (each plan en route)
                 ├─▶ embarkation.changed           (window, luggage, the guest's tier and suite for the gangway)
                 └─▶ continuity.crew_alert         (all aboard at risk · no transfer · cancelled · a failed change)
```

* In the mock, they are kept on `MockContinuityService.events`.
* On Supabase, they go to `journey_events`. The payload carries `correlationId` and `causationId`; the `dedupe_key` is the plan key plus the action.

**Code.** The shared rules live in `supabase/functions/_shared/continuity/`. They are self-contained, so they run in the app and in Deno:

* `types.ts`: the contracts;
* `engine.ts`: `planArrival`, `toArrivalUpdate`, `continuityEvents`;
* `orchestrator.ts`: `handleFlightUpdate` and the `ContinuityPorts` interface;
* `supabaseContinuity.ts`: the server ports.

## The rules

| | Rule |
|---|---|
| Below 20 minutes late | Nothing moves; the driver waits. "Your flight is running a little late." |
| New pick-up | The new estimate, plus the same gap the guest had after landing (50 minutes here), never under 45 minutes; rounded up to five minutes. |
| Plans en route | Bookings inside the transfer (the Sagrada Família visit) move by the same amount, **as a request**: a venue confirms, not the rules. |
| Arrival at the terminal | The transfer's end moved by the same amount. |
| Embarkation window | Moves to that arrival when it is later than the window (same length). The luggage time moves by the same amount. The embarkation team is always told, even when the window still holds. |
| All aboard at risk | Arriving within 60 minutes of all aboard brings a crew alert; the guest is told "Elena will call you". |
| No transfer, or a cancelled flight | A crew alert: a person handles it. |

**Honest outcomes.** Each port reports `confirmed`, `requested`, `notified` or `failed`. The guest's words follow it:

* The headline is "We've adjusted your arrival arrangements." **only when the transfer and the embarkation team are confirmed or notified.** Otherwise it is "We're adjusting your arrival arrangements", and the steps read "being updated / being told … they will confirm".
* A port that fails never stops the others. It adds a crew alert, and the guest reads "Elena is arranging your driver … personally".

**Idempotency.** There is one plan per flight and estimate (`arrival:<flight>:<estimate>`). The same estimate reported again changes nothing.

## Contracts

```ts
// Integration boundary: a flight-status source (only MockTravelDisruptionService exists).
interface TravelDisruptionService {
  getFlightStatus(flightNumber, departureDate): Promise<FlightStatusUpdate | null>;
  subscribe(listener): Unsubscribe;
}

// What the guest app reads.
interface ContinuityService {
  getArrivalUpdate(reservationId): Promise<ArrivalUpdate | null>;
  subscribe(reservationId, listener): Unsubscribe;
}
```

* **Mock.** `MockContinuityService` runs the shared orchestrator with the mock ports; it is the server, in the app. In the app, observations reach it through the internal event bus as `FLIGHT_DELAYED`. Transfer and embarkation are reached as `TRANSFER_DELAYED` and `EMBARKATION_UPDATED` events ([16](16-internal-events.md)). On its own (as in `check:continuity`), it listens to the source directly.
* **Supabase.** `SupabaseContinuityService` reads `arrival_updates` under RLS and listens with Realtime.

The guest app never talks to a flight-status source. In production, an adapter would run server-side and publish `flight.delayed`.

## Server

* **`journey-events`.** A `flight.delayed` event runs the orchestrator with the Supabase ports. Its payload carries `flightNumber`, `departureDate`, `estimatedArrival`, optionally `scheduledArrival` and `simulated`. The guest's alert then carries the update's headline and opens `/arrival`.
* **Migration `20261010000000_continuity.sql`.**
  * `flight_segments.estimated_arrival` (and in `flight_segments_local`);
  * `arrival_updates`: guest-safe JSON, one per plan key; the party and crew read it; only the service role writes;
  * `continuity_tasks`: one per team and change; crew read; guests see nothing.
  * The bookings themselves are not changed until the team confirms.

**To make it real**, in order:

1. Write a server-side flight-status adapter that publishes `flight.delayed` to the bus. It must be licensed, with webhooks or polling for tracked flights.
2. Give the transfer team and the embarkation desk a console that works `continuity_tasks`. Marking a task done would update the booking or embarkation and the guest's update, and the headline becomes "We've adjusted…".
3. Later, supplier APIs where they exist. Their port returns `confirmed` only on the supplier's acknowledgement.

## Tests

* **`check:continuity`** (69 checks):
  * the guest's day (tier, suite, transfer, the visit en route, the window);
  * the plan for two hours late (12:00 pick-up, 12:45 visit, 15:30 at the terminal, 15:30–16:00 window, 17:30 luggage);
  * short delays, rounding, the 45-minute minimum, all aboard at risk, no transfer, cancellation, another flight;
  * the exact headline and the six steps in order, with their words;
  * honest outcomes ("requested" never reads as done; failures go to a person);
  * events, correlation and causation; idempotency;
  * the mock pipeline end to end (flight, window, luggage, transfer confirmed, visit requested, fixtures untouched);
  * Home's transfer, flight line and window; the card and view models.
* **`test:supabase`** (13 checks):
  * through the server ports: every change requested and the headline "We're adjusting…";
  * the same times as the mock;
  * the flight's estimate shown;
  * the booking untouched;
  * tasks for each team, crew only;
  * other guests see nothing;
  * correlated events;
  * idempotent;
  * guests cannot write.
* **Browser** (`arrtest`, 21 checks):
  * default Home unchanged;
  * before and after the live event;
  * the card with its times and the demonstration note;
  * Home's transfer, flight and window;
  * every step's words; the visit requested; no claim of an integration;
  * Voyage › Embarkation; Talk to Elena;
  * 320 px; no page errors.
