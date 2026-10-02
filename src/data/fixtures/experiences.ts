import type {
  DaySchedule,
  Destination,
  DiscoverCollection,
  Experience,
  ExperienceBooking,
  JourneyAlert,
  Recommendation,
} from '@/domain';
import { reservation, tones } from './voyage';

const R = reservation.id;

export const catalogue: Experience[] = [
  // Dining
  {
    id: 'exp_lumiere', category: 'dining', title: 'Lumière',
    subtitle: 'Contemporary French, by candlelight',
    description: 'A twelve-table dining room celebrating the produce of each port, with a cellar of grower Champagnes.',
    inclusive: true, privateAvailable: false, tags: ['fine-dining', 'french'],
    hero: { alt: 'Candlelit table at Lumière', tone: tones.night },
  },
  {
    id: 'exp_giardino', category: 'dining', title: 'Il Giardino',
    subtitle: 'Riviera Italian on the open terrace',
    description: 'Ligurian classics — trofie al pesto, branzino al sale — served al fresco on Deck 9.',
    inclusive: true, privateAvailable: false, tags: ['italian', 'al-fresco'],
    hero: { alt: 'Terrace dining at sunset', tone: tones.terracotta },
  },
  {
    id: 'exp_chefs_counter', category: 'dining', title: "The Chef's Counter",
    subtitle: 'Eight seats. One menu. Conversation with the chef.',
    description: 'A nine-course tasting menu composed that afternoon from the morning market.',
    durationMinutes: 180, inclusive: false, privateAvailable: true, capacity: 8,
    price: { amountMinor: 32000, currency: 'EUR' }, tags: ['tasting', 'chef'],
    hero: { alt: "Chef plating at the counter", tone: tones.champagne },
  },
  // Wine
  {
    id: 'exp_barolo', category: 'wine', title: 'Barolo, Unhurried',
    subtitle: 'A vertical tasting with the head sommelier',
    description: 'Five decades of Nebbiolo from a single family estate, tasted in the wine library.',
    durationMinutes: 90, inclusive: false, privateAvailable: true,
    price: { amountMinor: 18000, currency: 'EUR' }, tags: ['wine', 'piedmont'],
    hero: { alt: 'Glasses of Barolo', tone: tones.terracotta },
  },
  {
    id: 'exp_cinque_vines', category: 'wine', portCallId: 'pc_6', destination: 'Portovenere',
    title: 'The Vertical Vineyards of Cinque Terre',
    subtitle: 'Sciacchetrà with the families who still farm by hand',
    description: 'Monorail up the terraces above Manarola, then a tasting among the vines.',
    durationMinutes: 240, inclusive: false, privateAvailable: true,
    price: { amountMinor: 42000, currency: 'EUR' }, tags: ['wine', 'walking'],
    hero: { alt: 'Terraced vineyards above the sea', tone: tones.olive },
  },
  // Spa
  {
    id: 'exp_salt_ritual', category: 'spa', title: 'Mediterranean Sea Salt Ritual',
    subtitle: 'Ninety minutes in the Sérénité Spa',
    description: 'Fleur de sel exfoliation, warm olive oil massage and a thalassotherapy soak.',
    durationMinutes: 90, inclusive: false, privateAvailable: false,
    price: { amountMinor: 29000, currency: 'EUR' }, tags: ['spa', 'massage'],
    hero: { alt: 'Spa treatment room', tone: tones.stone },
  },
  {
    id: 'exp_couples_suite', category: 'spa', title: 'Couples Terrace Suite',
    subtitle: 'Side by side, open to the sea',
    description: 'A private treatment suite with its own terrace, for two.',
    durationMinutes: 120, inclusive: false, privateAvailable: true,
    price: { amountMinor: 64000, currency: 'EUR' }, tags: ['spa', 'couples', 'occasion'],
    hero: { alt: 'Couples spa terrace', tone: tones.sea },
  },
  // Excursions
  {
    id: 'exp_corniche', category: 'excursion', portCallId: 'pc_3', destination: 'Monte Carlo',
    title: 'The Grande Corniche, Privately',
    subtitle: 'A 1960s convertible, Èze village and lunch above the sea',
    description: 'Your own driver-guide, the three Corniche roads, and a table at Château Eza.',
    durationMinutes: 300, inclusive: false, privateAvailable: true,
    price: { amountMinor: 210000, currency: 'EUR' }, tags: ['private', 'driving', 'lunch'],
    hero: { alt: 'Coastal road above Monaco', tone: tones.sea },
  },
  {
    id: 'exp_villa_ephrussi', category: 'culture', portCallId: 'pc_4', destination: 'Monte Carlo',
    title: 'Villa Ephrussi de Rothschild before opening',
    subtitle: 'The gardens to yourselves, with a curator',
    description: 'An early-morning private visit to the nine gardens of Saint-Jean-Cap-Ferrat.',
    durationMinutes: 180, inclusive: false, privateAvailable: true,
    price: { amountMinor: 95000, currency: 'EUR' }, tags: ['art', 'gardens', 'private'],
    hero: { alt: 'Formal gardens above the bay', tone: tones.olive },
  },
  {
    id: 'exp_fruttuoso', category: 'private', portCallId: 'pc_5', destination: 'Portofino',
    title: 'San Fruttuoso by Riva',
    subtitle: 'A mahogany launch to the abbey reachable only by sea',
    description: 'Swim in the cove, then lunch at the water’s edge. Captain and steward included.',
    durationMinutes: 240, inclusive: false, privateAvailable: true,
    price: { amountMinor: 280000, currency: 'EUR' }, tags: ['private', 'boat', 'occasion'],
    hero: { alt: 'Riva launch in a turquoise cove', tone: tones.sea },
  },
  {
    id: 'exp_bonifacio_walk', category: 'excursion', portCallId: 'pc_7', destination: 'Bonifacio',
    title: 'Citadel & Cliffs at Golden Hour',
    subtitle: 'A small-group walk with a Corsican historian',
    description: 'The King of Aragon’s Stairway, the bastions and a glass of Patrimonio at sunset.',
    durationMinutes: 150, inclusive: true, privateAvailable: true, capacity: 12, tags: ['walking', 'history'],
    hero: { alt: 'Bonifacio citadel', tone: tones.stone },
  },
  {
    id: 'exp_tropez_market', category: 'culture', portCallId: 'pc_2', destination: 'Saint-Tropez',
    title: 'Place des Lices Market with the Chef',
    subtitle: 'Shop for tonight’s menu, then a pastis at Le Café',
    description: 'Join the executive chef as he selects produce for the evening’s Provençal menu.',
    durationMinutes: 120, inclusive: true, privateAvailable: false, capacity: 10, tags: ['culinary', 'market'],
    hero: { alt: 'Provençal market stalls', tone: tones.terracotta },
  },
  // Marina
  {
    id: 'exp_marina', category: 'marina', portCallId: 'pc_7', destination: 'Bonifacio',
    title: 'The Marina Platform',
    subtitle: 'Swim, paddleboard and kayak from the aft of the yacht',
    description: 'Weather permitting, the marina opens in the lee of the Lavezzi islands from 14:00.',
    durationMinutes: 180, inclusive: true, privateAvailable: false, tags: ['swimming', 'watersports'],
    hero: { alt: 'Swimmers off the yacht’s marina', tone: tones.sea },
  },
  // Entertainment
  {
    id: 'exp_opera', category: 'entertainment', portCallId: 'pc_3', destination: 'Monte Carlo',
    title: 'An Evening at the Opéra de Monte-Carlo',
    subtitle: 'Box seats at the Salle Garnier',
    description: 'Private car from the yacht, interval Champagne and supper aboard on your return.',
    durationMinutes: 240, inclusive: false, privateAvailable: true,
    price: { amountMinor: 150000, currency: 'EUR' }, tags: ['music', 'evening'],
    hero: { alt: 'Gilded opera house interior', tone: tones.champagne },
  },
  {
    id: 'exp_jazz', category: 'entertainment', title: 'Jazz in the Observation Lounge',
    subtitle: 'A trio, a negroni, and the wake behind you',
    description: 'Nightly from 21:30 on Deck 10.',
    inclusive: true, privateAvailable: false, tags: ['music', 'evening'],
    hero: { alt: 'Lounge at night', tone: tones.night },
  },
  // Shopping
  {
    id: 'exp_monaco_atelier', category: 'shopping', portCallId: 'pc_4', destination: 'Monte Carlo',
    title: 'Private Atelier Appointments',
    subtitle: 'Fine jewellery and watchmaking, by appointment',
    description: 'Your concierge arranges private viewings at the maisons of Avenue des Beaux-Arts.',
    durationMinutes: 120, inclusive: true, privateAvailable: true, tags: ['shopping', 'private'],
    hero: { alt: 'Jewellery atelier', tone: tones.champagne },
  },
  // Transfers / private transport
  {
    id: 'exp_transfer_bcn', category: 'transfer', destination: 'Barcelona',
    title: 'Private Arrival Transfer',
    subtitle: 'Barcelona–El Prat to Port Vell',
    description: 'Met at arrivals by name. Luggage handled directly to your suite.',
    durationMinutes: 35, inclusive: true, privateAvailable: true, tags: ['transfer'],
    hero: { alt: 'Chauffeured car', tone: tones.night },
  },
  {
    id: 'exp_helicopter', category: 'transfer', portCallId: 'pc_3', destination: 'Monte Carlo',
    title: 'Helicopter to Nice or Saint-Paul-de-Vence',
    subtitle: 'Seven minutes along the coast',
    description: 'Private charter from the Monaco Heliport, arranged around your plans.',
    durationMinutes: 15, inclusive: false, privateAvailable: true,
    price: { amountMinor: 190000, currency: 'EUR' }, tags: ['private', 'transport'],
    hero: { alt: 'Helicopter over the coast', tone: tones.sea },
  },
];

