/// <reference types="node" />
/**
 * Builds Supabase seed rows from the FICTIONAL development dataset.
 *
 * IDs are deterministic UUIDs derived from the fixture IDs (UUID v5), so the
 * seed is reproducible and tests can map Supabase results back to fixtures.
 * Every row is marked `source_system = 'mock'`; the e-mail domain is the
 * reserved example.com.
 */
import { createHash } from 'node:crypto';
import { devDataset as d } from '@/data/fixtures';
import { scoreFixtures } from '@/services/mock/MockMiscServices';
import { fromPersonalized } from '@/services/shared/recommendations';
import { ENGINE_VERSION } from '../../supabase/functions/_shared/personalization/engine';

// ─── Deterministic IDs ─────────────────────────────────────────────────────

const NAMESPACE = Buffer.from('6f1c2e8a4b7d4e3f9a1b2c3d4e5f6a7b', 'hex');
const idMap = new Map<string, string>();

/** UUID v5 of a fixture ID. */
export function uuidFor(fixtureId: string): string {
  const hash = createHash('sha1').update(NAMESPACE).update(fixtureId).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  idMap.set(uuid, fixtureId);
  return uuid;
}

/** Fixture ID for a seeded UUID (after the rows have been built). */
export function fixtureIdFor(uuid: string): string | undefined {
  return idMap.get(uuid);
}

// ─── SQL value helpers ─────────────────────────────────────────────────────

/** A raw SQL expression, inserted verbatim. Only for values built here. */
export class Sql {
  constructor(readonly text: string) {}
}
export const sql = (text: string) => new Sql(text);

type Value = string | number | boolean | null | undefined | Sql | string[] | Record<string, unknown> | readonly unknown[];

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const textArray = (a: readonly string[]) => (a.length ? `array[${a.map(quote).join(', ')}]::text[]` : `'{}'::text[]`);
const uuidArray = (a: readonly string[]) => (a.length ? `array[${a.map(quote).join(', ')}]::uuid[]` : `'{}'::uuid[]`);
const jsonb = (v: unknown) => `${quote(JSON.stringify(v))}::jsonb`;
const point = (p?: { lat: number; lng: number }) => (p ? sql(`point(${p.lng}, ${p.lat})`) : null);

export const uuids = (ids: readonly string[]) => sql(uuidArray(ids.map(uuidFor)));
export const json = (v: unknown) => (v === undefined || v === null ? null : sql(jsonb(v)));
export const texts = (a: readonly string[] | undefined) => sql(textArray(a ?? []));

