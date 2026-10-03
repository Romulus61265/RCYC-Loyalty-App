/**
 * Deterministic, rules-based stand-in for the enterprise AI platform.
 *
 * Implements `ConciergeAIProvider`, so an `EnterpriseConciergeAIProvider`
 * (a server-side model calling tools scoped to the guest) can replace it
 * without touching the UI. Answers are grounded in the guest's snapshot
 * (itinerary, bookings, availability, preferences, recognition, requests),
 * loaded through the other services: see ./concierge/answers.ts.
 */
import type { ConciergeClassification, ConciergeMessage, ID } from '@/domain';
import type { ConciergeAIProvider } from '@/services/contracts';
import { answer, openingAnswer, type Answer } from './concierge/answers';
import type { ConciergeSnapshot } from './concierge/snapshot';
import { mockEventTime, mockId } from './support';

export type SnapshotLoader = (conversationId: ID) => Promise<ConciergeSnapshot>;

/** Same three kinds as the server pipeline (supabase/functions/_shared/concierge). */
export function classify(a: Pick<Answer, 'intent' | 'attachments'>): ConciergeClassification {
  const atts = a.attachments ?? [];
  const changes = atts.some((x) => x.kind === 'confirmation' || (x.kind === 'actions' && !x.subject?.experienceId && x.actions.some((b) => b.kind === 'change-booking' || b.kind === 'service-request')));
  if (changes || a.intent === 'service.request' || a.intent === 'dining.modify' || a.intent === 'transport.arrange') return 'transactional';
  const suggests = atts.some((x) => x.kind === 'experiences' || (x.kind === 'actions' && x.actions.some((b) => b.kind === 'request-experience')));
  return suggests ? 'recommendation' : 'information';
}

export function toMessage(conversationId: ID, a: Pick<Answer, 'body' | 'intent' | 'attachments' | 'suggestions'>): ConciergeMessage {
  const m: ConciergeMessage = { id: mockId('msg'), conversationId, author: 'ai', createdAt: mockEventTime().toISOString(), body: a.body, intent: a.intent, classification: classify(a) };
  if (a.attachments?.length) m.attachments = a.attachments;
  if (a.suggestions?.length) m.suggestions = a.suggestions;
  return m;
}

export class MockConciergeAI implements ConciergeAIProvider {
  constructor(private readonly load: SnapshotLoader) {}

  async respond({ conversationId, body, context, history }: Parameters<ConciergeAIProvider['respond']>[0]) {
    const snapshot = await this.load(conversationId);
    const a = answer(snapshot, body, history, context);
    return {
      messages: a.body ? [toMessage(conversationId, a)] : [],
      confidence: a.confidence,
      shouldEscalate: Boolean(a.escalate),
      escalateTo: a.escalate?.to,
      escalationReason: a.escalate?.reason,
      perform: a.perform,
    };
  }

  /** The opening message for today: greeting, prompts and suggested requests. */
  async opening(conversationId: ID, prompts: string[]): Promise<ConciergeMessage> {
    return toMessage(conversationId, openingAnswer(await this.load(conversationId), prompts));
  }
}
