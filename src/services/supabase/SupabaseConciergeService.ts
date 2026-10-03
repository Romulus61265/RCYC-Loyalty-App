/**
 * Concierge over Supabase.
 *
 *  • Replies come from the `concierge-respond` Edge Function. It persists the
 *    guest message, builds a minimised context server-side (the client's
 *    GuestContext is not sent: the server never trusts it), calls the AI
 *    provider with keys that live only in function secrets, and escalates.
 *  • Human replies arrive through Realtime; RLS limits them to the party.
 *  • Service requests are inserted directly; RLS accepts only new requests
 *    ('received', unassigned) on the caller's own reservation.
 */
import type { ConciergeMessage, EscalationRequest, EscalationResult, GuestContext, ID, ServiceRequest, ServiceRequestType } from '@/domain';
import type { ConciergeService, Unsubscribe } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { greeting } from '@/utils/format';
import { MESSAGE_COLUMNS, REQUEST_COLUMNS, toMessage, toRequest, type MessageRow, type RequestRow } from './rows';
import { many, maybe, one, text, toServiceError, uuid, type SupabaseDeps } from './support';

const MESSAGE_MAX = 2000;

export const SUGGESTED_QUESTIONS = [
  'What is planned for my first day?',
  'Can you move my dinner reservation?',
  'What private experiences are available ashore?',
  'Can you arrange transportation?',
  'What benefits do I have because of my Bonvoy status?',
  'Can I arrange something special for an occasion?',
];

interface FunctionsErrorLike {
  message: string;
  context?: { status?: number };
}

function functionError(error: FunctionsErrorLike): ServiceError {
  const status = error.context?.status;
  if (status === 401) return new ServiceError('unauthenticated', 'Session expired');
  if (status === 403) return new ServiceError('forbidden', 'Not part of this conversation');
  if (status === 404) return new ServiceError('not_found', 'Conversation not found');
  if (status === 422) return new ServiceError('validation', 'Message not accepted');
  return new ServiceError('unavailable', error.message || 'Concierge unavailable', true);
}

export class SupabaseConciergeService implements ConciergeService {
  constructor(private readonly deps: SupabaseDeps) {}

  private get db() {
    return this.deps.db();
  }

  private async currentGuestId(): Promise<string> {
    const { data, error } = await this.db.rpc('current_guest_id');
    if (error) throw toServiceError(error);
    if (typeof data !== 'string') throw new ServiceError('unauthenticated', 'No guest profile for this session');
    return data;
  }

  private async conversation(conversationId: ID): Promise<{ id: string; reservation_id: string }> {
    const id = uuid(conversationId, 'Conversation');
    return one(this.db.from('concierge_conversations').select('id, reservation_id').eq('id', id).maybeSingle(), 'Conversation', id);
  }

  async openConversation(reservationId: ID) {
    const res = uuid(reservationId, 'Reservation');
    const guestId = await this.currentGuestId();
    const find = () => maybe<{ id: string }>(this.db.from('concierge_conversations').select('id').eq('reservation_id', res).eq('guest_id', guestId).maybeSingle());
    let convo = await find();
    if (!convo) {
      const { data, error } = await this.db.from('concierge_conversations').insert({ reservation_id: res, guest_id: guestId }).select('id').maybeSingle();
      // Opened at the same moment on another device: use that one.
      if (error && error.code !== '23505') throw toServiceError(error);
      convo = (data as { id: string } | null) ?? (await find());
      if (!convo) throw new ServiceError('unavailable', 'Could not open the conversation', true);
    }
    const [rows, guest] = await Promise.all([
      many<MessageRow>(this.db.from('concierge_messages').select(MESSAGE_COLUMNS).eq('conversation_id', convo.id).order('created_at')),
      maybe<{ preferred_name: string | null; first_name: string }>(this.db.from('guests').select('preferred_name, first_name').eq('id', guestId).maybeSingle()),
    ]);
    const now = this.deps.clock.now();
    // Today's greeting is composed on the device and not stored.
    const opening: ConciergeMessage = {
      id: `greeting_${convo.id}`,
      conversationId: convo.id,
      author: 'ai',
      createdAt: now.toISOString(),
      body: `${greeting(now)}, ${guest?.preferred_name ?? guest?.first_name ?? 'and welcome'}. How may I help?`,
      suggestions: SUGGESTED_QUESTIONS,
    };
    return { conversationId: convo.id, messages: [...rows.map(toMessage), opening] };
  }

