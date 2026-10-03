# 17 · After the voyage: "Welcome home."

When the voyage is over, the app stops being an itinerary and becomes a keepsake. Home's hero reads **"Welcome home."** and leads to the voyage remembered: the days, the places, the moments the guest loved and a note from their Suite Ambassador. It also invites a few words, in the guest's own voice, and suggests where they might sail next.

**Run it.** Open the web build with `?demo=welcome-home`. The demo clock is 26 May 2027, at home in Miami, four days after Rome. Without the parameter (before the voyage), nothing post-voyage appears, and `/welcome-home` says it will fill once the voyage is over.

## When

The recap exists only in the journey phases after the voyage: `return-home`, `remember` and `rebook`. Before or during the voyage, `PostVoyageService.getRecap` returns `null`, and reflections are refused.

## What the guest sees (`/welcome-home`)

| Section | Content | Rule |
|---|---|---|
| Welcome | "Welcome home." *"Alexander, we hope the journey home was a gentle one. Here is your voyage, as we will remember it."* Then "Seven nights, six ports and four countries aboard Evrima, in Grand Suite 612." | From the voyage, yacht and suite |
| Voyage memories | A page per day ("Day 6 · Monte Carlo"): the anniversary first, then what took place, in order | **Only what took place**: completed bookings, or confirmed (or being arranged) ones whose time has passed. Transfers are not memories. A day with nothing reads "A day of your own"; the last day, "Farewells, and the journey home". **Private occasions never appear.** |
| Destinations visited | Each port once ("Monte Carlo · 19 – 20 May · Monaco"), with its line | From the itinerary and destinations |
| Favourite experiences | Until the guest chooses: "Perhaps these?" Then "Your favourite moments", which are their own | Suggested: the occasion, what was arranged for it, then the most personal private experience |
| Marriott Bonvoy | Tier and lifetime status; "Nights and points from this voyage will appear here once Marriott Bonvoy has posted them." "Not yet connected to Marriott Bonvoy." | **A placeholder.** No points or nights are invented; no Bonvoy integration exists. |
| A note from Elena | "Dear Alexander and Camille, …", then the anniversary, *"quietly, as you wished"*, signed | Rule-based, from the party, the occasion's recognition, the yacht and the ambassador |
| Your reflections | "Five short questions, each one optional. No ratings; just your voyage, in your words." Progress, or thanks once sent | See below |
| For your next voyage | Three voyages, each with a reason and the guest's own moment behind it ("Because you enjoyed …") | Ranked by interests (below) |
| Next voyage inspiration | The first of them, editorially: picture, standfirst, highlight, ports, and "Your preferences travel with you: a window table and private guides ashore, for what would be your fifth voyage with us." Then **Ask Elena about this voyage** | "Voyages shown here are illustrative in this preview." |

## The reflections (`/welcome-home/reflections`)

This is not a survey. There are no stars, no scales and no "how likely are you to recommend us". It asks one gentle question at a time. Every question is optional and the guest's place is saved as they go; "Save and finish later" is always there. The guest answers in their own words, and a person reads them.

| | Question | How |
|---|---|---|
| 1 of 5 | **Which moments stay with you?** | Their own memories, day by day, as chips (up to five). They become "Your favourite moments" and steer the recommendations. |
| 2 of 5 | **If the voyage were a word or two…** | Restful, Celebratory, Effortless, Intimate, Unhurried, Delicious, Romantic, Curious, Adventurous, Generous (up to three) |
| 3 of 5 | **Is there anyone you would like us to thank?** | The people who looked after them, by name: Elena, Luca Ferraro (Head Sommelier), then the restaurant, spa, and marina and deck teams. Each has an optional note. |
| 4 of 5 | **Was there anything we could have done better?** | "Elena reads every one personally. Nothing is too small." A free-text answer, and *I would like someone to get in touch* |
| 5 of 5 | **Anything to remember for next time?** | "The same suite, a quieter table, a later start…" |
| Review | **Ready when you are** | Exactly what will be sent, in plain words, then **Send to Elena** |

**Once sent:**

* the guest sees "Thank you. Elena will read every word, and pass your thanks on by name.";
* if they asked to be contacted, a service request is raised for the team, in their words, and the screen links to it;
* the reflections are now read-only.

**Validation:**

