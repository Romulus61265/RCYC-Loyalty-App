/**
 * Deterministic, rules-based stand-in for the enterprise AI platform.
 *
 * Implements `ConciergeAIProvider` so it can be replaced by an
 * `EnterpriseConciergeAIProvider` (server-side LLM with tool calls into the
 * Voyage / Experience / Loyalty services) without touching the UI.
 *
 * Every answer is composed from the development dataset, so changing the
 * fixtures changes the replies.
 */
import type { ConciergeIntent, ConciergeMessage, DaySchedule } from '@/domain';
import type { ConciergeAIProvider } from '@/services/contracts';
import { formatLongDate, formatTime } from '@/utils/format';
import { data, mockId, mockNow } from './support';

type Reply = Omit<ConciergeMessage, 'id' | 'conversationId' | 'author' | 'createdAt'>;

interface Rule {
  intent: ConciergeIntent;
  match: RegExp;
  reply: (body: string) => Reply;
  confidence: number;
  escalate?: boolean;
}

const { guest, voyage, experiences, concierge } = data;
const ambassadorFirstName = concierge.ambassador.name.split(' ')[0] ?? concierge.ambassador.name;
const companionName = guest.profile.companions[0]?.firstName;

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const bullet = (lines: string[]) => lines.map((l) => `• ${l}`).join('\n');

function scheduleLines(day: DaySchedule): string[] {
  return day.items.map((i) => `${formatTime(i.start)} — ${i.title}`);
}

/**
 * Which day the guest is asking about: an explicit "day N" or "sea day",
 * else tomorrow relative to the mock clock, else the first day aboard.
 */
function resolveDay(body: string): { day: DaySchedule; label: 'tomorrow' | 'first' | 'asked' } {
  const days = experiences.daySchedules;
  const dayN = /\bday (\d)\b/i.exec(body)?.[1];
  const seaDay = /sea day/i.test(body) ? voyage.voyage.itinerary.find((p) => p.type === 'sea') : undefined;
  const asked = dayN ? days.find((d) => d.dayNumber === Number(dayN)) : seaDay ? days.find((d) => d.portCallId === seaDay.id) : undefined;
  if (asked) return { day: asked, label: 'asked' };
  const tomorrow = new Date(mockNow().getTime() + 86_400_000).toISOString().slice(0, 10);
  const match = days.find((d) => d.date === tomorrow);
  return match ? { day: match, label: 'tomorrow' } : { day: days[0]!, label: 'first' };
}

