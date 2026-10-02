import { env } from '@/config/env';
import { ServiceError } from '@/services/contracts';

/** Simulated network latency so loading states are exercised in the shell. */
export function latency<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredCloneSafe(value)), ms));
}

/** Defensive copy so screens can't mutate fixtures by accident. */
function structuredCloneSafe<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function notFound(what: string, id: string): never {
  throw new ServiceError('not_found', `${what} ${id} not found`);
}

/** Mock clock — pinned to a demo moment so the journey phase is predictable. */
export function mockNow(): Date {
  const pinned = Date.parse(env.demoNow);
  return Number.isNaN(pinned) ? new Date() : new Date(pinned);
}

let seq = 0;
export function mockId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq}`;
}