export const bookings: ExperienceBooking[] = [
  {
    id: 'bkg_transfer', reservationId: R, experienceId: 'exp_transfer_bcn', category: 'transfer',
    title: 'Private arrival transfer', venue: 'Barcelona–El Prat, Terminal 1',
    start: '2026-10-17T12:15:00+02:00', end: '2026-10-17T12:50:00+02:00', partySize: 2, status: 'confirmed',
    note: 'Driver Jordi will meet you at arrivals holding your name. Flight BA478.',
  },
  {
    id: 'bkg_dinner_1', reservationId: R, experienceId: 'exp_lumiere', category: 'dining',
    title: 'Dinner at Lumière', venue: 'Lumière, Deck 5',
    start: '2026-10-17T20:30:00+02:00', partySize: 2, status: 'confirmed',
    note: 'Window table for two. Tree-nut allergy and pescatarian noted.',
  },
  {
    id: 'bkg_spa', reservationId: R, experienceId: 'exp_salt_ritual', category: 'spa',
    title: 'Mediterranean Sea Salt Ritual', venue: 'Sérénité Spa, Deck 4',
    start: '2026-10-18T10:00:00+02:00', end: '2026-10-18T11:30:00+02:00', partySize: 1, status: 'confirmed',
  },
  {
    id: 'bkg_corniche', reservationId: R, experienceId: 'exp_corniche', category: 'excursion',
    title: 'The Grande Corniche, Privately', venue: 'Port Hercule, tender pier',
    start: '2026-10-19T09:30:00+02:00', end: '2026-10-19T14:30:00+02:00', partySize: 2, status: 'confirmed',
    note: 'Your driver-guide is Margaux.',
  },
  {
    id: 'bkg_chefs', reservationId: R, experienceId: 'exp_chefs_counter', category: 'dining',
    title: "The Chef's Counter", venue: "Chef's Counter, Deck 5",
    start: '2026-10-19T19:30:00+02:00', partySize: 2, status: 'confirmed',
    note: 'A privilege of your return. Pairing: grower Champagne and Ligurian whites.',
  },
  {
    id: 'bkg_fruttuoso', reservationId: R, experienceId: 'exp_fruttuoso', category: 'private',
    title: 'San Fruttuoso by Riva', venue: 'Marina platform, Deck 2',
    start: '2026-10-21T10:00:00+02:00', end: '2026-10-21T14:00:00+02:00', partySize: 2, status: 'in_progress',
    note: 'Being finalised by Destination Services.',
  },
  {
    id: 'bkg_dinner_5', reservationId: R, experienceId: 'exp_giardino', category: 'dining',
    title: 'Dinner at Il Giardino', venue: 'Il Giardino terrace, Deck 9',
    start: '2026-10-21T20:00:00+02:00', partySize: 2, status: 'confirmed',
  },
];

