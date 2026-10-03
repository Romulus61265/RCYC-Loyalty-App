// Concierge AI pipeline: contracts.
//
// Plain TypeScript with no runtime imports, so the same modules run in the
// Edge Function (Deno) and in the Node checks (scripts/check-concierge-server.ts).
//
//   app ──(JWT, {conversationId, body, requestId})──▶ concierge-respond
//     validate → authorize → rate-limit → idempotency → load context (RLS)
//     → safety in → minimise + pseudonymise → prompt → LLM (timeout, retry)
//     → parse structured output → guard (grounding, claims, safety out)
//     → [execute confirmed action via the booking services] → escalate?
//     → persist → audit → response
//
// The model only ever sees handles (B1, E3, P2…), never database IDs, and
// never contact details, documents, payment or other guests' data.

export type Classification = 'information' | 'recommendation' | 'transactional';
export type EscalationTarget = 'suite-ambassador' | 'concierge-team' | 'medical';
export type ServiceTeam = 'shoreside-concierge' | 'suite-ambassador' | 'guest-services' | 'medical' | 'destination-services';

// ─── Request from the app ──────────────────────────────────────────────────

export interface ConciergeRequestBody {
  conversationId: string;
  body: string;
  /** Client-generated UUID; a retried request returns the original result. */
  requestId: string;
  /** Optional, and only ever checked against the caller: the server derives the guest from the JWT. */
  guestId?: string;
}

// ─── What the database gives us (read under the caller's RLS) ─────────────

export interface RawBooking {
  id: string;
  experienceId: string;
  title: string;
  category: string;
  venue: string;
  start: string; // local ISO
  end?: string;
  partySize: number;
  status: string;
  note?: string;
}

export interface RawExperience {
  id: string;
  title: string;
  category: string;
  subtitle: string;
  portCallId?: string;
  destination?: string;
  durationMinutes?: number;
  priceMinor?: number;
  currency?: string;
  inclusive: boolean;
  format: string;
  tags: string[];
  availability?: string;
}

export interface RawSlot {
  experienceId: string;
  start: string;
  end?: string;
  remaining: number;
}

export interface RawPortCall {
  id: string;
  day: number;
  date: string;
  type: string;
  portName: string;
  country: string;
  arrival?: string;
  departure?: string;
  allAboard?: string;
}

export interface RawDay {
  day: number;
  date: string;
  headline: string;
  dressCode?: string;
  sunset?: string;
  items: { start: string; title: string; location: string; kind: string }[];
}

export interface RawPreferences {
  dining?: { cuisines?: string[]; preferredTime?: string; tablePreference?: string };
  dietary?: { restrictions?: string[]; allergies?: { allergen: string; severity?: string }[] };
  beverage?: { wine?: string[]; spirits?: string[]; nonAlcoholic?: string[] };
  spa?: { favouriteTreatments?: string[]; pressure?: string; preferredTime?: string };
  excursions?: { style?: string; pace?: string; maxDurationMinutes?: number };
  transportation?: { arrivals?: string; helicopterWelcome?: boolean };
  accessibility?: { mobility?: string; tenderAssistance?: boolean };
  activityInterests?: string[];
  privacy?: { personalisedRecommendations?: boolean; shareOccasionsWithCrew?: boolean };
}

export interface RawRequest {
  id: string;
  type: string;
  summary: string;
  status: string;
  nextUpdateBy?: string;
}

export interface RawMessage {
  author: 'guest' | 'ai' | 'human';
  body: string;
  createdAt: string;
  /** Actions offered with an AI message (to recognise "21:00, please"). */
  actions?: OfferedAction[];
}

export interface RawContext {
  conversationId: string;
  reservationId: string;
  guestId: string;
  preferredName: string;
  companionFirstNames: string[];
  tierLabel?: string;
  voyage: { name: string; yacht: string; startDate: string; endDate: string; region?: string };
  embarkationStart: string;
  homeOffset: string; // e.g. "-04:00"
  ambassador: { firstName: string; title: string; availability?: string };
  itinerary: RawPortCall[];
  days: RawDay[];
  bookings: RawBooking[];
  catalogue: RawExperience[];
  slots: RawSlot[];
  preferences: RawPreferences;
  occasions: { type: string; date: string; label: string; recognition: string }[];
  openRequests: RawRequest[];
  history: RawMessage[];
}

// ─── What the model sees (minimised, pseudonymised) ────────────────────────

export interface ModelContext {
  guest: { preferredName: string; travellingWith: string[]; tier?: string };
  voyage: { name: string; yacht: string; dates: string; phase: string; today: string; now: string };
  itinerary: { handle: string; day: number; date: string; port: string; country: string; type: string; arrival?: string; departure?: string; allAboard?: string }[];
  programme: { day: number; date: string; headline: string; dressCode?: string; sunset?: string; items: string[] }[];
  bookings: { handle: string; title: string; category: string; venue: string; start: string; end?: string; partySize: number; status: string; note?: string }[];
  experiences: { handle: string; title: string; category: string; subtitle: string; where: string; durationMinutes?: number; price?: string; format: string; availability?: string; openSlots: string[] }[];
  preferences: Record<string, unknown>;
  occasions: { type: string; date: string }[];
  openRequests: { handle: string; summary: string; status: string }[];
  pendingActions: { handle: string; description: string }[];
  /** Which slices were included, for audit. */
  slices: string[];
}

