# 12 · Special occasions and service requests

Two connected guest flows:

* **Service requests.** One system for everything a guest asks of the crew, aboard or before sailing.
* **Special-occasion orchestration.** Turns a celebration during the voyage into a personal message and a handful of ideas. The ideas the guest approves become service requests or booking requests. Nothing is ever bought automatically.

## Service requests

### Model

`GuestServiceRequest` (`src/domain/requests.ts`):

| Field | Notes |
|---|---|
| `id` | |
| `guest` | `{ id, name }`: who raised it (stamped by a trigger in Supabase) |
| `voyage` | `{ id, name }` |
| `category` | `suite`, `dining`, `housekeeping`, `maintenance`, `transportation`, `excursion`, `spa`, `concierge`, `special-assistance`, `other` |
| `title`, `description` | The first line becomes the title |
| `priority` | `routine` ("When convenient"), `priority` ("Soon"), `urgent` |
| `status` | `submitted`, `acknowledged`, `in_progress`, `resolved`, `closed` |
| `createdAt`, `updatedAt` | |
| `assignedTeam` | `{ team, label, person? }`: the team, the department ("Housekeeping", "Engineering", "The Spa"), and the person once someone picks it up |
| `resolutionNotes` | What was done |
| `timeline` | When each status was reached |
| `canClose`, `awaitingGuest`, `nextUpdateBy` | For the screens |

### One store, two ways in

Requests raised from the Requests screens and requests the concierge raises from a conversation live in the same `service_requests` table (or, in the mock, the same `MockRequestStore`). Everything appears in one place.

The guest-facing status is derived from the underlying state and lifecycle stamps (`services/shared/serviceRequests.ts`):

| Underlying | Guest sees |
|---|---|
| `received` | Submitted |
| `received` + `acknowledged_at` (someone assigned) | Acknowledged |
| `in_progress`, `awaiting_guest` | In progress ("Needs your reply" when awaiting the guest) |
| `confirmed`, `completed` | Resolved |
| `closed_at`, `cancelled`, `declined` | Closed |

### Routing

| Category | Team · department |
|---|---|
| Suite, Other | Suite Ambassador |
| Dining | Guest Services · Restaurants |
| Housekeeping | Guest Services · Housekeeping |
| Maintenance | Guest Services · Engineering |
| Spa | Guest Services · The Spa |
| Transportation, Excursion | Destination Services |
| Concierge | Shoreside Concierge at home, Guest Services aboard |
| Special assistance | Guest Services |

### `ServiceRequestService`

```ts
submit({ reservationId, category, description, priority?, occasionStep? })
listActive(reservationId)    // submitted · acknowledged · in progress
listHistory(reservationId)   // resolved · closed
get(requestId)
close(requestId)             // withdraw before work starts, or close once resolved
subscribe(reservationId, listener)
```

**Mock.** `MockServiceRequestService` is backed by the shared store. In the app (`simulateCrew`), someone acknowledges a new request after about 8 s and starts it after about 25 s.

**Supabase.** `SupabaseServiceRequestService` works as follows:

* inserts a `received` row under RLS;
* lists and reads through `service_requests_local`, so times are shown in the zone the request was made in;
* closes through `close_service_request()`;
* takes live updates from Realtime.

### Database (`20261007000000_guest_service_requests.sql`)

* **New columns.** `category` (backfilled from `type`), `guest_id`, `resolution_notes`, `acknowledged_at`, `started_at`, `resolved_at`, `closed_at`, and `occasion_step`.
* **`service_request_lifecycle` trigger.**
  * On insert, it fills in the category and guest.
  * On update, it stamps each lifecycle moment, so crew tools only set the status. Assignment counts as an acknowledgement; withdrawal does not.
* **Guest insert policy.** Opening state only: no status other than `received`, no notes, no stamps, no assignment, and only their own guest ID.
* **`close_service_request(id)`.** The only change a guest can make:
  * a `received` request becomes `cancelled` ("Withdrawn by the guest.");
  * a resolved request gets `closed_at`;
  * anything in progress is refused.

### Screens

| Route | What it shows |
|---|---|
| `/requests` | Active and History tabs (`?view=history`), each a list with category, status, opened date and team, the next update or the resolution. "Make a request" |
| `/requests/new` | Category (10 chips, with hints and an example), the request in the guest's words, and how soon. "Urgent" shows how to reach help immediately. Nothing is charged by sending a request |
| `/requests/[id]` | Status timeline (Submitted → Acknowledged → In progress → Resolved → Closed, with times), the resolution, the request, and details (category, priority, who has it, opened, requested by, voyage). Withdraw, or close, with a confirmation |