const day = (
  dayNumber: number,
  date: string,
  portCallId: string,
  headline: string,
  items: DaySchedule['items'],
  extra: Partial<DaySchedule> = {},
): DaySchedule => ({ dayNumber, date, portCallId, headline, items, ...extra });

export const daySchedules: DaySchedule[] = [
  day(1, '2026-10-17', 'pc_1', 'Welcome aboard', [
    { id: 's1a', start: '2026-10-17T12:15:00+02:00', title: 'Private arrival transfer', location: 'Barcelona–El Prat', kind: 'booking', bookingId: 'bkg_transfer', category: 'transfer' },
    { id: 's1b', start: '2026-10-17T14:00:00+02:00', end: '2026-10-17T14:30:00+02:00', title: 'Your embarkation window', location: 'Port Vell Yacht Terminal', kind: 'port' },
    { id: 's1c', start: '2026-10-17T18:00:00+02:00', title: 'Safety briefing', location: 'Your suite', kind: 'ship-event' },
    { id: 's1d', start: '2026-10-17T19:30:00+02:00', title: 'Sail-away Champagne', location: 'Pool Deck aft', kind: 'ship-event' },
    { id: 's1e', start: '2026-10-17T20:30:00+02:00', title: 'Dinner at Lumière', location: 'Deck 5', kind: 'booking', bookingId: 'bkg_dinner_1', category: 'dining' },
  ], { dressCode: 'Elegant casual', sunset: '2026-10-17T19:23:00+02:00' }),
  day(2, '2026-10-18', 'pc_2', 'Saint-Tropez', [
    { id: 's2a', start: '2026-10-18T08:30:00+02:00', title: 'Place des Lices market with the Chef', location: 'Tender pier', kind: 'recommendation', category: 'culture' },
    { id: 's2b', start: '2026-10-18T10:00:00+02:00', end: '2026-10-18T11:30:00+02:00', title: 'Mediterranean Sea Salt Ritual', location: 'Sérénité Spa', kind: 'booking', bookingId: 'bkg_spa', category: 'spa' },
    { id: 's2c', start: '2026-10-18T21:30:00+02:00', title: 'All aboard', location: 'Tender pier', kind: 'port' },
  ], { dressCode: 'Riviera casual', sunset: '2026-10-18T18:51:00+02:00' }),
  day(3, '2026-10-19', 'pc_3', 'Monte Carlo — overnight', [
    { id: 's3a', start: '2026-10-19T09:30:00+02:00', end: '2026-10-19T14:30:00+02:00', title: 'The Grande Corniche, Privately', location: 'Port Hercule', kind: 'booking', bookingId: 'bkg_corniche', category: 'excursion' },
    { id: 's3b', start: '2026-10-19T19:30:00+02:00', title: "The Chef's Counter", location: 'Deck 5', kind: 'booking', bookingId: 'bkg_chefs', category: 'dining' },
    { id: 's3c', start: '2026-10-19T21:30:00+02:00', title: 'Jazz in the Observation Lounge', location: 'Deck 10', kind: 'ship-event', category: 'entertainment' },
  ], { dressCode: 'Evening elegant', sunset: '2026-10-19T18:46:00+02:00' }),
  day(4, '2026-10-20', 'pc_4', 'Monte Carlo', [
    { id: 's4a', start: '2026-10-20T08:00:00+02:00', title: 'Villa Ephrussi before opening', location: 'Saint-Jean-Cap-Ferrat', kind: 'recommendation', category: 'culture' },
    { id: 's4b', start: '2026-10-20T17:30:00+02:00', title: 'All aboard', location: 'Port Hercule', kind: 'port' },
  ], { dressCode: 'Elegant casual' }),
  day(5, '2026-10-21', 'pc_5', 'Portofino', [
    { id: 's5a', start: '2026-10-21T10:00:00+02:00', end: '2026-10-21T14:00:00+02:00', title: 'San Fruttuoso by Riva', location: 'Marina platform', kind: 'booking', bookingId: 'bkg_fruttuoso', category: 'private' },
    { id: 's5b', start: '2026-10-21T18:30:00+02:00', title: 'All aboard', location: 'Tender pier', kind: 'port' },
    { id: 's5c', start: '2026-10-21T20:00:00+02:00', title: 'Dinner at Il Giardino', location: 'Deck 9', kind: 'booking', bookingId: 'bkg_dinner_5', category: 'dining' },
  ], { dressCode: 'Evening elegant', sunset: '2026-10-21T18:37:00+02:00' }),
  day(6, '2026-10-22', 'pc_6', 'Portovenere & the Cinque Terre', [
    { id: 's6a', start: '2026-10-22T09:00:00+02:00', title: 'The Vertical Vineyards of Cinque Terre', location: 'Pier', kind: 'recommendation', category: 'wine' },
    { id: 's6b', start: '2026-10-22T17:30:00+02:00', title: 'All aboard', location: 'Pier', kind: 'port' },
  ]),
  day(7, '2026-10-23', 'pc_7', 'Bonifacio', [
    { id: 's7a', start: '2026-10-23T14:00:00+02:00', title: 'The Marina Platform opens', location: 'Deck 2 aft', kind: 'ship-event', category: 'marina' },
    { id: 's7b', start: '2026-10-23T17:00:00+02:00', title: 'Citadel & Cliffs at Golden Hour', location: 'Tender pier', kind: 'recommendation', category: 'excursion' },
    { id: 's7c', start: '2026-10-23T19:30:00+02:00', title: 'All aboard', location: 'Tender pier', kind: 'port' },
  ]),
  day(8, '2026-10-24', 'pc_8', 'Arrivederci', [
    { id: 's8a', start: '2026-10-24T08:00:00+02:00', title: 'Terrace breakfast', location: 'Suite 712', kind: 'ship-event' },
    { id: 's8b', start: '2026-10-24T11:00:00+02:00', title: 'Late disembarkation', location: 'Gangway, Deck 3', kind: 'port' },
  ]),
];

