# 22 · Security Audit

An application security review of the guest app, the Supabase database and the Edge Functions. It covers credentials, storage, authentication, authorization and RLS, PII, logging, API abuse, injection, dependencies, data leakage, client-side trust and the AI concierge.

Each finding was confirmed against the code, and for the database through PostgREST as the affected user. **Critical and High findings are fixed** below, with an explanation of each remediation and a test that would fail if it came back. Medium and Low findings are recorded with a recommended remediation and left for planned work.

| Severity | Count | Status |
|---|---|---|
| Critical | 0 | None found |
| High | 7 | All fixed |
| Medium | 11 | Documented |
| Low | 19 | Documented (one fixed with a High) |

**Severity scale.** *Critical:* any signed-in user, or anyone at all, reaches other guests' data or takes over accounts at scale with no precondition. *High:* a realistic attacker (a party member, any crew member, a tampered client, a prompt) reaches data or actions they should not have, or a misconfiguration ships the demo sign-in. *Medium:* needs a specific position or condition, or the impact is limited. *Low:* defence in depth, hardening, or depends on hosted settings.

## Scope and method

* **Read:** every migration and policy; every Edge Function and the concierge pipeline; the service registry, configuration, storage, auth and logging code; the dependency tree (`npm audit`).
* **Exercised:** every RLS finding was reproduced as the affected user through PostgREST (`npm run test:supabase`). Concierge findings were reproduced against the pipeline with fake ports (`check:concierge-server`). Build findings were reproduced with a real web export.

## What was already done well

These held up under review and are worth keeping:

* **Secrets.** No credentials in the repository or the bundle. The app refuses to start with a service-role key. `check:supabase` scans for privileged keys and non-public variables.
* **Tokens.** Tokens live in the Keychain or Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). The web preview keeps them in memory only. They are never logged.
* **Database.** Raw PII is kept in `private.guest_pii`, out of PostgREST's reach. Every table has RLS, which the migrations themselves check. Views are `security_invoker`, and `SECURITY DEFINER` functions pin `search_path`. `anon` has no grants. Guest writes go through narrow functions.
* **Injection.** No raw SQL is built anywhere. IDs are checked as UUIDs before they go into PostgREST `or=` or Realtime filters.
* **Edge Functions.** Callers are authorized from the JWT. Webhooks carry an HMAC with a replay window. There is no wildcard CORS.
* **Concierge, before this audit.** It already redacted typed PII, used pseudonymous handles, enforced structured output and grounding checks, and routed medical topics to people.

## Critical

None found.

## High (all fixed)

### H1 · Crew could read every guest in the fleet

**Found.** `guest_relationships` (value segment), `recommendations` (crew-only opportunities included) and `personalization_signals` were gated by `is_crew()`, which ignores the yacht. Any Suite Ambassador or concierge agent, on any yacht, could read every guest's segment, recommendations and behaviour signals. Separately, `crew_for_reservation()` treated a crew role with no `yacht_id` as fleet-wide for every role, so an onboard role inserted without a yacht saw every reservation.

**Fixed** (`20261014000000_security.sql`):

* The three policies now use `crew_for_guest(guest_id)`. Crew see a guest only while they serve one of that guest's reservations, on their yacht.
* `crew_for_reservation()` allows a role with no yacht only for `shore_ops` and `admin`. A Suite Ambassador or concierge agent with no yacht now sees nothing; before, they saw everything.
* A check constraint refuses new onboard roles with no yacht. It is `NOT VALID`, so existing rows are not rewritten silently and must be reviewed.

**Why this way.** The yacht is the unit a crew member is trusted with, and `crew_for_guest` already expressed that. Every crew-facing policy now goes through the same two functions, so the scope is decided in one place.

**Tested** (`test:supabase`):

* A Suite Ambassador on a yacht the guest never sailed sees none of that guest's relationship, recommendations, signals, messages or preferences.
* The guest's own yacht's ambassador still sees the relationship.
* An onboard role with no yacht is refused.

### H2 · Party members could read and forge each other's concierge threads

**Found.**

* Concierge conversations and messages were readable by the whole reservation party ("party or crew"). A companion could read the lead guest's private requests to the concierge.
* Through the guest insert policy, a party member could also post into someone else's thread.
* That policy left `author_name`, `intent`, `attachments`, `suggestions`, `classification` and `ai_confidence` to the client. A tampered client could post a message that looked like it came from "Elena, Suite Ambassador", with action cards of its choosing. The crew, and the AI on its next turn, would read it as context.
* Special-assistance (medical) service requests were visible to the whole party.

