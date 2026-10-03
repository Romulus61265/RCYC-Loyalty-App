/**
 * FICTIONAL bookings and daily programme for the Laurent party.
 * Times are local port time (+02:00). Validated by `scripts/check-fixtures.ts`:
 * every excursion sits inside its port window and nothing overlaps.
 */
import type { DaySchedule, ExperienceBooking } from '@/domain';
import { IDS } from './ids';

const R = IDS.reservation;
const t = (date: string, time: string) => `${date}T${time}:00+02:00`;

const D = {
  1: '2027-05-15',
  2: '2027-05-16',
  3: '2027-05-17',
  4: '2027-05-18',
  5: '2027-05-19',
  6: '2027-05-20',
  7: '2027-05-21',
  8: '2027-05-22',
} as const;

function booking(b: Omit<ExperienceBooking, 'reservationId' | 'partySize'> & { partySize?: number }): ExperienceBooking {
  return { reservationId: R, partySize: 2, ...b };
}

export const bookings: ExperienceBooking[] = [
  // ── Day 1 · Barcelona ──
  booking({
    id: 'dev_bkg_transfer_bcn', experienceId: 'dev_exp_transfer_bcn', category: 'transfer',
    title: 'Private arrival transfer', venue: 'Barcelona–El Prat, Terminal 1 arrivals',
    start: t(D[1], '10:00'), end: t(D[1], '13:30'), status: 'confirmed',
    note: 'Driver Marc meets AA 7412 holding your name. Luggage goes directly to Grand Suite 612.',
  }),
  booking({
    id: 'dev_bkg_sagrada', experienceId: 'dev_exp_sagrada_private', category: 'culture',
    title: 'The Sagrada Família, privately', venue: 'Sagrada Família, Passion façade entrance',
    start: t(D[1], '10:45'), end: t(D[1], '12:45'), status: 'confirmed',
    note: 'With architect-guide Núria. Tower access included.',
  }),
  booking({
    id: 'dev_bkg_dinner_1', experienceId: 'dev_exp_mediterraneo', category: 'dining',
    title: 'Dinner at Mediterraneo', venue: 'Mediterraneo, Deck 5',
    start: t(D[1], '20:30'), status: 'confirmed',
    note: 'Window table for two, sea side. Sparkling water with lemon, no ice.',
  }),

  // ── Day 2 · Palma de Mallorca ──
  booking({
    id: 'dev_bkg_mallorca_wine', experienceId: 'dev_exp_mallorca_wine', category: 'wine',
    title: 'Binissalem vineyards & lunch in Deià', venue: 'Palma cruise pier, private car',
    start: t(D[2], '09:30'), end: t(D[2], '14:30'), status: 'confirmed',
    note: 'Private guide Toni. Barrel tasting of Mantonegro reds with the winemaker.',
  }),
  booking({
    id: 'dev_bkg_dinner_2', experienceId: 'dev_exp_lumiere', category: 'dining',
    title: 'Dinner at Lumière', venue: 'Lumière, Deck 5',
    start: t(D[2], '20:30'), status: 'confirmed',
    note: 'Window table. Sommelier has set aside a 2015 Saint-Émilion grand cru.',
  }),

  // ── Day 3 · At sea ──
  booking({
    id: 'dev_bkg_spa_deep', experienceId: 'dev_exp_deep_tissue', category: 'spa',
    title: 'Deep-tissue recovery massage', venue: 'Spa, Deck 4',
    start: t(D[3], '10:00'), end: t(D[3], '11:30'), partySize: 1, status: 'confirmed',
    note: 'Firm pressure, unscented oil. Booked through your preferred-scheduling privilege.',
  }),
  booking({
    id: 'dev_bkg_chefs', experienceId: 'dev_exp_chefs_counter', category: 'dining',
    title: "The Chef's Counter", venue: "Chef's Counter, Deck 5",
    start: t(D[3], '19:30'), end: t(D[3], '22:15'), status: 'confirmed',
    note: 'A privilege of your return. Red-wine pairing: Barolo, Brunello, Priorat.',
  }),

  // ── Day 4 · Saint-Tropez ──
  booking({
    id: 'dev_bkg_classic_sail', experienceId: 'dev_exp_classic_sail', category: 'private',
    title: 'Under sail on a 1930s classic yacht', venue: 'Marina platform, Deck 2 (tender to the sloop)',
    start: t(D[4], '10:00'), end: t(D[4], '13:30'), status: 'confirmed',
    note: 'Skipper Julien will offer you the helm. Swim stop at Pampelonne.',
  }),
  booking({
    id: 'dev_bkg_dinner_4', experienceId: 'dev_exp_giardino', category: 'dining',
    title: 'Dinner at Il Giardino', venue: 'Il Giardino, Deck 9',
    start: t(D[4], '20:30'), status: 'confirmed',
    note: 'Glass-screened window table overlooking the bay.',
  }),

  // ── Day 5 · Monte Carlo (overnight) ──
  booking({
    id: 'dev_bkg_oceanographic', experienceId: 'dev_exp_oceanographic', category: 'culture',
    title: 'The Oceanographic Museum before opening', venue: 'Port Hercule, private car',
    start: t(D[5], '08:30'), end: t(D[5], '10:30'), status: 'confirmed',
    note: 'With curator Dr. Hélène Bastide.',
  }),
  booking({
    id: 'dev_bkg_thalasso', experienceId: 'dev_exp_thalasso', category: 'spa',
    title: 'Thalassotherapy circuit', venue: 'Spa, Deck 4',
    start: t(D[5], '17:00'), end: t(D[5], '18:00'), status: 'confirmed',
  }),
  booking({
    id: 'dev_bkg_dinner_5', experienceId: 'dev_exp_lumiere', category: 'dining',
    title: 'Dinner at Lumière', venue: 'Lumière, Deck 5',
    start: t(D[5], '20:30'), status: 'confirmed',
    note: 'Window table facing the Rocher.',
  }),

  // ── Day 6 · Monte Carlo · 20th anniversary ──
  booking({
    id: 'dev_bkg_ephrussi', experienceId: 'dev_exp_villa_ephrussi', category: 'culture',
    title: 'Villa Ephrussi de Rothschild, quietly', venue: 'Port Hercule, private car',
    start: t(D[6], '09:30'), end: t(D[6], '12:30'), status: 'confirmed',
    note: 'Chosen with Camille in mind. Lunch reserved in Beaulieu-sur-Mer.',
  }),
  booking({
    id: 'dev_bkg_couples', experienceId: 'dev_exp_couples_ritual', category: 'spa',
    title: 'Couples terrace ritual', venue: 'Spa couples suite, Deck 4',
    start: t(D[6], '16:00'), end: t(D[6], '18:00'), status: 'confirmed',
  }),
  booking({
    id: 'dev_bkg_anniversary', experienceId: 'dev_exp_anniversary_terrace', category: 'dining',
    title: 'Anniversary dinner on a private terrace', venue: 'Owner’s terrace, Deck 10 aft',
    start: t(D[6], '20:30'), end: t(D[6], '23:15'), status: 'in_progress',
    note: 'Elena and the chef are composing the menu. Kept discreet, as you asked.',
  }),

  // ── Day 7 · Portofino ──
  booking({
    id: 'dev_bkg_riva', experienceId: 'dev_exp_riva_fruttuoso', category: 'private',
    title: 'San Fruttuoso by Riva', venue: 'Marina platform, Deck 2',
    start: t(D[7], '09:30'), end: t(D[7], '13:30'), status: 'confirmed',
    note: 'Captain Paolo. Lunch at the water’s edge, swimming stop in the cove.',
  }),
  booking({
    id: 'dev_bkg_dinner_7', experienceId: 'dev_exp_mediterraneo', category: 'dining',
    title: 'Farewell dinner at Mediterraneo', venue: 'Mediterraneo, Deck 5',
    start: t(D[7], '20:30'), status: 'confirmed',
    note: 'Your window table. Ligurian menu.',
  }),

  // ── Day 8 · Rome ──
  booking({
    id: 'dev_bkg_transfer_fco', experienceId: 'dev_exp_transfer_fco', category: 'transfer',
    title: 'Private departure transfer', venue: 'Gangway, Deck 3',
    start: t(D[8], '09:45'), end: t(D[8], '10:50'), status: 'confirmed',
    note: 'For AA 7419 at 13:35. Bags collected from your suite at 09:15.',
  }),
];

