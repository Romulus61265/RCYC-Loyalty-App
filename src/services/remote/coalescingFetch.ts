/**
 * Identical reads in flight share one request.
 *
 * A screen's data is assembled by several services at once, and the
 * composed ones (occasions, notifications, the recap) each rebuild the
 * overview and profile they need. Measured on Home in Supabase mode: 111
 * requests, 25 distinct reads repeated within one load. With this wrapper
 * an identical PostgREST read (same URL, same caller, same representation)
 * made while the first is still on its way waits for that one instead:
 * Home loads with 47 requests.
 *
 * Nothing is reused once it has arrived (`windowMs` 0), so no answer is
 * older than a request the caller could have made itself; a two-second
 * window was measured too (Home 34) and rejected, because a reload
 * triggered by a change made elsewhere could have been answered from
 * before the change. Writes, and Edge Functions that may write, are
 * never shared and clear what is in flight from being joined; errors are
 * never shared after the fact; a different signed-in user never shares
 * an answer (the Authorization header is part of the key).
 */

/** RPCs that only read, so a POST to them may be shared. */
export const READ_RPCS = ['my_personal_details', 'my_relationship', 'current_guest_id'] as const;
/** Edge Functions that only read (any other function call is treated as a write). */
export const READ_FUNCTIONS = ['personalization-next-best'] as const;

interface Stored {
  status: number;
  statusText: string;
  headers: [string, string][];
  /** PostgREST answers are JSON text; text is also the most portable body across fetch implementations. */
  body: string;
}

interface Entry {
  at: number;
  settled: boolean;
  value: Promise<Stored>;
}

export interface CoalescingStats {
  network: number;
  shared: number;
}

/** Headers that change the answer; part of the key. */
const KEYED = ['authorization', 'apikey', 'accept', 'prefer', 'range', 'accept-profile', 'content-profile'];

export function coalescingFetch(base: typeof fetch, { windowMs = 0, now = () => Date.now(), readRpcs = READ_RPCS as readonly string[], readFunctions = READ_FUNCTIONS as readonly string[] } = {}) {
  const entries = new Map<string, Entry>();
  const stats: CoalescingStats = { network: 0, shared: 0 };

  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    const path = new URL(url, 'http://local').pathname;
    const rest = path.includes('/rest/v1/');
    const rpc = path.match(/\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1];
    const fn = path.match(/\/functions\/v1\/([a-z-]+)$/)?.[1];
    const isRead =
      (rest && (method === 'GET' || method === 'HEAD' || (method === 'POST' && rpc !== undefined && readRpcs.includes(rpc)))) ||
      (method === 'POST' && fn !== undefined && readFunctions.includes(fn));

    if (!isRead) {
      // A write (or a function that may write): nothing read before it may be reused after it.
      if (rest || path.includes('/functions/v1/')) entries.clear();
      stats.network += 1;
      return base(input, init);
    }

    const headers = new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
    const body = method === 'POST' && typeof init?.body === 'string' ? init.body : '';
    const key = [method, url, body, ...KEYED.map((h) => headers.get(h) ?? '')].join('\u0000');

    const t = now();
    for (const [k, e] of entries) if (e.settled && t - e.at >= windowMs) entries.delete(k);
    const hit = entries.get(key);
    if (hit) {
      stats.shared += 1;
      return toResponse(await hit.value);
    }

    stats.network += 1;
    const entry: Entry = {
      at: t,
      settled: false,
      value: base(input, init).then(async (r) => ({ status: r.status, statusText: r.statusText, headers: [...r.headers.entries()], body: await r.text() })),
    };
    entries.set(key, entry);
    entry.value.then(
      (s) => {
        entry.settled = true;
        entry.at = now();
        // Only a success is worth sharing after the fact, and only within the window.
        if (windowMs <= 0 || s.status < 200 || s.status >= 300) entries.delete(key);
      },
      () => entries.delete(key),
    );
    return toResponse(await entry.value);
  };

  return Object.assign(wrapped, { stats, clear: () => entries.clear() });
}

function toResponse(s: Stored): Response {
  // A fresh Response each time: a body can be read only once.
  return new Response(s.status === 204 || s.status === 304 ? null : s.body, { status: s.status, statusText: s.statusText, headers: s.headers });
}