**Fixed:**

* **Conversations and messages:** readable only by their own guest and by crew serving the reservation ("own or crew").
* **Guest messages:** a guest may insert only into their own conversation, as `author = 'guest'` with their own `auth.uid()`, a body of 1–2000 characters, and every structural field empty. Names, intents, attachments and suggestions are server-written only.
* **Special-assistance requests:** visible to the guest they concern, to whoever raised them, and to crew. Other requests stay party-visible, because a suite repair concerns everyone in the suite.

**Why this way.** A concierge thread is one person's channel and can hold health, family or occasion details meant for no one else. Everything the AI and crew treat as structure has to come from the server, or it becomes an injection path into both.

**Tested.**

* A companion cannot read or post into the lead guest's thread.
* A guest cannot write `author_name`, `attachments` or `intent`; a plain message still works.
* Medical requests are visible to the guest and crew but not the companion. Other requests stay visible to the party.

### H3 · The AI concierge carried out transactions on the model's word

**Found.** When the model's structured output said `guest_confirmed: true`, the pipeline carried out the offered action itself: moving a booking or raising a request. That flag is the model's interpretation of free text. A prompt-injected message, or text the model misread (a quoted message, an injected preference note, "yes, but…"), could make a change the guest never confirmed. This is excessive agency (OWASP LLM08). The mock concierge did the same for typed confirmations.

**Fixed:**

* **Server.** Only the guest's tap acts. When the model reports a confirmation, the pipeline offers that same action back as a button ("Tap 'Move to 21:00' below…"). It records the transaction as `awaiting_tap`. The tap goes through `performAction`, as the guest, and the database checks it.
* **Code.** The pipeline no longer has an `execute` port, so no code path from model output to a write remains.
* **Mock.** The mock concierge behaves the same way, and the AI provider contract no longer carries a `perform` field.

**Why this way.** A model can be talked into anything, but a tap on a card the server rendered cannot be faked by text. The cost to the guest is one tap, and confirmation is the moment that tap belongs to.

**Tested.**

* In `check:concierge-server`, a steered model reporting `guest_confirmed` executes nothing. Its offer comes back as a tap card. A slot that has gone is not offered again.
* In `test:supabase`, the words change nothing, and the tap moves the booking.
* In `check:concierge`, "21:00, please" changes nothing until the tap.
* `check:security` asserts that no execute path exists.

### H4 · The concierge's cost could be run up

**Found.**

* The rate limit was a count of stored messages, checked before the model call. Parallel requests all passed the check before any was stored.
* There was no daily cap.
* Responses allowed `max_tokens: 16000`, against a reply that needs a few hundred.
* A replayed `requestId` was looked up without checking its owner, so one guest's id could return another guest's run.

**Fixed:**

* **Atomic allowance.** `concierge_take_slot()` takes a slot in one statement per counter (12 per 5 minutes, 150 per UTC day), before the model is called. Its table has RLS with no policies, and only the service role can call it.
* **Order of checks.** Replays are answered before a slot is taken, so a retry costs nothing.
* **Output.** Capped at 2,048 tokens.
* **Replays.** `findRun` matches the caller as well as the `requestId` (this also closes Low L-idempotency).

**Why this way.** Counting rows the request is about to create can never be atomic. An upsert counter is atomic under concurrency, with no locking in the function.

**Tested.** 15 concurrent `take_slot` calls yield exactly 12 slots. A guest cannot call `take_slot`. The pipeline refuses with 429 after its allowance.

### H5 · "AI off" did not take the AI off

**Found.** Crew can take a conversation over (`ai_enabled = false`), for a complaint or a sensitive moment. The pipeline ignored the flag and still sent the guest's words to the model and posted AI replies into a thread a person was handling.

**Fixed.** With `ai_enabled` false, the pipeline stores the guest's words, as the guest, under their RLS, and audits `humanOnly`. It returns `{ humanOnly: true }` without calling the model.

**Why this way.** A takeover exists so a person speaks for the yacht. It has to stop the model at the server, not just in a crew interface.

**Tested.** With AI off, there is no AI message and no model call, and the guest's words are kept (`check:concierge-server`, `test:supabase`).

### H6 · A release build could run on the demo sign-in

**Found.** An unset or misspelt `EXPO_PUBLIC_APP_ENV` silently became `development`, and `EXPO_PUBLIC_SERVICE_MODE` became `mock`. A production build with a missing variable would therefore ship `MockAuthService`, which signs anyone in as the demo guest and accepts any six-digit code. Enterprise mode composed the same mock auth, and nothing stopped it in production. Production on mock services only logged a warning.

