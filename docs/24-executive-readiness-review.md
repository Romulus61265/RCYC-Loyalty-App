# 24 · Executive-readiness review

A full technical review before the executive demonstration ([23](23-demo-mode.md)). Defects were fixed; no functionality was added.

## How it was reviewed

| Area | Method | Result |
|---|---|---|
| TypeScript | `tsc --noEmit`, strict | Clean |
| Broken imports | `tsc`, plus a check of every in-app link target (28) and section parameter against the routes that exist | None broken |
| Navigation | Route crawl; every `router.push`/`href`/deep link/notification route resolved against `src/app` | All 20 routes reachable; unknown paths go to the not-found screen |
| Runtime errors | Browser crawl of 35 URLs × 8 data states (default, executive demo, empty, outage, partial outage, flight delay, welcome home, disruption) × up to 4 widths: 455 page loads, collecting page errors and console errors | **1 defect** (below); the rest were the outage scenario logging the outage it simulates, as designed |
| Empty, loading, error states | The same crawl: blank pages, spinners still showing after 2 s, error copy | No blank or stuck screens. Every screen has a loading label, a calm error with **Try again**, and empty copy. |
| Mobile responsiveness | The same crawl at 320, 390, 768 and 1280 px: sideways page scroll, text past the viewport outside horizontal carousels | None |
| Broken text | The crawl: "undefined", "NaN", "null", "[object", "Invalid Date" | None |
| Dead code | `knip` (unused files, exports, types), then each unused export checked against its own file | 1 unused file and 3 unused symbols (below). The rest are exports used only within their file: harmless. |
| Duplicated code | `jscpd` (≥ 12 lines, ≥ 90 tokens) across the app and Edge Functions | 0.26% duplicated lines. The one repeated pattern, the full-screen error wrapper in 16 screens, was consolidated (below). |
| Architecture | Composition root, contract boundary, ESLint import boundaries (screens cannot import fixtures or mocks) | Holds; see the summary below |
| Visual consistency | Screens reviewed at phone width in the demo journey | One defect (the demo control covering content) |
| Accessibility | `check:a11y` (49), the axe browser run (0 violations), the screen-reader suite | Clean |
| Security | `check:security` (21), `check:supabase` (51), `test:supabase` (252 integration and 157 SQL checks, last run on the security audit), `npm audit --omit=dev` | No new findings; dependency advisories unchanged from [22](22-security-audit.md) L19 (build tooling, plus one runtime advisory with no compatible fix) |
| Performance | `check:perf` (41) and the request budgets in `test:supabase` | Within budget ([21](21-performance.md)) |

## Defects fixed

| # | Defect | Fix |
|---|---|---|
| 1 | **Unhandled promise rejection** when optional data fails (Concierge, with bookings unavailable). Seven mock methods raised their simulated outage synchronously, so callers' `.catch(() => [])` never saw it, and the error escaped as an uncaught page error. | The seven methods are `async`, so a failure is always a rejected promise and the callers' fallbacks apply. Concierge and Notifications now degrade as designed. |
| 2 | **The demo control covered content.** The floating "Demo" button stayed over whatever scrolled beneath it (the yacht description, section headings). | It is now a slim bar above every screen (**Demo · fictional data**, **Presenter ›**). It takes its own place in the layout and the top safe area, so it covers nothing. |
| 3 | **Dead code:** `src/security/authorization.ts`, a client permission matrix nothing used, which docs/09 described as active and whose grants differed from the server's; an unused `Hero` component; `isAppError`; `EXAMPLE_DOMAIN`. | Removed. docs/06 and docs/09 now state what is true: the app shows what RLS returns, and the database or the function checks every write. |
| 4 | **Duplication:** the same full-screen error wrapper, copied into 16 screens. | One `ScreenError` component in `src/components`, used by all 16. |

## 1 · Final architecture summary

