# Manual Testing Checklist: Project Foundation

Run on at least one iOS simulator or device, one Android emulator or device, and the web build.
Start with `npm install`, then `npx expo start`.

Tick each item and note the device or OS.

## 0 · Automated gates (run first)

- [ ] `npm run typecheck` prints no errors.
- [ ] `npm run lint` prints no errors or warnings.
- [ ] `npm run doctor`: all checks pass. Two checks need internet access to expo.dev and reactnative.directory, so they fail behind a restricted proxy.
- [ ] `npm run verify` includes `check:a11y`: contrast from the tokens, font-scale caps and accessibility patterns.
- [ ] `npm run verify` includes `check:supabase`: seed freshness, key validation, sign-in logic and security scans.
- [ ] With PostgreSQL and PostgREST available: `PG_BIN=… POSTGREST=… npm run test:supabase` reports every SQL assertion and service check passed.

## 1 · Launch

- [ ] The splash screen (ivory background) shows, then hides once the fonts have loaded. There's no flash of system fonts.
- [ ] "Preparing your journey…" appears briefly, then Home loads.
- [ ] The Metro or browser console shows `[info] app: app start` and `[info] app.services: services ready {mode: mock, …}`.
- [ ] Nothing shows in red, and there are no yellow-box warnings.

## 2 · Bottom navigation

- [ ] Exactly five tabs, in order: **Home · Voyage · Discover · Concierge · Profile**.
- [ ] Each tab shows an outline icon when inactive and a filled icon when active. Labels are uppercase and small.
- [ ] Tapping each tab shows its screen without a visible delay or flicker.
- [ ] The active tab's icon and label are ink-coloured; inactive ones are driftwood.
- [ ] Re-tapping the active tab does nothing harmful.
- [ ] **Android:** hardware/gesture back on any tab returns to Home, and back on Home exits the app.
- [ ] The tab bar clears the home indicator on iPhone (Face ID models) and the gesture bar on Android.

## 3 · Screens (design language)

On every screen, check for:

- [ ] Ivory background, serif headlines and generous margins of about 24 pt.
- [ ] No badges, counters, progress meters or promotional banners.
- [ ] Content starts below the status bar and notch, except on Home, where the hero bleeds under the status bar.

| Screen | Check |
|---|---|
| Home | [ ] "Good morning/afternoon/evening, Isabelle" · [ ] "2 days until Barcelona" · [ ] a quiet Bonvoy recognition line · [ ] two alerts, which can be dismissed · [ ] the "Open concierge" button is readable on the dark card |
| Voyage | [ ] Five section tabs scroll horizontally · [ ] each section renders content |
| Discover | [ ] Filters scroll horizontally and change the collections shown · [ ] carousels scroll horizontally |
| Concierge | [ ] Suggested prompts appear · [ ] tapping one returns a reply · [ ] see section 14 · [ ] the keyboard doesn't cover the input (iOS) |
| Profile | [ ] The Bonvoy card shows tier first; points appear in small type only |

## 4 · Deep links and unknown routes

- [ ] `npx uri-scheme open rcycguest://voyage --ios` (or `--android`) opens the Voyage tab.
- [ ] On web, open `/voyage`, `/discover`, `/concierge` and `/profile` directly. Each loads the right tab.
- [ ] On web, open `/no-such-page`. It shows "This page has drifted away", and "Return home" goes to Home.

## 5 · Error handling

- [ ] **Configuration error.** Set `EXPO_PUBLIC_SERVICE_MODE=supabase` in `.env`, leaving the URL and key blank, and restart with `npx expo start --clear`.
  - Expect the "With our apologies · The app isn't quite ready" screen.
  - Expect warnings in the console that name each missing variable.
  - Revert the setting afterwards.
- [ ] **Invalid mode.** Set `EXPO_PUBLIC_SERVICE_MODE=banana`. The app runs in mock mode and logs a warning about the unknown mode.
- [ ] **Offline (device).** Turn on airplane mode, then use Concierge. No crash; mock mode keeps working. When remote services are connected, expect "You appear to be offline".
- [ ] **No raw error text.** No screen ever shows an error code, a stack trace or an exclamation mark.

## 6 · Environment and logging

