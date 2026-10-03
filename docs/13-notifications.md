# 13 · Contextual notifications and push

Notifications are **derived from the guest's own data**, not authored one by one. A dinner booking yields a reminder. A request moving on yields a service update. A programme item whose time moved yields an itinerary change.

One shared engine decides what to say and when. The app uses it for the inbox; a scheduled Edge Function uses it for push. Both agree on every notification by its stable key.

```
guest data ──▶ engine (rules) ──▶ candidates  { key, type, title, body, at, expiresAt, deepLink, timeSensitive }
           ──▶ decide (preferences, push channel, privacy, quiet hours) ──▶ { delivery: push | in-app | off, deliverAt }
                 │                                    │
                 ▼                                    ▼
   app: NotificationService                server: notifications-dispatch (every 5 min)
   inbox (due now) · coming up · read     due in (since, until] → Expo push → record once (dedupe_key)
```

The code is in `supabase/functions/_shared/notifications/`:

* `types.ts` and `engine.ts` hold the rules, preferences, quiet hours and windows;
* `dispatch.ts` holds the dispatcher and the Expo and dry-run senders;
* `supabaseDispatch.ts` holds the server-side ports.

It is self-contained, so the same files run in the app (Metro and Node) and in Deno. Service-request statuses and timelines come from `_shared/requests/rules.ts`, which is also shared.

## Types

| Type | Comes from | Example |
|---|---|---|
| **Information** | Arrival in port; informational messages the server sends | "Welcome to Monte Carlo." |
| **Reminder** | A confirmed booking about to begin; all aboard on a day ashore | "Dinner at Mediterraneo begins at 8:30 PM." |
| **Service update** | A request acknowledged, in progress, needing a reply, resolved; the driver on the way | "Your transfer driver will arrive in 20 minutes." |
| **Reservation** | Booking news the server sends (confirmed, changed) | "Your Sagrada Família visit is confirmed" |
| **Itinerary change** | A programme item whose time moved (`previousStart`, `changedAt`) | "Tomorrow's marina activity has moved to 3:00 PM." |
| **Urgent** | Urgent alerts (weather, tenders, safety) | "Tenders paused in Portofino" |
| **Recommendation** | One actionable idea per coming port day, the evening before, at most three | "A private wine experience is available in Mallorca." |

**Timing.**

| Notification | When it goes out |
|---|---|
| Dinner reminder | 2 hours before |
| Spa and ashore reminders | 1 hour before |
| "Earlier" reminders | Twice as early |
| All aboard | 90 minutes before |
| Driver | 20 minutes before pick-up |
| Itinerary change | The moment it was made |
| Recommendation | 18:00 the evening before |

**What makes no notification.**