* favourites must be moments from this voyage (at most five);
* words must come from the list (at most three);
* thanks only to the voyage's crew (notes of up to 300 characters);
* "better" up to 1,500 characters, "next time" up to 1,000;
* without words in "better", there is no follow-up;
* nothing to send: "Share a thought or two first, or simply close this".

Each save is versioned, so a stale edit is refused.

## Recommendations

Interest weights come from three sources:

* what took place: experience tags, with dinners counting half, since dinner every evening is routine;
* favourites: twice their tags;
* stated activity interests.

Each future voyage scores:

* the sum of its tags' weights;
* +2 when its region is one the guest names among their preferred destinations;
* −2 for the region just sailed;
* −3 for a region sailed in the last four years.

Voyages already under way are left out. The **reason** is that voyage's own line for the guest's strongest matching interest, and **because** names the guest's moment behind it. So choosing the sail and the Riva as favourites turns Corsica's reason to "Anchorages you can only reach by sea", because of San Fruttuoso by Riva.

The voyages are fictional in development: `voyage_inspirations`, seeded from `src/data/fixtures/postVoyage.ts`. Their lines are generic. The personal part is always the guest's own memory.

## Contracts and code

```ts
interface PostVoyageService {
  getRecap(guestId, reservationId): Promise<VoyageRecap | null>;   // null until the voyage is over
  saveFeedback(guestId, reservationId, patch, { expectedVersion? }): Promise<VoyageFeedback>;
  sendFeedback(guestId, reservationId): Promise<VoyageFeedback>;   // once; raises the follow-up request
}
```

| Piece | File | Notes |
|---|---|---|
| Rules | `src/services/postVoyage/recap.ts` | `buildRecap`, `recommendVoyages`, `happened`, `isVoyageComplete`. Pure. |
| Service | `ComposedPostVoyageService` | Over the other contracts, in both modes. Reflections in a `PostVoyageStore`: `MemoryPostVoyageStore` (mock) or `SupabasePostVoyageStore`. |
| Screens | `src/features/welcomeHome/` | `WelcomeHomeScreen`, `ReflectionsScreen`, `welcomeHomeModel` (steps, review words, Home card). Home shows **After your voyage** with "Welcome home." |

**Migration `20261011000000_post_voyage.sql`:**

* **`voyage_feedback`** (guest × reservation): reflections in JSON, status, version and `sent_at`.
  * The guest reads and writes their own, on their reservation, **while it is a draft only**. A sent row cannot be edited.
  * Crew assigned to the reservation read it.
* **`voyage_inspirations`**: read-only for signed-in guests.

**Mock fix that came with this.** The demo URL parameters (`?demo=`, `?now=`, `?scenario=`) are now read once, as the app opens. In-app navigation drops the query string, which used to send the demo clock back to the dataset's reference moment on the next screen.

## Tests

* **`check:post-voyage`** (60 checks):
  * nothing before or during the voyage;
  * the exact welcome and summary;
  * a page per day, the anniversary first and with Camille, nothing invented on the last day;
  * a cancelled or never-confirmed booking is not a memory; a private occasion is never mentioned;
  * destinations;
  * suggested, then chosen, favourites;
  * Bonvoy as a placeholder, with no invented numbers;
  * Elena's note;
  * recommendations (the Adriatic stepped back, past voyages out, reasons from the voyage's lines with the guest's moment, favourites changing them) and the inspiration's closing line;
  * the people to thank;
  * reflections: validation, versions, trimming, follow-up rules, sending once with the request raised, read-only after;
  * the steps' wording, with no survey language;
  * the review lines, progress, and the Home card.
* **`test:supabase`** (14 checks):
  * the recap from the database (days, destinations, anniversary, note, inspirations, Bonvoy placeholder);
  * reflections under RLS: versioned; stale edits refused; other guests read nothing; crew read them;
  * sent once, with the follow-up request in their words;
  * read-only after sending;
  * inspirations read-only.
* **Browser** (`whtest`, 25 checks):
  * before the voyage;
  * Home and the recap, section by section, with no survey language;
  * the whole reflections flow, from chips to thanks, notes, follow-up and the review;
  * sending, the follow-up request in Your requests, and the recap afterwards;
  * save and finish later;
  * 320 px; no page errors.