- [ ] Setting `EXPO_PUBLIC_LOG_LEVEL=warn` and restarting hides the `[info]` and `[debug]` lines.
- [ ] Changing `EXPO_PUBLIC_DEMO_NOW` (for example to `2026-10-19T09:00:00+02:00`) changes the Home countdown. This proves environment values reach the bundle.
- [ ] No log line contains a full e-mail address, phone number or token.

## 7 · Accessibility

- [ ] VoiceOver / TalkBack announces each tab with its name and whether it's selected.
- [ ] Hero images announce their alt text, for example "Monte Carlo harbour at golden hour". The headline over the image is a separate heading after it.
- [ ] **Headings.** With the rotor (iOS) or headings navigation (Android), Home reads its headline, then each section: For your attention, Arranged for you, Your voyage, and so on.
- [ ] **Icons are silent.** Swiping through a Discover card never stops on an icon on its own.
- [ ] **Chips.** In Discover → Refine, a port is read as "radio button, 1 of N, selected"; interests as checkboxes; Private only as a toggle.
- [ ] **Focus moves.**
  - Reflections → Continue: the next question is read.
  - Profile → Edit Dining: "Editing Dining"; Cancel returns to "Edit Dining, button".
  - Sign-in: after "Send my code", the code instructions are read.
- [ ] **Errors.** Make a request with nothing filled in. Each error is announced, the fields say "invalid" and are read with their errors, and both are named as required.
- [ ] **Announcements.** A concierge reply is read when it arrives. Changing Discover's filters says how many experiences there are.
- [ ] **Largest text size.** At the largest Dynamic Type size (iOS) or font size (Android), reading text is twice its size, headings grow less, and nothing is clipped. Tab labels stay the same size, and a long press shows them large (iOS).
- [ ] **Reduce motion.** With it on, the Home skeleton holds still, screens appear without sliding, and photographs appear without fading.
- [ ] **Voice Control.** "Tap Request" works on a Discover card; "Tap Elena" opens the people panel.
- [ ] **Web.** Tab through Make a request; the order follows the page and every control shows a focus ring.

## 8 · Platforms

- [ ] iOS: portrait only, and the status bar is dark on light backgrounds.
- [ ] Android: the adaptive icon shows on an ivory background, and there's no edge-to-edge overlap with the system bars.
- [ ] Web, 390 px wide: no horizontal page scroll.

## 9 · Home dashboard states

On web, append these to the URL. On native, set `EXPO_PUBLIC_MOCK_SCENARIO` or `EXPO_PUBLIC_DEMO_NOW` and restart with `--clear`.

| URL | Expect |
|---|---|
| `/` | "3 days until Barcelona", Prepare step highlighted, two alerts needing action, arrival (transfer + embarkation), dining / ashore / spa, yacht + suite, 3 recommendations, concierge invitation |
| `/?scenario=slow` | Skeleton matching the layout, then content settles in place |
| `/?scenario=empty` | "Nothing needs your attention", "Nothing is scheduled just yet", a hint in each arranged slot, the recommendation placeholder; hero, embarkation and suite intact |
| `/?scenario=error` | Calm full-screen "We couldn't reach the yacht just now" with Try again; tab bar still works |
| `/?scenario=partial-error` | Hero, recognition, embarkation, yacht and suite render; Attention, Arranged and Chosen-for-you each show an inline message; no "Nothing is scheduled" claim |
| `/?now=2027-05-20T10:00:00%2B02:00` | "Day 6 · Monte Carlo", Sail step highlighted, "Next today: Couples terrace ritual", "Your journey home" with AA 7419, pre-voyage alerts gone |

- [ ] Rotate a tablet, or widen the browser past 700 px: yacht and suite sit side by side, and the column stays centred (max 720 px).
- [ ] At 320 px wide, journey step labels stay on one line and nothing scrolls horizontally.
- [ ] With "Reduce Motion" on, skeleton blocks don't pulse.

## 10 · Voyage area