* Non-urgent alerts stay attention cards on Home. When one warrants a message, the server sends it (stored with the alert's key), so nothing appears twice.
* A request the guest withdrew.
* Bookings that are only requested.

**Keys** are stable, for example `reminder:<booking>`, `transfer:<booking>:arriving`, `moved:<activity>:<start>` and `request:<id>:<status>`. A notification the server has sent (stored with `dedupe_key`) replaces its generated twin in the inbox, keeping the server's words.

## Preferences

Notification preferences live with the guest's **communication preferences** (`communication.notifications`). That one versioned record is editable in Profile and synced in Supabase mode, next to the channels and quiet hours.

| Setting | Values | Default |
|---|---|---|
| Per type | Push · In the app · Off | Push for urgent, itinerary changes, reminders, service updates and reservations; in the app for information and recommendations |
| Times | 7:30 PM · 19:30 | By language (12-hour for en-US); notifications are often read on the lock screen |
| Reminders | At the usual time · A little earlier | Usual time |

These rules always apply:

* **Urgent is always pushed**, even in quiet hours. The service refuses any change to it.
* If the **push channel is off** in Communication, everything stays in the app.
* **Recommendations follow privacy.** With personalised recommendations off, there are none.
* **Quiet hours** (e.g. 23:00–07:00, wrapping midnight) hold pushes that can wait until the end of quiet hours.
  * Time-sensitive pushes (the driver) and urgent ones are not held.
  * A push held past its moment (its `expiresAt`) is not sent late. It stays in the inbox.

## `NotificationService`

```ts
list(guestId, reservationId, { type? })   // inbox: due now, newest first, with read state
upcoming(guestId, reservationId)          // pushes still to come (after quiet hours if held)
unreadCount · markRead(keys) · markAllRead
getSettings · updatePreferences(patch)    // urgent cannot be changed
registerDevice({ token, platform, name }) · listDevices · unregisterDevice
subscribe(guestId, reservationId, onChange)
```

`ComposedNotificationService` implements it over the other services' contracts in both modes:

* bookings, the day programme, requests, alerts, stored notifications, personalised recommendations and preferences;
* a small `NotificationStateStore` for read state and devices: `MemoryNotificationState` in the mock, `SupabaseNotificationState` in Supabase.

### Screens

| Route | What it shows |
|---|---|
| `/notifications` | "For you": unread count, mark all as read, a filter by type, Coming up (the next three pushes), and the inbox grouped by day. Tapping one marks it read and opens its internal route |
| `/notifications/settings` | Each type (Push · In the app · Off; urgent locked on; recommendations locked off by privacy), time format, reminder timing, quiet hours explained, this device's push |

Ways in: the bell on Home (with the unread count), and Profile › Communication.

## Push architecture (Expo Notifications)

### On the server (in place)

**`push_devices`**: one row per Expo push token.

* A guest registers only through `register_push_device()`. A token belongs to a device, so the last account to sign in on it owns it.
* The guest can see their devices (platform, name, dates) but cannot read any token back.
* Dead tokens are disabled with `disabled_reason`.

**`notifications`**: the outbound record of every push.

* `type`, `dedupe_key` (unique per guest), `push_status` (`sent` or `dry-run`), `push_ticket`.
* Guests may only set `read_at`.

**`notification_receipts`**: read state of contextual notifications, the guest's own only.

**`notifications-dispatch`** (Edge Function). It runs every five minutes, called by `pg_cron` with `NOTIFICATIONS_CRON_SECRET`; guests cannot call it. Each run:

1. Finds guests with an enabled device and a voyage in progress or within three days.
2. Loads the same inputs as the app (service role, same views), runs the engine and applies preferences.
3. Picks pushes whose `deliverAt` falls in the last 15 minutes. The window overlaps the schedule, so a late run catches up. Anything expired or already recorded (`dedupe_key`) is skipped.
4. Sends one message per device via `PushSender`:
   * `title`, `body`;
   * `data: { key, type, route }`;
   * `channelId: rcyc-<type>`;
   * `priority: high` and a sound only for urgent or time-sensitive;
   * a `ttl` until it expires.
5. Records each push once. A push that failed on every device is not recorded, so the next run retries it.
6. Disables `DeviceNotRegistered` tokens.

**Secrets.**

* `NOTIFICATIONS_PUSH_MODE` is `dry-run` (the default: records without sending) or `expo`.
* `EXPO_ACCESS_TOKEN` is needed when Expo's enhanced push security is on.

**Next on the server.** Poll Expo push **receipts** about 15 minutes after sending, to catch late `DeviceNotRegistered` and `MessageRateExceeded` errors. This needs a `receipt_checked_at` column and a second action in the function.

### In the app (designed; one adapter to add)

The app talks to push only through `PushRegistrar` (`src/services/push/PushRegistrar.ts`): `supported`, `permission()`, `enable()` and `onOpen(handler)`. Today it is `UnsupportedPushRegistrar`, and Settings explains that push arrives in the iOS and Android apps.

To switch push on:

1. **Add the dependencies.** `npx expo install expo-notifications expo-device`. Add the `expo-notifications` config plugin to `app.json`, with icon, colour and default channel.
2. **Credentials.** Configure APNs and FCM in EAS (`eas credentials`). Make sure `extra.eas.projectId` is set.
3. **Write `ExpoPushRegistrar`** (native only) to replace `UnsupportedPushRegistrar` in `registry.ts`. It:
   * returns `unsupported` unless `Device.isDevice`;
   * sets one Android channel per type with `Notifications.setNotificationChannelAsync('rcyc-<type>', …)`. Urgent gets `importance: HIGH`, the others `DEFAULT`, so guests can tune them in system settings;
   * on `enable()`, calls `requestPermissionsAsync()` and then `getExpoPushTokenAsync({ projectId })`;
   * on `onOpen`, listens with `addNotificationResponseReceivedListener` and reads `response.notification.request.content.data`;
   * sets a handler with `setNotificationHandler`. In the foreground it shows a banner only for urgent and time-sensitive types; the rest are quietly added to the inbox.
4. **Wire it up.**
   * When the guest enables push in Settings (or after the first booking), call `NotificationService.registerDevice` with the token and platform. Repeat at sign-in, because tokens can rotate.
   * At sign-out, call `unregisterDevice`.
   * When a push is tapped, call `markRead([data.key])` and `router.push(routeFromPush(data))`. Only internal routes are allowed; anything else opens Home.
5. **Switch the server on.** Set `NOTIFICATIONS_PUSH_MODE=expo` and schedule the function:

   ```sql
   select cron.schedule('notifications-dispatch', '*/5 * * * *',
     $$ select net.http_post(url := '<project>/functions/v1/notifications-dispatch',
                             headers := jsonb_build_object('Authorization', 'Bearer <NOTIFICATIONS_CRON_SECRET>')) $$);
   ```

**Privacy and safety.**

* Tokens are never shown or logged.
* The payload carries no PII beyond the visible text. Titles and bodies are written for a lock screen; for example, the occasion message names no person.
* Deep links are validated on both ends (a database check plus `safeRoute`).
* Audit records counts per run, never message text.

## Tests

* **`check:notifications`** (69 checks):
  * the four examples word for word;
  * all seven types, unique and stable keys, determinism, dedupe with server messages;
  * preferences, push channel, privacy;
  * quiet hours (across midnight, the driver not held, nothing sent late), earlier reminders, 12- and 24-hour times;
  * inbox, upcoming and the dispatch window;
  * the service (read state, settings validation, devices that never return tokens);
  * the dispatcher (window, no re-sends, dead tokens, retries) and the Expo sender (batches of 100, access token, tickets);
  * view models and push routing.
* **`test:supabase`**:
  * inbox and "coming up" parity with the mock;
  * receipts, preferences and devices under RLS, with tokens unreadable;
  * a dry-run dispatch through PostgREST that records once, never re-sends, and shows once in the inbox;
  * dead tokens disabled.
