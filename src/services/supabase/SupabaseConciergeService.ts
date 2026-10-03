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
import type { ConciergeAction, ConciergeAttachment, ConciergeMessage, EscalationRequest, EscalationResult, EscalationTarget, GuestContext, ID, ServiceRequest, ServiceRequestType } from '@/domain';
import type { ConciergeService, Unsubscribe } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { formatLongDate, formatShortDate, formatTime, greeting } from '@/utils/format';
import { SupabaseExperienceService } from './SupabaseExperienceService';
import { MESSAGE_COLUMNS, REQUEST_COLUMNS, toMessage, toRequest, type MessageRow, type RequestRow } from './rows';
import { many, maybe, one, text, toServiceError, uuid, type SupabaseDeps } from './support';

const MESSAGE_MAX = 2000;

export const SUGGESTED_QUESTIONS = [
  'What is planned for tomorrow?',
  'Move my dinner reservation.',
  'What private experiences are available ashore?',
  'Arrange transportation.',
  'What benefits do I have?',
  'Help me celebrate an occasion.',
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
  private readonly experience: SupabaseExperienceService;
  private seq = 0;

  constructor(private readonly deps: SupabaseDeps) {
    this.experience = new SupabaseExperienceService(deps);
  }

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
    const to: EscalationTarget = request.to ?? (request.reason === 'medical' ? 'medical' : 'suite-ambassador');
    const team: ServiceRequest['assignedTeam'] = to === 'medical' ? 'medical' : to === 'suite-ambassador' ? 'suite-ambassador' : 'shoreside-concierge';
    const [created, reservation] = await Promise.all([
      this.insertRequest(convo.reservation_id, {
        type: to === 'medical' ? 'medical' : 'general',
        summary: to === 'medical' ? 'Medical assistance requested via concierge' : to === 'suite-ambassador' ? 'Guest asked to speak with their Suite Ambassador' : 'Guest asked to speak with the concierge team',
        details: request.note,
        priority: to === 'medical' ? 'urgent' : 'priority',
        assignedTeam: team,
        conversationId: convo.id,
      }),
      maybe<{ suite_ambassador_contact: { name?: string; title?: string } | null; suite_ambassador: string | null }>(
        this.db.from('reservations').select('suite_ambassador, suite_ambassador_contact').eq('id', convo.reservation_id).maybeSingle(),
      ),
    ]);
    const contact = reservation?.suite_ambassador_contact;
    const ambassador = contact?.name ?? reservation?.suite_ambassador;
    const agentName =
      to === 'medical' ? 'The Medical Centre' : to === 'concierge-team' ? 'The concierge team' : ambassador ? `${ambassador.split(' ')[0]}, ${contact?.title ?? 'Suite Ambassador'}` : 'Your Suite Ambassador';
    return { handoffId: created.id, team, agentName, expectedResponseMinutes: to === 'medical' ? 1 : to === 'concierge-team' ? 3 : 5 };
  }

  /**
   * Carries out an action from a card. Writes go through RLS (requests are
   * inserted as 'received'; bookings change through the database functions),
   * so the confirmation shown is what the guest is allowed to know: received
   * and being arranged. The confirmation message is composed on the device.
   */
  async performAction(conversationId: ID, action: ConciergeAction): Promise<ConciergeMessage[]> {
    const convo = await this.conversation(conversationId);
    const say = (body: string, attachment: ConciergeAttachment): ConciergeMessage[] => {
      this.seq += 1;
      return [{ id: `local_${Date.now().toString(36)}_${this.seq}`, conversationId: convo.id, author: 'ai', createdAt: this.deps.clock.now().toISOString(), body, intent: 'service.request', attachments: [attachment] }];
    };
    switch (action.kind) {
      case 'open':
        throw new ServiceError('validation', 'Navigation is handled by the app');
      case 'change-booking': {
        const booking = await this.experience.requestChange(action.bookingId, { start: action.start });
        const req = await this.insertRequest(convo.reservation_id, { type: booking.category === 'dining' ? 'dining-change' : 'excursion', summary: `${booking.title}: ${formatTime(action.start)}, ${formatShortDate(action.start)}`, conversationId: convo.id, bookingId: booking.id });
        return say(`I have asked for ${formatTime(action.start)} on ${formatLongDate(action.start)}. You will see it confirmed here.`, { kind: 'confirmation', status: booking.status, title: booking.title, detail: `${formatLongDate(booking.start)} · ${formatTime(booking.start)} · party of ${booking.partySize}`, bookingId: booking.id, requestId: req.id });
      }
      case 'request-experience': {
        const booking = await this.experience.requestBooking(convo.reservation_id, action.experienceId, action.start, action.partySize);
        return say(`Requested: ${booking.title}, ${formatLongDate(booking.start)} at ${formatTime(booking.start)}. You will see it confirmed here.`, { kind: 'confirmation', status: booking.status, title: booking.title, detail: `${formatLongDate(booking.start)} · ${formatTime(booking.start)} · party of ${booking.partySize}`, bookingId: booking.id });
      }
      case 'service-request': {
        const req = await this.insertRequest(convo.reservation_id, { type: action.type, summary: action.summary, details: action.details, priority: action.priority, conversationId: convo.id });
        return say('I have passed this on. You will see each update here.', { kind: 'confirmation', status: req.status, title: req.summary, detail: req.details ?? 'Request received', requestId: req.id });
      }
      case 'escalate': {
        const result = await this.escalateToHuman({ conversationId, reason: action.reason, preferredChannel: 'chat', to: action.to });
        return say(`Of course. ${result.agentName.split(',')[0]} will join us shortly.`, { kind: 'handoff', to: action.to, team: result.team, agentName: result.agentName, expectedResponseMinutes: result.expectedResponseMinutes, requestId: result.handoffId });
      }
    }
  }

  private async insertRequest(
    reservationId: string,
    input: { type: ServiceRequestType; summary: string; details?: string; priority?: ServiceRequest['priority']; assignedTeam?: ServiceRequest['assignedTeam']; conversationId?: string; bookingId?: string; experienceId?: string },
  ): Promise<ServiceRequest> {
    const inserted = await one<{ id: string }>(
      this.db
        .from('service_requests')
        .insert({
          reservation_id: reservationId,
          conversation_id: input.conversationId ?? null,
          booking_id: input.bookingId ? uuid(input.bookingId, 'Booking') : null,
          experience_id: input.experienceId ? uuid(input.experienceId, 'Experience') : null,
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
