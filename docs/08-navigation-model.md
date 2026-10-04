# 8 · Navigation Model

The app is built on Expo Router (file-based) with typed routes enabled.

```mermaid
flowchart TB
  Root["_layout.tsx<br/>Fonts · SafeArea · ServiceProvider · JourneyProvider"] --> Tabs["(tabs)/_layout.tsx"]
  Tabs --> Home["/ (Home)"]
  Tabs --> Voyage["/voyage"]
  Tabs --> Discover["/discover"]
  Tabs --> Concierge["/concierge"]
  Tabs --> Profile["/profile"]

  Voyage --- V1[Itinerary]
  Voyage --- V2[Day by day]
  Voyage --- V3[Reservations]
  Voyage --- V4[Suite & yacht]
  Voyage --- V5[Travel: embarkation · transfers · documents]

  Home -.alert action.-> Voyage
  Home -.privileges.-> Profile
  Home -.your voyage card.-> Voyage
  Home -.at your service.-> Concierge
  Home -.anniversary card.-> Celebration["/celebration/[key]"]
  Home -.anything you need.-> Requests["/requests"]
  Home -.bell.-> Notifications["/notifications"]
  Home -.attention.-> Recovery["/recovery/[id]"]
  Home -.arrival.-> Arrival["/arrival"]
  Home -.after the voyage.-> WelcomeHome["/welcome-home"]
  WelcomeHome --> Reflections["/welcome-home/reflections"]
  Profile -.past voyages.-> History["/history"]
  History --> PastVoyage["/history/[id]"]
  Notifications --> NotificationSettings["/notifications/settings"]
  Notifications -.deep link.-> Voyage
  Concierge -.requests tab.-> Requests
  Celebration -.approved step.-> Request
  Requests --> NewRequest["/requests/new"]
  Requests --> Request["/requests/[id]"]

  Root -. future .-> Auth["(auth)/sign-in · verify · link-bonvoy"]
  Root -. future .-> Modals["experience/[id] · booking/[id]"]
```

## Tabs

| Tab | Question it answers | Primary content |
|---|---|---|
| **Home** | "What matters to me right now?" | Greeting, recognition, alerts, voyage and embarkation, next item, reservations, recommendations, concierge access |
| **Voyage** | "Tell me everything about my voyage." | Itinerary, daily schedule, restaurant, spa and shore reservations, marina and events, suite and yacht, embarkation, transfers, documents |
| **Discover** | "What could I do?" | Destinations, curated collections, personalised picks; filters for private, culinary, wine, spa, marina, evenings, shopping, culture and transport |
| **Concierge** | "Can someone take care of this?" | AI conversation, suggested questions, a named Ambassador hand-off, request status strip |
| **Profile** | "Do they know me?" | Bonvoy identity, relationship, privileges, voyages, personal details, companions, occasions, preferences, communication |

## Contextual navigation

* **The journey phase drives emphasis.** `useJourney().phase` lets Home and Voyage reorder content: embarkation details before sailing, the day's programme at sea, memories after the voyage.
* **Alerts deep-link** through `JourneyAlert.action.route`, so the BFF decides where a guest should land.
* **Planned deep links** (`rcycguest://`): `rcycguest://voyage`, `rcycguest://concierge`, and `rcycguest://experience/<id>` for push notifications and e-mail.
* Within a tab, the guest moves between sections with in-page `SegmentedTabs`, which avoids deep stacks. Detail views will open as modal sheets so the tab context is kept.

## Stack screens

These are pushed above the tabs, each with a quiet "Back" (falling back to a sensible parent on a cold deep link).

| Route | Screen |
|---|---|
| `/requests?view=active\|history` | Your requests: active and history |
| `/requests/new` | Make a request |
| `/requests/[id]` | One request: status timeline, resolution, details, withdraw or close |
| `/notifications` | Notifications: inbox by day, filter by type, coming up, mark read |
| `/notifications/settings` | Notification types, times, reminder timing, push on this device |
| `/welcome-home` | After the voyage: "Welcome home.", memories by day, destinations, favourites, Bonvoy placeholder, a note from Elena, reflections, next voyages and inspiration |
| `/welcome-home/reflections` | Five optional questions, one at a time, saved as you go; review; send to the Suite Ambassador |
| `/history` | Voyage history: where you have sailed with us, newest first |
| `/history/[id]` | One past voyage: yacht, dates, suite, destinations, experiences, dining highlights, saved preferences, memories, photographs placeholder. Also opened from Profile's past voyages |
| `/arrival` | The arrival update: what was detected, each change (done or requested), the new times, plans en route, the concierge |
| `/recovery/[id]` | A disruption: the message, the reason (when known), comparable alternatives with approval, Ask Elena. Opened from Home's attention area and from the journey alert |
| `/celebration/[key]` | A celebration during the voyage: the message, the ideas, approval (`key` is URL-encoded, e.g. `anniversary%3A…`) |

## Planned stacks (next iterations)

| Route | Presentation |
|---|---|
| `(auth)/sign-in`, `(auth)/verify`, `(auth)/link-bonvoy` | Full-screen, before the tabs; guarded in the root layout |
| `experience/[id]` | Modal sheet: imagery, details, availability, request |
| `booking/[id]` | Modal sheet: change or cancel |
| `documents/[id]` | Modal sheet: secure upload to Storage |
