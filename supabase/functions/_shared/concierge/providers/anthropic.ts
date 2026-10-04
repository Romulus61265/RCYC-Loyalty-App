// Claude provider (Deno, Edge Functions only). The API key is a function
// secret (`supabase secrets set ANTHROPIC_API_KEY=…`); it never reaches the
// app, the database or the logs.
//
// Structured output via output_config.format (JSON Schema), low effort for a
// chat-speed reply, the fixed system prompt cached, retries owned by the
// pipeline (maxRetries: 0) so the deadline holds, and server-side fallback on
// a safety decline.
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { ProviderError, type LLMProvider, type LLMRequest, type LLMResponse } from '../types.ts';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model = 'claude-opus-5-5',
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    try {
      const response = await this.client.beta.messages.create(
        {
          model: this.model,
          // The reply is capped at 1,800 characters (safety.ts) and the structured fields are short:
          // a tight ceiling bounds the cost of any one call, however it is prompted.
          max_tokens: 2048,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
          messages: req.messages,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: req.schema } },
        },
        { timeout: req.timeoutMs, signal: req.signal },
      );
      const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined };
      if (response.stop_reason === 'refusal') return { output: null, stopReason: 'refusal', model: response.model, usage };
      const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      let output: unknown = null;
      try {
        output = JSON.parse(text);
      } catch {
        output = text; // the guard rejects it
      }
      return { output, stopReason: response.stop_reason === 'end_turn' ? 'end_turn' : response.stop_reason === 'max_tokens' ? 'max_tokens' : 'other', model: response.model, usage };
    } catch (e) {
      // Most specific first; never surface the provider's message to the guest.
      if (e instanceof Anthropic.APIUserAbortError || e instanceof Anthropic.APIConnectionTimeoutError) throw new ProviderError('timeout', 'timeout');
      if (e instanceof Anthropic.RateLimitError) throw new ProviderError('rate_limited', 'rate limited');
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new ProviderError('auth', 'provider credentials');
      if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.UnprocessableEntityError) throw new ProviderError('bad_request', 'bad request');
      if (e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) throw new ProviderError('unavailable', 'unavailable');
      if (e instanceof Anthropic.APIError) throw new ProviderError('unavailable', `status ${e.status}`);
      throw new ProviderError('unavailable', 'unknown');
    }
  }
}