  async sendMessage(conversationId: ID, body: string, _context: GuestContext) {
    const payload = { conversationId: uuid(conversationId, 'Conversation'), body: text(body, 'Message', MESSAGE_MAX) };
    const { data, error } = await this.db.functions.invoke<{ messages: MessageRow[]; escalated: boolean }>('concierge-respond', { body: payload });
    if (error) throw functionError(error as FunctionsErrorLike);
    return (data?.messages ?? []).filter(Boolean).map(toMessage);
  }

  async escalateToHuman(request: EscalationRequest): Promise<EscalationResult> {
    const convo = await this.conversation(request.conversationId);
    const medical = request.reason === 'medical';
    const team: ServiceRequest['assignedTeam'] = medical ? 'medical' : 'suite-ambassador';
    const [created, reservation] = await Promise.all([
      this.insertRequest(convo.reservation_id, {
        type: medical ? 'medical' : 'general',
        summary: medical ? 'Medical assistance requested via concierge' : 'Guest asked to speak with their Suite Ambassador',
        details: request.note,
        priority: medical ? 'urgent' : 'priority',
        assignedTeam: team,
        conversationId: convo.id,
      }),
      maybe<{ suite_ambassador_contact: { name?: string; title?: string } | null; suite_ambassador: string | null }>(
        this.db.from('reservations').select('suite_ambassador, suite_ambassador_contact').eq('id', convo.reservation_id).maybeSingle(),
      ),
    ]);
    const contact = reservation?.suite_ambassador_contact;
    const ambassador = contact?.name ?? reservation?.suite_ambassador;
    return {
      handoffId: created.id,
      team,
      agentName: medical ? 'The Medical Centre' : ambassador ? `${ambassador.split(' ')[0]}, ${contact?.title ?? 'Suite Ambassador'}` : 'Your Suite Ambassador',
      expectedResponseMinutes: medical ? 1 : 5,
    };
  }

  private async insertRequest(
    reservationId: string,
    input: { type: ServiceRequestType; summary: string; details?: string; priority?: ServiceRequest['priority']; assignedTeam?: ServiceRequest['assignedTeam']; conversationId?: string },
  ): Promise<ServiceRequest> {
    const inserted = await one<{ id: string }>(
      this.db
        .from('service_requests')
        .insert({
          reservation_id: reservationId,
          conversation_id: input.conversationId ?? null,
          type: input.type,
          summary: text(input.summary, 'Summary', 200),
          details: input.details ? text(input.details, 'Details', 2000) : null,
          priority: input.priority ?? (input.type === 'medical' ? 'urgent' : 'routine'),
          assigned_team: input.assignedTeam ?? (input.type === 'medical' ? 'medical' : 'suite-ambassador'),
          status: 'received',
        })
        .select('id')
        .maybeSingle(),
      'Service request',
      'new',
    );
    return this.getServiceRequest(inserted.id);
  }

  createServiceRequest(reservationId: ID, input: { type: ServiceRequestType; summary: string; details?: string; priority?: ServiceRequest['priority'] }) {
    return this.insertRequest(uuid(reservationId, 'Reservation'), input);
  }

  async listServiceRequests(reservationId: ID) {
    const rows = await many<RequestRow>(this.db.from('service_requests_local').select(REQUEST_COLUMNS).eq('reservation_id', uuid(reservationId, 'Reservation')).order('created_ts', { ascending: false }));
    return rows.map(toRequest);
  }

  async getServiceRequest(requestId: ID) {
    const id = uuid(requestId, 'Service request');
    return toRequest(await one<RequestRow>(this.db.from('service_requests_local').select(REQUEST_COLUMNS).eq('id', id).maybeSingle(), 'Service request', id));
  }

  /** Human replies only: AI replies are already returned by sendMessage. */
  subscribe(conversationId: ID, listener: (message: ConciergeMessage) => void): Unsubscribe {
    const id = uuid(conversationId, 'Conversation');
    const db = this.db;
    const channel = db
      .channel(`concierge:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'concierge_messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        const row = payload.new as MessageRow;
        if (row.author === 'human') listener(toMessage(row));
      })
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }
}
