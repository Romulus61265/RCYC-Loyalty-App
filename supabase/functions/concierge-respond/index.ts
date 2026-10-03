// POST /concierge-respond  { conversationId, body, requestId }
//
// The endpoint is thin: it authenticates, builds the two clients and the
// provider, and hands the raw request to the runtime-agnostic pipeline in
// _shared/concierge (validation, authorization, rate limit, idempotency,
// minimised context, prompt, model call with timeouts, structured output,
// guards, transactions through the booking services, escalation, audit).
//
// Credentials live only in function secrets:
//   CONCIERGE_AI_PROVIDER = mock (default) | anthropic
//   ANTHROPIC_API_KEY     = required for `anthropic`
//   CONCIERGE_AI_MODEL    = optional model override
// The app never sees them; it only ever calls this function with its own JWT.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle, HttpError, json, serviceClient } from '../_shared/auth.ts';
import { DEFAULT_CONFIG, handleConcierge } from '../_shared/concierge/pipeline.ts';
import { MockLLMProvider } from '../_shared/concierge/providers/mock.ts';
import { AnthropicProvider } from '../_shared/concierge/providers/anthropic.ts';
import { resolveCaller, supabasePorts } from '../_shared/concierge/supabasePorts.ts';
import { MAX_REQUEST_BYTES } from '../_shared/concierge/validate.ts';
import type { LLMProvider } from '../_shared/concierge/types.ts';

function provider(): LLMProvider {
  const kind = Deno.env.get('CONCIERGE_AI_PROVIDER') ?? 'mock';
  if (kind === 'anthropic') {
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    // Misconfiguration is an operator problem: fail closed rather than fall back silently.
    if (!key) throw new HttpError(503, 'unavailable');
    return new AnthropicProvider(key, Deno.env.get('CONCIERGE_AI_MODEL') ?? undefined);
  }
  return new MockLLMProvider();
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) throw new HttpError(401, 'unauthenticated');
    if (Number(req.headers.get('Content-Length') ?? 0) > MAX_REQUEST_BYTES) throw new HttpError(413, 'too_large');

    const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const caller = await resolveCaller(user);
    if (!caller) throw new HttpError(401, 'unauthenticated');

    const raw = await req.text();
    const result = await handleConcierge(raw, caller, supabasePorts(user, serviceClient()), { ...DEFAULT_CONFIG, provider: provider() });
    return json(result.body, result.status);
  }),
);
