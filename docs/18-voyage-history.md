# 18 · Voyage history

Every past voyage, as the guest would remember it and as we learned from it. The same records are the personalization engine's **history**: what the guest did before shapes what we suggest next.

**Run it.** Go to **Profile → Voyage History**, then tap a voyage or **Your voyage history**. The routes are `/history` and `/history/[id]`.

## What each voyage shows (`/history/[id]`)

| Section | Content | Rule |
|---|---|---|
| Header | The voyage name and region, with **Yacht · Dates · Suite** ("Evrima · 31 August – 7 September 2024 · Grand Suite 612") | From the voyage and the guest's record of it |
| Destinations | "Dubrovnik, Hvar and Venice", each with its country | In the order sailed |
| Experiences | Excursions and spa, in date order, with where and when ("Under sail on a classic yacht · Hvar · 2 September") | Only what the guest did. When they told us something, it is shown kindly: *"You told us it felt crowded, so we have kept to private guides since."* |
| Dining highlights | "The Chef’s Counter, with the wine pairing" | Dining moments from that voyage |
| Saved preferences | What we learned on that voyage ("A window table each evening"), each **Kept** or **Noted** | **Kept** means it is still in the guest's preferences today; **Noted** means they have changed it since. The live preference always wins. |
| Memories | "Taking the helm of a classic yacht off Hvar" | The guest's own moments, in their words |
| Photographs | "Photographs from this voyage will appear here. Your Suite Ambassador can add those the crew took, with your permission." | **A placeholder.** No photographs are invented and none are stored yet. |

The list (`/history`) reads **"Where you have sailed with us"**, with the voyages newest first and a summary sentence: "Three voyages, 24 nights, aboard Ilma and Evrima."

## Previous behaviour as personalization input

`PastVoyageRecord.moments` with a `weight` become the engine's `history` items (`historyFromVoyages`, shared by the app and the Edge Function). `mergeHistory` keeps the voyage records and adds only those observed history signals that are not already among them. So:

* the mock (`MockPersonalizationService`) and the server (`personalization-next-best`, which reads `voyage_history` with the service role) give the same recommendations;
* the eight history signals that used to sit in `personalization.ts` now live on their voyages (`voyageHistory.ts`), with the **same ids**. The engine's output is byte-for-byte identical, and `check:history` proves it;
* moments without a weight are shown to the guest, but not learned from.

For example, the helm off Hvar still steers the sail recommendation, and its reason still names Hvar. The crowded Santorini tour (rated 2) still steps group formats back.

## Contracts and code

```ts
interface VoyageHistoryService {
  listVoyages(guestId): Promise<VoyageHistoryEntry[]>;           // newest first
  getVoyage(guestId, voyageId): Promise<VoyageHistoryEntry>;     // not_found if not theirs
}
```

| Piece | File | Notes |
|---|---|---|
| Domain | `src/domain/voyageHistory.ts` | `PastVoyageRecord` (what is stored), `VoyageHistoryEntry` (what is shown) |
| Fixtures | `src/data/fixtures/voyageHistory.ts` | Three fictional voyages (Caribbean, Adriatic, Aegean) |
| Service | `src/services/history/ComposedVoyageHistoryService.ts` | Over `VoyageService` and `GuestProfileService`, in both modes. Records come from a `VoyageHistoryStore`: `MemoryVoyageHistoryStore` (mock) or `SupabaseVoyageHistoryStore`. |
| Engine input | `supabase/functions/_shared/personalization/history.ts` | `historyFromVoyages`, `mergeHistory` |
| Screens | `src/features/history/` | `VoyageHistoryScreen`, `PastVoyageScreen`, `historyModel` (lines and the summary) |

**Migration `20261012000000_voyage_history.sql`.** `voyage_history` (guest × voyage) holds the yacht name, suite label, destinations, moments, saved preferences and photos (JSON).

* The guest reads their own.
* Crew assigned to the guest's reservation read it.
* Nobody writes it from the app: the records come from the reservation, POS, spa and shore systems, through the service role.

## Tests

* **`check:history`** (25 checks):
  * the list order and summary;
  * not_found for an unknown voyage;
  * every field of a voyage: yacht, dates, places with "the", suite, experiences in order, dining, memories and the photographs placeholder;
  * the Santorini note;
  * saved preferences turning from Kept to Noted when the guest changes them;
  * `historyFromVoyages` and `mergeHistory`;
  * the engine giving exactly what the old signals gave;
  * history changing recommendations and their reasons, with Hvar remembered by name.
* **`test:supabase`** (5 checks):
  * the history from the database matches the mock;
  * one voyage in full;
  * another guest reads nothing;
  * crew read it;
  * guests cannot write it.

  Server personalization parity, which now includes voyage history, is checked by the existing recommendation checks.
* **Browser** (`histtest`):
  * Profile → history → the Adriatic, section by section;
  * the Aegean;
  * 320 px.
