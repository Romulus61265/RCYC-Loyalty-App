/**
 * Builds the guest's combined calendar from the fixture programme, bookings,
 * port times and flights. The merge rules live in `services/shared/calendar`
 * and are shared with the Supabase implementation.
 */
import type { CalendarDay, ID } from '@/domain';
import type { ScheduleService } from '@/services/contracts';
import { buildCalendar as buildFrom } from '@/services/shared/calendar';
import { data, failIf, isEmptyScenario, latency } from './support';

export function buildCalendar(): CalendarDay[] {
  const { voyage, flights, yacht } = data.voyage;
  const { bookings, daySchedules } = data.experiences;
  return buildFrom({ voyage, yachtName: yacht.name, flights, bookings, daySchedules });
}

export class MockScheduleService implements ScheduleService {
  async getCalendar(_reservationId: ID) {
    failIf('optional', 'calendar');
    if (isEmptyScenario()) return latency<CalendarDay[]>([]);
    return latency(buildCalendar());
  }
}
