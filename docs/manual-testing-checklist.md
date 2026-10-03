# Manual Testing Checklist: Project Foundation

Run on at least one iOS simulator or device, one Android emulator or device, and the web build.
Start with `npm install`, then `npx expo start`.

Tick each item and note the device or OS.

## 0 · Automated gates (run first)

- [ ] `npm run typecheck` prints no errors.
- [ ] `npm run lint` prints no errors or warnings.
- [ ] `npm run doctor`: all checks pass. Two checks need internet access to expo.dev and reactnative.directory, so they fail behind a restricted proxy.

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
| Concierge | [ ] Suggested questions appear · [ ] tapping one returns a reply · [ ] the "Sophie" button adds a hand-off note and Sophie's message · [ ] the keyboard doesn't cover the input (iOS) |
| Profile | [ ] The Bonvoy card shows tier first; points appear in small type only |

## 4 · Deep links and unknown routes

- [ ] `npx uri-scheme open rcycguest://voyage --ios` (or `--android`) opens the Voyage tab.
- [ ] On web, open `/voyage`, `/discover`, `/concierge` and `/profile` directly. Each loads the right tab.
- [ ] On web, open `/no-such-page`. It shows "This page has drifted away", and "Return home" goes to Home.

## 5 · Error handling

- [ ] **Configuration error.** Set `EXPO_PUBLIC_SERVICE_MODE=supabase` in `.env`, leaving the URLs blank, and restart with `npx expo start --clear`.
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
- [ ] Hero images announce their alt text, for example "Monte Carlo harbour at golden hour".
- [ ] At the largest Dynamic Type size, text wraps without clipping.

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
- [ ] Supabase (when configured): set `EXPO_PUBLIC_SERVICE_MODE=supabase` and the URL and key, sign in, and save. A row appears in `guest_preferences` with `version` incremented, and the line says "Saved to your account".
