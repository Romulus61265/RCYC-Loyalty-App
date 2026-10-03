# 14 · Service recovery

When something goes wrong, the guest hears it from us first, calmly, with the reason when we know it, a few comparable alternatives and a person to help. The crew get a brief, an owner and a time by which someone follows up. Each disruption is recorded once.

Nothing is booked without the guest's explicit yes. **Nothing is ever compensated automatically.** Goodwill is a business decision: rules that authorised people have approved may *propose* a gesture to the crew, and a person with the authority the rule names decides.

```
journey event ─┐                                   ┌─▶ service_recovery_events  (crew: assessment, steps, brief, alternatives offered)
               ├─▶ disruption ─▶ assess ─▶ plan ───┼─▶ recovery_notices         (guest-safe: no internal reason, no quotes)
guest's data ──┘   (8 kinds)    severity   steps   └─▶ goodwill rules ─▶ goodwill_proposals (crew only; never applied)
(scan)                          owner      message
                                follow-up  alternatives · assistance
```

The rules live in `supabase/functions/_shared/recovery/`:

* `types.ts`: the contracts;
* `engine.ts`: events to disruptions, detection in the guest's data, assessment, the plan and its alternatives;
* `goodwill.ts`: matching rules to proposals, and deciding them;
* `handler.ts`: recording once, and the scan;
* `supabaseRecovery.ts`: the server-side ports.

They are self-contained, so the same files run in the app (Metro and Node) and in Deno. The mock records with the same handler the Edge Functions use.

## Disruptions

| Kind | Reported by | Default severity | Owner |
|---|---|---|---|
| Transfer delay | `transfer.delayed` | Low under 30 minutes; moderate from 30; high from 60 | Shore Operations |
| Dining cancellation | `dining.cancelled` | Moderate (high if private or paid) | Restaurant Manager |
| Excursion cancellation | `excursion.cancelled` | Moderate (high if private or paid) | Shore Operations |
| Suite issue | `suite.issue_reported`, or a maintenance request (or a suite request describing a fault) | Moderate | Executive Housekeeper |
| Port change | `itinerary.port_changed` | High | Guest Services Manager |
| Weather disruption | `weather.disruption` | Moderate (high if a private or paid experience is lost) | Concierge |
| Missed service | `service.missed`, or an active request past its promised update | Moderate | Suite Ambassador |
| Guest complaint | `guest.complaint`, or a request that reads as a complaint | High | Guest Services Manager |

**Event payloads** (all optional):

* the subject: `bookingId`, `experienceId`, `requestId`, `portCallId`, `title`, `start`/`startLocal`, `venue`;
* the reason: `guestReason` (or `reason`) and `internalReason`;
* the `cause`;
* the details: `delayMinutes`, `newPickupLocal`, `fromPort`, `toPort`, `toPortCallId`, `date`, `quote`.

A disruption's key is stable:

| Source | Key |
|---|---|
| Journey event | `event:<dedupeKey>` |
| Detected in the guest's data | `missed:<request>:<promised time>`, `suite:<request>`, `complaint:<request>` |

When it is recorded, the disruption takes a **snapshot of its subject**: title, time, venue and party size. A cancelled booking leaves the guest's lists, but the notice still reads the same.

**Severity rises by one step:**

* on a celebration day (the anniversary);
* from the third disruption on the same voyage.

**Follow-up.** A person follows up within this time, written in port time:

| Severity | Follow up within |
|---|---|
| Low | 120 minutes |
| Moderate | 60 minutes |
| High | 30 minutes |
| Critical | 15 minutes |

From high upwards, the Hotel Director is told.

## The playbook

Every plan follows the same steps, in order:

| Step | Audience | |
|---|---|---|
| 1. Inform calmly | guest | The notice: a personal message, signed by the Suite Ambassador. No exclamation marks, no blame, nothing about money. |
| 2. Explain the reason | guest | **Only when it is known** and may be shared (`reason.guest`). Otherwise there is no explanation, and the crew brief says "do not speculate". The internal reason never reaches the guest. |
| 3. Present comparable alternatives | guest | Up to three (below), when the kind allows. |
| 4. Offer concierge assistance | guest | "Ask Elena": a service request, tagged `recovery:<notice>:assist`. |
| 5. Record the event | crew | `service_recovery_events`, once, by its key. |
| Tell the Hotel Director | crew | From high severity. |
| Follow up in person | crew | The owner, by the follow-up time. |

**Example: the private sail cancelled for a mistral.** This is the `?demo=disruption` mock.

> *Under sail on a 1930s classic yacht will not go ahead.*
> Alexander, we are sorry to tell you that "Under sail on a 1930s classic yacht" on Tuesday 18 May cannot take place as planned. Elena has set aside a few comparable alternatives below…
> **The reason:** A strong mistral is forecast across the Bay of Saint-Tropez that morning, and the skipper will not take guests out in it.

