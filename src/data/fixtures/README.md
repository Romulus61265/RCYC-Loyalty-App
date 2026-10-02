# Development dataset (fictional)

**`dev-laurent-evrima-2027-05`**: Alexander and Camille Laurent, Grand Suite 612 aboard *Evrima*, sailing Barcelona → Palma de Mallorca → (at sea) → Saint-Tropez → Monte Carlo (overnight) → Portofino → Rome, from 15 to 22 May 2027. Their 20th wedding anniversary falls on 20 May, in Monaco.

> Everything here is **fictional**: the guests, crew names, bookings, flight numbers, prices and privileges. Privileges are illustrative and are **not** actual Marriott Bonvoy benefits. *Evrima* is used as a name only; its specifications and venues are illustrative. Real places (Sagrada Família, Villa Ephrussi and so on) appear only for realism.

## How it is kept separate from production

| Safeguard | Where |
|---|---|
| Only `src/services/mock/*` may import this folder | `eslint.config.js` blocks imports from screens, components, hooks, remote adapters, contracts, core and config |
| Every record ID is `dev_`-prefixed, and integration records carry `source.system = 'mock'` | Checked by `npm run check:fixtures` |
| E-mail values use the reserved `example.com` domain (RFC 2606) | Checked |
| `meta.fictional: true`, `meta.allowedConsumers: 'mock-services-only'` | `index.ts` |
| Production adapters read only from the backend-for-frontend, never from here | `src/services/remote/*` |
| The registry warns if a production build runs on mock services | `validateEnv()` |

## Files

| File | Contents | Typed by |
|---|---|---|
| `types.ts` | `DevDataset` and its section interfaces | — |
| `ids.ts` | Stable `dev_` IDs | — |
| `guest.ts` | Profile, preferences, companion, occasions, Bonvoy membership, relationship, privileges | `DevGuestData` |
| `voyage.ts` | Yacht, Grand Suite, 8-day itinerary, reservation, embarkation, documents, flights, 3 past voyages | `DevVoyageData` |
| `catalogue.ts` | Experiences aboard and ashore, Discover collections, destinations | `DevExperienceData` |
| `bookings.ts` | 7 dinners, 3 spa appointments, 6 private excursions, 2 transfers, and the day-by-day programme | `ExperienceBooking[]`, `DaySchedule[]` |
| `concierge.ts` | Suite Ambassador, greeting, suggested questions, 5 service requests, prior conversation | `DevConciergeData` |
| `communication.ts` | 3 in-app alerts and 11 notifications (6 delivered, 5 scheduled) | `DevCommunicationData` |
| `personalization.ts` | 17 signals from past voyages, 5 guest recommendations and 3 crew-only ones | `DevPersonalizationData` |
| `tones.ts` | Brand-tone gradients standing in for imagery | — |

Entity shapes come from `src/domain`, so mock services return exactly what enterprise adapters will.

## Reference "now"

The dataset is built around **11 May 2027, 09:00 in Miami**, four days before embarkation, in the *prepare* phase. Mock services use this moment unless `EXPO_PUBLIC_DEMO_NOW` is set; for example, `2027-05-20T10:00:00+02:00` shows the anniversary morning aboard.

## Changing the data

1. Edit the relevant file.
2. Run `npm run check:fixtures`. It runs 75 checks covering references, port windows, overlaps, flights against transfers, totals, conformance to the product brief, and concierge routing for every suggested question.
3. Run `npm run verify` before committing.
