// Shared guard for Edge Functions (Deno runtime).
//
// Every function: verify the caller's JWT with Supabase Auth, load roles,
// and use a *user-scoped* client so RLS still applies. The service-role
// client is created only for narrowly-scoped server writes (audit, AI
// messages, event projection) and never leaves the function.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type AppRole = 'guest' | 'travel_companion' | 'suite_ambassador' | 'concierge_agent' | 'shore_ops' | 'admin';

export interface Caller {
  userId: string;
  roles: AppRole[];
  db: SupabaseClient; // user-scoped (RLS enforced)
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireCaller(req: Request, allowed?: AppRole[]): Promise<Caller> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new HttpError(401, 'unauthenticated');

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'unauthenticated');

  const { data: roleRows } = await db.from('user_roles').select('role');
  const roles = (roleRows ?? []).map((r: { role: AppRole }) => r.role);
  if (roles.length === 0) roles.push('guest');
  if (allowed && !roles.some((r) => allowed.includes(r))) throw new HttpError(403, 'forbidden');

  return { userId: data.user.id, roles, db };
}

/** Service-role client. Use sparingly; every write through it must be audited. */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export async function audit(entry: {
  actorId?: string;
  actorRoles?: AppRole[];
  action: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure';
  requestId?: string;
  metadata?: Record<string, unknown>;
}) {
  await serviceClient().from('audit_log').insert({
    actor_id: entry.actorId,
    actor_roles: entry.actorRoles,
    action: entry.action,
    resource: entry.resource,
    resource_id: entry.resourceId,
    outcome: entry.outcome,
    request_id: entry.requestId,
    metadata: entry.metadata ?? {},
  });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error('unhandled', e instanceof Error ? e.message : 'unknown');
      return json({ error: 'internal' }, 500);
    }
  };
}
