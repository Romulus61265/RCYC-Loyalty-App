# 23 · Demo Mode

A presenter-led demonstration for senior executives. It runs on the fictional dataset, follows the same 15 steps every time, and resets with one tap.

| | |
|---|---|
| Guest | Alexander Laurent (sailing with Camille) |
| Voyage | *Balearics & the Riviera* aboard Evrima, Barcelona → Rome, 15–22 May 2027, Grand Suite 612 |
| Moment | Embarkation morning, 07:30 in Barcelona. The guests are in the air on AA 7412. |
| Data | Fictional, mock services only. Nothing leaves the device. |

## Turning it on

`DEMO_MODE` is the `EXPO_PUBLIC_DEMO_MODE` variable:

```sh
# A demonstration build (device or web)
EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_SERVICE_MODE=mock EXPO_PUBLIC_DEMO_MODE=executive npx expo start --clear
EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_SERVICE_MODE=mock EXPO_PUBLIC_DEMO_MODE=executive npx expo export -p web --clear
```

* **Values:** `off` (the default) and `executive`. An unknown value is reported and leaves demo mode off.
* **Mock services only.** On Supabase, demo mode is reported and ignored.
* **Never in production.** A production build must run on Supabase (docs/22, H6), so it cannot run a demonstration.
* **Without rebuilding:** any non-production web build opens the same demonstration at `?demo=executive`. The query is read once, when the app opens, so in-app navigation keeps it.

## The presenter's controls

During a demonstration, a slim bar sits above every screen: **Demo · fictional data**, with **Presenter ›** on the right. It takes its own place in the layout, and the top safe area, so it never covers content. It opens the **Presenter** screen (`/demo`), which holds:

* the script: every step, with what to show and say, and **Go to step N**;
* **Report the flight delay** (step 13), the one step the presenter performs rather than shows;
* **Reset the demonstration**.

The bar says the data is fictional, so the audience is never in doubt. Outside a demonstration, neither the bar nor the screen appears.

## The journey

The steps follow the app's own navigation, so the presenter can simply tap through. The Presenter screen is there to jump or recover.

| # | Step | Where | What the audience sees |
|---|---|---|---|
| 1 | Open Home | Home | "Good morning, Alexander". On your way to the yacht: today, Barcelona. |
| 2 | Titanium recognition | Home | Marriott Bonvoy Titanium Elite: fourth voyage, Lifetime Platinum, 7 privileges |
| 3 | The upcoming voyage | Home | Balearics & the Riviera, 15–22 May 2027, and the journey phases |
| 4 | The Grand Suite | Home, Your voyage | Grand Suite 612, Deck 6, 62 m² plus an 18 m² terrace, with Suite Ambassador Elena Moreau |
| 5 | A personalised recommendation | Home, Chosen for you | Each with its reason, e.g. "You loved the Barolo vertical aboard Evrima in 2023." |
| 6 | Open Voyage | Voyage tab | Overview: yacht, suite, ambassador, embarkation, documents all complete |
| 7 | The itinerary | Voyage › Itinerary | Eight days, port by port: times, what is booked, what has been chosen |
| 8 | Open Mallorca | **Explore Palma de Mallorca** | Day 2 in full: times, local time, the day's plan |
| 9 | The private vineyard | Palma, Chosen for you | *Binissalem Vineyards & Lunch in Deià*, private: "Mantonegro reds with the winemaker himself: you loved the Barolo vertical aboard Evrima in 2023." **Arrange with the concierge** leads to step 10. |
| 10 | Open Concierge | Concierge | The digital concierge, with Elena a tap away |
| 11 | Ask about the anniversary | Tap "Help me celebrate my anniversary." | The 20th, on Thursday 20 May in Monte Carlo |
| 12 | Curated options | The reply | What is already in place (Villa Ephrussi, the couples ritual, a private terrace dinner) and more ideas (an atelier hour, flowers, planning with Elena, keeping it a surprise). Offered, never booked, until the guest taps. |
| 13 | The inbound flight is delayed | Presenter › **Report the flight delay** | AA 7412 reported two hours late. The app returns to Home. The flight status is simulated: no flight-data service is connected, and the app says so. |
| 14 | Travel arrangements adjust themselves | Home, Your arrival › **See what changed** | Transfer re-timed to 12:00, driver following the flight, embarkation team notified, arrival expected 15:30, the Sagrada Família moved to after landing |
| 15 | Service continuity | Concierge | Elena writes to them herself: the new landing time, the driver, the moved visit. Nothing for the guest to do. |

