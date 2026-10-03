/**
 * View models for after the voyage: the Home card, the reflections' steps
 * and the words of the review before sending. Pure.
 *
 * The reflections are a few gentle questions, one at a time, each optional,
 * in the guest's words. No stars, no scales, no scores.
 */
import type { VoyageFeedback, VoyageRecap } from '@/domain';
import { FEEDBACK_WORDS } from '@/domain';

export type ReflectionStepKey = 'moments' | 'words' | 'thanks' | 'better' | 'nextTime' | 'review';

export interface ReflectionStep {
  key: ReflectionStepKey;
  eyebrow: string;
  title: string;
  hint: string;
}

export function reflectionSteps(recap: VoyageRecap): ReflectionStep[] {
  const amb = recap.thankYou.signature.split(' ')[0] ?? 'Your Suite Ambassador';
  const steps: Omit<ReflectionStep, 'eyebrow'>[] = [
    { key: 'moments', title: 'Which moments stay with you?', hint: 'Choose as many as five. It helps us know you a little better; nothing more.' },
    { key: 'words', title: 'If the voyage were a word or two…', hint: 'Up to three, or none at all.' },
    { key: 'thanks', title: 'Is there anyone you would like us to thank?', hint: 'We will pass your words on, by name.' },
    { key: 'better', title: 'Was there anything we could have done better?', hint: `${amb} reads every one personally. Nothing is too small.` },
    { key: 'nextTime', title: 'Anything to remember for next time?', hint: 'The same suite, a quieter table, a later start…' },
    { key: 'review', title: 'Ready when you are', hint: `This goes to ${amb}, and to no one else unless you thanked them.` },
  ];
  return steps.map((s, i) => ({ ...s, eyebrow: s.key === 'review' ? 'Your reflections' : `${i + 1} of ${steps.length - 1}` }));
}

export const WORD_OPTIONS = FEEDBACK_WORDS;

/** How many of the five reflections have something in them. */
export function shared(f: VoyageFeedback): number {
  return [f.favourites.length > 0, f.words.length > 0, f.thanks.length > 0, Boolean(f.better), Boolean(f.nextTime)].filter(Boolean).length;
}

/** What will be sent, in plain words, before the guest sends it. */
export function reviewLines(recap: VoyageRecap, f: VoyageFeedback): string[] {
  const titles = new Map(recap.days.flatMap((d) => d.memories.map((m) => [m.id, m.title] as const)));
  const crew = new Map(recap.crew.map((c) => [c.id, c.name] as const));
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const lines: string[] = [];
  if (f.favourites.length) lines.push(`The moments that stay with you: ${list(f.favourites.map((id) => titles.get(id) ?? '').filter(Boolean))}.`);
  if (f.words.length) lines.push(`In a word: ${list(f.words.map((w) => w.toLowerCase()))}.`);
  if (f.thanks.length) lines.push(`Your thanks to ${list(f.thanks.map((t) => crew.get(t.crewId) ?? '').filter(Boolean))}.`);
  if (f.better) lines.push(`What could have been better, in your words${f.followUp ? ', and that you would like someone to get in touch' : ''}.`);
  if (f.nextTime) lines.push('A note for next time.');
  return lines;
}

/** The Home card after the voyage. */
export interface WelcomeHomeCard {
  title: string;
  line: string;
  cta: string;
  reflections: string;
}

export function welcomeHomeCard(recap: VoyageRecap): WelcomeHomeCard {
  const n = shared(recap.feedback);
  return {
    title: recap.welcome.title,
    line: recap.summary.line,
    cta: 'Your voyage, remembered',
    reflections:
      recap.feedback.status === 'sent'
        ? 'Thank you for your reflections.'
        : n
          ? 'Your reflections are saved. Finish them whenever you like.'
          : 'A few words, when you are ready.',
  };
}

export { FEEDBACK_WORDS };