- [ ] Nine section tabs: Overview · Itinerary · My Suite · Embarkation · Calendar · Dining · Spa · Experiences · Documents. The selected one is underlined and announced as selected.
- [ ] `/voyage?section=documents` opens Documents directly, with its tab scrolled into view. Home's "Complete now" alert lands there too.
- [ ] **Itinerary:** each port shows an image placeholder, arrival / all-aboard / departure, local time ("UTC+2 · 6 h ahead of Miami"), what's booked and personalised suggestions. The sea day suggests the bridge visit and wine masterclass; Monte Carlo day 6 departs "00:00 +1".
- [ ] **My Suite:** Grand Suite · Deck 6 · Suite 612, amenities, preferences (feather-free, sparkling water, 21 °C), and Elena's availability, suite telephone, languages, plus "Message Elena", which opens Concierge.
- [ ] **Embarkation:** Barcelona, Port Vell Yacht Terminal, 13:30 – 14:00, the transfer with AA 7412 tracked, luggage (4 pieces, digital tags, in suite by 15:30), documentation 5 of 6, and a check-in checklist with the health questionnaire outstanding.
- [ ] **Calendar:** starts "Before you sail" with AA 7412 from Miami and ends with AA 7419 home. Filters (Yacht, Dining, Spa, Excursions, Private, Travel) narrow the list; suggestions are marked "Suggested for you".
- [ ] **Dining / Spa / Experiences:** reservations grouped by day, plus "Also available to you" where something remains unbooked.
- [ ] **Documents:** a summary line, and no document numbers anywhere.
- [ ] States: `?scenario=slow` shows "Gathering your voyage…"; `?scenario=error` shows the calm full-screen message; `?scenario=partial-error&section=calendar` shows an inline error while My Suite still works; `?scenario=empty&section=dining` shows "No dining reservations yet".

## 11 · Discover marketplace

- [ ] Tabs: All · Private Experiences · Destinations · Dining · Wine · Wellness · Spa · Marina · Culture · Shopping · Transportation. `/discover?category=wine` opens Wine.
- [ ] **Recommended for You** (All, no filters): six experiences, none already reserved or fully booked, each with its own reason.
- [ ] Every card shows: title, destination, duration, format (private / small group / shared), price and "Included in your voyage" or "At additional cost", availability (with note and next times), reservation status and a reason when recommended. **Details** expands the description and what's included.
- [ ] Wine → Binissalem: "Recommended because you enjoyed a private vineyard lunch on Hvar on your Adriatic voyage in 2024." · Reserved, Sunday 16 May · 09:30.
- [ ] Wellness → Tramuntana walk: Fully booked · Ask your concierge. Transportation → Helicopter: Waitlist · On request.
- [ ] **Refine**: Port (Portofino → Riva and the lighthouse walk), Date (16 May → Palma and aboard), Interests (Wine), **Private only**, Availability (Bookable now hides waitlist and fully booked). The count appears on Refine; **Clear** resets.
- [ ] An impossible combination (Portofino + Spa & wellbeing) shows "Nothing matches these choices" with **Clear filters**.
- [ ] Destinations → tap Saint-Tropez → All, filtered to that port (2 experiences).
- [ ] **Request** or **Ask the concierge** opens Concierge.
- [ ] Tablet (≥ 760 px): cards in two columns. 320 px: no horizontal scrolling.
- [ ] `?scenario=partial-error`: cards still listed, with "Availability on request", plus inline messages for recommendations and availability.

## 12 · Profile and preferences

- [ ] Eight sections: Personal · Bonvoy · Preferences · Companions · Occasions · Voyage History · Communication · Privacy. `/profile?section=privacy` opens Privacy.
- [ ] **Preferences** lists ten groups: Dining, Dietary, Beverage, Suite, Pillow, Spa, Activities, Destinations, Transportation, Accessibility. Dietary and Accessibility show a lock (sensitive).
- [ ] **Edit Dining** → Terrace, 21:00, add a note → Save. The summary reads "Terrace, from 21:00" and the line says "Saved on this device".
- [ ] **Persistence:** fully close and reopen the app (or reload on web). The change is still there.
- [ ] **Cancel** discards changes. Only one group can be edited at a time. Save stays disabled until something changes.
- [ ] **Suite** temperature stops at 16 °C and 28 °C. **Dietary**: an allergy without a name is refused with "Each allergy needs a name."
- [ ] **Multi-choice**: "Add your own" (e.g. a destination) is saved and shown.
- [ ] **Communication**: toggle WhatsApp; set quiet hours (choosing only one end is refused).
- [ ] **Privacy**: switch off Personalised recommendations. Discover then shows no reasons and an empty "Recommended for You"; Home shows no picks. Switch it back on to restore them.
- [ ] **Your data**: "Request a copy" and "Ask us to delete" confirm "Sent to our privacy team".
- [ ] To reset the demo data on web, clear site data (key `rcyc.preferences.v1.*`). On a device, delete and reinstall the app.
- [ ] Supabase (when configured): save a preference. In `guest_preferences`, `version` increments, and the line says "Saved to your account". See section 13.