```
Expo (iOS, Android, web) ── Expo Router screens (src/app → src/features)
        │  view models: pure functions of service data (…Model.ts)
        │  hooks: useAsync, useJourney, useRefreshOnFocus
        ▼
  Service contracts (src/services/contracts): the only thing screens see
        │  createServices() in src/services/registry.ts, the one composition root
        │  instrumented (errors normalised, timings, data version) and analytics-wrapped
        ├── mock        fictional dataset, pinned clock, scenarios and demos (incl. DEMO_MODE)
        ├── supabase    Auth, Postgres behind RLS, Realtime, Edge Functions
        └── enterprise  mocks plus Bonvoy through the BFF (development only)
                │
        Supabase ── Postgres: 54 tables (raw PII in a private schema), 13 views, 27 functions, RLS on every table
                 └─ Edge Functions: concierge-respond (Claude, server-side), journey-events (HMAC webhooks),
                    notifications-dispatch, personalization-next-best, service-recovery-scan
```

* **Boundaries.** Screens depend only on contracts. ESLint blocks screens from importing fixtures or mocks.
* **Rules live once.** Business rules (notifications, recovery, requests, continuity) are in `supabase/functions/_shared` and run in both the app's composed services and the Edge Functions.
* **Fail closed.** A release build refuses to start without a declared environment, or with production on anything but Supabase. A secret key in the bundle stops the app in every mode.
* **The AI acts on taps only.** The concierge offers, a person's tap acts, and the database checks the action.
* **Checks.** `npm run verify` (22 suites, 1,269 checks); `npm run test:supabase` (SQL and integration against real Postgres and PostgREST); Deno check and lint for the functions; browser suites (outside the repository).

## 2 · Screen inventory (20 routes)

| Route | Screen | States covered |
|---|---|---|
| `/` | Home: greeting and journey phase, recognition, attention items, arrival, the next step, arranged for you, voyage and suite, chosen for you, concierge | loading, error, partial, empty |
| `/voyage` (`?section=` overview, itinerary, suite, embarkation, calendar, dining, spa, experiences, documents) | Voyage, nine sections | loading, error, per-section error, empty |
| `/port/[id]` | A port in full: times, chosen for you, booked | loading, error, not on the voyage |
| `/discover` | Discover: ports, collections, refine, request | loading, error, empty |
| `/concierge` | Concierge: conversation, cards, requests, a person | loading, error, partial |
| `/profile` (`?section=` personal, bonvoy, preferences, companions, occasions, history, communication, privacy) | Profile and preferences | loading, error, conflict, validation |
| `/requests`, `/requests/new`, `/requests/[id]` | Service requests: list, new, status | loading, error, empty, validation |
| `/notifications`, `/notifications/settings` | Inbox and notification settings | loading, error, empty |
| `/celebration/[key]` | A celebration and its ideas | loading, error, not found |
| `/recovery/[id]` | A disruption and its alternatives | loading, error, not found |
| `/arrival` | What changed for the arrival | loading, error |
| `/history`, `/history/[id]` | Voyage history and one past voyage | loading, error, empty |
| `/welcome-home`, `/welcome-home/reflections` | After the voyage, and feedback | loading, error |
| `/demo` | Presenter (demonstrations only) | inactive outside a demonstration |
| `+not-found` | Not found | — |
| (sign-in) | Shown by the journey provider when there is no session | validation, error |

## 3 · Service inventory (23 contracts)

| Service | Mock | Supabase |
|---|---|---|
| `auth` | Demo account | Supabase Auth: e-mail OTP, Bonvoy OIDC (configured later); session in the keychain; sign-out wipes the device |
| `profile` | Fixture record and device preferences (special categories in memory) | `guests` and `guest_preferences`, with optimistic versioning |
| `loyalty` | Fixture membership | `loyalty_memberships`, `guest_privileges`, relationship (projections) |
| `voyage` | Fixture voyage | reservations, voyages, port calls, embarkation, documents, flights |
| `experience` | Fixture catalogue and bookings | experiences, slots, bookings, through booking RPCs |
| `concierge` | Deterministic local brain | `concierge-respond` (Claude, server-side), threads behind RLS |
| `personalization` | Shared scoring engine | `recommendations`, signals; `personalization-next-best` |
| `requests` | In-memory store with simulated crew | `service_requests` and their events |
| `occasions` | Composed from the services above | composed |
| `notifications` | Composed, with memory state | composed, with receipts, push devices, `notifications-dispatch` |
| `recovery` | Composed, with a memory store | `recovery_notices`, `service-recovery-scan` |
| `continuity` | Simulated flight status | `arrival_updates`, `continuity_tasks` |
| `postVoyage`, `history` | Composed | `voyage_inspirations`, `voyage_feedback`, `voyage_history` |
| `journeyEvents`, `schedule`, `audit` | Mock outbox, fixture programme, console | `journey_events`, composed programme, triggers and `audit_log` |
| `analytics` | Console (development) | Consent-gated; vendor not chosen (no-op in production) |
| `push` | Unsupported registrar | Unsupported until expo-notifications ships |
| `clock` | Pinned demo clock | Real time |
| `demo` | DEMO_MODE controls | Inert |

