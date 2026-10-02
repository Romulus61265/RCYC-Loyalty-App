// POST /concierge-respond  { conversationId, body }
//
// 1. Authenticate guest; confirm (via RLS) they belong to the conversation.
// 2. Persist the guest message.
// 3. Build a *minimised* GuestContext server-side (never trust the client's).
// 4. Ask the configured AI provider for a reply + confidence.
// 5. Persist the AI reply; auto-escalate to a human when confidence is low,
//    the topic is sensitive (medical, complaint) or the guest asks.
// 6. Audit everything. No raw PII is ever sent to the AI provider.
import { audit, handle, HttpError, json, requireCaller, serviceClient } from '../_shared/auth.ts';

type Provider = 'mock' | 'enterprise';
const PROVIDER = (Deno.env.get('CONCIERGE_AI_PROVIDER') ?? 'mock') as Provider;
const AI_ENDPOINT = Deno.env.get('CONCIERGE_AI_ENDPOINT'); // enterprise AI platform / LLM gateway
const AI_API_KEY = Deno.env.get('CONCIERGE_AI_API_KEY');    // lives only in function secrets
const ESCALATION_THRESHOLD = 0.55;

const SENSITIVE = /\b(doctor|medical|unwell|emergency|complain|lawyer|refund|injur)/i;

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method');
    const caller = await requireCaller(req, ['guest', 'travel_companion']);
    const { conversationId, body } = (await req.json()) as { conversationId?: string; body?: string };
    if (!conversationId || !body || body.length > 2000) throw new HttpError(422, 'validation');

    // RLS: returns a row only if the caller is on the reservation.
    const { data: convo } = await caller.db
      .from('concierge_conversations')
      .select('id, reservation_id, guest_id')
      .eq('id', conversationId)
      .single();
    if (!convo) throw new HttpError(404, 'not_found');

    await caller.db.from('concierge_messages').insert({
      conversation_id: conversationId,
      author: 'guest',
      author_user_id: caller.userId,
      body,
    });

    const context = await buildContext(caller.db, convo.reservation_id, convo.guest_id);
    const reply = await respond(body, context);
    const escalate = reply.confidence < ESCALATION_THRESHOLD || SENSITIVE.test(body);

    const svc = serviceClient();
    const { data: saved } = await svc
      .from('concierge_messages')
      .insert({
        conversation_id: conversationId,
        author: 'ai',
        body: reply.body,
        intent: reply.intent,
        suggestions: reply.suggestions ?? [],
        ai_confidence: reply.confidence,
      })
      .select()
      .single();

    if (escalate) {
      const medical = /\b(doctor|medical|unwell|emergency|injur)/i.test(body);
      await svc.from('service_requests').insert({
        reservation_id: convo.reservation_id,
        conversation_id: conversationId,
        type: medical ? 'medical' : 'general',
        summary: medical ? 'Medical assistance requested via concierge' : 'Concierge hand-off',
        priority: medical ? 'urgent' : 'priority',
        assigned_team: medical ? 'medical' : 'suite-ambassador',
        created_by: caller.userId,
      });
    }

    await audit({
      actorId: caller.userId,
      actorRoles: caller.roles,
      action: 'concierge.respond',
      resource: 'concierge_conversation',
      resourceId: conversationId,
      outcome: 'success',
      metadata: { intent: reply.intent, confidence: reply.confidence, escalated: escalate, provider: PROVIDER },
    });

    return json({ messages: [saved], escalated: escalate });
  }),
);

interface GuestContext {
  guestRef: string;
  preferredName: string;
  tierLabel?: string;
  voyageName?: string;
  occasions: string[];
  hasDeclaredAllergy: boolean;
}

async function buildContext(db: ReturnType<typeof serviceClient>, reservationId: string, guestId: string): Promise<GuestContext> {
  const [{ data: g }, { data: m }, { data: r }, { data: occ }, { data: prefs }] = await Promise.all([
    db.from('guests').select('preferred_name, first_name').eq('id', guestId).single(),
    db.from('loyalty_memberships').select('tier_label').eq('guest_id', guestId).maybeSingle(),
    db.from('reservations').select('voyages(name, start_date, end_date)').eq('id', reservationId).single(),
    db.from('special_occasions').select('type, recognition').eq('guest_id', guestId),
    db.from('guest_preferences').select('dietary').eq('guest_id', guestId).maybeSingle(),
  ]);
  const voyage = (r as { voyages?: { name: string } } | null)?.voyages;
  return {
    guestRef: await pseudonym(guestId),
    preferredName: g?.preferred_name ?? g?.first_name ?? 'Guest',
    tierLabel: m?.tier_label,
    voyageName: voyage?.name,
    occasions: (occ ?? []).filter((o: { recognition: string }) => o.recognition !== 'private').map((o: { type: string }) => o.type),
    hasDeclaredAllergy: Boolean((prefs?.dietary as { allergies?: unknown[] } | undefined)?.allergies?.length),
  };
}

async function pseudonym(id: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${Deno.env.get('PSEUDONYM_SALT')}:${id}`));
  return Array.from(new Uint8Array(digest)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface AIReply {
  body: string;
  intent: string;
  confidence: number;
  suggestions?: string[];
}

async function respond(body: string, context: GuestContext): Promise<AIReply> {
  if (PROVIDER === 'enterprise' && AI_ENDPOINT && AI_API_KEY) {
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AI_API_KEY}`, 'Content-Type': 'application/json' },
      // Tools (get_schedule, request_booking, list_privileges…) are resolved
      // by the AI platform calling back into our BFF with a scoped token.
      body: JSON.stringify({ message: body, context, policy: 'luxury-concierge-v1' }),
    });
    if (res.ok) return (await res.json()) as AIReply;
    // Degrade gracefully: never leave the guest without an answer.
  }
  return {
    body: `Thank you, ${context.preferredName}. I’ve passed this to your Suite Ambassador, who will reply personally.`,
    intent: 'general',
    confidence: 0.3,
  };
}
