/** View-model primitives shared by features. */
import type { ExperienceBooking } from '@/domain';
import type { AppError } from '@/core/errors';

/** Each optional source may fail on its own; screens degrade section by section. */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: AppError };

export type Tone = 'calm' | 'pending' | 'attention';

/** Runs a service call and captures its outcome, including synchronous throws. */
export async function settle<T>(call: () => Promise<T>, toError: (e: unknown) => AppError): Promise<Settled<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

export function bookingStatus(b: Pick<ExperienceBooking, 'status'>): { label: string; tone: Tone } {
  switch (b.status) {
    case 'confirmed':
    case 'completed':
      return { label: 'Confirmed', tone: 'calm' };
    case 'awaiting_guest':
      return { label: 'Awaiting your choice', tone: 'attention' };
    case 'declined':
    case 'cancelled':
      return { label: 'No longer available', tone: 'attention' };
    default:
      return { label: 'Being arranged', tone: 'pending' };
  }
}

