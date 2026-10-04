# 19 · Product analytics

Privacy-conscious product analytics answer *what happened in the app*, never *who* or *what was said*. Events are declared in advance with a fixed set of properties. They are screened for anything that must never be logged, and nothing is sent without the guest's consent. They go through a provider abstraction, so the vendor can be replaced without touching a screen.

## The events

| Event | Properties | Recorded where |
|---|---|---|
| `screen_viewed` | `screen`, a route pattern (`/history/[id]`), never with real ids or a query | `AnalyticsTracker`, on each route change; the same screen twice in a row counts once |
| `experience_viewed` | `experience_id`, `category`, `surface` | Discover, the first time a card's details open |
| `experience_saved` | `experience_id`, `category`, `saved` (yes/no) | Discover's Save toggle |
| `experience_booked` | `experience_id`, `category`, `party_size`, `source` | `ExperienceService.requestBooking` (tap) |
| `concierge_opened` | `entry` (the concierge view) | Concierge screen |
| `concierge_request_submitted` | `kind` (message, action or handoff), `action`, `team` | `ConciergeService.sendMessage`, `performAction` and `escalateToHuman` (tap). **The kind, never the words.** |
| `service_request_created` | `category`, `priority`, `source` (requests or concierge) | `ServiceRequestService.submit`, `ConciergeService.createServiceRequest` (tap) |
| `recommendation_viewed` | `recommendation_id`, `surface`, `position` | Home's recommendation rail, once per recommendation per session |
| `recommendation_accepted` | `recommendation_id`, `surface`, `action` | Home rail tap; a request from a recommended Discover card |
| `preference_updated` | `group` (dining, spa, privacy, …) | `GuestProfileService.updatePreferences` (tap). **Which group, never the values.** |

Taps (`withAnalytics`) record events from the services, whichever screen led there. They run only after a call succeeds, never change its result, and cannot break it.

## What is never logged

Two layers, both in `src/services/analytics/schema.ts`:

1. **An allow-list.** Each event declares its properties and their shape:
   * an id;
   * a short lower-case label;
   * a count from 0 to 999;
   * or a route.

   Anything undeclared is dropped, and so is anything of the wrong shape. A guard also refuses property names that could carry something private (passport, card, payment, token, medical, message, text, note, name, email, phone, guest_id, …).
2. **Value screening, whatever the key.** A value is dropped, never redacted and sent, if it contains:
   * a JWT;
   * a bearer token;
   * an Expo push token;
   * an e-mail address;
   * a card number (Luhn);
   * a phone number;
   * a passport-like number;
   * free text (any whitespace).

| The request said never log | How |
|---|---|
| Passport information | No such property; passport-like values dropped anywhere |
| Payment data | No such property; card numbers (Luhn) dropped anywhere |
| Private concierge text | Concierge events carry only the kind of request; free text is dropped anywhere |
| Medical details | Service requests carry only their category (`special-assistance`); preferences only the group; free text dropped |
| Authentication tokens | JWTs, bearer and push tokens dropped anywhere; no auth property exists |

**Envelopes** (`AnalyticsEnvelope`) carry:

* the event and its screened properties;
* a time **to the minute**;
* a random **session id**, new each launch and not tied to the guest;
* the app's version, platform and mode;
* the **names** of any dropped properties, for monitoring the instrumentation.

There is **never a guest, reservation or user id**.

## Consent

Consent is the guest's own switch: **Profile → Privacy → Anonymous app analytics** (`privacy.analytics`).

* **Until it is read**, events wait on the device, at most 100.
* **Off:** waiting events are discarded and nothing more is kept.
* **On:** waiting events are sent.

The fictional guest has it **off**, so the demo sends nothing until it is switched on.

Batches go when 20 events are waiting, every 15 seconds, and when the app goes to the background. A provider that fails loses that batch; analytics never retry on a guest's phone and never surface an error.

## Providers: replacing the vendor

```ts
interface AnalyticsProvider { readonly name: string; send(batch: AnalyticsEnvelope[]): Promise<void>; }
interface AnalyticsService { track(event, props): void; screen(path): void; setConsent(granted): void; flush(): Promise<void>; }
```

| Provider | Use |
|---|---|
| `NoopAnalyticsProvider` | Production until a vendor is chosen |
| `ConsoleAnalyticsProvider` | Development: each event to the logger (`app.analytics`) |
| `MemoryAnalyticsProvider` | Tests |
| `FanOutAnalyticsProvider` | Several destinations; one failing does not stop the others |

**To add a vendor**, write one class that maps `AnalyticsEnvelope` to the vendor's call, and choose it in `src/services/registry.ts`. Nothing else changes. The vendor's own SDK must not auto-collect: no device ids, advertising ids, IP-based location or session replay. It should only receive what the provider passes it. A vendor key that must stay secret belongs in a backend relay, not in the app.

| Piece | File |
|---|---|
| Events and envelope | `src/domain/analytics.ts` |
| Allow-list and screening | `src/services/analytics/schema.ts` |
| Service (consent, batching) | `src/services/analytics/PrivacyAnalyticsService.ts` |
| Providers | `src/services/analytics/providers.ts` |
| Service taps | `src/services/analytics/withAnalytics.ts` |
| Screens, consent, flushing | `src/features/analytics/AnalyticsTracker.tsx` (in the root layout) |

## Tests

* **`check:analytics`** (59 checks):
  * the ten events, and no declared property that could carry something private;
  * the filter: undeclared keys; passport, card, JWT, bearer, push token, e-mail, phone and free text, in any property; label and count shapes;
  * every real recommendation and experience id passes;
  * route patterns;
  * consent (waiting, refusing, withdrawing, bounded);
  * envelopes (minute precision, no guest anywhere, dropped names, unlinkable sessions);
  * screen dedupe; batches; a failing vendor; fan-out; malformed calls never throwing;
  * the taps over the mock services. A concierge message, a medical service request, a spa request and a booking note, each containing a passport number, a card, a JWT and a medical condition, are recorded by kind and category with **none of it** in what is sent. Preference changes are recorded by group only. A failed call is not an event.
* **Browser** (`histtest`):
  * nothing is sent while the guest's switch is off;
  * once it is switched on, Save, screen views (each once, as patterns), concierge opened and recommendations are recorded;
  * no guest or reservation ids appear;
  * no page errors.