## 13 · Supabase mode

Prerequisites:

* Run `supabase start && supabase db reset`, which applies the migrations and the fictional seed.
* Invite `alexander.laurent@example.com` in Studio.
* Set `EXPO_PUBLIC_SERVICE_MODE=supabase`, the local URL and the **anon** key, then restart with `--clear`.

- [ ] **Secret key refused.** Put the `service_role` key in `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The app shows "The app isn't quite ready", and the console names `SECRET_IN_BUNDLE`. This happens in every mode. Put the anon key back.
- [ ] **Sign-in screen.** The app opens on "Welcome aboard", with no tabs behind it.
- [ ] **No account enumeration.** Request a code for `nobody@example.com`. You see the same "If … is on a reservation, a code is on its way" step, and no e-mail arrives in the local mail viewer.
- [ ] **Sign in.** Request a code for `alexander.laurent@example.com`, then enter the code from the local mail viewer (`http://127.0.0.1:54324`). Home loads for Alexander, and the countdown uses today's date (the real clock).
- [ ] **Wrong code.** It shows "That code didn't work…". A code older than ten minutes asks for a new one.
- [ ] **Unlinked account.** Invite `crew@example.com`, which has no guest record, and sign in. You see "We couldn't find a voyage for this address", and you stay signed out.
- [ ] **Data matches mock mode.** Spot-check Voyage → Itinerary (port times in local time), Calendar, Discover (recommendations and reasons), Profile → Bonvoy and Occasions, and Concierge history.
- [ ] **Booking request.** Request an experience. In `experience_bookings` the row has `status = 'received'`, `created_by` = your user, and the category from the catalogue. In `audit_log` there is `experience_bookings.insert` with column names only.
- [ ] **Concierge.** Send a message. A reply arrives from `concierge-respond` (run `supabase functions serve`). A crew reply inserted in Studio (`author = 'human'`) appears live.
- [ ] **Alerts.** Dismiss an alert. `journey_alerts.acknowledged_at` is set, and it does not return on refresh.
- [ ] **Session.** Leave the app for more than 15 minutes, then come back. You are still signed in (token refreshed), with no reload flash.
- [ ] **Sign out.** Profile → Personal → Sign out returns to the sign-in screen. The keychain entry is removed. On web, a reload also signs out, because sessions are kept in memory only there.
- [ ] **RLS.** In Studio's SQL editor, run `set role anon; select * from guests;`. It fails with permission denied.

## 14 · Concierge

- [ ] **Opening.** The April conversation with Elena sits under "Monday 26 April". Today's greeting names Alexander and Barcelona on Saturday 15 May. Six prompts appear as chips: *What is planned for tomorrow? · Move my dinner reservation. · What private experiences are available in Monte Carlo? · Arrange transportation. · What benefits do I have? · Help me celebrate my anniversary.*
- [ ] **Suggested requests** follow the greeting:
  - the bridge visit, which is awaiting your choice (16:30 or 17:30);
  - the health questionnaire, where **Complete now** opens Voyage › Documents;
  - a personalised pick with its reason.
- [ ] **Tomorrow, before the voyage.** "What is planned for tomorrow?" returns: still at home in Miami on Wednesday 12 May, the questionnaire due on the 13th, AA 7412 leaving Miami at 18:40, and the day 1 schedule card.
- [ ] **Tomorrow, aboard.** Open `/concierge?now=2027-05-18T09:00:00%2B02:00` and ask "What should I do tomorrow?". The reply covers Monte Carlo, day 5:
  - suggestions first, each with its reason;
  - then what's arranged, including "Dinner at Lumière, at your window table";
  - sunset and dress code;
  - cards to reserve the atelier at 14:00 or 15:30.

  No suggestion clashes with a booking.