**Fixed** (`src/config/env.ts`, `src/services/registry.ts`). The app now refuses to start, showing the calm error screen, when any of these holds:

* in a release build (`__DEV__` false), `EXPO_PUBLIC_APP_ENV` or `EXPO_PUBLIC_SERVICE_MODE` is unset or unknown;
* `production` runs on anything but `supabase`;
* `staging` runs on `enterprise`, whose identity adapter is not built.

A demo build must declare itself (`EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_SERVICE_MODE=mock`).

**Why this way.** Fail closed: a missing value must never quietly pick the least safe mode. Development is unaffected, because `__DEV__` builds still default.

**Tested.**

* `check:security` covers each combination.
* A real web export with neither variable set shows "The app isn't quite ready", not a signed-in demo.

### H7 · Health-related preferences were stored in plain text, and stayed after sign-out

**Found.** Outside Supabase mode, all preferences, including allergies (with severity) and mobility needs, were written to AsyncStorage, or to `localStorage` on the web. Both are unencrypted and readable by anyone with the device or a backup. Sign-out (`useJourney`) only called `auth.signOut()` and left every `rcyc.*` key behind for the next person to use the device.

**Fixed:**

* **Special-category groups** (`dietary`, `accessibility`, `SPECIAL_CATEGORY_GROUPS`) are never written to device storage. `LocalPreferencesRepository` keeps them in memory for the session. A record written by an earlier version is moved off the device the first time it is read. Supabase mode keeps them server-side, as before.
* **Sign-out wipes the device** (`src/security/deviceData.ts`). Every sign-out, including one whose network call fails, removes every `rcyc.*` key from device storage, clears the session's in-memory stores and removes the enterprise access token. A failing clearer neither stops the others nor blocks the sign-out.

**Why this way.** Encrypting AsyncStorage would still leave the key on the same device. Not writing the data is simpler and stronger. One prefix and one wipe mean a new local store is covered by default.

**Tested** (`check:security`). Allergies never appear in device storage, and the guest still sees them for the session. A legacy record is migrated. The wipe removes only `rcyc.*` keys and runs every clearer. The registry wipes at every sign-out.

## Medium (documented)

| # | Area | Finding | Recommended remediation |
|---|---|---|---|
| M1 | Authorization | Party members can cancel or change each other's bookings and requests. The write functions check `on_reservation`, not who booked. | Allow the change only to whoever booked it or the lead guest, and to crew. Audit changes made on someone's behalf. |
| M2 | Database | `iso_local(ts, tz)` raises on an invalid time zone. One bad `time_zone` value on a port call breaks every read that formats its times. | Validate `time_zone` against `pg_timezone_names` with a check constraint, and fall back to UTC in the function. |
| M3 | Authorization | Guest inserts may set request `priority`, `assigned_team`, booking times outside the experience's slots, and titles. | Derive priority and team server-side. Check times against availability in the insert function. Cap title length. |
| M4 | PII | `shareWithCrew` defaults to **true** when absent (`coalesce(..., true)`), so accessibility needs are shared with crew unless the guest opts out. | Default to false. Ask once, at the moment the need is entered. |
| M5 | Push | `register_push_device` upserts on `token`. Whoever registers a token takes its device over, and could receive another guest's lock-screen notices. | Refuse a token already held by another user (or require the old row to be retired). Bind tokens to the installation. |
| M6 | AI | Card text the model writes (titles and details on offered actions) is not screened by the guard, unlike the reply. | Run the same grounding and claim checks on every model-written string. Better, render card text from the offer's data only. |
| M7 | Functions | Scheduled jobs read with PostgREST's `max_rows = 200` and do not page, so fleet-scale runs silently process only the first 200 rows. | Page with `range()` until empty, or move the batch into a SQL function. |
| M8 | Auth | `signInWithOtp` returns a distinguishable error under rate limiting (429), which can hint that an address exists. | Map every OTP send outcome to the same response and delay. Rate-limit by IP at the edge. |
| M9 | Config | Production safeguards (log level, analytics provider) key on `appEnv`, not on the build. A staging build with `__DEV__` false logs at debug. | Derive verbosity from `__DEV__` and `appEnv` together. Never log at debug in a release. |
| M10 | Logging | `scrub()` is shallow. Nested objects passed to the logger keep their keys, e.g. `{ guest: { email } }`. | Recurse with a depth limit, and redact by key at every level. |
| M11 | Device | No screenshot or app-switcher protection on screens showing PII or documents. | `expo-screen-capture` on document and personal-details screens, and a privacy cover on backgrounding (already planned in docs/09). |