type Item = DaySchedule['items'][number];
const item = (id: string, date: string, start: string, title: string, location: string, kind: Item['kind'], extra: Partial<Item> = {}): Item => ({
  id, start: t(date, start), title, location, kind, ...extra,
});

export const daySchedules: DaySchedule[] = [
  {
    dayNumber: 1, date: D[1], portCallId: 'dev_pc_1', headline: 'Welcome aboard', dressCode: 'Elegant casual', sunset: t(D[1], '21:09'),
    items: [
      item('dev_s1a', D[1], '10:00', 'Private arrival transfer', 'Barcelona–El Prat', 'booking', { bookingId: 'dev_bkg_transfer_bcn', category: 'transfer' }),
      item('dev_s1b', D[1], '10:45', 'The Sagrada Família, privately', 'Sagrada Família', 'booking', { bookingId: 'dev_bkg_sagrada', category: 'culture' }),
      item('dev_s1c', D[1], '13:30', 'Your embarkation window', 'Port Vell Yacht Terminal', 'port', { end: t(D[1], '14:00') }),
      item('dev_s1d', D[1], '18:00', 'Safety briefing', 'Your suite', 'ship-event'),
      item('dev_s1e', D[1], '19:30', 'Sail-away Champagne', 'Pool Deck aft', 'ship-event', { category: 'event' }),
      item('dev_s1f', D[1], '20:30', 'Dinner at Mediterraneo', 'Deck 5', 'booking', { bookingId: 'dev_bkg_dinner_1', category: 'dining' }),
    ],
  },
  {
    dayNumber: 2, date: D[2], portCallId: 'dev_pc_2', headline: 'Palma de Mallorca', dressCode: 'Elegant casual', sunset: t(D[2], '20:58'),
    items: [
      item('dev_s2a', D[2], '09:30', 'Binissalem vineyards & lunch in Deià', 'Palma cruise pier', 'booking', { bookingId: 'dev_bkg_mallorca_wine', category: 'wine', end: t(D[2], '14:30') }),
      item('dev_s2b', D[2], '15:30', 'La Seu with a historian', 'Palma cathedral', 'recommendation', { category: 'culture' }),
      item('dev_s2c', D[2], '18:30', 'All aboard', 'Palma cruise pier', 'port'),
      item('dev_s2d', D[2], '20:30', 'Dinner at Lumière', 'Deck 5', 'booking', { bookingId: 'dev_bkg_dinner_2', category: 'dining' }),
    ],
  },
  {
    dayNumber: 3, date: D[3], portCallId: 'dev_pc_3', headline: 'A day at sea', dressCode: 'Evening elegant', sunset: t(D[3], '21:02'),
    items: [
      item('dev_s3a', D[3], '10:00', 'Deep-tissue recovery massage', 'Spa, Deck 4', 'booking', { bookingId: 'dev_bkg_spa_deep', category: 'spa', end: t(D[3], '11:30') }),
      item('dev_s3b', D[3], '15:00', 'Barolo & Saint-Émilion, side by side', 'Wine library, Deck 5', 'recommendation', { category: 'wine' }),
      item('dev_s3c', D[3], '16:30', 'A visit to the bridge', 'Bridge, Deck 8', 'recommendation', { category: 'private' }),
      item('dev_s3d', D[3], '19:30', "The Chef's Counter", 'Deck 5', 'booking', { bookingId: 'dev_bkg_chefs', category: 'dining' }),
      item('dev_s3e', D[3], '22:30', 'Jazz in the Observation Lounge', 'Deck 10', 'ship-event', { category: 'entertainment' }),
    ],
  },
  {
    dayNumber: 4, date: D[4], portCallId: 'dev_pc_4', headline: 'Saint-Tropez', dressCode: 'Riviera casual', sunset: t(D[4], '20:52'),
    items: [
      item('dev_s4a', D[4], '10:00', 'Under sail on a 1930s classic yacht', 'Marina platform', 'booking', { bookingId: 'dev_bkg_classic_sail', category: 'private', end: t(D[4], '13:30') }),
      // Moved by half an hour on the sea-day evening (the itinerary-change example).
      item('dev_s4b', D[4], '15:00', 'The marina platform opens', 'Deck 2 aft', 'ship-event', { category: 'marina', end: t(D[4], '17:00'), previousStart: t(D[4], '14:30'), changedAt: t(D[3], '18:00') }),
      item('dev_s4c', D[4], '20:30', 'Dinner at Il Giardino', 'Deck 9', 'booking', { bookingId: 'dev_bkg_dinner_4', category: 'dining' }),
      item('dev_s4d', D[4], '22:30', 'All aboard (last tender 22:15)', 'Tender pier', 'port'),
    ],
  },
  {
    dayNumber: 5, date: D[5], portCallId: 'dev_pc_5', headline: 'Monte Carlo — overnight', dressCode: 'Evening elegant', sunset: t(D[5], '20:50'),
    items: [
      item('dev_s5a', D[5], '08:30', 'The Oceanographic Museum before opening', 'Port Hercule', 'booking', { bookingId: 'dev_bkg_oceanographic', category: 'culture', end: t(D[5], '10:30') }),
      item('dev_s5b', D[5], '14:00', 'Private atelier appointments', 'Avenue des Beaux-Arts', 'recommendation', { category: 'shopping' }),
      item('dev_s5c', D[5], '17:00', 'Thalassotherapy circuit', 'Spa, Deck 4', 'booking', { bookingId: 'dev_bkg_thalasso', category: 'spa', end: t(D[5], '18:00') }),
      item('dev_s5d', D[5], '20:30', 'Dinner at Lumière', 'Deck 5', 'booking', { bookingId: 'dev_bkg_dinner_5', category: 'dining' }),
    ],
  },
  {
    dayNumber: 6, date: D[6], portCallId: 'dev_pc_6', headline: 'Monte Carlo · your anniversary', dressCode: 'Evening elegant', sunset: t(D[6], '20:51'),
    items: [
      item('dev_s6a', D[6], '09:30', 'Villa Ephrussi de Rothschild, quietly', 'Port Hercule', 'booking', { bookingId: 'dev_bkg_ephrussi', category: 'culture', end: t(D[6], '12:30') }),
      item('dev_s6b', D[6], '16:00', 'Couples terrace ritual', 'Spa, Deck 4', 'booking', { bookingId: 'dev_bkg_couples', category: 'spa', end: t(D[6], '18:00') }),
      item('dev_s6c', D[6], '20:30', 'Anniversary dinner on a private terrace', 'Deck 10 aft', 'booking', { bookingId: 'dev_bkg_anniversary', category: 'dining' }),
      item('dev_s6d', D[6], '23:30', 'All aboard', 'Port Hercule', 'port'),
    ],
  },
  {
    dayNumber: 7, date: D[7], portCallId: 'dev_pc_7', headline: 'Portofino', dressCode: 'Riviera casual', sunset: t(D[7], '20:49'),
    items: [
      item('dev_s7a', D[7], '09:30', 'San Fruttuoso by Riva', 'Marina platform', 'booking', { bookingId: 'dev_bkg_riva', category: 'private', end: t(D[7], '13:30') }),
      item('dev_s7b', D[7], '15:30', 'The lighthouse path at golden hour', 'Piazzetta', 'recommendation', { category: 'excursion' }),
      item('dev_s7c', D[7], '18:00', 'All aboard', 'Tender pier', 'port'),
      item('dev_s7d', D[7], '20:30', 'Farewell dinner at Mediterraneo', 'Deck 5', 'booking', { bookingId: 'dev_bkg_dinner_7', category: 'dining' }),
    ],
  },
  {
    dayNumber: 8, date: D[8], portCallId: 'dev_pc_8', headline: 'Arrivederci',
    items: [
      item('dev_s8a', D[8], '08:00', 'Breakfast on your terrace', 'Grand Suite 612', 'ship-event'),
      item('dev_s8b', D[8], '09:45', 'Private departure transfer', 'Gangway, Deck 3', 'booking', { bookingId: 'dev_bkg_transfer_fco', category: 'transfer' }),
    ],
  },
];
