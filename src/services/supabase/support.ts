/**
 * Query helpers shared by the Supabase services: typed results, error
 * mapping to ServiceError, and input checks.
 *
 * Raw database messages never reach the UI: they are kept on the error for
 * the logger, and screens show calm copy chosen from the error code.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError, type ClockService, type ServiceErrorCode } from '@/services/contracts';

export type Db = () => SupabaseClient;

export interface SupabaseDeps {
  db: Db;
  clock: ClockService;
}

interface PostgrestErrorLike {
  code?: string;
  message: string;
  status?: number;
}

interface Result {
  data: unknown;
  error: PostgrestErrorLike | null;
  status?: number;
}

const CODE_MAP: Record<string, ServiceErrorCode> = {
  PGRST116: 'not_found', // .single() matched no row
  P0002: 'not_found', // raised by our functions
  '42501': 'forbidden', // RLS or privilege
  '23505': 'conflict',
  '40001': 'conflict',
  '23514': 'validation', // check constraint
  '23502': 'validation',
  '22023': 'validation',
  '22P02': 'validation',
  '22001': 'validation',
  PGRST301: 'unauthenticated', // JWT expired or invalid
  PGRST302: 'unauthenticated',
};

export function toServiceError(error: PostgrestErrorLike, status?: number): ServiceError {
  const mapped = error.code ? CODE_MAP[error.code] : undefined;
  const code = mapped ?? (status === 401 ? 'unauthenticated' : status === 403 ? 'forbidden' : undefined);
  if (code) return new ServiceError(code, error.message, false);
  // Network failures and 5xx: worth retrying.
  return new ServiceError('unavailable', error.message || 'Supabase request failed', true);
}

/** All rows, or a ServiceError. */
export async function many<T>(query: PromiseLike<Result>): Promise<T[]> {
  const { data, error, status } = await query;
  if (error) throw toServiceError(error, status);
  return (data ?? []) as T[];
}

/** Matches `max_rows` in supabase/config.toml: the API never returns more per request. */
export const PAGE_SIZE = 200;

/**
 * All rows of a list that can outgrow one response, fetched page by page.
 * `page(from, to)` must apply a total order so pages don't overlap.
 */
export async function manyPaged<T>(page: (from: number, to: number) => PromiseLike<Result>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = await many<T>(page(from, from + PAGE_SIZE - 1));
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

/** One row or null (use with `.maybeSingle()`). */
export async function maybe<T>(query: PromiseLike<Result>): Promise<T | null> {
  const { data, error, status } = await query;
  if (error) throw toServiceError(error, status);
  return (data ?? null) as T | null;
}

/** One row, or ServiceError('not_found'). */
export async function one<T>(query: PromiseLike<Result>, what: string, id: string): Promise<T> {
  const row = await maybe<T>(query);
  if (!row) throw new ServiceError('not_found', `${what} ${id} not found`);
  return row;
}

/** Runs a write and fails on error; returns nothing. */
export async function run(query: PromiseLike<Result>): Promise<void> {
  const { error, status } = await query;
  if (error) throw toServiceError(error, status);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * IDs are validated before use. Besides failing fast, this keeps values that
 * are interpolated into PostgREST filter strings (`or=`, Realtime filters)
 * from changing the filter.
 */
export function uuid(id: string, what: string): string {
  if (!UUID.test(id)) throw new ServiceError('not_found', `${what} ${id} not found`);
  return id;
}

export function text(value: string, what: string, max: number, min = 1): string {
  const v = value.trim();
  if (v.length < min || v.length > max) throw new ServiceError('validation', `${what} must be ${min}–${max} characters`);
  return v;
}

/** Drops null (and empty arrays when asked) so domain objects carry optional fields only when set. */
export function opt<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

export function optList<T>(value: T[] | null | undefined): T[] | undefined {
  return value && value.length ? value : undefined;
}

/** Whole days between two ISO dates. */
export function nightsBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

/** Removes keys whose value is undefined (matches the JSON shape of the mocks). */
export function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