- [ ] **Preferences change answers.** In Profile, switch off Personalised recommendations and ask again. The reasons disappear. Set the dining table to Terrace: the window-table note goes.
- [ ] **Move dinner.** The reply names Mediterraneo, 20:30 and the window table, with **Move to 19:30 / Move to 21:00**.
  - Tap 21:00. You see "Done…", a **Confirmed** card with a reference, and the buttons resolve (✓ on 21:00).
  - In Voyage › Dining the dinner is at 21:00.
  - Typing "21:00, please" instead changes nothing yet: the reply offers **Move to 21:00** back as a button, and the tap moves it.
- [ ] **Private dinner.** "Move my dinner on 20 May" offers **Ask Elena** rather than times.
- [ ] **Monte Carlo.** You see what's private and unbooked (the atelier), with times, and what's already arranged (Oceanographic, Villa Ephrussi).
- [ ] **Transportation.** You see your transfers, AA 7412 being tracked, and that the helicopter request has been received (not offered again). There are car cards for Saint-Tropez and Portofino carrying your note ("sedan, no music").
- [ ] **Benefits.** Titanium Elite (Lifetime Platinum Elite), fourth voyage, seven privileges as a card, Elena again as Suite Ambassador. No points.
- [ ] **Anniversary.** Thursday 20 May in Monte Carlo, "quietly, as you prefer", with what's in place that day. Cards offer the atelier, **Arrange flowers** and **Ask Elena**. With "Share occasions with crew" off, a note says the crew haven't been told.
- [ ] **Request status.** On **Requests**, open requests show a Received → Being arranged → Confirmed timeline, the owner and the next update. **Ask about this** on the bridge visit offers the times; choose 17:30 and it's reserved, and the request is confirmed.
- [ ] **Suite Ambassador.** Header **Elena · A person** opens the people panel (Elena with her hours and languages; the concierge team; the Medical Centre; emergency advice). **Ask Elena to join** shows a hand-off card; Elena joins within a few seconds and picks up the topic.
- [ ] **Human escalation.** "I would like to speak to a real person" brings Marco (Shoreside Concierge) before the voyage, or Sofia (Guest Services) aboard. "I feel unwell" goes to the Medical Centre, with emergency advice for where you are. An unclear message offers a person; a second one hands you over.
- [ ] **Failures.** With `?scenario=error`, a calm message with Try again. Losing the network mid-message shows "Your message didn't reach us…" and keeps your text in the box.
- [ ] **320 px and large text.** No horizontal scrolling; cards and buttons wrap.

## Service recovery (`?demo=disruption`)

- [ ] **Unchanged by default.** Without the parameter, Home shows no disruption.
- [ ] **Home.** With `/?demo=disruption`, "For your attention" opens with **A change to your plans · 18 May**: "Under sail on a 1930s classic yacht will not go ahead", and "Elena has 3 comparable alternatives for you." There is no "Nothing needs your attention" beside it.
- [ ] **The notice.** **See the alternatives** opens a letter from Elena:
  - "Alexander, we are sorry to tell you that…", calm, with no exclamation marks;
  - **The reason**: the mistral and the skipper;
  - nothing about severity, the Hotel Director, goodwill or money.
- [ ] **Alternatives.** Three of them:
  - Saint-Tropez on Foot, Privately (the same morning, 10:00, €650);
  - the wellness coach aboard;
  - the Monte Carlo atelier.
  
  Nothing on the water that day, and nothing already booked or requested.
- [ ] **Approval.** **Request 10:00** shows "Before we send it", with exactly what will be sent. **Send the request** stays disabled until you tick "I understand €650 will be charged… once the team confirms it". Then **Your choice** shows Requested, and the other alternatives are gone.
- [ ] **Ask Elena.** Add a note and send it: "Elena has this in hand", **In hand**, and the request appears in Your requests ("Excursion cancellation: …").
- [ ] **320 px.** No horizontal scrolling.

## Shoreside-to-yacht continuity (`?demo=flight-delay`)