## 4 · Database inventory

* **13 migrations** (`supabase/migrations`), each self-checking RLS. Seed: `supabase/seed.sql` (fictional; refuses real databases).
* **54 tables:**

| Group | Tables |
|---|---|
| Identity and access | `guests`, `private.guest_pii`, `user_roles`, `travel_companions`, `special_occasions` |
| Fleet and voyage | `yachts`, `suites`, `voyages`, `voyage_days`, `port_calls`, `destinations`, `discover_collections`, `day_schedule_items` |
| Reservation | `reservations`, `reservation_guests`, `embarkations`, `travel_documents`, `flight_segments` |
| Loyalty | `loyalty_memberships`, `privileges`, `guest_privileges`, `guest_relationships` |
| Preferences and personalization | `guest_preferences`, `personalization_signals`, `recommendations`, `recommendation_feedback` |
| Experiences | `experiences`, `experience_slots`, `experience_bookings`, `dining_bookings`, `spa_bookings`, `excursion_bookings` |
| Concierge | `concierge_conversations`, `concierge_messages`, `concierge_ai_runs`, `concierge_rate_limits` |
| Service | `service_requests`, `service_request_events` |
| Communication | `journey_alerts`, `journey_events`, `notifications`, `notification_receipts`, `push_devices` |
| Recovery | `service_recovery_events`, `recovery_notices`, `goodwill_rules`, `goodwill_proposals`, `goodwill_policy` |
| Continuity | `arrival_updates`, `continuity_tasks` |
| After the voyage | `voyage_feedback`, `voyage_inspirations`, `voyage_history` |
| Audit | `audit_log` (append-only) |

* **13 views** (all `security_invoker`): the `_local` time views, `excursions`, `voyage_guests`.
* **27 functions**, including:
  * the RLS helpers (`current_guest_id`, `on_reservation`, `crew_for_reservation`, `crew_for_guest`);
  * the booking RPCs and `register_push_device`;
  * `concierge_take_slot`.
* **One private Storage bucket** for travel documents.

## 5 · Known limitations

* **Imagery.** Brand-tone gradients stand in for photography until a DAM is connected.
* **Push.** The server side (device registry, dispatcher) is built, but the device side waits for `expo-notifications` in the native builds.
* **Flight status.** Simulated; no flight-data provider is connected, and the app says so.
* **Times.** Message timestamps follow the device's time zone. Demonstrations should set the device to Central European time.
* **Enterprise mode.** It signs in with the demo account (development only, refused elsewhere).
* **Open findings.** The Medium and Low items of [22](22-security-audit.md) are open, for example:
  * party members can change each other's bookings;
  * accessibility needs are shared with crew by default;
  * push-token takeover;
  * no screenshot protection.
* **Long lists.** The concierge thread and inbox render in a `ScrollView`, which is fine at today's sizes ([21](21-performance.md)).
* **Dependency advisories.** Build-tool advisories remain until Expo ships fixes. There is also one runtime advisory, `decode-uri-component`, reachable only through route parameters the app builds itself.

## 6 · Mock integrations

| Integration | Stand-in |
|---|---|
| Marriott Bonvoy (status, privileges, SSO) | Fixture membership; in Supabase, projection tables. The BFF adapter (`MarriottBonvoyService`) exists for enterprise mode. |
| Reservations and PMS | Fixture and seed data |
| CRM (guest record, preferences, history) | Fixture record; in Supabase, its tables |
| Flight status | `MockTravelDisruptionService`, labelled simulated |
| Ground transfers | `MockTransferService` |
| Crew operations (acknowledging and completing requests) | Simulated crew in the mock request service |
| Concierge AI in mock mode | A deterministic local brain; in Supabase, Claude through `concierge-respond` |
| Product analytics | Console in development; no-op in production |
| Media and DAM | Gradients |
| Partner webhooks | `journey-events` accepts signed events; no partner is sending yet |