/** Handle → real record, kept server-side only. */
export interface HandleMap {
  bookings: Map<string, RawBooking>;
  experiences: Map<string, RawExperience>;
  ports: Map<string, RawPortCall>;
  requests: Map<string, RawRequest>;
  pending: Map<string, OfferedAction>;
}

// ─── Model output (structured) ─────────────────────────────────────────────

export type TransactionType = 'change_booking' | 'request_experience' | 'cancel_booking' | 'service_request';

export interface ModelOutput {
  classification: Classification;
  reply: string;
  grounding: string[];
  recommendations: { experience: string; reason: string }[];
  transaction: null | {
    type: TransactionType;
    booking: string | null;
    experience: string | null;
    /** Local wall-clock "YYYY-MM-DDTHH:MM" from the context. */
    start_local: string | null;
    party_size: number | null;
    summary: string;
    /** True only when the guest has clearly said yes to an action offered in the previous turn. */
    guest_confirmed: boolean;
  };
  needs_human: { required: boolean; team: EscalationTarget | null; reason: string | null };
  confidence: number;
}

// ─── Actions (same shape as the app's ConciergeAction) ────────────────────

export type OfferedAction =
  | { kind: 'change-booking'; label: string; bookingId: string; start: string }
  | { kind: 'request-experience'; label: string; experienceId: string; start: string; partySize: number }
  | { kind: 'service-request'; label: string; type: string; summary: string; details?: string }
  | { kind: 'escalate'; label: string; to: EscalationTarget; reason: string };

// ─── Ports (implemented with Supabase in the function; fakes in tests) ────

export interface Caller {
  userId: string;
  guestId: string | null;
  roles: string[];
}

export interface TransactionResult {
  ok: boolean;
  /** Status reported by the booking service after the write. */
  status?: 'received' | 'in_progress' | 'confirmed';
  bookingId?: string;
  requestId?: string;
  title?: string;
  start?: string;
  partySize?: number;
  error?: string;
}

export interface PersistedReply {
  messages: unknown[];
}

export interface ConciergePorts {
  now(): Date;
  /** Messages the caller sent in the last `windowSeconds`. */
  recentMessageCount(caller: Caller, windowSeconds: number): Promise<number>;
  /** A stored result for this requestId (idempotent retries). */
  findRun(requestId: string): Promise<PersistedReply | null>;
  /** Loads everything about the conversation the caller is allowed to see; null if not theirs. */
  loadContext(caller: Caller, conversationId: string): Promise<RawContext | null>;
  /** Carries out an action the guest consented to, through the booking services (RLS). */
  execute(caller: Caller, ctx: RawContext, action: OfferedAction): Promise<TransactionResult>;
  /** Hands the conversation to a person: a service request plus team assignment. */
  escalate(caller: Caller, ctx: RawContext, to: EscalationTarget, reason: string, summary: string): Promise<{ requestId: string; team: ServiceTeam; agentName: string; minutes: number }>;
  /** Stores the guest message and the reply (service role for AI-authored rows). */
  persist(caller: Caller, ctx: RawContext, run: RunRecord, guestText: string, reply: ReplyMessage): Promise<PersistedReply>;
  audit(entry: AuditEntry): Promise<void>;
}

export interface LLMRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  schema: Record<string, unknown>;
  signal: AbortSignal;
  timeoutMs: number;
}

export interface LLMResponse {
  /** Parsed JSON (structured output); unknown until validated. */
  output: unknown;
  stopReason: 'end_turn' | 'max_tokens' | 'refusal' | 'other';
  model: string;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number };
}

export interface LLMProvider {
  readonly name: string;
  generate(req: LLMRequest): Promise<LLMResponse>;
}

/** Thrown by providers; `retryable` drives the single retry. */
export class ProviderError extends Error {
  constructor(
    public kind: 'timeout' | 'rate_limited' | 'unavailable' | 'bad_request' | 'auth',
    message: string,
  ) {
    super(message);
  }
  get retryable() {
    return this.kind === 'timeout' || this.kind === 'rate_limited' || this.kind === 'unavailable';
  }
}

// ─── Output to the app ─────────────────────────────────────────────────────

export interface ReplyMessage {
  body: string;
  classification: Classification;
  intent: string;
  confidence: number;
  attachments: unknown[];
  suggestions: string[];
}

export interface RunRecord {
  requestId: string;
  provider: string;
  model: string;
  promptVersion: string;
  classification: Classification;
  slices: string[];
  safetyFlags: string[];
  guardFindings: string[];
  escalated: EscalationTarget | null;
  transaction: { type: string; status: 'offered' | 'executed' | 'failed' | 'none' };
  degraded: boolean;
  latencyMs: number;
  attempts: number;
  usage?: LLMResponse['usage'];
}

export interface AuditEntry {
  actorId: string;
  actorRoles: string[];
  action: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure';
  requestId?: string;
  metadata: Record<string, unknown>;
}

export interface PipelineResult {
  status: number;
  body: { messages?: unknown[]; classification?: Classification; escalated?: boolean; degraded?: boolean; error?: string; replayed?: boolean };
}
