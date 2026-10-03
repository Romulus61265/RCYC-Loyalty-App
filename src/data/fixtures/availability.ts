/**
 * FICTIONAL availability across the voyage, per experience. Port
 * experiences only offer slots on their port day and inside the shore
 * window (checked by `scripts/check-fixtures.ts`).
 */
import type { ExperienceAvailability } from '@/domain';

const DAY = {
  1: '2027-05-15',
  2: '2027-05-16',
  3: '2027-05-17',
  4: '2027-05-18',
  5: '2027-05-19',
  6: '2027-05-20',
  7: '2027-05-21',
  8: '2027-05-22',
} as const;
type DayNo = keyof typeof DAY;

/** Builds slots for the given days and local times (+02:00). */
function slots(days: DayNo[], times: string[], remaining: number, durationMinutes?: number) {
  return days.flatMap((d) =>
    times.map((t) => {
      const start = `${DAY[d]}T${t}:00+02:00`;
      // Keep the port's local offset so times display as wall-clock port time.
      const end = durationMinutes ? `${new Date(Date.parse(start) + (durationMinutes + 120) * 60_000).toISOString().slice(0, 19)}+02:00` : undefined;
      return { start, ...(end ? { end } : {}), remaining };
    }),
  );
}

const EVENINGS: DayNo[] = [1, 2, 3, 4, 5, 6, 7];
const MORNINGS: DayNo[] = [2, 3, 4, 5, 6, 7];

export const availability: ExperienceAvailability[] = [
  // Dining
  { experienceId: 'dev_exp_mediterraneo', status: 'available', slots: slots(EVENINGS, ['19:30', '20:30', '21:00'], 6) },
  { experienceId: 'dev_exp_lumiere', status: 'available', slots: slots(EVENINGS, ['19:30', '20:30'], 4) },
  { experienceId: 'dev_exp_giardino', status: 'available', slots: slots(EVENINGS, ['20:00', '20:30'], 8) },
  { experienceId: 'dev_exp_chefs_counter', status: 'limited', slots: slots([3], ['19:30'], 0, 165).concat(slots([5], ['19:30'], 2, 165)), note: 'Two seats left on 19 May' },
  { experienceId: 'dev_exp_anniversary_terrace', status: 'limited', slots: slots([5, 6], ['20:30'], 1, 180), note: 'One private terrace, by arrangement' },
  // Wine
  { experienceId: 'dev_exp_wine_masterclass', status: 'limited', slots: slots([3], ['15:00'], 4, 90), note: 'Four places left' },
  { experienceId: 'dev_exp_mallorca_wine', status: 'available', slots: slots([2], ['09:30'], 1, 300) },
  // Spa & wellness
  { experienceId: 'dev_exp_deep_tissue', status: 'available', slots: slots(MORNINGS, ['09:00', '10:00', '11:30'], 2, 90), note: 'Morning times open to you 72 hours early' },
  { experienceId: 'dev_exp_thalasso', status: 'available', slots: slots(MORNINGS, ['08:00', '17:00'], 8, 60) },
  { experienceId: 'dev_exp_couples_ritual', status: 'limited', slots: slots([3, 5, 6], ['16:00'], 1, 120), note: 'The couples suite is free on three afternoons' },
  { experienceId: 'dev_exp_sunrise_yoga', status: 'available', slots: slots(MORNINGS, ['07:00'], 10, 45) },
  { experienceId: 'dev_exp_private_coach', status: 'available', slots: slots(MORNINGS, ['07:30', '17:30'], 1, 60) },
  { experienceId: 'dev_exp_tramuntana_walk', status: 'unavailable', slots: [], note: 'Fully booked. Your concierge can ask the guides about another hour.' },
  // Culture, private & excursions
  { experienceId: 'dev_exp_sagrada_private', status: 'available', slots: slots([1], ['10:45'], 1, 120) },
  { experienceId: 'dev_exp_palma_seu', status: 'available', slots: slots([2], ['15:30', '16:45'], 1, 75) },
  { experienceId: 'dev_exp_classic_sail', status: 'available', slots: slots([4], ['10:00'], 1, 210) },
  { experienceId: 'dev_exp_oceanographic', status: 'available', slots: slots([5], ['08:30'], 1, 120) },
  { experienceId: 'dev_exp_villa_ephrussi', status: 'available', slots: slots([5, 6], ['09:30'], 1, 180) },
  { experienceId: 'dev_exp_riva_fruttuoso', status: 'limited', slots: slots([7], ['09:30', '13:45'], 1, 240), note: 'Two launches that morning and afternoon' },
  { experienceId: 'dev_exp_lighthouse_walk', status: 'available', slots: slots([7], ['15:30', '16:30'], 8, 90) },
  // Aboard
  { experienceId: 'dev_exp_bridge', status: 'limited', slots: slots([3], ['16:30', '17:30'], 1, 45), note: 'By invitation, on the sea day' },
  { experienceId: 'dev_exp_marina', status: 'available', slots: slots([4], ['14:30'], 40, 150), note: 'Weather permitting' },
  { experienceId: 'dev_exp_jazz', status: 'available', slots: slots(EVENINGS, ['21:30'], 60) },
  // Shopping
  { experienceId: 'dev_exp_monaco_atelier', status: 'available', slots: slots([5, 6], ['14:00', '15:30'], 1, 90) },
  // Transportation
  { experienceId: 'dev_exp_transfer_bcn', status: 'available', slots: slots([1], ['10:00'], 1) },
  { experienceId: 'dev_exp_transfer_fco', status: 'available', slots: slots([8], ['09:45'], 1) },
  { experienceId: 'dev_exp_helicopter', status: 'waitlist', slots: slots([5, 6], ['12:00', '15:00'], 0, 15), note: 'Requested. Awaiting the charter operator' },
];