export const collections: DiscoverCollection[] = [
  { id: 'col_private', title: 'Privately Yours', standfirst: 'Experiences arranged for your party alone.', category: 'private', experienceIds: ['exp_fruttuoso', 'exp_corniche', 'exp_villa_ephrussi', 'exp_helicopter'] },
  { id: 'col_table', title: 'At the Table', standfirst: 'From the morning market to the Chef’s Counter.', category: 'dining', experienceIds: ['exp_chefs_counter', 'exp_tropez_market', 'exp_giardino', 'exp_lumiere'] },
  { id: 'col_wine', title: 'The Cellar & the Vine', standfirst: 'Nebbiolo, Sciacchetrà and the people behind them.', category: 'wine', experienceIds: ['exp_barolo', 'exp_cinque_vines'] },
  { id: 'col_wellbeing', title: 'Stillness', standfirst: 'The Sérénité Spa and the open sea.', category: 'spa', experienceIds: ['exp_salt_ritual', 'exp_couples_suite', 'exp_marina'] },
  { id: 'col_evenings', title: 'After Dark', standfirst: 'The Opéra, a jazz trio, and the wake behind you.', category: 'entertainment', experienceIds: ['exp_opera', 'exp_jazz'] },
  { id: 'col_culture', title: 'Art, Gardens & History', standfirst: 'Curators, historians and doors opened early.', category: 'culture', experienceIds: ['exp_villa_ephrussi', 'exp_bonifacio_walk', 'exp_tropez_market'] },
  { id: 'col_shopping', title: 'By Appointment', standfirst: 'The maisons of Monaco, privately.', category: 'shopping', experienceIds: ['exp_monaco_atelier'] },
  { id: 'col_transport', title: 'Getting There, Beautifully', standfirst: 'Chauffeurs, launches and helicopters.', category: 'transfer', experienceIds: ['exp_transfer_bcn', 'exp_helicopter'] },
];