const rules: Rule[] = [
  {
    intent: 'medical.assist',
    match: /\b(doctor|medical|unwell|sick|emergency|hurt|injur)/i,
    confidence: 1,
    escalate: true,
    reply: () => ({
      intent: 'medical.assist',
      body: 'I am connecting you with our medical team and your Suite Ambassador now. If this is an emergency aboard, please also press the red emergency key on any suite telephone.',
    }),
  },
  {
    intent: 'dining.modify',
    match: /(move|change|reschedul|later|earlier).*(dinner|reservation|table|lunch)|(dinner|reservation).*(move|change|later)/i,
    confidence: 0.86,
    reply: () => {
      const dinner = experiences.bookings.find((b) => b.category === 'dining');
      if (!dinner) return { intent: 'dining.modify', body: 'You have no dinner reservations yet. Shall I arrange one?' };
      return {
        intent: 'dining.modify',
        body: `Of course. You are at ${dinner.venue.split(',')[0]} on ${formatLongDate(dinner.start)} at ${formatTime(dinner.start)}, at your window table. I can request 21:00 or 21:15, and the window table is held at both. Which would you prefer?`,
        suggestions: ['21:00, please', '21:15, please', 'Keep it as it is'],
      };
    },
  },
  {
    intent: 'schedule.query',
    match: /\b(tomorrow|first day|planned|schedule|itinerary|sea day)\b|\bwhat(?:'s| is)? (?:on|happening)\b/i,
    confidence: 0.92,
    reply: (body) => {
      const { day, label } = resolveDay(body);
      const intro =
        label === 'asked'
          ? `${day.headline}, ${formatLongDate(day.date)}:`
          : label === 'tomorrow'
            ? `Tomorrow, ${formatLongDate(day.date)}:`
            : `Tomorrow is a quiet day at home. Here is your first day aboard, ${formatLongDate(day.date)}:`;
      const extras = [day.sunset && `Sunset is at ${formatTime(day.sunset)}.`, day.dressCode && `Dress is ${day.dressCode.toLowerCase()}.`].filter(Boolean).join(' ');
      return {
        intent: 'schedule.query',
        body: `${intro}\n\n${bullet(scheduleLines(day))}\n\n${extras}`.trim(),
        attachments: [{ kind: 'schedule', dayNumber: day.dayNumber }],
        suggestions: ['Move my dinner to 21:00', 'What about the sea day?'],
      };
    },
  },
  {
    intent: 'experience.discover',
    match: /(private|exclusive|special).*(experience|monte|monaco)|monte carlo|monaco/i,
    confidence: 0.9,
    reply: () => {
      const monaco = experiences.catalogue.filter((e) => e.destination === 'Monte Carlo' && e.privateAvailable);
      const bookedIds = new Set(experiences.bookings.map((b) => b.experienceId));
      const open = monaco.filter((e) => !bookedIds.has(e.id));
      const held = monaco.filter((e) => bookedIds.has(e.id));
      return {
        intent: 'experience.discover',
        body:
          `In Monte Carlo, these can be arranged ${companionName ? `for you and ${companionName}` : 'for your party'} alone:\n\n${bullet(open.map((e) => `${e.title}: ${e.subtitle}`))}` +
          (held.length ? `\n\nYou already have ${held.map((e) => e.title).join(' and ')}.` : ''),
        attachments: [{ kind: 'experiences', experienceIds: monaco.map((e) => e.id) }],
        suggestions: open.slice(0, 2).map((e) => `Tell me about ${e.title}`),
      };
    },
  },
  {
    intent: 'transport.arrange',
    match: /\b(transport\w*|cars?|driver|transfers?|taxi|helicopter|pick ?up|flights?)\b/i,
    confidence: 0.84,
    reply: () => {
      const transfers = experiences.bookings.filter((b) => b.category === 'transfer');
      const inbound = voyage.flights.find((f) => f.direction === 'inbound');
      const lines = transfers.map((t) => `${formatLongDate(t.start)}, ${formatTime(t.start)}: ${t.title.toLowerCase()} (${t.venue})`);
      return {
        intent: 'transport.arrange',
        body:
          `Happily. Your private cars are confirmed:\n\n${bullet(lines)}` +
          (inbound ? `\n\nWe are tracking ${inbound.flightNumber}, and your driver will adjust if it lands early or late.` : '') +
          '\n\nWould you like anything else, perhaps a car or helicopter in Monaco?',
        suggestions: ['A helicopter to Nice', 'A car in Monaco on the 19th'],
      };
    },
  },
  {
    intent: 'loyalty.benefits',
    match: /(benefit|bonvoy|status|privilege|titanium|elite|perk)/i,
    confidence: 0.95,
    reply: () => {
      const ordinal = ORDINALS[guest.relationship.voyagesCompleted] ?? `${guest.relationship.voyagesCompleted + 1}th`;
      const forVoyage = guest.privileges.filter((p) => !p.appliesToVoyageId || p.appliesToVoyageId === voyage.voyage.id);
      return {
        intent: 'loyalty.benefits',
        body: `As a Marriott Bonvoy ${guest.membership.tierLabel} member returning for your ${ordinal} voyage, you'll enjoy:\n\n${bullet(forVoyage.map((p) => p.title))}`,
        attachments: [{ kind: 'privileges', privilegeIds: forVoyage.map((p) => p.id) }],
      };
    },
  },
  {
    intent: 'occasion.plan',
    match: /(anniversary|birthday|celebrat|surprise|special.*(something|occasion))/i,
    confidence: 0.8,
    escalate: true,
    reply: () => {
      const occasion = guest.profile.occasions.find((o) => o.date >= voyage.voyage.startDate && o.date <= voyage.voyage.endDate);
      if (!occasion) return { intent: 'occasion.plan', body: `I’ll ask ${ambassadorFirstName} to plan something special with you.` };
      const port = voyage.voyage.itinerary.find((p) => p.date === occasion.date);
      const plans = experiences.bookings.filter((b) => b.start.startsWith(occasion.date));
      return {
        intent: 'occasion.plan',
        body:
          `Your ${occasion.label} falls on ${formatLongDate(occasion.date)}${port ? `, in ${port.portName}` : ''}. Here is what's already in place:\n\n` +
          bullet(plans.map((b) => `${formatTime(b.start)}: ${b.title}${b.status === 'confirmed' ? '' : ' (being arranged)'}`)) +
          `\n\nI’ve let ${ambassadorFirstName} know you asked. She is handling it personally, discreetly as you wished.`,
        suggestions: ['Add flowers to the suite', companionName ? `Keep it a surprise for ${companionName}` : 'Keep it a surprise'],
      };
    },
  },
];

const fallback: Rule = {
  intent: 'general',
  match: /.*/,
  confidence: 0.4,
  reply: () => ({
    intent: 'general',
    body: `Let me make sure this is handled properly. Would you like me to pass it to ${ambassadorFirstName}, your ${concierge.ambassador.title}?`,
    suggestions: ['Yes, please connect me', 'What is planned for my first day?'],
  }),
};

export class MockConciergeAI implements ConciergeAIProvider {
  async respond({ conversationId, body }: Parameters<ConciergeAIProvider['respond']>[0]) {
    const rule = rules.find((r) => r.match.test(body)) ?? fallback;
    const message: ConciergeMessage = {
      id: mockId('msg'),
      conversationId,
      author: 'ai',
      createdAt: new Date().toISOString(),
      ...rule.reply(body),
    };
    return {
      messages: [message],
      confidence: rule.confidence,
      shouldEscalate: Boolean(rule.escalate) || rule.confidence < 0.5,
    };
  }
}
