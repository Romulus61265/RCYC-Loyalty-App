// The concierge request pipeline. Runtime-agnostic: the Edge Function wires
// it to Supabase and an LLM provider; tests wire it to fakes.
import { buildModelContext, type Topic } from './context.ts';
import { claimsChange, guard, parseOutput, type GuardResult } from './guard.ts';
import { buildMessages, OUTPUT_SCHEMA, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt.ts';
import { screenInput, screenOutput } from './safety.ts';
import { authorize, validateRequest } from './validate.ts';
import {
  ProviderError,
  type Caller,
  type Classification,
  type ConciergePorts,
  type EscalationTarget,
  type LLMProvider,
  type LLMResponse,
  type ModelOutput,
  type OfferedAction,
  type PipelineResult,
  type RawContext,
  type ReplyMessage,
  type RunRecord,
} from './types.ts';

export interface PipelineConfig {
  provider: LLMProvider;
  /** Whole request, including retries (the guest is waiting). */
  deadlineMs: number;
  /** One model call. */
  providerTimeoutMs: number;
  /** Below this, offer a person rather than trust the answer. */
  minConfidence: number;
  /** Guest turns that reach the model: per window and per day, counted atomically before the call. */
  rateLimit: { max: number; windowSeconds: number; perDay: number };
}

export const DEFAULT_CONFIG: Omit<PipelineConfig, 'provider'> = {
  deadlineMs: 15_000,
  providerTimeoutMs: 9_000,
  minConfidence: 0.55,
  rateLimit: { max: 12, windowSeconds: 300, perDay: 150 },
};

function intentFor(classification: Classification, topics: Topic[], escalated: EscalationTarget | null): string {
  if (escalated === 'medical') return 'medical.assist';
  if (classification === 'transactional') return 'service.request';
  if (classification === 'recommendation') return topics.includes('occasion') ? 'occasion.plan' : 'experience.discover';
  const map: Partial<Record<Topic, string>> = { schedule: 'schedule.query', loyalty: 'loyalty.benefits', requests: 'request.status', occasion: 'occasion.plan', transport: 'transport.arrange', dining: 'dining.modify', shore: 'experience.discover' };
  return map[topics[0] ?? 'general'] ?? 'general';
}

const atHome = (ctx: RawContext, now: Date) => now.getTime() < Date.parse(ctx.embarkationStart) - 12 * 3_600_000 || now.getTime() > Date.parse(`${ctx.voyage.endDate}T18:00:00Z`);

/** Words written by the server, never by the model, for outcomes it must not misstate. */
const COPY = {
  emergency(ctx: RawContext, now: Date, reason: string) {
    if (reason === 'wellbeing') return `I am bringing in our Medical Centre and ${ctx.ambassador.firstName} right now. You are not alone. If you are in immediate danger, please call your local emergency number${atHome(ctx, now) ? '' : ' or press the red key on any suite telephone'}.`;
    if (reason === 'security') return 'I have alerted our team, who will contact you straight away. If anyone is in danger, please call for help immediately.';
    return atHome(ctx, now)
      ? 'I am connecting you with our Medical Centre now. If this is an emergency, please call your local emergency number first.'
      : 'I am connecting you with our Medical Centre now. If this is an emergency, press the red key on any suite telephone and stay where you are.';
  },

  unsure: (ctx: RawContext) => `I want to be sure I give you the right answer, so I have asked ${ctx.ambassador.firstName} to look into this for you.`,
  unavailable: (ctx: RawContext) => `I am taking a little longer than usual, so I have asked ${ctx.ambassador.firstName} to reply to you personally.`,
  confirmBelow: (label: string) => `Of course. Tap “${label.replace(/[“”"]/g, '')}” below and I will send it straight away.`,
  offer: (summary: string) => `I can arrange that: ${summary.replace(/\.$/, '')}. Please confirm below and I will send it to the team.`,
  joining: (agent: string) => `I have asked ${agent.split(',')[0]} to join us.`,
};

interface Attempt {
  response?: LLMResponse;
  output?: ModelOutput;
  checked?: GuardResult;
  error?: ProviderError | Error;
}

export async function handleConcierge(rawBody: string, caller: Caller, ports: ConciergePorts, config: PipelineConfig): Promise<PipelineResult> {
  const t0 = Date.now();
  const deadline = t0 + config.deadlineMs;
  const fail = async (status: number, error: string, requestId?: string): Promise<PipelineResult> => {
    await ports.audit({ actorId: caller.userId, actorRoles: caller.roles, action: 'concierge.respond', resource: 'concierge_conversation', outcome: 'failure', requestId, metadata: { error, status } }).catch(() => undefined);
    return { status, body: { error } };
  };

  // 1 · Authorization and validation.
  const auth = authorize(caller);
  if (!auth.ok) return fail(auth.status, auth.error);
  const v = validateRequest(rawBody, caller);
  if (!v.ok) return fail(v.status, v.error);
  const req = v.value;

  // 2 · Rate limit and idempotency.
  // A retry of a stored turn costs nothing; anything else takes a slot first. The slot is taken
  // atomically in the database, so parallel requests cannot all pass a count made before any is stored.
  const previous = await ports.findRun(caller, req.requestId);
  if (previous) return { status: 200, body: { messages: previous.messages, replayed: true } };
  if (!(await ports.takeSlot(caller, config.rateLimit))) return fail(429, 'rate_limited', req.requestId);

  // 3 · Context, under the caller's RLS. Not theirs = not found.
  const ctx = await ports.loadContext(caller, req.conversationId);
  if (!ctx) return fail(404, 'not_found', req.requestId);
  const now = ports.now();

  // 4 · Input safety.
  const screen = screenInput(req.body);

  // Crew have taken this conversation over: the guest's words go to them, and no model is
  // called (no reply, no offer, no cost). Enforced here, not only in the app.
  if (!ctx.aiEnabled) {
    await ports.persistGuestOnly(caller, ctx, screen.text);
    await ports.audit({ actorId: caller.userId, actorRoles: caller.roles, action: 'concierge.respond', resource: 'concierge_conversation', resourceId: ctx.conversationId, outcome: 'success', requestId: req.requestId, metadata: { humanOnly: true } }).catch(() => undefined);
    return { status: 200, body: { messages: [], humanOnly: true } };
  }
  const run: RunRecord = {
    requestId: req.requestId,
    provider: config.provider.name,
    model: 'none',
    promptVersion: PROMPT_VERSION,
    classification: 'information',
    slices: [],
    safetyFlags: screen.flags,
    guardFindings: [],
    escalated: null,
    transaction: { type: 'none', status: 'none' },
    degraded: false,
    latencyMs: 0,
    attempts: 0,
  };
  const attachments: unknown[] = [];

  const escalate = async (to: EscalationTarget, reason: string, summary: string) => {
    const e = await ports.escalate(caller, ctx, to, reason, summary);
    run.escalated = to;
    attachments.push({ kind: 'handoff', to, team: e.team, agentName: e.agentName, expectedResponseMinutes: e.minutes, requestId: e.requestId });
    return e;
  };

  const finish = async (body: string, classification: Classification, topics: Topic[], confidence: number): Promise<PipelineResult> => {
    run.classification = classification;
    run.latencyMs = Date.now() - t0;
    const reply: ReplyMessage = { body, classification, intent: intentFor(classification, topics, run.escalated), confidence, attachments, suggestions: [] };
    const persisted = await ports.persist(caller, ctx, run, screen.text, reply);
    await ports.audit({
      actorId: caller.userId,
      actorRoles: caller.roles,
      action: 'concierge.respond',
      resource: 'concierge_conversation',
      resourceId: req.conversationId,
      outcome: 'success',
      requestId: req.requestId,
      // Never message text: metadata about the decision only.
      metadata: {
        provider: run.provider,
        model: run.model,
        promptVersion: run.promptVersion,
        classification,
        topics,
        slices: run.slices,
        safetyFlags: run.safetyFlags,
        guardFindings: run.guardFindings,
        escalated: run.escalated,
        transaction: run.transaction,
        degraded: run.degraded,
        attempts: run.attempts,
        latencyMs: run.latencyMs,
        usage: run.usage,
      },
    });
    return { status: 200, body: { messages: persisted.messages, classification, escalated: Boolean(run.escalated), degraded: run.degraded } };
  };

  // 5 · Emergencies go to people at once; no model in the loop.
  if (screen.emergency) {
    await escalate(screen.emergency.to, screen.emergency.reason, screen.emergency.reason === 'security' ? 'Safety concern raised via concierge' : 'Urgent help requested via concierge');
    return finish(COPY.emergency(ctx, now, screen.emergency.reason), 'information', ['general'], 1);
  }

  // 6 · Minimised, pseudonymised context and the prompt.
  const { model, handles, topics } = buildModelContext(ctx, screen.text, now);
  run.slices = model.slices;
  const messages = buildMessages(model, screen.text, ctx.history.map((m) => (m.author === 'guest' ? { ...m, body: screenInput(m.body).text } : m)));

  // 7 · The model: bounded time, one retry or one repair.
  const attempt = async (msgs: typeof messages): Promise<Attempt> => {
    const remaining = deadline - Date.now();
    if (remaining < 1_500) return { error: new ProviderError('timeout', 'deadline') };
    const controller = new AbortController();
    const timeoutMs = Math.min(config.providerTimeoutMs, remaining - 500);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    run.attempts += 1;
    try {
      const response = await config.provider.generate({ system: SYSTEM_PROMPT, messages: msgs, schema: OUTPUT_SCHEMA, signal: controller.signal, timeoutMs });
      run.model = response.model;
      run.usage = response.usage;
      if (response.stopReason === 'refusal') return { response };
      const parsed = parseOutput(response.output);
      if (!parsed.ok) return { response, error: new Error(`schema:${parsed.error}`) };
      return { response, output: parsed.value, checked: guard(parsed.value, model, handles, ctx, screen.text, now) };
    } catch (e) {
      const err = e instanceof ProviderError ? e : controller.signal.aborted ? new ProviderError('timeout', 'timeout') : new ProviderError('unavailable', e instanceof Error ? e.message : 'error');
      return { error: err };
    } finally {
      clearTimeout(timer);
    }
  };

  let a = await attempt(messages);
  if (a.error instanceof ProviderError && a.error.retryable) a = await attempt(messages);
  else if (a.output && a.checked?.repairable.length) {
    run.guardFindings.push(...a.checked.findings.map((f) => `attempt1:${f}`));
    const repaired = await attempt([
      ...messages,
      { role: 'assistant', content: JSON.stringify(a.output) },
      { role: 'user', content: `<feedback>\n${a.checked.repairable.join('\n')}\n</feedback>\nAnswer the guest's last message again, following the rules.` },
    ]);
    if (repaired.output) a = repaired;
  } else if (a.error && !(a.error instanceof ProviderError)) {
    // Malformed output: one more try.
    run.guardFindings.push(`attempt1:${a.error.message}`);
    const again = await attempt(messages);
    if (again.output || !a.output) a = again;
  }

  // 8 · Degrade gracefully: never leave the guest without an answer.
  if (!a.output || !a.checked) {
    run.degraded = true;
    const refusal = a.response?.stopReason === 'refusal';
    run.guardFindings.push(refusal ? 'provider.refusal' : a.error instanceof ProviderError ? `provider.${a.error.kind}` : (a.error?.message ?? 'provider.no_output'));
    await escalate(refusal ? 'concierge-team' : 'suite-ambassador', refusal ? 'sensitive' : 'low-confidence', 'Concierge could not answer automatically');
    return finish(refusal ? COPY.unsure(ctx) : COPY.unavailable(ctx), 'information', topics, 0);
  }

  const checked = a.checked;
  run.guardFindings.push(...checked.findings);
  const out = checked.output;
  let reply = out.reply;
  const classification = out.classification;
  let confidence = out.confidence;

  // Anything the repair didn't fix is replaced by server-written words.
  const stillWrong = checked.findings.some((f) => f === 'grounding.unknown_time' || f === 'grounding.unknown_price');
  if (claimsChange(reply)) {
    run.guardFindings.push('final:claim_replaced');
    reply = checked.offer ? COPY.offer(checked.offer.title) : COPY.unsure(ctx);
    if (!checked.offer) out.needs_human = { required: true, team: 'suite-ambassador', reason: 'unverifiable claim' };
  } else if (stillWrong) {
    run.guardFindings.push('final:ungrounded_replaced');
    reply = COPY.unsure(ctx);
    confidence = Math.min(confidence, 0.3);
    out.needs_human = { required: true, team: 'suite-ambassador', reason: 'ungrounded answer' };
  }

  // Output safety.
  const medicalTopic = screen.flags.includes('topic.medical');
  const safe = screenOutput(reply, { medicalTopic });
  run.guardFindings.push(...safe.findings);
  if (!safe.ok) {
    reply = medicalTopic ? COPY.emergency(ctx, now, 'medical') : COPY.unsure(ctx);
    out.needs_human = { required: true, team: medicalTopic ? 'medical' : 'suite-ambassador', reason: 'output safety' };
  } else reply = safe.text;
  if (medicalTopic && out.needs_human.team !== 'medical') out.needs_human = { required: true, team: 'medical', reason: 'health question' };

  // 9 · Transactions. Nothing is executed on the model's word that the guest agreed: the model
  // reads text others wrote (catalogue copy, crew notes, earlier messages) and can be steered.
  // An offer the guest accepted in words is presented again as a button; the tap (performAction,
  // under the guest's own RLS) is the only way it happens.
  if (checked.confirmed) {
    run.transaction = { type: checked.confirmed.kind, status: 'awaiting_tap' };
    reply = COPY.confirmBelow(checked.confirmed.label);
    attachments.push({ kind: 'actions', title: checked.confirmed.label, detail: 'Tap to confirm', subject: {}, actions: [checked.confirmed] as OfferedAction[] });
  } else if (checked.offer) {
    run.transaction = { type: checked.offer.action.kind, status: 'offered' };
    attachments.push({ kind: 'actions', title: checked.offer.title, detail: checked.offer.detail, subject: checked.offer.subject, actions: [checked.offer.action] as OfferedAction[] });
  }

  // Suggestions become cards the guest can act on (open slots only).
  for (const card of checked.suggestionCards) {
    attachments.push({ kind: 'actions', title: card.title, detail: card.detail, subject: { experienceId: card.experienceId }, actions: card.actions });
  }

  // 10 · People.
  if (out.needs_human.required && out.needs_human.team) {
    const e = await escalate(out.needs_human.team, out.needs_human.team === 'medical' ? 'medical' : 'guest-request', (out.needs_human.reason ?? 'Concierge hand-off').slice(0, 200));
    if (!reply.includes(e.agentName.split(',')[0]!)) reply = `${reply} ${COPY.joining(e.agentName)}`;
  } else if (confidence < config.minConfidence) {
    // Unsure: offer a person rather than hand over unasked.
    attachments.push({
      kind: 'actions',
      title: 'Speak with a person',
      actions: [
        { kind: 'escalate', label: `Ask ${ctx.ambassador.firstName}`, to: 'suite-ambassador', reason: 'low-confidence' },
        { kind: 'escalate', label: 'The concierge team', to: 'concierge-team', reason: 'low-confidence' },
      ],
    });
  }

  return finish(reply, classification, topics, confidence);
}
