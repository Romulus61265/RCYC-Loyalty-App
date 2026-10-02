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
