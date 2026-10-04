# 21 · Performance

Every change below fixes a problem that was measured first. Each was measured again afterwards. Areas with no measurable problem were left alone, and the reasons are recorded at the end.

## How it was measured

| What | How |
|---|---|
| Bundle and app size | `expo export -p web` with source maps; bytes per package, files per asset |
| Renders | A development build with React's DevTools hook: commits and component renders per interaction. Subtrees React reused untouched are skipped, as DevTools does. |
| Interaction latency | Production build, CPU throttled 4× (a mid-range phone), Event Timing API: input to next paint, the measure behind INP |
| Service calls | The service instrumentation's per-call log, per screen visit |
| Network requests | `scripts/supabase/request-profile.ts`: each screen's calls against real PostgREST, counting HTTP requests; part of `npm run test:supabase` |
| Database at scale | `supabase/tests/90_scale_probe.sql`. Another voyage's fleet-scale volume is added: 200k messages and notifications, 100k requests and bookings, 20k reservations. The guest's own queries are then timed with `EXPLAIN ANALYZE`, as the guest, through RLS. Run with `SCALE_PROBE=1 npm run test:supabase`. |
| Memory | JS heap after forced GC, over 15 rounds through all five tabs; DOM node count |

## Findings and fixes

### Bundle size and app size

**Found.** The JS bundle was 2.60 MB minified, and the app shipped 18 MB of assets.

* Importing from `@expo/vector-icons` bundles every icon family's glyph map, about 520 KB of source, for the one family used (Ionicons). It also packages every family's font file.
* Importing from `@expo-google-fonts/inter` and `…/cormorant-garamond` references all 28 weights, so all 28 ship, in the web export and in the iOS and Android binaries alike. Six are used.

**Changed.** Ionicons is imported from `@expo/vector-icons/Ionicons`, and each font face from its own path, e.g. `@expo-google-fonts/inter/400Regular`.

| | Before | After |
|---|---|---|
| JS bundle, minified | 2.60 MB | 2.17 MB (−17%) |
| JS bundle, gzipped | 717 KB | 581 KB (−19%) |
| Exported app, incl. fonts and icons | 18 MB | 5.4 MB (−70%) |
| Font files shipped | 41 | 7 (the 6 faces + Ionicons) |

`check:perf` fails the build if a package index import returns.

### Network requests and caching

**Found.** Home in Supabase mode made **111 HTTP requests**, and 25 distinct reads were repeated within that one load. The composed services rebuild the overview and profile they need: occasions (31 requests), notifications (38) and the recap. The reservation, voyage, embarkation and port calls were each fetched 5 times; the guest record and personal details 8 times.

**Changed: identical reads in flight share one request** (`src/services/remote/coalescingFetch.ts`, in the Supabase client).

* An identical PostgREST read, meaning the same URL, the same signed-in user and the same representation, made while the first is still on its way, waits for that one.
* **Nothing is reused once it has arrived.** Writes, write RPCs and Edge Functions that may write are never shared, and they stop later reads joining earlier ones. Errors are never reused, and a different user never shares an answer.

**Rejected: a two-second reuse window.** It would have taken Home to 34 requests, but the integration tests caught a stale read with it. A guest re-listed recovery notices right after the server recorded one, and got the cached empty list. A reload triggered by a change made elsewhere could have done the same in the app. All 238 integration checks now run through the coalescing fetch, so a shared read that hid a write would fail them.

| Requests per screen load | Before | After |
|---|---|---|
| Home (fresh) | 111 | 47 |
| Home (with a recovery notice) | 141 | 54–70 (median 69) |
| Voyage | 32 | 19 |
| Discover | 23 | 19 |
| Concierge | 30 | 26 |
| Profile | 32 | 23 |

**Found: refresh on focus.** Every return to a tab refetched everything. For Home that meant 13 service calls (about 47 requests in Supabase mode) and some 4,300 component renders on each tab switch.

**Changed: refresh on focus only when something may have changed** (`useRefreshOnFocus`, `src/services/dataVersion.ts`). A screen refreshes on return when the guest changed something through any service since it last loaded, or when its data is over 30 seconds old. Bookings, requests, preferences and messages all count; the instrumentation sees every call. Live changes still arrive through their own subscriptions.

| Return to Home, nothing changed | Before | After |
|---|---|---|
| Service calls | 13 | 0 |
| Component renders | 4,331 | 130 |

**Guarded.** `request-profile.ts` budgets the requests each screen's services issue (deterministic), so an N+1 or a new query per row fails `test:supabase`. It also fails on any read without a row filter (below).

### Database queries

**Found at scale** (`SCALE_PROBE=1`):

