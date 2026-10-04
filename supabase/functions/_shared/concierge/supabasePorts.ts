// Supabase implementation of the pipeline's ports.
//
// Two clients: `user` carries the caller's JWT, so every read and every
// guest-side write is decided by RLS exactly as in the app; `service` (service
// role) is used only for what guests may not write themselves: AI-authored
// messages, the AI run record, team assignment and the audit log.
//
// The client type is structural, so this file runs under Deno (Edge
// Function) and Node (scripts/supabase/integration.ts) alike.
import type { Caller, ConciergePorts, EscalationTarget, OfferedAction, RawContext, RawMessage, ServiceTeam } from './types.ts';

// deno-lint-ignore no-explicit-any
type Query = any;
export interface Db {
  from(table: string): Query;
  rpc(fn: string, args?: Record<string, unknown>): Query;
}

const OPEN = ['received', 'in_progress', 'awaiting_guest'];

async function rows<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}
async function row<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T | null> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? null) as T | null;
}
async function paged<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 200) {
    const batch = await rows<T>(page(from, from + 199));
    out.push(...batch);
    if (batch.length < 200) return out;
  }
}

export function supabasePorts(user: Db, service: Db, clock: () => Date = () => new Date()): ConciergePorts {
  return {
    now: clock,

    async takeSlot(caller, limit) {
      const { data, error } = await service.rpc('concierge_take_slot', { p_user: caller.userId, p_window_seconds: limit.windowSeconds, p_max: limit.max, p_per_day: limit.perDay });
      if (error) throw new Error('rate limit unavailable');
      return data === true;
    },

    async findRun(caller, requestId) {
      // Bound to the caller: a request id alone never returns someone else's reply.
      const run = await row<{ message_ids: string[] }>(service.from('concierge_ai_runs').select('message_ids').eq('request_id', requestId).eq('actor_user_id', caller.userId).maybeSingle());
      if (!run) return null;
      const messages = await rows(service.from('concierge_messages').select('id, conversation_id, author, author_name, body, intent, attachments, suggestions, created_at, classification').in('id', run.message_ids));
      return { messages };
    },

    async loadContext(caller, conversationId) {
      // Conversations are per guest: a party member cannot speak in someone else's.
      const convo = await row<{ id: string; reservation_id: string; guest_id: string; ai_enabled: boolean }>(user.from('concierge_conversations').select('id, reservation_id, guest_id, ai_enabled').eq('id', conversationId).maybeSingle());
      if (!convo || convo.guest_id !== caller.guestId) return null;
      const res = await row<{
        id: string;
        voyage_id: string;
        suite_ambassador: string | null;
        suite_ambassador_contact: { name?: string; title?: string; availability?: string } | null;
        voyage: { name: string; start_date: string; end_date: string; region: string | null; yacht: { name: string } | null } | null;
      }>(user.from('reservations').select('id, voyage_id, suite_ambassador, suite_ambassador_contact, voyage:voyages(name, start_date, end_date, region, yacht:yachts(name))').eq('id', convo.reservation_id).maybeSingle());
      if (!res?.voyage) return null;
      const guestId = convo.guest_id;
      const [guest, companions, membership, embark, flights, ports, days, activities, bookings, catalogue, slots, prefs, occasions, requests, history] = await Promise.all([
        row<{ preferred_name: string | null; first_name: string }>(user.from('guests').select('preferred_name, first_name').eq('id', guestId).maybeSingle()),
        rows<{ first_name: string }>(user.from('travel_companions').select('first_name').eq('guest_id', guestId)),
        row<{ tier_label: string }>(user.from('loyalty_memberships').select('tier_label').eq('guest_id', guestId).maybeSingle()),
        row<{ arrival_window_start: string }>(user.from('embarkations_local').select('arrival_window_start').eq('reservation_id', res.id).maybeSingle()),
        rows<{ departure: string; direction: string }>(user.from('flight_segments_local').select('departure, direction').eq('reservation_id', res.id)),
        rows<{ id: string; day: number; call_date: string; type: string; port_name: string; country: string; arrival: string | null; departure: string | null; all_aboard: string | null }>(
          user.from('port_calls_local').select('id, day, call_date, type, port_name, country, arrival, departure, all_aboard').eq('voyage_id', res.voyage_id).order('day'),
        ),
        rows<{ day: number; day_date: string; headline: string; dress_code: string | null; sunset: string | null }>(user.from('voyage_days_local').select('day, day_date, headline, dress_code, sunset').eq('voyage_id', res.voyage_id).order('day')),
        paged<{ day: number; title: string; location: string | null; kind: string; start_local: string }>((f, t) =>
          user.from('activities_local').select('day, title, location, kind, start_local').eq('voyage_id', res.voyage_id).or(`reservation_id.is.null,reservation_id.eq.${res.id}`).order('starts_at').order('id').range(f, t),
        ),
        paged<{ id: string; experience_id: string; title: string; category: string; venue: string | null; start_local: string; end_local: string | null; party_size: number; status: string; note: string | null }>((f, t) =>
          user.from('experience_bookings_local').select('id, experience_id, title, category, venue, start_local, end_local, party_size, status, note').eq('reservation_id', res.id).order('starts_at').order('id').range(f, t),
        ),
        rows<{ id: string; title: string; category: string; subtitle: string | null; port_call_id: string | null; destination: string | null; duration_minutes: number | null; price_minor: number | null; currency: string | null; inclusive: boolean; format: string; tags: string[]; availability_status: string | null }>(
          user.from('experiences').select('id, title, category, subtitle, port_call_id, destination, duration_minutes, price_minor, currency, inclusive, format, tags, availability_status').or(`voyage_id.eq.${res.voyage_id},voyage_id.is.null`).order('sort_order'),
        ),
        paged<{ experience_id: string; start_local: string; end_local: string | null; remaining: number }>((f, t) =>
          user.from('experience_slots_local').select('experience_id, start_local, end_local, remaining').gte('starts_at', clock().toISOString()).order('starts_at').order('id').range(f, t),
        ),
        row<Record<string, unknown>>(user.from('guest_preferences').select('dining, dietary, beverage, spa, excursions, transportation, accessibility, activity_interests, privacy').eq('guest_id', guestId).maybeSingle()),
        rows<{ type: string; occasion_date: string; label: string; recognition: string }>(user.from('guest_occasions').select('type, occasion_date, label, recognition').eq('guest_id', guestId)),
        rows<{ id: string; type: string; summary: string; status: string; next_update_by: string | null }>(user.from('service_requests_local').select('id, type, summary, status, next_update_by').eq('reservation_id', res.id).in('status', OPEN).order('created_ts', { ascending: false })),
        rows<{ author: RawMessage['author']; body: string; created_at: string; attachments: { kind: string; actions?: OfferedAction[] }[] | null }>(
          user.from('concierge_messages').select('author, body, created_at, attachments').eq('conversation_id', convo.id).order('created_at', { ascending: false }).limit(8),
        ),
      ]);
      const contact = res.suite_ambassador_contact;
      const ambassador = contact?.name ?? res.suite_ambassador ?? 'your Suite Ambassador';
      const inbound = flights.find((f) => f.direction === 'inbound')?.departure;
      const embarkStart = embark?.arrival_window_start ?? `${res.voyage.start_date}T12:00:00+00:00`;
      // deno-lint-ignore no-explicit-any
      const p = (prefs ?? {}) as Record<string, any>;
      return {
        conversationId: convo.id,
        aiEnabled: convo.ai_enabled !== false,
        reservationId: res.id,
        guestId,
        preferredName: guest?.preferred_name ?? guest?.first_name ?? 'Guest',
        companionFirstNames: companions.map((c) => c.first_name),
        tierLabel: membership?.tier_label,
        voyage: { name: res.voyage.name, yacht: res.voyage.yacht?.name ?? 'the yacht', startDate: res.voyage.start_date, endDate: res.voyage.end_date, region: res.voyage.region ?? undefined },
        embarkationStart: embarkStart,
        homeOffset: (inbound ?? embarkStart).slice(-6),
        ambassador: { firstName: ambassador.split(' ')[0] ?? ambassador, title: contact?.title ?? 'Suite Ambassador', availability: contact?.availability },
        itinerary: ports.map((x) => ({ id: x.id, day: x.day, date: x.call_date, type: x.type, portName: x.port_name, country: x.country, arrival: x.arrival ?? undefined, departure: x.departure ?? undefined, allAboard: x.all_aboard ?? undefined })),
        days: days.map((d) => ({
          day: d.day,
          date: d.day_date,
          headline: d.headline,
          dressCode: d.dress_code ?? undefined,
          sunset: d.sunset ?? undefined,
          items: activities.filter((a) => a.day === d.day).map((a) => ({ start: a.start_local, title: a.title, location: a.location ?? '', kind: a.kind })),
        })),
        bookings: bookings.map((b) => ({ id: b.id, experienceId: b.experience_id, title: b.title, category: b.category, venue: b.venue ?? '', start: b.start_local, end: b.end_local ?? undefined, partySize: b.party_size, status: b.status, note: b.note ?? undefined })),
        catalogue: catalogue.map((e) => ({ id: e.id, title: e.title, category: e.category, subtitle: e.subtitle ?? '', portCallId: e.port_call_id ?? undefined, destination: e.destination ?? undefined, durationMinutes: e.duration_minutes ?? undefined, priceMinor: e.price_minor ?? undefined, currency: e.currency?.trim(), inclusive: e.inclusive, format: e.format, tags: e.tags ?? [], availability: e.availability_status ?? undefined })),
        slots: slots.map((s) => ({ experienceId: s.experience_id, start: s.start_local, end: s.end_local ?? undefined, remaining: s.remaining })),
        preferences: {
          dining: p.dining,
          dietary: p.dietary,
          beverage: p.beverage,
          spa: p.spa,
          excursions: p.excursions,
          transportation: p.transportation,
          accessibility: p.accessibility,
          activityInterests: p.activity_interests,
          privacy: p.privacy,
        },
        occasions: occasions.map((o) => ({ type: o.type, date: o.occasion_date, label: o.label, recognition: o.recognition })),
        openRequests: requests.map((r) => ({ id: r.id, type: r.type, summary: r.summary, status: r.status, nextUpdateBy: r.next_update_by ?? undefined })),
        history: history.reverse().map((m) => ({ author: m.author, body: m.body, createdAt: m.created_at, actions: (m.attachments ?? []).flatMap((a) => (a.kind === 'actions' ? (a.actions ?? []) : [])) })),
      } satisfies RawContext;
    },


    async escalate(caller, ctx, to: EscalationTarget, reason, summary) {
      const team: ServiceTeam = to === 'medical' ? 'medical' : to === 'suite-ambassador' ? 'suite-ambassador' : 'shoreside-concierge';
      const { data, error } = await user
        .from('service_requests')
        .insert({
          reservation_id: ctx.reservationId,
          conversation_id: ctx.conversationId,
          type: to === 'medical' ? 'medical' : 'general',
          summary: summary.slice(0, 200) || 'Concierge hand-off',
          details: `Raised by the concierge (${reason}).`,
          status: 'received',
          priority: to === 'medical' ? 'urgent' : 'priority',
          assigned_team: team,
        })
        .select('id')
        .maybeSingle();
      if (error || !data) throw new Error(error?.message ?? 'escalation insert failed');
      await service.from('concierge_conversations').update({ assigned_team: team }).eq('id', ctx.conversationId);
      void caller;
      const agentName = to === 'medical' ? 'The Medical Centre' : to === 'concierge-team' ? 'The concierge team' : `${ctx.ambassador.firstName}, ${ctx.ambassador.title}`;
      return { requestId: data.id, team, agentName, minutes: to === 'medical' ? 1 : to === 'concierge-team' ? 3 : 5 };
    },

    async persistGuestOnly(caller, ctx, guestText) {
      const { error } = await user.from('concierge_messages').insert({ conversation_id: ctx.conversationId, author: 'guest', author_user_id: caller.userId, body: guestText });
      if (error) throw new Error('message not stored');
    },

    async persist(caller, ctx, run, guestText, reply) {
      // The guest's words as screened (card numbers and the like removed).
      const guest = await row<{ id: string }>(user.from('concierge_messages').insert({ conversation_id: ctx.conversationId, author: 'guest', author_user_id: caller.userId, body: guestText }).select('id').maybeSingle());
      const ai = await row<Record<string, unknown>>(
        service
          .from('concierge_messages')
          .insert({ conversation_id: ctx.conversationId, author: 'ai', body: reply.body, intent: reply.intent, attachments: reply.attachments, suggestions: reply.suggestions, ai_confidence: Number(reply.confidence.toFixed(3)), classification: reply.classification })
          .select('id, conversation_id, author, author_name, body, intent, attachments, suggestions, created_at, classification')
          .maybeSingle(),
      );
      if (!ai) throw new Error('reply not stored');
      await service.from('concierge_ai_runs').insert({
        request_id: run.requestId,
        conversation_id: ctx.conversationId,
        reservation_id: ctx.reservationId,
        actor_user_id: caller.userId,
        provider: run.provider,
        model: run.model,
        prompt_version: run.promptVersion,
        classification: run.classification,
        context_slices: run.slices,
        safety_flags: run.safetyFlags,
        guard_findings: run.guardFindings,
        escalated_to: run.escalated,
        transaction: run.transaction,
        degraded: run.degraded,
        attempts: run.attempts,
        latency_ms: run.latencyMs,
        usage: run.usage ?? null,
        message_ids: [guest?.id, ai.id].filter(Boolean),
      });
      return { messages: [ai] };
    },

    async audit(entry) {
      await service.from('audit_log').insert({
        actor_id: entry.actorId,
        actor_roles: entry.actorRoles,
        action: entry.action,
        resource: entry.resource,
        resource_id: entry.resourceId,
        outcome: entry.outcome,
        request_id: entry.requestId,
        metadata: entry.metadata,
      });
    },
  };
}

/** Resolves the caller from the JWT (user-scoped client): user, guest record and roles. */
export async function resolveCaller(user: Db & { auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> } }): Promise<Caller | null> {
  const { data, error } = await user.auth.getUser();
  if (error || !data.user) return null;
  return callerFor(user, data.user.id);
}

/** The caller for a verified user ID, read under their own RLS. */
export async function callerFor(user: Db, uid: string): Promise<Caller> {
  const [guest, roles] = await Promise.all([row<{ id: string }>(user.from('guests').select('id').eq('auth_user_id', uid).maybeSingle()), rows<{ role: string }>(user.from('user_roles').select('role').eq('user_id', uid))]);
  return { userId: uid, guestId: guest?.id ?? null, roles: roles.map((r) => r.role) };
}