export const destinations: Destination[] = [
  { id: 'dst_bcn', name: 'Barcelona', country: 'Spain', portCallId: 'pc_1', standfirst: 'Gaudí, the Gothic Quarter and the sea at the end of every street.', hero: { alt: 'Barcelona', tone: tones.terracotta } },
  { id: 'dst_tropez', name: 'Saint-Tropez', country: 'France', portCallId: 'pc_2', standfirst: 'A fishing village that became a legend — and still feels like one in October.', hero: { alt: 'Saint-Tropez', tone: tones.stone } },
  { id: 'dst_monaco', name: 'Monte Carlo', country: 'Monaco', portCallId: 'pc_3', standfirst: 'Two days and a night in the Principality: corniches, gardens and the Opéra.', hero: { alt: 'Monaco', tone: tones.sea } },
  { id: 'dst_portofino', name: 'Portofino', country: 'Italy', portCallId: 'pc_5', standfirst: 'Pastel façades, a lighthouse path, and an abbey only reachable by sea.', hero: { alt: 'Portofino', tone: tones.olive } },
  { id: 'dst_portovenere', name: 'Portovenere', country: 'Italy', portCallId: 'pc_6', standfirst: 'The Gulf of Poets and the vertical vineyards of the Cinque Terre.', hero: { alt: 'Portovenere', tone: tones.terracotta } },
  { id: 'dst_bonifacio', name: 'Bonifacio', country: 'Corsica', portCallId: 'pc_7', standfirst: 'A citadel balanced on white cliffs above the Strait.', hero: { alt: 'Bonifacio', tone: tones.stone } },
];