| Query, as the guest through RLS | Time |
|---|---|
| Concierge thread, notifications, requests, bookings (the app's queries, filtered) | 1.1–1.5 ms each, with 200k other rows |
| A table read with no filter, leaving RLS to filter | 0.9 s to over 15 s |
| **The guest's reservations (on every app start), as written** | **1,052 ms** with 20k other reservations |
| The same, filtered by the guest's party | **1.1 ms** |

`getUpcomingReservation`, `listReservations` and `getPastVoyages` read every reservation and filtered in JavaScript. RLS therefore checked every reservation in the fleet: about a second added to every launch at fleet scale, growing with each voyage sold.

**Changed.**

* The reservations query is filtered by the guest's party (`reservation_guests!inner`, through its `guest_id` index). The results are the same; the integration checks pass unchanged.
* `request-profile.ts` now fails on any read without a row filter.
* **Index audit** (`supabase/tests/40_index_audit.sql`, part of the SQL tests): every foreign key has an index leading with its columns.
  * One was missing where a query filters: `voyage_feedback(reservation_id)`, which crew read and RLS checks. It is added in `20261013000000_performance.sql`.
  * The other 13 are audit columns (`created_by`, `decided_by`, …) that no query filters on. They are listed by name, so a new foreign key must be indexed or deliberately listed.

### Unnecessary renders and large lists (Discover)

**Found.** On a 4× throttled CPU:

| Interaction | Input to paint | Renders |
|---|---|---|
| Save an experience | 360 ms | 2,896 |
| Open Refine | 352 ms | 3,803, opening and choosing together |
| Back to all ports | 392–480 ms | n/a |

Anything over 200 ms is poor responsiveness. The causes:

* every card re-rendered on any Discover state change;
* the screen's `request` callback was recreated on every render, and `toggleSave` changed identity on each save;
* bringing 26 filtered-out cards back meant mounting them all before the next paint.

**Changed.**

* `ExperienceCard` is memoised, `request` is stable, and `toggleSave` reads the saved set through a ref.
* The results list is deferred (`useDeferredValue`): the chip paints at once and the list fills in work that yields to the next tap.

| | Before | After |
|---|---|---|
| Save: renders | 2,896 | 376 |
| Save: input to paint | 360 ms | 104–136 ms |
| Open Refine | 352 ms | 104–136 ms |
| Back to all ports | 392–480 ms | 80–104 ms |
| Tab switches | 88–304 ms | 48–160 ms |
| Typing in the concierge | 64 ms (7 renders per keystroke) | 48 ms, unchanged |

Every interaction measured is now under 200 ms on the throttled CPU.

### Memory

**Measured.** JS heap after GC over 15 rounds of all five tabs: 24.7 → 28.5 MB before, 22.9 → 24.5 MB after (fewer cached renders and fonts). It levels off in both cases, and the DOM node count is constant.

At idle, Home has 0 commits in 10 seconds: no timers or subscriptions render while nothing happens. The analytics flush interval, continuity subscription, skeleton animation and live listeners all clean up on unmount. **No leak; nothing changed.**

## Reviewed, no measurable problem, left alone

* **State management.** The service and journey providers re-render nothing at idle. Typing re-renders only the composer, about 7 components per keystroke. A state library or more context splitting would add complexity for no measured gain.
* **Navigation.** Tabs mount on first visit and stay mounted (heap above); transitions are native. Tab switches measure 48–160 ms throttled.
* **Image loading.** No remote images ship today: brand-tone gradients stand in until DAM photography arrives. `expo-image` caches in memory and on disk by default, and fades only when reduce motion is off. When the DAM is connected:
  * request renditions sized to the frame;
  * give the hero `priority="high"`;
  * measure again.
* **Long lists.** The concierge thread, notifications and request history render in a `ScrollView`, which is fine at today's sizes. Discover's 28 cards are handled above. Move a list to `FlatList` when one regularly passes about 150 items (a long voyage's concierge thread is the first candidate). Measure first.
* **Splitting the bundle by mode.** Supabase's client (about 840 KB of source) is in the mock build too. On iOS and Android there is one Hermes bundle either way, and the client is needed in production, so this is not worth the complexity.

## Checks

* **`npm run check:perf`** (41 checks, in `verify`):
  * one icon family and six font faces, never a package index;
  * coalescing: concurrent reads shared; nothing reused after arrival; users, representations, writes, write RPCs and possibly-writing functions never shared; errors never reused;
  * the read/write split behind refresh on focus;
  * the memoised card, its stable callback and the deferred list.
* **`npm run test:supabase`** also runs:
  * the index audit;
  * the request profile: budgets per screen, no unfiltered reads, and the shared requests reported as a range;
  * optionally, the scale probe (`SCALE_PROBE=1`).
* **Browser harnesses** (outside the repository): the render and memory probe, and the interaction-latency probe.
