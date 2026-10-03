/**
 * The combined calendar, built from Supabase reads with the same merge rules
 * as the mock (services/shared/calendar).
 */
import type { CalendarDay, ID } from '@/domain';
import type { ExperienceService, ScheduleService, VoyageService } from '@/services/contracts';
import { buildCalendar } from '@/services/shared/calendar';

export class SupabaseScheduleService implements ScheduleService {
  constructor(
    private readonly voyage: VoyageService,
    private readonly experience: ExperienceService,
  ) {}

  async getCalendar(reservationId: ID): Promise<CalendarDay[]> {
    const [overview, bookings, daySchedules] = await Promise.all([
      this.voyage.getOverview(reservationId),
      this.experience.listBookings(reservationId),
      this.experience.listDaySchedules(reservationId),
    ]);
    return buildCalendar({ voyage: overview.voyage, yachtName: overview.yacht.name, flights: overview.flights, bookings, daySchedules });
  }
}
