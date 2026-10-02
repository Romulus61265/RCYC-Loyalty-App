import { env } from '@/config/env';
import { devDataset } from '@/data/fixtures';
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

/** The development dataset every mock service reads from. */
export const data = devDataset;

/**
 * Mock clock — pinned so the journey phase is predictable. Uses
 * EXPO_PUBLIC_DEMO_NOW when set, otherwise the dataset's reference moment.
 */
export function mockNow(): Date {
  const pinned = Date.parse(env.demoNow || data.meta.referenceNow);
  return Number.isNaN(pinned) ? new Date() : new Date(pinned);
}

let seq = 0;
export function mockId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq}`;
}