The alternatives:

1. Saint-Tropez on Foot, Privately: the same morning, 10:00, €650.
2. A Private Session with the Wellness Coach, aboard.
3. Private Atelier Appointments in Monte Carlo.

Then "Ask Elena".

For the crew: severity high (a private, paid experience was lost), owner Shore Operations, follow up within 30 minutes, tell the Hotel Director. The approved rule proposes a handwritten note from the Captain.

## Comparable alternatives

Candidates come from the voyage catalogue and its live availability.

**Excluded:**

* anything already booked or requested (a restaurant only on the same evening);
* anything that clashes with the rest of the programme;
* anything starting within two hours;
* transfers.

**Scoring:**

| Reason | Points |
|---|---|
| Same day | +3 |
| Same category | +3 |
| Same kind (ashore, wellbeing, dining) | +2 |
| Shared tags | up to +2 |
| Both private | +2 |
| Similar length | +1 |
| Close to the original time | +1 |

Candidates need at least 4 points. The best slot of each experience is used. The result is a choice, not three of a kind: one per kind of experience, except the original's.

**By kind:**

| Kind | Alternatives |
|---|---|
| Excursion | As above. |
| Weather | When the weather is the cause, nothing on the water that day (sailing, boats, watersports, the marina). A weather notice with nothing of the guest's in it offers only what is aboard that day. |
| Dining | Other restaurants that evening within 90 minutes of the booking, then dinner in the suite (a request to the team). |
| Port change | What the new port offers that day. |
| Transfer, suite issue, missed service, complaint | None. A person, quickly. |

Every alternative is a **proposal**. The service carries it out only on the guest's explicit approval:

* `approved: true`, plus `acknowledgedCharge` when it has a price;
* it becomes a booking request (`received`, for the team to confirm) or a service request;
* never a booking or a charge;
* one alternative per notice.

## Goodwill: authorised rules, proposals, people

```ts
GoodwillRule {
  id, version, status: 'draft' | 'approved' | 'retired', name,
  appliesTo: DisruptionKind[], minSeverity,
  conditions?: { tiers?, occasionDay?, minRecoveries?, privateOrPaid? },
  action: { kind: 'gesture' | 'amenity' | 'upgrade' | 'service-credit' | 'refund' | 'loyalty-points', description, maxValue? },
  approval: { role, maxPerReservation },
  authorizedBy, authorizedAt, effectiveFrom?, effectiveTo?
}
```

**Matching (`evaluateGoodwill`).** A rule is matched only when all of these hold:

* it is approved;
* it names who authorised it, and when;
* it is within its dates;
* it fits the kind, severity and conditions;
* it is under its limit for the reservation.

A match is a `GoodwillProposal`, with a rationale naming the rule, version and authoriser. Every rule passed over is listed with its reason, for audit.

**Financial actions are never proposed while `GoodwillPolicy.financialEnabled` is false.** These are service credits, refunds and points. The MVP ships with the policy false, in code (`MVP_GOODWILL_POLICY`) and in the database (`goodwill_policy`). A rule that would move money also needs a ceiling and an admin as approver: a database check enforces both.

**Deciding (`decideProposal` / `decide_goodwill_proposal()`).**

* The decider must hold the rule's role (or be an admin). Financial proposals need an admin *and* the policy on.
* Approving re-checks the rule as it stands now (version, status, dates) and its limit per reservation.
* A proposal is decided once, and audited.
* **An approval records the authority to carry the gesture out. It does not carry it out.**
* Guests never see proposals.

**Fictional rules** (`src/data/fixtures/recovery.ts`, seeded):

| Rule | Status | Applies to | Proposes | Approved by |
|---|---|---|---|---|
| A private experience lost | approved | high excursion, weather or dining loss, private or paid | A handwritten note from the Captain, with a bottle from the sommelier's reserve | Suite Ambassador |
| A disruption on a celebration day | approved | moderate or worse, on the anniversary | Flowers and a celebration amenity | Suite Ambassador |
| A guest who is unhappy | approved | high complaints | A personal visit from the Hotel Director | Concierge agent |
| Repeated disruption on one voyage | **draft** | from the third disruption | An onboard credit (up to €500) | Admin |

The last rule is never matched: it is a draft, financial, and the policy is off.

**To introduce compensation later.** The engine does not change. In order:

1. An admin writes the rule, with a ceiling and the admin role.
2. It is authorised, and approved, with its dates.
3. Separately, the business switches `goodwill_policy.financial_enabled` on.
4. Proposals then appear for admins to decide.
5. Fulfilment (posting a credit to the folio, a refund to the payment provider, points to Bonvoy) would be a separate, audited integration acting only on approved proposals. It is not part of this MVP.

## `ServiceRecoveryService` (guest)