Ways in: Home ("Anything you need"), the Concierge's Requests tab, and each celebration step that became a request.

## Special-occasion orchestration

### Reusable architecture

```
detectCelebrations(input) → DetectedCelebration[]
        │  one detector per kind
        ▼
planCelebration(c, input) → { message, steps[] }
        │  PLAYBOOKS[kind] picks and orders the steps
        │  shared step builders: private-dining · wine · suite-amenity ·
        │  private-shore · spa · captain · concierge
        ▼
OccasionService.approveStep(…, { approved: true, acknowledgedCharge? })
        └─▶ ExperienceService.requestBooking (status 'received')
            or ServiceRequestService.submit (tagged with occasionStep)
```

The engine is pure, in `src/services/occasions/celebrations.ts`. `ComposedOccasionService` runs it over the other services' contracts, so mock and Supabase modes share it. To add a kind, add a detector and a playbook entry.

| Kind | Detected when | Playbook |
|---|---|---|
| Birthday | A shared birthday falls during the voyage (any year) | Message, private dining, suite amenity (a cake that respects dietary needs), private shore, concierge |
| Anniversary | A shared anniversary falls during the voyage | Message, private dining, wine and sommelier, suite amenity, private shore, spa together, concierge |
| Honeymoon | A honeymoon occasion during the voyage | Message, private dining, spa, suite amenity, private shore, wine, concierge |
| Milestone voyage | The 5th, 10th, … voyage, or a 50th, 100th, … night aboard | Message from the Captain and crew, the bridge, suite amenity, wine, concierge |
| Bonvoy milestone | A membership anniversary in five-year steps | Message, suite amenity, private dining, concierge |

### The fictional guest's anniversary

Alexander and Camille's 20th wedding anniversary is on Thursday 20 May. That is day 6, their second day in Monte Carlo, and they asked for it to be discreet.

* **Message.** "Twenty years", from Elena, their Suite Ambassador: "…we have kept it between us, as you asked… Nothing is requested or charged unless you say so."
* **Private dining.** Dinner on a Private Terrace at 20:30. In hand: being arranged.
* **Wine and the sommelier.** A 2007 Barolo, from the year they married, chosen from their beverage preferences. In hand: arranged by the head sommelier.
* **Suite amenity.** Champagne on ice (their celebration wine) and flowers, on the morning of the day, set out quietly with no card. *Suggested.*
* **Private shore experience.** Villa Ephrussi de Rothschild with a curator. In hand: confirmed.
* **Spa together.** The Couples Terrace Ritual at 16:00. In hand: confirmed.
* **Concierge assistance.** Elena, to plan the day with them. *Suggested.*

### Never purchased automatically

* **Plans only propose.** Already booked or requested items are shown "in hand", never offered twice. A withdrawn request is offered again.
* **The screen shows what will be sent first.** Each step opens a "Before we send it" panel with exactly what will be sent and the price, plus an optional note. "Not now" sends nothing.
* **`approveStep` enforces consent in the service, not just the screen.**
  * Refused unless `approved: true`.
  * Refused for a chargeable step unless the guest has acknowledged the charge ("I understand €1,200 will be charged to my account once the team confirms it.").
  * Refused for a step already in hand.
* **An approved experience is a request.** It is a booking request with status `received`; the team confirms it, and the charge follows only then.
* **Other steps go to people.** They become service requests that a person handles, and they confirm any cost with the guest.

### Privacy

* `private` occasions are never detected.
* With personalised recommendations off, a plan is only the message and a person.
* If occasions are not shared with the crew, requests do not say what they are for.
* Minors in the party mean no Champagne.
* The amenity respects dietary needs.

## Tests

* **`check:requests`** (42 checks):
  * categories, routing and status mapping;
  * timelines and validation;
  * the mock service: submit, lists, close, live updates, the store shared with the concierge, the crew simulation;
  * view models.
* **`check:occasions`** (58 checks):
  * detection of all five kinds (and not of private, past or out-of-voyage ones);
  * the anniversary plan, step by step;
  * the "nothing arranged yet" plan;
  * privacy and the party;
  * the approval rules: no approval, no acknowledgement, twice, in hand, unknown.
* **`test:supabase`**:
  * request parity with the mock;
  * insert and update refusals;
  * the trigger's stamps through the lifecycle;
  * closing and withdrawing, including direct RPC attempts;
  * isolation from another guest;
  * the anniversary plan from the database, and an approved step stored with its `occasion_step`.