- [ ] **Before.** Open `/?demo=flight-delay`. It is embarkation morning (07:30). The transfer shows Today · 10:00, and AA 7412 shows "On schedule and tracked".
- [ ] **The event.** After about 3 seconds, without reloading, **Your arrival** appears: "We've adjusted your arrival arrangements." Below it are six lines:
  - Inbound flight delay detected (11:10);
  - Private transfer updated;
  - Embarkation team notified;
  - New transfer time (12:00);
  - Updated arrival estimate (15:30);
  - Concierge available.

  A note under them says the flight status is simulated.
- [ ] **Home follows.** The transfer is at 12:00, the flight reads "Now landing 11:10, and your driver knows", and the window is 15:30 – 16:00.
- [ ] **Details.** **See what changed** shows each step's words, each marked Done. Under "Also moving with your flight", the Sagrada Família is asked to move to 12:45 and marked **Requested**, not done.
- [ ] **Embarkation.** **Your embarkation details** shows the new window, and a note from the embarkation team.
- [ ] **Concierge.** **Talk to Elena** opens the concierge.
- [ ] **Unchanged by default.** Without the parameter, no arrival card appears, and `/arrival` says travel is on schedule.

## After the voyage (`?demo=welcome-home`)

- [ ] **Home.** Open `/?demo=welcome-home`. The hero reads **Welcome home.**, and **After your voyage** reads "Seven nights, six ports and four countries aboard Evrima, in Grand Suite 612." and "A few words, when you are ready."
- [ ] **The voyage remembered.** **Your voyage, remembered** opens the recap. Check each section:
  - the welcome;
  - day-by-day memories, with Day 6 led by the 20th wedding anniversary "In Monte Carlo, with Camille";
  - destinations, with Monte Carlo on 19 – 20 May;
  - suggested favourites;
  - the Bonvoy placeholder ("Not yet connected to Marriott Bonvoy");
  - Elena's note to Alexander and Camille;
  - three next voyages with reasons, and the inspiration with its closing line;
  - "illustrative in this preview".
- [ ] **Not a survey.** Nowhere asks for a rating, a score or a likelihood to recommend.
- [ ] **Reflections.** **Share your reflections**:
  - choose two moments and two words;
  - thank Elena, with a note;
  - write what could be better, and ask to be contacted;
  - add a note for next time;
  - review, and send to Elena.

  You should see "Thank you." and a link to the request; the recap now shows your favourite moments and "Sent".
- [ ] **Save and finish later.** On a fresh load, choose one moment, then **Save and finish later**. The recap shows "1 of 5 begun, saved as you go."

## Voyage history

- [ ] **The list.** Go to **Profile → Voyage History → Your voyage history**. The page reads "Where you have sailed with us", then "Three voyages, 24 nights, aboard Ilma and Evrima.", with the Cyclades first.
- [ ] **A voyage.** Open **Dalmatian Coast & Venice**. You should see:
  - Evrima · 31 August – 7 September 2024 · Grand Suite 612;
  - Dubrovnik, Hvar and Venice;
  - three experiences in order, then the Chef's Counter;
  - saved preferences marked **Kept**;
  - memories, starting "Taking the helm of a classic yacht off Hvar";
  - the photographs placeholder, with no photographs.
- [ ] **What they told us.** **Cyclades in Early Summer** shows the Owner's Suite 701 aboard Ilma, and "You told us it felt crowded…".
- [ ] **Kept and Noted.** In **Preferences → Spa**, change the pressure, then reopen the Cyclades. "Firm pressure, unscented oil" now reads **Noted**.

## Analytics (web build, development: open the browser console)

- [ ] **Off by default.** Browse Home, Discover and the Concierge. No `app.analytics:` lines appear, because the fictional guest has analytics off.
- [ ] **On.** In **Profile → Privacy**, switch on **Anonymous app analytics** and save. Then save an experience on Discover, open the Concierge and visit a past voyage. Within 15 seconds you should see:
  - `experience_saved`;
  - `concierge_opened`;
  - `screen_viewed` with `/history/[id]`.

  No names, ids of the guest or reservation, or message text appear.
- [ ] **Concierge text.** Send a concierge message containing a card number. The event reads `concierge_request_submitted {kind: "message"}` and nothing more.
