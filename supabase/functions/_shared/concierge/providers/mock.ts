// Deterministic provider for development and CI. It reads only what a real
// model would read (the prompt), and answers in the same structured format,
// so the whole pipeline (guards, actions, escalation, audit) runs without an
// LLM or any credential.
import type { LLMProvider, LLMRequest, LLMResponse, ModelContext, ModelOutput } from '../types.ts';

function contextOf(req: LLMRequest): { ctx: ModelContext; guest: string } {
  const last = req.messages[req.messages.length - 1]!.content;
  const ctx = JSON.parse(/<context>\n([\s\S]*?)\n<\/context>/.exec(last)?.[1] ?? '{}') as ModelContext;
  const guest = [...last.matchAll(/<guest_message>([\s\S]*?)<\/guest_message>/g)].pop()?.[1] ?? '';
  return { ctx, guest };
}

const base = (reply: string, classification: ModelOutput['classification'], confidence: number, grounding: string[] = []): ModelOutput => ({
  classification,
  reply,
  grounding,
  recommendations: [],
  transaction: null,
  needs_human: { required: false, team: null, reason: null },
  confidence,
});

const time = (iso: string) => iso.slice(11, 16);

export function mockAnswer(ctx: ModelContext, guest: string): ModelOutput {
  const g = guest.toLowerCase();
  const name = ctx.guest?.preferredName ?? 'there';

  // "21:00, please" after an offer: accept the matching pending action.
  const wantsTime = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(g)?.[0]?.padStart(5, '0');
  const pending = ctx.pendingActions ?? [];
  if (pending.length && (wantsTime || /^\s*(yes|please|go ahead|do it|perfect)\b/.test(g))) {
    const p = pending.find((x) => !wantsTime || x.description.includes(`T${wantsTime}`)) ?? pending[0]!;
    const start = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(p.description)?.[1] ?? null;
    const move = /move booking/.test(p.description);
    if (!move && !/request at/.test(p.description)) {
      return {
        ...base('Of course, I will send that to the team.', 'transactional', 0.9, [p.handle]),
        transaction: { type: 'service_request', booking: null, experience: null, start_local: null, party_size: null, summary: p.description, guest_confirmed: true },
      };
    }
    const booking = move ? ctx.bookings.find((b) => b.category === 'dining' && b.start.slice(0, 10) === start?.slice(0, 10))?.handle ?? null : null;
    const experience = move ? null : ctx.experiences.find((e) => e.openSlots.includes(start ?? ''))?.handle ?? null;
    return {
      ...base(`Of course, I will ask for ${start ? time(start) : 'that'}.`, 'transactional', 0.9, [p.handle]),
      transaction: { type: move ? 'change_booking' : 'request_experience', booking, experience, start_local: start, party_size: null, summary: p.description, guest_confirmed: true },
    };
  }

  if (/\b(move|change|reschedul\w*|later|earlier)\b/.test(g) && /\b(dinner|table|reservation)\b/.test(g)) {
    const dinner = ctx.bookings.find((b) => b.category === 'dining');
    if (!dinner) return base('I cannot see a dinner reservation yet. Shall I ask for one?', 'information', 0.7);
    const venue = ctx.experiences.find((e) => e.category === 'dining' && e.title === dinner.venue) ?? ctx.experiences.find((e) => e.category === 'dining' && dinner.title.includes(e.title));
    const options = (venue?.openSlots ?? []).filter((s) => s.slice(0, 10) === dinner.start.slice(0, 10) && s !== dinner.start);
    const target = (wantsTime && options.find((s) => time(s) === wantsTime)) || options.find((s) => time(s) > time(dinner.start)) || options[0];
    if (!target) return { ...base(`${dinner.venue} has no other free time that evening. Shall I ask the maître d'?`, 'information', 0.6, [dinner.handle]), needs_human: { required: false, team: null, reason: null } };
    return {
      ...base(`You are at ${dinner.venue} at ${time(dinner.start)}. I can move your table to ${time(target)}; just confirm below.`, 'transactional', 0.88, [dinner.handle, venue!.handle]),
      transaction: { type: 'change_booking', booking: dinner.handle, experience: null, start_local: target, party_size: null, summary: `Move ${dinner.title} to ${time(target)}`, guest_confirmed: false },
    };
  }

  if (/\b(tomorrow|today|planned|schedule|should (i|we) do)\b/.test(g)) {
    const day = ctx.programme.find((d) => (/tomorrow/.test(g) ? d.date > ctx.voyage.today : d.date === ctx.voyage.today)) ?? ctx.programme[0];
    if (!day) return base(`Nothing is planned for that day yet, ${name}. Would you like some ideas?`, 'information', 0.7);
    const booked = ctx.bookings.filter((b) => b.start.slice(0, 10) === day.date);
    const idea = ctx.experiences.find((e) => e.openSlots.some((s) => s.startsWith(day.date)) && !booked.some((b) => b.title.includes(e.title)));
    const lines = booked.map((b) => `${time(b.start)} ${b.title}`).join('; ');
    const out = base(`On ${day.date}: ${day.headline}. ${lines ? `Arranged: ${lines}.` : 'Nothing is booked yet.'}${day.sunset ? ` Sunset is at ${day.sunset}.` : ''}`, idea ? 'recommendation' : 'information', 0.85, booked.map((b) => b.handle));
    if (idea) out.recommendations = [{ experience: idea.handle, reason: 'It fits your free time that day.' }];
    return out;
  }

  if (/\b(benefits?|privileges?|bonvoy|status)\b/.test(g)) return base(`As a ${ctx.guest.tier ?? 'valued'} member, your privileges for this voyage are listed in your profile, and your Suite Ambassador can arrange any of them.`, 'information', 0.8);
  if (/\b(anniversary|birthday|celebrat\w*)\b/.test(g)) {
    return { ...base('I would love to help plan it. Your Suite Ambassador can arrange this with you personally.', 'information', 0.8), needs_human: { required: true, team: 'suite-ambassador', reason: 'Occasion planning' } };
  }
  if (/\b(car|transfer|transport\w*|driver)\b/.test(g)) {
    const port = ctx.itinerary.find((p) => p.date > ctx.voyage.today && p.type !== 'sea');
    return {
      ...base(`I can ask for a private car${port ? ` in ${port.port} on ${port.date}` : ''}. Shall I send the request?`, 'transactional', 0.8, port ? [port.handle] : []),
      transaction: { type: 'service_request', booking: null, experience: null, start_local: null, party_size: null, summary: `Private car${port ? ` in ${port.port}, ${port.date}` : ''}`, guest_confirmed: false },
    };
  }
  return base('Could you tell me a little more about what you would like?', 'information', 0.4);
}

export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';
  generate(req: LLMRequest): Promise<LLMResponse> {
    const { ctx, guest } = contextOf(req);
    return Promise.resolve({ output: mockAnswer(ctx, guest), stopReason: 'end_turn', model: 'mock-concierge-1' });
  }
}