## Deterministic by construction

* **The clock is pinned** to 07:30 on 15 May in Barcelona, so the journey phase, "today" and the countdowns never move. Message timestamps follow the device's time zone. Set the demonstration device to Central European time to show 07:30.
* **The data is prepared, not edited.** `src/data/fixtures/executiveDemo.ts` derives the demonstration from the development dataset. It changes three things, so each step shows exactly one:
  * the vineyard day in Mallorca is unbooked, so it can be the recommendation;
  * the paperwork is complete, so no overdue questionnaire competes for attention;
  * nothing is late until the presenter says so.

  Being derived, the two datasets cannot drift apart.
* **Nothing happens on a timer.** The development `?demo=flight-delay` reports the delay a few seconds after opening. The executive demonstration waits for the presenter. The report waits until every handler has adjusted the arrangements, so Home is already updated when it appears.
* **The concierge offers and never acts on words** (docs/22, H3), so a stray phrase cannot change the story.

## Resetting

**Reset the demonstration** on the Presenter screen puts everything back to its first moment:

* bookings, requests, messages, the flight and the arrival plan;
* anything the presenter changed along the way.

How it works:

* Mock services copy what they read, so a fresh set of services is a fresh demonstration. The reset builds a new set, and the `ServiceProvider` remounts every screen with it.
* It also wipes this device's `rcyc.*` storage (`security/deviceData`), so saved preferences return to the dataset's.
* It returns to Home, ready for step 1.

Closing and reopening the app, or reloading the web page, does the same.

## Checks

| | Covers |
|---|---|
| `npm run check:demo` (29 checks, in `verify`) | `DEMO_MODE` parsing and refusal outside mock services and in production. The executive dataset: derived without changing the development one, consistent (no dangling bookings or recommendations), Alexander, Evrima, the Grand Suite, Titanium, the unbooked private vineyard with its reason, no outstanding paperwork. The pinned clock; two runs showing the same bookings and recommendations; one run's changes not reaching the next. The script: 15 steps in the briefed order, on routes that exist, with only step 13 performed. |
| Browser walk-through (outside the repository, with the other browser suites) | All 15 steps through the app, twice; the in-app reset; the demo bar absent outside a demonstration (49 checks) |

## Files

| File | Role |
|---|---|
| `src/config/env.ts` | `EXPO_PUBLIC_DEMO_MODE` (`demoMode`), validated |
| `src/services/mock/support.ts` | `mockDemo()`: the URL or `DEMO_MODE`; the pinned clock; which dataset the mocks read |
| `src/data/fixtures/executiveDemo.ts` | The demonstration's dataset, derived |
| `src/services/mock/executiveDemoScript.ts` | The 15 steps |
| `src/services/contracts` (`DemoService`), `src/services/demo.ts`, `src/services/registry.ts` | The presenter's controls: script, flight delay, reset; inert outside a demonstration |
| `src/services/ServiceProvider.tsx` | Builds fresh services on reset |
| `src/features/demo/` and `src/app/demo.tsx` | The demo bar (`DemoFrame`) and the Presenter screen |
| `src/features/voyage/PortScreen.tsx` and `src/app/port/[id].tsx` | A port in full: opened from the itinerary in every mode, not only in the demonstration |