## Low (documented)

| # | Finding | Recommended remediation |
|---|---|---|
| L1 | Account linking by e-mail depends on hosted settings: confirmed e-mail, self-signup off. | Assert those settings in deployment checks. |
| L2 | `travel_companions.person_ids` and companion links are not checked against the reservation. | Validate them in the insert function. |
| L3 | `voyage_feedback.reservation_id` can be changed by its author after insert. | Make it immutable with a column grant or trigger. |
| L4 | Goodwill approval: two approvers deciding at once can both pass the limit check, and the approving role is not yacht-scoped. | Lock the proposal row (`for update`) and scope the role to the yacht. |
| L5 | The travel-documents bucket has no size or MIME limits. | Set `file_size_limit` and `allowed_mime_types` on the bucket. |
| L6 | `audit_log` blocks UPDATE and DELETE but not TRUNCATE by its owner. | Revoke TRUNCATE and add a statement trigger. The SIEM copy remains the record. |
| L7 | ~~A replayed concierge `requestId` was found without checking the caller.~~ | **Fixed with H4.** |
| L8 | Two identical concierge requests in flight at the same instant can both run, each within its allowance. | Insert the run row first with a unique `(user, request_id)`. |
| L9 | Request size is judged from `Content-Length`, which a client controls. | Read the body with a byte limit. |
| L10 | `personalization-next-best` returns rule ids and relevance scores, from which a guest can infer their segment. | Return only the guest-facing fields. |
| L11 | `personalization-next-best` has no rate limit. | Reuse the allowance table with its own bucket. |
| L12 | `journey-events`: a non-numeric timestamp passes as `NaN`; an unset secret is not refused at start; the body schema is loose. | Validate the timestamp and the event schema, and refuse to serve without a secret. |
| L13 | A degraded concierge escalates each failed turn, which can flood the team during an outage. | Coalesce escalations per conversation while degraded. |
| L14 | The concierge's `open` actions are validated less strictly than notifications' `safeRoute`. | Use `safeRoute` for both. |
| L15 | Push devices are not unregistered at sign-out. Native push is not shipped yet. | When native push ships, remember this device's id and call `unregisterDevice` from the sign-out wipe. |
| L16 | `isPrivilegedSupabaseKey` fails open when `atob` is missing. Hermes and browsers provide it. | Fall back to a small base64 decoder and fail closed. |
| L17 | MFA is enrolled for crew but not enforced for guests before travel documents. | Require AAL2 in the documents bucket policy and the screen. |
| L18 | The custom-scheme redirect (`rcyc://`) can be claimed by another app on Android. | Use verified App Links and Universal Links for auth redirects. |
| L19 | Dependencies: `npm audit` reports `braces`, `micromatch`, `node-forge` and `uuid`, all through build tooling (Expo CLI, xcode), none shipped in the app. It also reports `decode-uri-component` through `expo-router`'s `query-string`, which is shipped, but only with route parameters the app itself built. The fixed release is ESM-only and would break `require`, so it was not forced. | Take each fix as Expo publishes it. Run `npm audit --omit=dev` in CI and fail on new runtime advisories. |

## Checks

| Command | Covers |
|---|---|
| `npm run check:security` (21 checks, in `verify`) | H6 fail-closed configuration; H7 preferences off the device and the sign-out wipe; H3 no execute path in the app, mock or function |
| `npm run check:concierge-server` (in `verify`) | H3 tap-only actions under a steered model; H4 allowance before the model; H5 human-only conversations |
| `npm run check:concierge` (in `verify`) | The mock concierge acts on taps only |
| `npm run test:supabase` | H1 and H2 as each affected user through PostgREST; H4 concurrent allowance; H5 end to end |

## Building the app

A release build now declares its environment, or it does not start:

```sh
# Demo (web or device)
EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_SERVICE_MODE=mock npx expo export -p web
# Production: Supabase only
EXPO_PUBLIC_APP_ENV=production EXPO_PUBLIC_SERVICE_MODE=supabase EXPO_PUBLIC_SUPABASE_URL=… EXPO_PUBLIC_SUPABASE_ANON_KEY=… eas build
```

Metro caches transformed modules with the values inlined. When you change these variables between builds, pass `--clear` (`npx expo export --clear`, `npx expo start --clear`).
