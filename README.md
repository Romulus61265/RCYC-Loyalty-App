# Yacht Collection: Guest Companion

A mobile digital guest experience concept for an ultra-luxury yacht cruise brand, modelled on The Ritz-Carlton Yacht Collection. It recognises the guest through **Marriott Bonvoy** and orchestrates the whole journey (dream → book → prepare → embark → sail → explore → return → remember → rebook) with voyage management, concierge, curated discovery and continuous service.

> **First iteration.** It contains the architecture and an application shell. Every enterprise service is mocked behind interfaces that can be replaced by enterprise APIs without touching the presentation layer.

## Run it

```bash
npm install
cp .env.example .env        # optional: defaults to mock mode
npx expo start              # press i / a / w for iOS, Android or web
npm run verify              # typecheck + lint (incl. architecture boundaries)
npm run doctor              # expo-doctor dependency health
```

The manual QA steps are in [docs/manual-testing-checklist.md](docs/manual-testing-checklist.md).

The demo is pinned to **15 October 2026**, two days before embarkation. Change `EXPO_PUBLIC_DEMO_NOW` to explore other journey phases.

### Demo story (fictional)

**Isabelle Laurent-Hale** (Bonvoy Titanium Elite, Lifetime Platinum) and her husband **James** sail aboard the fictional yacht **Aurelia** in **Loft Suite 712**, on *Riviera & the Ligurian Coast*. The route runs Barcelona → Saint-Tropez → Monte Carlo (overnight) → Portofino → Portovenere → Bonifacio → Rome, from 17 to 24 October 2026. It is their third voyage, and their 25th wedding anniversary falls in Portofino. Their Suite Ambassador is Sophie Marchetti.

In **Concierge**, try:

* What is planned for tomorrow?
* Can you move my dinner reservation?
* What private experiences are available in Monte Carlo?
* Can you arrange transportation?
* What benefits do I have because of my Bonvoy status?
* Can I arrange something special for my anniversary? *(This one hands the conversation to Sophie.)*

## Screens

| Home | Voyage | Discover | Concierge | Profile |
|---|---|---|---|---|
| ![](docs/screenshots/home.png) | ![](docs/screenshots/voyage.png) | ![](docs/screenshots/discover.png) | ![](docs/screenshots/concierge-chat.png) | ![](docs/screenshots/profile.png) |

*Captured from the web build. Imagery uses brand-tone placeholders until DAM photography is supplied through `MediaAsset.uri`.*

## Architecture

| # | Document |
|---|---|
| 1 | [Product architecture](docs/01-product-architecture.md) |
| 2 | [Enterprise integration architecture](docs/02-enterprise-integration-architecture.md) |
| 3 | [Domain model](docs/03-domain-model.md) |
| 4 | [Database schema](docs/04-database-schema.md) · [SQL](supabase/migrations/20261002000000_init.sql) |
| 5 | [Service interfaces](docs/05-service-interfaces.md) · [contracts](src/services/contracts/index.ts) |
| 6 | [Application folder structure](docs/06-application-folder-structure.md) |
| 7 | [Design system](docs/07-design-system.md) · [tokens](src/theme/tokens.ts) |
| 8 | [Navigation model](docs/08-navigation-model.md) |
| 9 | [Security architecture](docs/09-security-architecture.md) |
| 10 | [Personalization architecture](docs/10-personalization-architecture.md) |

### Replacing mocks with enterprise APIs

Screens depend only on `src/services/contracts`, which they reach through `useServices()`. Implementations are chosen in one place, `src/services/registry.ts`, from `EXPO_PUBLIC_SERVICE_MODE` (`mock | supabase | enterprise`). `MarriottBonvoyService` is included as the first remote adapter, implementing `LoyaltyService` against the backend-for-frontend.

## Stack

* **Mobile:** Expo SDK 57 · React Native 0.86 · TypeScript (strict) · Expo Router (typed routes) · expo-secure-store · expo-image
* **Backend (MVP):** Supabase (PostgreSQL + RLS, Auth, Storage, Realtime, Edge Functions on Deno)

## Supabase

```bash
supabase start && supabase db reset          # applies migrations
supabase functions serve                     # concierge-respond, journey-events, personalization-next-best
supabase secrets set CONCIERGE_AI_PROVIDER=mock PSEUDONYM_SALT=... JOURNEY_EVENTS_HMAC_SECRET=...
```

To run the RLS smoke test against plain Postgres, see [docs/04](docs/04-database-schema.md#row-level-security-model).

## Security notes

* Only `EXPO_PUBLIC_*` values are bundled into the app. These are the Supabase URL and anon key, both protected by RLS.
* Service-role, Bonvoy, AI and webhook secrets live only in Edge Function secrets.
* Tokens are stored in the Keychain or Keystore.
* All data is fictional.
