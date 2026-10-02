# 3 · Domain Model

The TypeScript source of truth is `src/domain/*.ts`. It is grouped into bounded contexts that line up with the service contracts.

```mermaid
classDiagram
  direction LR
  class Guest {
    id
    salutation
    firstName / lastName
    emailMasked
    guestSince
  }
  class GuestPreferences {
    preferredDestinations
    dining / dietary / beverage
    suite / activityInterests
    communication
  }
  class TravelCompanion
  class SpecialOccasion {
    type
    date
    recognition
  }
  class LoyaltyMembership {
    tier
    tierLabel
    lifetimeStatus
    memberNumberMasked
    pointsBalance?
  }
  class GuestRelationship {
    voyagesCompleted
    nightsSailed
    valueSegment (internal)
  }
  class GuestPrivilege {
    title
    basis
  }
  class Voyage {
    code
    name
    startDate / endDate
  }
  class PortCall {
    day
    type
    portName
    timeZone
    allAboard
  }
  class Yacht
  class Suite
  class VoyageReservation {
    bookingReference
    status
    suiteAmbassador
  }
  class Embarkation {
    arrivalWindow
    suiteReadyAt
    allAboard
  }
  class TravelDocument {
    type
    status
  }
  class Experience {
    category
    inclusive
    privateAvailable
  }
  class ExperienceBooking {
    start
    partySize
    status
  }
  class DaySchedule
  class ScheduleItem
  class ConciergeMessage {
    author: guest|ai|human
    intent
  }
  class ServiceRequest {
    type
    status
    assignedTeam
    nextUpdateBy
  }
  class JourneyEvent {
    type
    severity
    dedupeKey
  }
  class JourneyAlert {
    title
    handled
    action
  }
  class Recommendation {
    surface
    rationale
    score
    drivers
    audience
  }

  Guest "1" -- "1" GuestPreferences
  Guest "1" -- "*" TravelCompanion
  Guest "1" -- "*" SpecialOccasion
  Guest "1" -- "0..1" LoyaltyMembership
  Guest "1" -- "1" GuestRelationship
  Guest "1" -- "*" GuestPrivilege
  Guest "1" -- "*" VoyageReservation : party member
  VoyageReservation "*" -- "1" Voyage
  VoyageReservation "*" -- "1" Suite
  Voyage "*" -- "1" Yacht
  Suite "*" -- "1" Yacht
  Voyage "1" -- "*" PortCall
  VoyageReservation "1" -- "1" Embarkation
  VoyageReservation "1" -- "*" TravelDocument
  VoyageReservation "1" -- "*" ExperienceBooking
  ExperienceBooking "*" -- "1" Experience
  Experience "*" -- "0..1" PortCall
  DaySchedule "1" -- "*" ScheduleItem
  ScheduleItem "*" -- "0..1" ExperienceBooking
  VoyageReservation "1" -- "*" ServiceRequest
  VoyageReservation "1" -- "*" JourneyEvent
  JourneyEvent "1" -- "0..1" JourneyAlert
  Guest "1" -- "*" Recommendation
```

## Bounded contexts

| Context | Aggregates | Owner (system of record) |
|---|---|---|
| **Guest** | `GuestProfile` (Guest, Preferences, Companions, Occasions) | CRM |
| **Loyalty** | `LoyaltyRecognition` (Membership, Relationship, Privileges) | Marriott Bonvoy (membership), CRM (relationship) |
| **Voyage** | `VoyageOverview` (Reservation, Voyage, Yacht, Suite, Embarkation, Documents) | Reservations PMS |
| **Experience** | Experience catalogue, `ExperienceBooking`, `DaySchedule` | Shipboard PMS/POS, shore ops |
| **Concierge** | Conversation, `ConciergeMessage`, `ServiceRequest` | Concierge platform |
| **Continuity** | `JourneyEvent` → `JourneyAlert` | Event bus |
| **Personalization** | `Recommendation`, signals, feedback | Decisioning platform |

## Modelling rules

* **Times carry the port's offset.** For example, `2026-10-17T20:30:00+02:00`. The UI shows wall-clock port time, so a guest at home in London still sees "20:30" for dinner in Barcelona.
* **Money is held in minor units** (`amountMinor`) with an ISO currency code.
* **Imagery is a `MediaAsset`.** It holds a DAM `uri` plus a brand `tone` gradient used as a graceful fallback.
* **PII arrives masked** (`emailMasked`, `memberNumberMasked`). Full values are fetched only in explicit, audited flows.
* **Internal-only fields** such as `GuestRelationship.valueSegment` and `Recommendation.audience = 'crew'` are never rendered in the guest app. RLS also keeps them out of guest queries (see the schema).
* **Bookings are requests.** `RequestStatus` models the hospitality reality that the crew confirms, proposes an alternative, or declines.
