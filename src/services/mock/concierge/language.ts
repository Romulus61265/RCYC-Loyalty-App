/**
 * Rules-based understanding for the mock concierge: which intent a message
 * expresses, and the day, time and port it refers to. Deterministic, so
 * scripts/check-concierge.ts can pin every behaviour.
 */
import type { ConciergeIntent, ConciergeMessage, PortCall } from '@/domain';
import { localDate, type ConciergeSnapshot } from './snapshot';

export type Intent = ConciergeIntent | 'confirm.action' | 'small-talk' | 'complaint';

const RULES: { intent: Intent; match: RegExp }[] = [
  { intent: 'medical.assist', match: /\b(doctor|medical|unwell|sick|emergency|hurt|injur\w*|chest pain|can'?t breathe)\b/i },
  { intent: 'human.handoff', match: /\b(speak|talk|chat)\s+(to|with)\b|\b(a human|real person|a person|call me|ambassador|butler)\b/i },
  { intent: 'complaint', match: /\b(complain\w*|disappointed|unacceptable|refund|not happy|unhappy|terrible)\b/i },
  { intent: 'dining.modify', match: /\b(move|change|reschedul\w*|shift|push|earlier|later)\b.*\b(dinner|lunch|table|reservation|restaurant)\b|\b(dinner|table|reservation)\b.*\b(move|change|earlier|later|reschedul\w*)\b/i },
  { intent: 'request.status', match: /\b(status (of|on)|update on|progress|my requests?|any news|what'?s happening with|where are we with|have you heard)\b/i },
  { intent: 'occasion.plan', match: /\b(anniversary|birthday|celebrat\w*|surprise|honeymoon|proposal|special occasion)\b/i },
  { intent: 'experience.discover', match: /\b(private|exclusive|experiences?|excursions?|things to do|what can (we|i) do|tours?|available in|ashore)\b/i },
  { intent: 'transport.arrange', match: /\b(transport\w*|cars?|driver|chauffeur|transfers?|taxi|helicopter|pick ?up|airport|flights?)\b/i },
  { intent: 'loyalty.benefits', match: /\b(benefits?|bonvoy|privileges?|perks?|titanium|elite|tier|recognition|my status)\b/i },
  { intent: 'schedule.query', match: /\b(tomorrow|today|tonight|planned|plan|schedule|itinerary|programme|program|agenda|what should (i|we) do|what'?s on|day \d|first day|last day|sea day)\b/i },
  { intent: 'gratitude', match: /^\s*(thanks?|thank you|lovely|wonderful|perfect|great|merci|grazie)\b/i },
  { intent: 'small-talk', match: /^\s*(hi|hello|good (morning|afternoon|evening)|hey)\b/i },
];

const YES = /^\s*(yes|yes please|please|please do|do it|book it|that one|perfect|go ahead|sounds good|lovely)\b/i;

/** The last concierge message's actions, if the guest is likely replying to it. */
export function pendingActions(history: ConciergeMessage[]) {
  const last = [...history].reverse().find((m) => m.author !== 'guest');
  return (last?.attachments ?? []).flatMap((a) => (a.kind === 'actions' ? a.actions : [])).filter((a) => a.kind !== 'open');
}

export function classify(body: string, history: ConciergeMessage[], ambassadorFirstName?: string): Intent {
  if (RULES[0]!.match.test(body)) return 'medical.assist';
  // Asking for the Suite Ambassador by name ("Can Elena call me?").
  if (ambassadorFirstName && new RegExp(`\\b${ambassadorFirstName}\\b`, 'i').test(body) && !/\b(thanks?|thank you)\b/i.test(body)) return 'human.handoff';
  const pending = pendingActions(history);
  if (pending.length) {
    const time = timeIn(body);
    const short = body.trim().length <= 40;
    if (time && pending.some((a) => 'start' in a && a.start.slice(11, 16) === time) && short) return 'confirm.action';
    if (YES.test(body) && short && pending.length === 1) return 'confirm.action';
  }
  return RULES.find((r) => r.match.test(body))?.intent ?? 'general';
}

/** "21:00", "9pm", "9.15 pm" → "21:00" / "21:15". */
export function timeIn(body: string): string | undefined {
  const hm = /\b([01]?\d|2[0-3])[:.](\d{2})\s*(am|pm)?\b/i.exec(body);
  const h = /\b(1[0-2]|[1-9])\s*(am|pm)\b/i.exec(body);
  const m = hm ?? (h ? [h[0], h[1], '00', h[2]] : null);
  if (!m) return undefined;
  let hour = Number(m[1]);
  if (m[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (m[3]?.toLowerCase() === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${m[2]}`;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export type DayRef = { date: string; how: 'today' | 'tomorrow' | 'named' };

/**
 * The day a message refers to, judged where the guest is: today/tonight,
 * tomorrow, "day 3", first/last/sea day, a weekday, "the 19th" or "19 May",
 * or a port on the itinerary. Undefined when none is mentioned.
 */
export function dayIn(body: string, s: ConciergeSnapshot): DayRef | undefined {
  const text = body.toLowerCase();
  const today = localDate(s, s.now);
  const { itinerary, startDate, endDate } = s.overview.voyage;
  if (/\b(today|tonight|this (evening|afternoon|morning))\b/.test(text)) return { date: today, how: 'today' };
  if (/\btomorrow\b/.test(text)) return { date: localDate(s, s.now, 1), how: 'tomorrow' };
  const dayN = /\bday (\d{1,2})\b/.exec(text)?.[1];
  const byNumber = dayN ? itinerary.find((p) => p.day === Number(dayN)) : undefined;
  if (byNumber) return { date: byNumber.date, how: 'named' };
  if (/\b(first day|embarkation day|day we (sail|embark))\b/.test(text)) return { date: startDate, how: 'named' };
  if (/\b(last day|final day|disembarkation)\b/.test(text)) return { date: endDate, how: 'named' };
  const sea = /\bsea day\b/.test(text) ? itinerary.find((p) => p.type === 'sea') : undefined;
  if (sea) return { date: sea.date, how: 'named' };
  const dom = /\b(?:the )?(\d{1,2})(?:st|nd|rd|th)?(?: of)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w* (\d{1,2})(?:st|nd|rd|th)?\b|\bthe (\d{1,2})(?:st|nd|rd|th)\b/.exec(text);
  if (dom) {
    const d = Number(dom[1] ?? dom[4] ?? dom[5]);
    const monthName = dom[2] ?? dom[3];
    const month = monthName ? MONTHS.indexOf(monthName) + 1 : Number(startDate.slice(5, 7));
    const date = `${startDate.slice(0, 4)}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!Number.isNaN(Date.parse(date))) return { date, how: 'named' };
  }
  const weekday = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(text));
  if (weekday >= 0) {
    for (let i = 0; i < 7; i++) {
      const date = localDate(s, s.now, i);
      if (new Date(`${date}T12:00:00Z`).getUTCDay() === weekday) return { date, how: i === 0 ? 'today' : i === 1 ? 'tomorrow' : 'named' };
    }
  }
  const port = portIn(body, itinerary);
  if (port) return { date: port.date, how: 'named' };
  return undefined;
}

const ALIASES: Record<string, string[]> = { 'Monte Carlo': ['monaco', 'monte carlo', 'port hercule'], 'Rome (Civitavecchia)': ['rome', 'civitavecchia'], 'Palma de Mallorca': ['palma', 'mallorca', 'majorca'] };

/** The first itinerary port named in the message (aliases included). */
export function portIn(body: string, itinerary: PortCall[]): PortCall | undefined {
  const text = body.toLowerCase();
  return itinerary.find((p) => p.type !== 'sea' && [p.portName.toLowerCase(), ...(ALIASES[p.portName] ?? [])].some((n) => text.includes(n)));
}

/** Keywords used to find a request or booking the guest names ("the helicopter", "the Barolo"). */
export function keywords(body: string): string[] {
  const stop = new Set(['the', 'my', 'a', 'an', 'of', 'on', 'for', 'with', 'what', 'whats', 'is', 'are', 'status', 'update', 'any', 'news', 'request', 'requests', 'happening', 'where', 'we', 'about', 'please', 'have', 'you', 'heard', 'progress', 'to', 'and']);
  return body
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
}
