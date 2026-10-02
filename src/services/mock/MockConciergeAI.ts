/**
 * Deterministic, rules-based stand-in for the enterprise AI platform.
 *
 * Implements `ConciergeAIProvider` so it can be replaced by an
 * `EnterpriseConciergeAIProvider` (server-side LLM with tool calls into the
 * Voyage / Experience / Loyalty services) without touching the UI.
 */
import type { ConciergeIntent, ConciergeMessage } from '@/domain';
import type { ConciergeAIProvider } from '@/services/contracts';
import { bookings, catalogue } from '@/data/fixtures/experiences';
import { privileges } from '@/data/fixtures/guest';
import { mockId } from './support';

interface Rule {
  intent: ConciergeIntent;
  match: RegExp;
  reply: (ctx: Parameters<ConciergeAIProvider['respond']>[0]) => Omit<ConciergeMessage, 'id' | 'conversationId' | 'author' | 'createdAt'>;
  confidence: number;
  escalate?: boolean;
}

const rules: Rule[] = [
  {
    intent: 'medical.assist',
    match: /\b(doctor|medical|unwell|sick|emergency|hurt|injur)/i,
    confidence: 1,
    escalate: true,
    reply: () => ({
      intent: 'medical.assist',
      body: 'I am connecting you with our medical team and your Suite Ambassador right now. If this is an emergency aboard, please also press the red emergency key on any suite telephone.',
    }),
  },
  {
    intent: 'schedule.query',
    match: /(tomorrow|planned|schedule|itinerary|what.*(on|happening))/i,
    confidence: 0.92,
    reply: () => ({
      intent: 'schedule.query',
      body:
        'Tomorrow is a quiet day at home — nothing is required of you. Here is your first day aboard, Saturday 17 October:\n\n' +
        '• 12:15 — Jordi meets you at Barcelona arrivals\n' +
        '• 14:00 — Your personal embarkation window at Port Vell\n' +
        '• 19:30 — Sail-away Champagne on the Pool Deck\n' +
        '• 20:30 — Dinner at Lumière, window table for two\n\n' +
        'Sunset is at 19:23. Dress is elegant casual.',
      attachments: [{ kind: 'schedule', dayNumber: 1 }],
      suggestions: ['Move my dinner to 21:00', 'What about day two?'],
    }),
  },
  {
    intent: 'dining.modify',
    match: /(move|change|reschedul|later|earlier).*(dinner|reservation|table|lunch)|(dinner|reservation).*(move|change|later)/i,
    confidence: 0.86,
    reply: () => {
      const dinner = bookings.find((b) => b.id === 'bkg_dinner_1');
      return {
        intent: 'dining.modify',
        body: `Of course. You are currently at ${dinner?.venue ?? 'Lumière'} at 20:30 on 17 October. I can request 21:00 or 21:15 — the window table is available at both. Which would you prefer?`,
        suggestions: ['21:00, please', '21:15, please', 'Keep 20:30'],
      };
    },
  },
  {
    intent: 'experience.discover',
    match: /(private|exclusive|special).*(experience|monte|monaco)|monte carlo|monaco/i,
    confidence: 0.9,
    reply: () => {
      const ids = catalogue.filter((e) => e.destination === 'Monte Carlo' && e.privateAvailable).map((e) => e.id);
      return {
        intent: 'experience.discover',
        body:
          'In Monte Carlo, these can be arranged for the two of you alone:\n\n' +
          '• Villa Ephrussi de Rothschild before opening, with a curator\n' +
          '• Box seats at the Opéra de Monte-Carlo, with supper aboard afterwards\n' +
          '• Private atelier appointments on Avenue des Beaux-Arts\n' +
          '• A helicopter to Saint-Paul-de-Vence for lunch\n\n' +
          'You already have the Grande Corniche drive with Margaux on the 19th.',
        attachments: [{ kind: 'experiences', experienceIds: ids }],
        suggestions: ['Tell me about the Opéra', 'Reserve Villa Ephrussi'],
      };
    },
  },
  {
    intent: 'transport.arrange',
    match: /(transport|car|driver|transfer|taxi|helicopter|pick ?up)/i,
    confidence: 0.84,
    reply: () => ({
      intent: 'transport.arrange',
      body:
        'Happily. Your Barcelona arrival transfer is confirmed with Jordi at 12:15, adjusted for BA478’s new time. ' +
        'For your departure from Civitavecchia on the 24th, would you like a car to Rome or to Fiumicino?',
      suggestions: ['A car to Rome', 'A car to Fiumicino', 'Something in Monaco'],
    }),
  },
  {
    intent: 'loyalty.benefits',
    match: /(benefit|bonvoy|status|privilege|titanium|elite|perk)/i,
    confidence: 0.95,
    reply: () => ({
      intent: 'loyalty.benefits',
      body:
        'As a Titanium Elite member returning for your third voyage, this time you’ll enjoy:\n\n' +
        privileges.slice(0, 5).map((p) => `• ${p.title}`).join('\n'),
      attachments: [{ kind: 'privileges', privilegeIds: privileges.map((p) => p.id) }],
    }),
  },
  {
    intent: 'occasion.plan',
    match: /(anniversary|birthday|celebrat|surprise|special.*(something|occasion))/i,
    confidence: 0.8,
    escalate: true,
    reply: () => ({
      intent: 'occasion.plan',
      body:
        'Your 25th anniversary falls on the 21st, in Portofino — a beautiful place for it. ' +
        'A few thoughts: the Couples Terrace Suite that morning, Champagne aboard the Riva at San Fruttuoso, ' +
        'or your dinner at Il Giardino moved to a private corner of the terrace with a menu from the chef. ' +
        'I’ve asked Sophie, your Suite Ambassador, to help plan it personally — she will be in touch shortly.',
      suggestions: ['The Couples Terrace Suite', 'A private dinner', 'Keep it a surprise for James'],
    }),
  },
];

const fallback: Rule = {
  intent: 'general',
  match: /.*/,
  confidence: 0.4,
  reply: () => ({
    intent: 'general',
    body: 'Let me make sure this is handled properly. Would you like me to pass it to Sophie, your Suite Ambassador?',
    suggestions: ['Yes, please connect me', 'What is planned for tomorrow?'],
  }),
};

export class MockConciergeAI implements ConciergeAIProvider {
  async respond({ conversationId, body, context }: Parameters<ConciergeAIProvider['respond']>[0]) {
    const rule = rules.find((r) => r.match.test(body)) ?? fallback;
    const reply = rule.reply({ conversationId, body, context, history: [] });
    const message: ConciergeMessage = {
      id: mockId('msg'),
      conversationId,
      author: 'ai',
      createdAt: new Date().toISOString(),
      ...reply,
    };
    return {
      messages: [message],
      confidence: rule.confidence,
      shouldEscalate: Boolean(rule.escalate) || rule.confidence < 0.5,
    };
  }
}