export const recommendations: Recommendation[] = [
  {
    id: 'rec_couples', surface: 'home', kind: 'experience', experienceId: 'exp_couples_suite', category: 'spa',
    title: 'Couples Terrace Suite in Portofino',
    rationale: 'For the morning of your anniversary — before San Fruttuoso.',
    score: 0.94, drivers: ['special-occasion', 'spa-history', 'travel-companions'], audience: 'guest',
  },
  {
    id: 'rec_cinque', surface: 'home', kind: 'experience', experienceId: 'exp_cinque_vines', category: 'wine',
    title: 'The Vertical Vineyards of Cinque Terre',
    rationale: 'You loved the Assyrtiko tasting on Santorini last September.',
    score: 0.89, drivers: ['excursion-history', 'dining-history', 'future-itinerary'], audience: 'guest',
  },
  {
    id: 'rec_villa', surface: 'home', kind: 'experience', experienceId: 'exp_villa_ephrussi', category: 'culture',
    title: 'Villa Ephrussi before opening',
    rationale: 'A quiet morning with a curator — gardens and art, before the crowds.',
    score: 0.82, drivers: ['suite-preference', 'future-itinerary'], audience: 'guest',
  },
  {
    id: 'rec_marina', surface: 'discover', kind: 'experience', experienceId: 'exp_marina', category: 'marina',
    title: 'Open-water swim from the marina',
    rationale: 'James swam every morning from the marina in the Cyclades.',
    score: 0.78, drivers: ['travel-companions', 'excursion-history'], audience: 'guest',
  },
  {
    id: 'rec_crew_recovery', surface: 'crew-console', kind: 'service-gesture',
    title: 'Acknowledge last voyage’s delayed tender in Mykonos',
    rationale: 'Service issue recorded 2025-09-12; resolved but noted as disappointing.',
    score: 0.71, drivers: ['service-recovery', 'feedback'], audience: 'crew',
  },
];

export const alerts: JourneyAlert[] = [
  {
    id: 'alr_docs', eventId: 'evt_docs', severity: 'action',
    title: 'One small thing before you sail',
    body: 'Your health declaration is due by tomorrow, 16 October. It takes about two minutes.',
    action: { label: 'Complete now', route: '/voyage' },
    createdAt: '2026-10-14T09:00:00+01:00', acknowledged: false,
  },
  {
    id: 'alr_flight', eventId: 'evt_flight', severity: 'notice',
    title: 'British Airways has retimed BA478',
    body: 'Your flight on 17 October now lands in Barcelona at 11:50, 25 minutes later than planned.',
    handled: 'Jordi, your driver, has been informed and will be waiting at the new time. Your embarkation window is unaffected.',
    createdAt: '2026-10-15T07:40:00+01:00', acknowledged: false,
  },
];