## 7 · Production integrations still required

1. **Identity:** Marriott Bonvoy OIDC (client registration and PKCE redirect, verified App and Universal Links), plus MFA (AAL2) before travel documents.
2. **Loyalty:** a Bonvoy member and privileges feed into the projection tables, through the BFF.
3. **Reservations, PMS and CRM:** reservations, the party, suites, documents and the guest record, synchronised into Postgres.
4. **Flight status:** a provider feeding `journey-events` (HMAC), driving continuity.
5. **Transfers and shore operators:** booking confirmations back into experiences.
6. **Crew tools:** the console that acknowledges requests, decides goodwill and takes concierge conversations over (the database side is ready).
7. **Push:** `expo-notifications` in the native builds, with APNs and FCM credentials.
8. **Observability:** a backend for `RemoteSink`, the SIEM stream for `audit_log`, and crash reporting.
9. **Analytics:** the vendor adapter behind `AnalyticsProvider`.
10. **Media:** DAM renditions sized to their frames.
11. **Payments:** a tokenised PSP for the onboard folio (none is in scope today).
12. **Deployment:** EAS builds with secret scanning; certificate pinning for the BFF; device-posture controls.

## 8 · Recommended next development phase

**Phase 2: one real guest, end to end, on staging.**

1. **Identity first.** Bonvoy OIDC and MFA on staging Supabase, so a real (test) member signs in.
2. **The data spine.** Reservation, party and guest record synchronised from PMS and CRM, plus the Bonvoy member feed, into the existing tables. The services do not change.
3. **The crew console.** The minimum console that lets the yacht answer: acknowledge and complete requests, take a conversation over, decide goodwill. The guest experience depends on the crew closing the loop.
4. **Native push and the flight feed.** Together they make continuity real.
5. **Close the Medium findings of [22](22-security-audit.md)** before any real guest data: who may change a party member's booking, accessibility sharing defaulting to off, push-token ownership, screenshot protection.
6. **Pilot readiness:** observability, crash reporting, EAS release pipeline, accessibility audit on devices, load test of `concierge-respond`.

## 9 · Executive demo script

Fifteen steps, about ten minutes. Turn the demonstration on with `EXPO_PUBLIC_DEMO_MODE=executive` (or `?demo=executive` on a non-production web build). Set the device to Central European time. Full detail is in [23](23-demo-mode.md).

| # | Do | Say |
|---|---|---|
| 1 | Open Home | "It is embarkation morning. Alexander and Camille Laurent are in the air to Barcelona." |
| 2 | Point to the recognition card | "Titanium Elite, fourth voyage, Lifetime Platinum. Recognised before they arrive." |
| 3 | Point to the hero | "Balearics & the Riviera aboard Evrima: today, Barcelona." |
| 4 | Scroll to Your voyage | "Grand Suite 612, with Elena Moreau as their Suite Ambassador." |
| 5 | Chosen for you | "Each suggestion says why: a Barolo they loved, the helm off Hvar." |
| 6 | Tap Voyage | "Everything about the voyage in one place." |
| 7 | Tap Itinerary | "Eight days, port by port: what is booked, what is chosen for them." |
| 8 | Explore Palma de Mallorca | "Day two, in full." |
| 9 | The vineyard card | "A private vineyard with the winemaker, chosen because of the Barolo in 2023." Then tap **Arrange with the concierge**. |
| 10 | Concierge opens | "A digital concierge, with a person a tap away." |
| 11 | Tap "Help me celebrate my anniversary." | "Their 20th, in Monte Carlo." |
| 12 | The reply | "What is already arranged, more ideas, a surprise kept for Camille: offered, never booked, until they choose." |
| 13 | Demo bar › Presenter › **Report the flight delay** | "Their flight is now two hours late." |
| 14 | Home, Your arrival › **See what changed** | "The driver re-timed, the yacht told, the arrival window moved, without the guest asking." |
| 15 | Concierge | "And Elena writes to them herself. Nothing for them to do." |

Afterwards: Presenter › **Reset the demonstration**, ready for the next audience.
