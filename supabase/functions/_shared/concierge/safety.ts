// Content safety, before and after the model.
//
// In: redact personal data the guest types (card numbers, passport numbers,
// e-mail, phone) before it leaves our boundary; flag prompt-injection
// attempts (the guest text is passed as delimited data either way); route
// emergencies to people without waiting for a model.
//
// Out: replies may not contain links, internal handles or IDs, other
// people's contact details, medical or legal advice, or prompt leakage.
import type { EscalationTarget } from './types.ts';

export interface InputScreen {
  text: string;
  flags: string[];
  /** Handled by people immediately; the model is not called. */
  emergency: null | { to: EscalationTarget; reason: string };
}

const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
};

const PHONE = /\+?\d[\d ()-]{8,}\d/g;
/** At least nine digits, and not a date or a time range. */
const isPhone = (m: string) => m.replace(/\D/g, '').length >= 9 && !/^\d{4}-\d{2}-\d{2}/.test(m.trim());

const INJECTION = [
  /\bignore (all |any )?(the )?(previous|prior|above) (instructions|prompts?|rules)\b/i,
  /\b(system|developer) (prompt|message|instructions)\b/i,
  /\byou are now\b|\bact as\b|\bpretend to be\b|\bjailbreak\b|\bDAN\b/,
  /<\/?(system|context|guest_message|instructions)>/i,
  /\bprint (your|the) (prompt|instructions|context)\b/i,
];

const MEDICAL_EMERGENCY = /\b(chest pain|can'?t breathe|cannot breathe|unconscious|not breathing|heart attack|stroke|severe (bleeding|allergic)|anaphyla\w*|overdose|seizure)\b/i;
const MEDICAL = /\b(doctor|medical|unwell|sick|injur\w*|hurt|fever|pain|medicine|medication)\b/i;
const SELF_HARM = /\b(kill myself|suicid\w*|end my life|self[- ]harm|hurt myself)\b/i;
const SAFETY_THREAT = /\b(bomb|weapon|gun|attack (the|this) (ship|yacht))\b/i;

export function screenInput(raw: string): InputScreen {
  const flags: string[] = [];
  let text = raw;

  text = text.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => {
    const d = m.replace(/\D/g, '');
    if (d.length >= 13 && luhn(d)) {
      flags.push('pii.card');
      return '[card number removed]';
    }
    return m;
  });
  text = text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, () => (flags.push('pii.email'), '[e-mail removed]'));
  text = text.replace(PHONE, (m) => (isPhone(m) ? (flags.push('pii.phone'), '[phone removed]') : m));
  text = text.replace(/\b(passport|document)( number| no\.?)?[: ]+[A-Z0-9]{6,9}\b/gi, (m) => (flags.push('pii.document'), `${m.split(/[: ]/)[0]} [number removed]`));

  if (INJECTION.some((r) => r.test(text))) flags.push('injection.suspected');

  let emergency: InputScreen['emergency'] = null;
  if (SELF_HARM.test(text)) {
    flags.push('safety.self_harm');
    emergency = { to: 'medical', reason: 'wellbeing' };
  } else if (MEDICAL_EMERGENCY.test(text)) {
    flags.push('safety.medical_emergency');
    emergency = { to: 'medical', reason: 'medical' };
  } else if (SAFETY_THREAT.test(text)) {
    flags.push('safety.threat');
    emergency = { to: 'concierge-team', reason: 'security' };
  } else if (MEDICAL.test(text)) {
    // Not an emergency, but never for the model to advise on.
    flags.push('topic.medical');
  }
  return { text, flags: [...new Set(flags)], emergency };
}

export interface OutputScreen {
  ok: boolean;
  text: string;
  findings: string[];
}

const HANDLE = /\b[BEPRA]\d{1,3}\b/;
const UUIDISH = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/i;
const LEAK = /\b(system prompt|my instructions|as an ai language model|<context>|guest_message)\b/i;
const ADVICE = /\b(you should take|dosage|mg\b|prescri\w+|diagnos\w+|legal advice|sue\b)/i;

/** Checks a reply before it reaches the guest. Removes what can be removed; fails what can't. */
export function screenOutput(reply: string, opts: { medicalTopic: boolean; maxChars?: number }): OutputScreen {
  const findings: string[] = [];
  let text = reply.trim();
  if (URL.test(text)) {
    findings.push('output.link_removed');
    text = text.replace(new RegExp(URL.source, 'gi'), '').replace(/\s{2,}/g, ' ').trim();
  }
  if (HANDLE.test(text)) findings.push('output.internal_handle');
  if (UUIDISH.test(text)) findings.push('output.internal_id');
  if (LEAK.test(text)) findings.push('output.prompt_leak');
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text) || (text.match(PHONE) ?? []).some(isPhone)) findings.push('output.contact_details');
  if (opts.medicalTopic && ADVICE.test(text)) findings.push('output.medical_advice');
  if (text.length > (opts.maxChars ?? 1800)) findings.push('output.too_long');
  if (!text) findings.push('output.empty');
  const blocking = findings.filter((f) => f !== 'output.link_removed');
  return { ok: blocking.length === 0, text, findings };
}