export function literal(v: Value): string {
  if (v === null || v === undefined) return 'null';
  if (v instanceof Sql) return v.text;
  if (typeof v === 'string') return quote(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return textArray(v as string[]);
  return jsonb(v);
}

export type Row = Record<string, Value>;
export interface TableRows {
  table: string;
  rows: Row[];
}

// ─── Time zones ────────────────────────────────────────────────────────────

const HOME_ZONE = 'America/New_York'; // Miami
const AIRPORT_ZONE: Record<string, string> = { MIA: 'America/New_York', BCN: 'Europe/Madrid', FCO: 'Europe/Rome' };

/** The zone the guest is in on a local date: the port's during the voyage, home otherwise. */
/** Engine keys embed fixture IDs ("request:dev_srq_bridge:in_progress"): seed them with UUIDs. */
const keyIds = (key: string) => key.replace(/dev_[a-z0-9_]+/g, (id) => uuidFor(id));

export function zoneOn(iso: string): string {
  const date = iso.slice(0, 10);
  return d.voyage.voyage.itinerary.find((p) => p.date === date)?.timeZone ?? HOME_ZONE;
}

// ─── Rows ──────────────────────────────────────────────────────────────────

const mock = 'mock';

export function buildSeedRows(): TableRows[] {
  const { profile, membership, relationship, privileges } = d.guest;
  const { guest, preferences, companions, occasions } = profile;
  const v = d.voyage;
  const x = d.experiences;
  const companion = companions[0]!;
  const reservationId = v.reservation.id;
  const evrima = v.yacht;

  const voyages = [v.voyage, ...v.pastVoyages];
  const pastReservationId = (voyageId: string) => `${voyageId}_rsv`;
  const portById = new Map(v.voyage.itinerary.map((p) => [p.id, p]));
  const availabilityById = new Map(x.availability.map((a) => [a.experienceId, a]));
  const anniversary = occasions.find((o) => o.type === 'anniversary');

  const tables: TableRows[] = [];
  const add = (table: string, rows: Row[]) => tables.push({ table, rows });

  // Identity
  add('public.guests', [
    {
      id: uuidFor(guest.id), salutation: guest.salutation, first_name: guest.firstName, last_name: guest.lastName,
      preferred_name: guest.preferredName, email_masked: guest.emailMasked, phone_masked: guest.phoneMasked,
      home_city: guest.homeCity, home_airport: guest.homeAirport, guest_since: guest.guestSince, source_system: mock,
    },
    {
      id: uuidFor(companion.id), salutation: 'Mrs. Laurent', first_name: companion.firstName, last_name: companion.lastName,
      preferred_name: companion.firstName, email_masked: 'c••••••@example.com', home_city: guest.homeCity,
      home_airport: guest.homeAirport, guest_since: guest.guestSince, source_system: mock,
    },
  ]);
  add('private.guest_pii', [
    { guest_id: uuidFor(guest.id), email: 'alexander.laurent@example.com', phone: '+1 305 555 0147', date_of_birth: guest.dateOfBirth, nationality: guest.nationality },
    { guest_id: uuidFor(companion.id), email: 'camille.laurent@example.com', nationality: 'French' },
  ]);

  // Loyalty
  add('public.loyalty_memberships', [
    {
      guest_id: uuidFor(guest.id), programme: membership.programme, member_number_masked: membership.memberNumberMasked,
      tier: membership.tier, tier_label: membership.tierLabel, lifetime_status: membership.lifetimeStatus,
      member_since: membership.memberSince, points_balance: membership.pointsBalance, source_system: mock,
    },
  ]);
  add('public.guest_relationships', [
    {
      guest_id: uuidFor(guest.id), voyages_completed: relationship.voyagesCompleted, nights_sailed: relationship.nightsSailed,
      first_voyage_date: relationship.firstVoyageDate, yachts_sailed: texts(relationship.yachtsSailed),
      value_segment: relationship.valueSegment, ambassador_name: relationship.ambassadorName,
    },
  ]);
  add('public.privileges', privileges.map((p) => ({ id: uuidFor(p.id), code: p.id, title: p.title, description: p.description, category: p.category, basis: p.basis })));

  // Fleet & voyages
  add('public.yachts', [
    {
      id: uuidFor(evrima.id), name: evrima.name, tagline: evrima.tagline, guest_capacity: evrima.guestCapacity, suites: evrima.suites,
      crew: evrima.crew, length_m: evrima.lengthMeters, highlights: texts(evrima.highlights), hero: json(evrima.hero),
    },
    { id: uuidFor(d.voyage.pastVoyages[2]!.yachtId), name: 'Ilma', tagline: 'A sister yacht to Evrima.', highlights: texts([]), hero: json({ alt: 'Ilma under way', tone: ['#1F3A4D', '#7F9C96'] }) },
  ]);
  add('public.suites', [
    {
      id: uuidFor(v.suite.id), yacht_id: uuidFor(evrima.id), number: v.suite.number, name: v.suite.name, category: v.suite.category,
      deck: v.suite.deck, area_sqm: v.suite.areaSqm, terrace_sqm: v.suite.terraceSqm, features: texts(v.suite.features), hero: json(v.suite.hero),
    },
  ]);
  add('public.voyages', voyages.map((vo) => ({
    id: uuidFor(vo.id), code: vo.code, name: vo.name, yacht_id: uuidFor(vo.yachtId), start_date: vo.startDate, end_date: vo.endDate,
    region: vo.region, hero: json(vo.hero), source_system: mock,
  })));
  add('public.port_calls', v.voyage.itinerary.map((p) => ({
    id: uuidFor(p.id), voyage_id: uuidFor(v.voyage.id), day: p.day, call_date: p.date, type: p.type, port_name: p.portName,
    country: p.country, time_zone: p.timeZone, arrival: p.arrival, departure: p.departure, all_aboard: p.allAboard,
    summary: p.summary, location: point(p.location), hero: json(p.hero),
  })));
  add('public.voyage_days', x.daySchedules.map((s) => ({
    id: uuidFor(`${v.voyage.id}_day_${s.dayNumber}`), voyage_id: uuidFor(v.voyage.id), day: s.dayNumber, day_date: s.date,
    port_call_id: uuidFor(s.portCallId), headline: s.headline, dress_code: s.dressCode, sunset: s.sunset,
    time_zone: portById.get(s.portCallId)?.timeZone ?? zoneOn(s.date),
  })));

  // Reservations (the current voyage, plus completed past voyages)
  add('public.reservations', [
    {
      id: uuidFor(reservationId), booking_reference: v.reservation.bookingReference, voyage_id: uuidFor(v.reservation.voyageId),
      suite_id: uuidFor(v.reservation.suiteId), lead_guest_id: uuidFor(v.reservation.leadGuestId), status: v.reservation.status,
      suite_ambassador: v.reservation.suiteAmbassador, suite_ambassador_contact: json(v.reservation.suiteAmbassadorContact), source_system: mock,
    },
    ...v.pastVoyages.map((vo) => ({
      id: uuidFor(pastReservationId(vo.id)), booking_reference: `${vo.code.slice(0, 2)}-${vo.code.slice(2)}-LAU`, voyage_id: uuidFor(vo.id),
      lead_guest_id: uuidFor(guest.id), status: 'completed', source_system: mock,
    })),
  ]);
  const party = (res: string) => [
    { reservation_id: uuidFor(res), guest_id: uuidFor(guest.id), relationship: 'lead', is_minor: false },
    { reservation_id: uuidFor(res), guest_id: uuidFor(companion.id), relationship: companion.relationship, is_minor: companion.isMinor },
  ];
  add('public.reservation_guests', [...party(reservationId), ...v.pastVoyages.flatMap((vo) => party(pastReservationId(vo.id)))]);
  const e = v.embarkation;
  add('public.embarkations', [
    {
      reservation_id: uuidFor(e.reservationId), terminal_name: e.terminalName, address: e.address, location: point(e.location),
      arrival_window_start: e.arrivalWindowStart, arrival_window_end: e.arrivalWindowEnd, suite_ready_at: e.suiteReadyAt,
      all_aboard: e.allAboard, departure: e.departure, check_in_status: e.checkInStatus, luggage: json(e.luggage),
      notes: texts(e.notes), time_zone: v.voyage.itinerary[0]!.timeZone,
    },
  ]);
  add('public.flight_segments', v.flights.map((f) => ({
    id: uuidFor(f.id), reservation_id: uuidFor(f.reservationId), direction: f.direction, carrier: f.carrier, flight_number: f.flightNumber,
    origin: f.origin, destination: f.destination, departure: f.departure, departure_tz: AIRPORT_ZONE[f.origin] ?? 'UTC',
    arrival: f.arrival, arrival_tz: AIRPORT_ZONE[f.destination] ?? 'UTC', cabin: f.cabin, status: f.status,
    tracked_for_transfer: f.trackedForTransfer, source_system: mock,
  })));
  add('public.travel_documents', v.documents.map((doc) => ({
    id: uuidFor(doc.id), reservation_id: uuidFor(reservationId), guest_id: uuidFor(doc.guestId), type: doc.type, label: doc.label,
    status: doc.status, detail: doc.detail, due_by: doc.dueBy,
  })));

  // Profile
  const { guestId: _g, ...groups } = preferences;
  add('public.guest_preferences', [
    {
      guest_id: uuidFor(guest.id), preferred_destinations: texts(groups.preferredDestinations), dining: json(groups.dining),
      dietary: json(groups.dietary), beverage: json(groups.beverage), suite: json(groups.suite),
      activity_interests: texts(groups.activityInterests), excursions: json(groups.excursions), spa: json(groups.spa),
      transportation: json(groups.transportation), accessibility: json(groups.accessibility),
      communication: json(groups.communication), privacy: json(groups.privacy), version: 1,
    },
  ]);
  add('public.travel_companions', companions.map((c) => ({
    id: uuidFor(c.id), guest_id: uuidFor(guest.id), companion_guest_id: c.guestId ? uuidFor(c.guestId) : null,
    first_name: c.firstName, last_name: c.lastName, relationship: c.relationship, is_minor: c.isMinor, notes: c.notes,
  })));
  add('public.guest_occasions', occasions.map((o) => ({
    id: uuidFor(o.id), guest_id: uuidFor(guest.id), type: o.type, label: o.label, occasion_date: o.date,
    person_ids: uuids(o.personIds), recognition: o.recognition,
  })));
  add('public.guest_privileges', privileges.map((p, i) => ({
    id: uuidFor(`${guest.id}_${p.id}`), guest_id: uuidFor(guest.id), privilege_id: uuidFor(p.id),
    voyage_id: p.appliesToVoyageId ? uuidFor(p.appliesToVoyageId) : null, sort_order: i,
  })));

  // Catalogue
  add('public.experiences', x.catalogue.map((exp, i) => {
    const a = availabilityById.get(exp.id);
    return {
      id: uuidFor(exp.id), voyage_id: uuidFor(v.voyage.id), port_call_id: exp.portCallId ? uuidFor(exp.portCallId) : null,
      category: exp.category, title: exp.title, subtitle: exp.subtitle, description: exp.description, duration_minutes: exp.durationMinutes,
      price_minor: exp.price?.amountMinor, currency: exp.price?.currency, inclusive: exp.inclusive, private_available: exp.privateAvailable,
      capacity: exp.capacity, tags: texts(exp.tags), hero: json(exp.hero), format: exp.format, includes: texts(exp.includes),
      destination: exp.destination, availability_status: a?.status, availability_note: a?.note, sort_order: i,
    };
  }));
  add('public.experience_slots', x.availability.flatMap((a) => a.slots.map((s) => ({
    id: uuidFor(`${a.experienceId}_${s.start}`), experience_id: uuidFor(a.experienceId), starts_at: s.start, ends_at: s.end,
    remaining: s.remaining, time_zone: zoneOn(s.start),
  }))));
  add('public.destinations', x.destinations.map((dst, i) => ({
    id: uuidFor(dst.id), voyage_id: uuidFor(v.voyage.id), port_call_id: dst.portCallId ? uuidFor(dst.portCallId) : null,
    name: dst.name, country: dst.country, standfirst: dst.standfirst, hero: json(dst.hero), sort_order: i,
  })));
  add('public.discover_collections', x.collections.map((c, i) => ({
    id: uuidFor(c.id), voyage_id: uuidFor(v.voyage.id), title: c.title, standfirst: c.standfirst, category: c.category,
    experience_ids: uuids(c.experienceIds), sort_order: i,
  })));

  // Bookings and programme
  add('public.experience_bookings', x.bookings.map((b) => ({
    id: uuidFor(b.id), reservation_id: uuidFor(b.reservationId), experience_id: uuidFor(b.experienceId), title: b.title,
    starts_at: b.start, ends_at: b.end, party_size: b.partySize, venue: b.venue, status: b.status, note: b.note,
    time_zone: zoneOn(b.start), source_system: mock,
  })));
  const dining = x.bookings.filter((b) => b.category === 'dining');
  add('public.dining_bookings', dining.map((b) => ({
    booking_id: uuidFor(b.id),
    table_preference: /terrace/i.test(b.venue) ? 'terrace' : b.experienceId === 'dev_exp_chefs_counter' ? 'chefs-table' : 'window',
    seating_note: b.note, dietary_shared: preferences.privacy.shareDietaryWithPartners,
    occasion_id: anniversary && b.start.startsWith(anniversary.date) ? uuidFor(anniversary.id) : null,
  })));
  add('public.spa_bookings', x.bookings.filter((b) => b.category === 'spa').map((b) => ({
    booking_id: uuidFor(b.id), treatment_room: b.venue, pressure: b.experienceId === 'dev_exp_deep_tissue' ? preferences.spa.pressure : null,
  })));
  add('public.excursion_bookings', x.bookings.filter((b) => ['excursion', 'culture', 'wine', 'private'].includes(b.category)).map((b) => ({
    booking_id: uuidFor(b.id), meeting_point: b.venue, return_by: b.end,
  })));
  add('public.activities', x.daySchedules.flatMap((s) => s.items.map((i) => ({
    id: uuidFor(i.id), voyage_id: uuidFor(v.voyage.id),
    // Ship-wide events have no reservation; bookings and suggestions are the party's own.
    reservation_id: i.kind === 'booking' || i.kind === 'recommendation' ? uuidFor(reservationId) : null,
    day: s.dayNumber, starts_at: i.start, ends_at: i.end, title: i.title, location: i.location, kind: i.kind,
    booking_id: i.bookingId ? uuidFor(i.bookingId) : null, category: i.category, time_zone: zoneOn(i.start),
    previous_starts_at: i.previousStart, changed_at: i.changedAt,
  }))));

  // Concierge
  const conversationId = `${reservationId}_${guest.id}_cnv`;
  const history = d.concierge.history;
  add('public.concierge_conversations', [
    { id: uuidFor(conversationId), reservation_id: uuidFor(reservationId), guest_id: uuidFor(guest.id), assigned_team: 'suite-ambassador', created_at: history[0]?.createdAt },
  ]);
  add('public.concierge_messages', history.map((m) => ({
    id: uuidFor(m.id), conversation_id: uuidFor(conversationId), author: m.author, author_name: m.authorName, body: m.body,
    intent: m.intent, attachments: json(m.attachments ?? []), suggestions: texts(m.suggestions), created_at: m.createdAt,
  })));
  add('public.service_requests', d.concierge.requests.map((r) => ({
    id: uuidFor(r.id), reservation_id: uuidFor(r.reservationId), type: r.type, summary: r.summary, details: r.details,
    status: r.status, priority: r.priority, assigned_team: r.assignedTeam, assigned_to_name: r.assignedTo,
    next_update_by: r.nextUpdateBy, created_at: r.createdAt, updated_at: r.updatedAt, time_zone: zoneOn(r.createdAt),
    experience_id: r.experienceId ? uuidFor(r.experienceId) : null, booking_id: r.bookingId ? uuidFor(r.bookingId) : null,
    category: r.category, guest_id: r.guestId ? uuidFor(r.guestId) : null, resolution_notes: r.resolutionNotes,
    acknowledged_at: r.acknowledgedAt, started_at: r.startedAt, resolved_at: r.resolvedAt, closed_at: r.closedAt,
    // Plan steps embed the occasion's ID: seed it as the occasion's UUID.
    occasion_step: r.occasionStep?.replace(/dev_[a-z0-9_]+/g, (id) => uuidFor(id)),
  })));

  // Continuity
  const EVENT_TYPE: Record<string, string> = {
    dev_evt_docs_due: 'documents.due',
    dev_evt_srq_bridge: 'service.request_updated',
    dev_evt_flight_tracked: 'flight.tracked',
  };
  const alerts = d.communication.alerts;
  add('public.journey_events', alerts.map((a) => ({
    id: uuidFor(a.eventId), type: EVENT_TYPE[a.eventId] ?? 'general', reservation_id: uuidFor(reservationId),
    guest_ids: uuids([guest.id]), severity: a.severity, source: 'mock', dedupe_key: a.eventId, occurred_at: a.createdAt, processed_at: a.createdAt,
  })));
  add('public.journey_alerts', alerts.map((a) => ({
    id: uuidFor(a.id), event_id: uuidFor(a.eventId), event_type: EVENT_TYPE[a.eventId] ?? 'general', reservation_id: uuidFor(reservationId),
    severity: a.severity, title: a.title, body: a.body, handled: a.handled, action_label: a.action?.label, action_route: a.action?.route,
    acknowledged_at: a.acknowledged ? a.createdAt : null, created_at: a.createdAt, expires_at: a.expiresAt, time_zone: zoneOn(a.createdAt),
  })));
  add('public.notifications', d.communication.notifications.map((n) => ({
    id: uuidFor(n.id), guest_id: uuidFor(n.guestId), reservation_id: n.reservationId ? uuidFor(n.reservationId) : null,
    channel: n.channel, category: n.category, title: n.title, body: n.body, deep_link: n.deepLink, scheduled_for: n.scheduledFor,
    delivered_at: n.deliveredAt, read_at: n.readAt, bypass_quiet_hours: n.bypassQuietHours, time_zone: zoneOn(n.scheduledFor),
    type: n.type, dedupe_key: n.dedupeKey ? keyIds(n.dedupeKey) : null,
  })));
  // Contextual notifications the guest had already read; keys embed record IDs.
  add('public.notification_receipts', d.communication.readNotificationKeys.map((k) => ({ guest_id: uuidFor(guest.id), notification_key: keyIds(k), read_at: d.meta.referenceNow })));

  // Personalization: curated picks, crew opportunities, and the rules
  // scorer's output materialised server-side (as a batch job would).
  const recRow = (r: (typeof d.personalization.recommendations)[number], modelVersion: string) => ({
    id: uuidFor(r.id), guest_id: uuidFor(guest.id), reservation_id: uuidFor(reservationId), surface: r.surface, kind: r.kind,
    experience_id: r.experienceId ? uuidFor(r.experienceId) : null, title: r.title, rationale: r.rationale, score: r.score,
    drivers: texts(r.drivers), audience: r.audience, model_version: modelVersion,
  });
  add('public.recommendations', [
    ...d.personalization.recommendations.map((r) => recRow(r, 'curated')),
    ...scoreFixtures().map((r) => recRow(fromPersonalized(r, 'discover'), ENGINE_VERSION)),
  ]);
  add('public.personalization_signals', d.personalization.signals.map((s) => ({
    guest_id: uuidFor(s.guestId), kind: s.kind, weight: s.weight, observed_at: s.observedAt, source: s.source,
    value: json({ ref: s.id, summary: s.summary, memory: s.memory, category: s.category, voyageId: s.voyageId ? uuidFor(s.voyageId) : undefined, rating: s.rating, tags: s.tags }),
  })));

  // Service recovery: the goodwill rules (business configuration; the draft is never matched).
  add('public.goodwill_rules', d.recovery.goodwillRules.map((r) => ({
    id: r.id, version: r.version, status: r.status, name: r.name, applies_to: texts(r.appliesTo), min_severity: r.minSeverity,
    conditions: json(r.conditions), action: json(r.action), approval: json(r.approval),
    authorized_by: r.authorizedBy ?? null, authorized_at: r.authorizedAt ?? null, effective_from: r.effectiveFrom ?? null, effective_to: r.effectiveTo ?? null,
  })));

  // Voyage history: past voyages as recorded (moments with a weight are the engine's history).
  add('public.voyage_history', d.voyageHistory.records.map((r) => ({
    guest_id: uuidFor(r.guestId), voyage_id: uuidFor(r.voyageId), yacht_name: r.yachtName, suite_label: r.suite,
    destinations: json(r.destinations), moments: json(r.moments), saved_preferences: json(r.savedPreferences), photos: json(r.photos),
  })));

  // After the voyage: fictional voyages to inspire the next one.
  add('public.voyage_inspirations', d.postVoyage.voyageInspirations.map((v) => ({
    id: uuidFor(v.id), name: v.name, region: v.region, yacht_name: v.yachtName, start_date: v.startDate, end_date: v.endDate,
    nights: v.nights, ports: texts(v.ports), tags: texts(v.tags), standfirst: v.standfirst, highlight: v.highlight, hooks: json(v.hooks), hero: json(v.hero),
  })));

  return tables;
}

export function renderSeedSql(tables: TableRows[]): string {
  const out: string[] = [
    '-- ═══════════════════════════════════════════════════════════════════════════',
    '-- DEVELOPMENT SEED — FICTIONAL DATA ONLY. Generated by scripts/generate-seed.ts',
    `-- from ${d.meta.datasetId}. Do not edit by hand: run \`npm run seed:generate\`.`,
    '--',
    `-- ${d.meta.disclaimer}`,
    '--',
    '-- Runs after the migrations on `supabase db reset` (local only). No auth',
    '-- users are created: invite alexander.laurent@example.com from the local',
    '-- Studio (or the admin API) and the link trigger connects the account.',
    '-- ═══════════════════════════════════════════════════════════════════════════',
    '',
    '-- Refuse to run against a database that already holds non-fictional guests.',
    'do $$ begin',
    "  if exists (select 1 from public.guests where source_system <> 'mock') then",
    "    raise exception 'Refusing to load the fictional seed into a database with real guests';",
    '  end if;',
    'end $$;',
    '',
  ];
  for (const { table, rows } of tables) {
    if (!rows.length) continue;
    const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    out.push(`insert into ${table} (${columns.join(', ')}) values`);
    out.push(rows.map((r) => `  (${columns.map((c) => literal(r[c])).join(', ')})`).join(',\n'));
    out.push('on conflict do nothing;', '');
  }
  return out.join('\n');
}