```ts
listNotices(guestId, reservationId)             // open first, newest first
getNotice(guestId, reservationId, noticeId)
acceptAlternative(…, { alternativeId, approved: true, acknowledgedCharge?, note? })
requestAssistance(…, note?)
subscribe(reservationId, onChange)
```

`ComposedRecoveryService` implements it in both modes, over the other services' contracts. It reads the stored notice (`RecoveryNoticeStore`: memory, or `recovery_notices`) and **plans it afresh** with the shared engine. So its alternatives are what is free now, not when it was recorded, and they read the same as the server's record.

A `RecoveryNotice` carries:

* the message and the reason;
* the subject;
* the alternatives (without their proposals);
* the guest's choice, and whether help was asked for;
* the assurance.

It never carries severity, the crew brief, the steps or goodwill.

`ServiceRecoveryOperations` is the crew's side: `listRecords`, `listProposals`, `decideProposal`. It is not part of the guest app's `Services`. Mock: `MemoryRecoveryStore.operations(actor)`. Supabase: `SupabaseRecoveryOperations`, under crew RLS and the decide RPC.

### Screens

| Route | What it shows |
|---|---|
| Home, "For your attention" | The newest open notice: "A change to your plans · 18 May", title, "Elena has 3 comparable alternatives for you." The all-clear is not shown beside it. |
| `/recovery/[id]` | The letter; "The reason" (when known); "Comparable alternatives", each with "Before we send it" (exactly what will be sent, the price to acknowledge, an optional note); then "Your choice" once chosen; "Concierge assistance" (Ask Elena); the assurance. |

**Mock demo.** Open the web build with `?demo=disruption`: the classic sail is cancelled and its recovery recorded at start-up. Without it, nothing changes.

## Server

* **`journey-events`.** A disruption event is now also recorded as a recovery, before the alert is projected, so the alert opens the notice (`/recovery/<id>`). It uses the policy in `goodwill_policy`. Suite issue, missed service and complaint events make no second alert card.
* **`service-recovery-scan`** (new). Runs on a schedule with `RECOVERY_CRON_SECRET`; guests cannot call it. For reservations in progress or within three days, it detects disruptions in the guest's own data and records each once. Requests raised from a notice (tagged `recovery:`) are never detected again.

  ```sql
  select cron.schedule('service-recovery-scan', '*/15 * * * *',
    $$ select net.http_post(url := '<project>/functions/v1/service-recovery-scan',
                            headers := jsonb_build_object('Authorization', 'Bearer <RECOVERY_CRON_SECRET>')) $$);
  ```

* **Migration `20261009000000_service_recovery.sql`.**
  * `service_recovery_events`: crew read; written by the service role.
  * `recovery_notices`: the party and crew read. A check refuses an internal reason, quotes or guest ids. Guests answer only through `respond_to_recovery_notice()`, whose booking or request must be on the same reservation.
  * `goodwill_rules`: crew read, admins write. Checks: approved means authorised; money needs a ceiling and an admin.
  * `goodwill_policy`: one row, financial off.
  * `goodwill_proposals`: crew read; decided only through `decide_goodwill_proposal()`.
* **Audit.** It records kinds, counts, severity and decisions, never the guest's words or the reason.

## Tests

* **`check:recovery`** (147 checks):
  * the context and port time;
  * all eight kinds from events, and detection in the guest's data (missed updates, suite faults, complaints; not requests raised from a recovery);
  * the playbook order and audiences;
  * calm wording with no blame and no compensation, for every kind;
  * the reason explained only when known, with the internal reason and quotes never shown to the guest;
  * severity, modifiers and follow-up times;
  * the demo's alternatives: comparable, free, not booked, no clash, nothing on the water, never too close to the start, a choice of kinds;
  * dining, port change and aboard-only weather;
  * guest-safe notices that plan the same;
  * goodwill: approved, authorised and effective only; the draft and financial rules never proposed in the MVP; the limit, roles, admin for money, re-checks and a single decision;
  * the service: recorded once, notices without crew fields, approval and price acknowledgement required, a booking request (never a booking), once only, assistance tagged, listeners, crew operations and roles;
  * view models.
* **`test:supabase`** (34 more checks):
  * recorded through the server ports, once, audited without words;
  * the guest's notice under RLS, agreeing with the server's record to the word, and the same after the booking is cancelled;
  * guests cannot read events or proposals, write notices or answer another party's;
  * the database refuses a notice with an internal reason;
  * acceptance becomes a `received` booking request, once; assistance is a tagged request;
  * crew read records and proposals; shore operations cannot approve a Suite Ambassador's gesture; a single decision;
  * rule checks; the policy is off;
  * the scan records once.
* **Browser** (`rectest`, 20 checks): the default Home is unchanged; the demo on Home; the notice, reason and alternatives; approval with the price acknowledged; the choice; Ask Elena; requests; 320 px; an unknown notice; no page errors.
