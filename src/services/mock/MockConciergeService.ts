import type {
  ConciergeMessage,
  EscalationRequest,
  EscalationResult,
  GuestContext,
  ID,
  ServiceRequest,
  ServiceRequestType,
} from '@/domain';
import type { ConciergeAIProvider, ConciergeService, Unsubscribe } from '@/services/contracts';
import { greeting } from '@/utils/format';
import { data, latency, mockId, mockNow, notFound } from './support';
import { MockConciergeAI } from './MockConciergeAI';

const { concierge } = data;
const AMBASSADOR = `${concierge.ambassador.name.split(' ')[0]}, ${concierge.ambassador.title}`;
const GUEST_FIRST_NAME = data.guest.profile.guest.preferredName ?? data.guest.profile.guest.firstName;

/**
 * Orchestrates AI responses, human hand-off and service requests.
 * The AI provider is injected so the reasoning backend can change
 * independently of conversation and request management.
 */
export class MockConciergeService implements ConciergeService {
  private conversations = new Map<ID, ConciergeMessage[]>();
  private requests: ServiceRequest[] = [...concierge.requests];
  private listeners = new Map<ID, Set<(m: ConciergeMessage) => void>>();

  constructor(private readonly ai: ConciergeAIProvider = new MockConciergeAI()) {}

  async openConversation(reservationId: ID) {
    const conversationId = `cnv_${reservationId}`;
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, [
        // Earlier exchange (pre-voyage), then today's greeting.
        ...concierge.history.map((m) => ({ ...m, conversationId })),
        {
          id: mockId('msg'),
          conversationId,
          author: 'ai',
          createdAt: mockNow().toISOString(),
          body: `${greeting(mockNow())}, ${GUEST_FIRST_NAME}. ${concierge.greeting}`,
          suggestions: concierge.suggestedQuestions,
        },
      ]);
    }
    return latency({ conversationId, messages: this.conversations.get(conversationId)! });
  }

  async sendMessage(conversationId: ID, body: string, context: GuestContext) {
    const history = this.conversations.get(conversationId) ?? [];
    const guestMessage: ConciergeMessage = {
      id: mockId('msg'),
      conversationId,
      author: 'guest',
      body,
      createdAt: new Date().toISOString(),
    };
    history.push(guestMessage);

    const result = await this.ai.respond({ conversationId, body, context, history });
    history.push(...result.messages);
    this.conversations.set(conversationId, history);

    if (result.shouldEscalate) {
      // Simulate a human picking up the thread asynchronously.
      const reason = result.messages[0]?.intent === 'medical.assist' ? 'medical' : 'low-confidence';
      void this.escalateToHuman({ conversationId, reason, preferredChannel: 'chat' });
    }
    return latency(result.messages, 700);
  }

  async escalateToHuman(request: EscalationRequest): Promise<EscalationResult> {
    const team = request.reason === 'medical' ? 'medical' : 'suite-ambassador';
    const agentName = team === 'medical' ? 'Dr. Elena Vos, Medical Centre' : AMBASSADOR;
    const result: EscalationResult = {
      handoffId: mockId('hnd'),
      team,
      agentName,
      expectedResponseMinutes: team === 'medical' ? 1 : 5,
    };
    setTimeout(() => {
      const msg: ConciergeMessage = {
        id: mockId('msg'),
        conversationId: request.conversationId,
        author: 'human',
        authorName: agentName,
        createdAt: new Date().toISOString(),
        body:
          team === 'medical'
            ? 'This is Dr. Vos. I have your details and I am available now. Are you able to tell me what is happening?'
            : `Hello ${GUEST_FIRST_NAME}, it’s ${concierge.ambassador.name.split(' ')[0]}. I’ve read the conversation and I’ll take it from here — leave it with me.`,
      };
      this.conversations.get(request.conversationId)?.push(msg);
      this.listeners.get(request.conversationId)?.forEach((l) => l(msg));
    }, 2200);
    return latency(result, 300);
  }

  async createServiceRequest(
    reservationId: ID,
    input: { type: ServiceRequestType; summary: string; details?: string; priority?: ServiceRequest['priority'] },
  ) {
    const now = new Date().toISOString();
    const req: ServiceRequest = {
      id: mockId('srq'),
      reservationId,
      type: input.type,
      summary: input.summary,
      details: input.details,
      status: 'received',
      priority: input.priority ?? (input.type === 'medical' ? 'urgent' : 'routine'),
      assignedTeam: input.type === 'medical' ? 'medical' : 'suite-ambassador',
      createdAt: now,
      updatedAt: now,
    };
    this.requests.unshift(req);
    return latency(req, 400);
  }

  listServiceRequests(reservationId: ID) {
    return latency(this.requests.filter((r) => r.reservationId === reservationId));
  }

  getServiceRequest(requestId: ID) {
    const found = this.requests.find((r) => r.id === requestId);
    return found ? latency(found) : notFound('ServiceRequest', requestId);
  }

  subscribe(conversationId: ID, listener: (message: ConciergeMessage) => void): Unsubscribe {
    const set = this.listeners.get(conversationId) ?? new Set();
    set.add(listener);
    this.listeners.set(conversationId, set);
    return () => set.delete(listener);
  }
}
