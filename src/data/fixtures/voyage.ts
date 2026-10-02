/**
 * Fictional voyage on the fictional yacht "Aurelia" — modelled on an
 * ultra-luxury Mediterranean yacht itinerary.
 */
import type {
  Embarkation,
  Suite,
  TravelDocument,
  Voyage,
  VoyageReservation,
  Yacht,
} from '@/domain';
import { COMPANION_GUEST_ID, LEAD_GUEST_ID } from './guest';

const tone = {
  dusk: ['#0E1A2B', '#3A5068'],
  sea: ['#1F3A4D', '#7F9C96'],
  stone: ['#5B5750', '#CFC5B6'],
  terracotta: ['#6E3B2A', '#C99A7A'],
  olive: ['#3C4A35', '#A7AE8C'],
  champagne: ['#5A4A32', '#E8DCC4'],
  night: ['#0B111C', '#1E2530'],
} as const;

export const tones = tone;

export const yacht: Yacht = {
  id: 'yct_aurelia',
  name: 'Aurelia',
  tagline: 'An intimate yacht with the soul of a grand hotel.',
  guestCapacity: 298,
  suites: 149,
  crew: 246,
  lengthMeters: 190,
  highlights: [
    'Every suite with a private terrace',
    'Aft marina platform for swimming, paddleboarding and tenders',
    'Five restaurants, including an eight-seat Chef’s Counter',
    'Sérénité Spa with thalassotherapy pool',
  ],
  hero: { alt: 'Aurelia at anchor at dusk', tone: tone.dusk },
};

export const suite: Suite = {
  id: 'ste_712',
  number: '712',
  name: 'Loft Suite',
  category: 'loft',
  deck: 7,
  areaSqm: 56,
  terraceSqm: 14,
  features: [
    'Two-storey living with floor-to-ceiling glass',
    'Private terrace with daybed',
    'Marble bathroom with soaking tub',
    'Dedicated Suite Ambassador',
  ],
  hero: { alt: 'Loft Suite living area overlooking the sea', tone: tone.champagne },
};

export const voyage: Voyage = {
  id: 'voy_riv_1026',
  code: 'AU261017',
  name: 'Riviera & the Ligurian Coast',
  yachtId: yacht.id,
  startDate: '2026-10-17',
  endDate: '2026-10-24',
  nights: 7,
  region: 'Western Mediterranean',
  hero: { alt: 'Monte Carlo harbour at golden hour', tone: tone.sea },
  source: { system: 'mock' },
  itinerary: [
    {
      id: 'pc_1', day: 1, date: '2026-10-17', type: 'embark',
      portName: 'Barcelona', country: 'Spain', timeZone: 'Europe/Madrid',
      departure: '2026-10-17T20:00:00+02:00', allAboard: '2026-10-17T19:00:00+02:00',
      location: { lat: 41.3712, lng: 2.1856 },
      summary: 'Embark at the Port Vell yacht terminal and sail at sunset along the Costa Brava.',
      hero: { alt: 'Barcelona from the sea', tone: tone.terracotta },
    },
    {
      id: 'pc_2', day: 2, date: '2026-10-18', type: 'tender',
      portName: 'Saint-Tropez', country: 'France', timeZone: 'Europe/Paris',
      arrival: '2026-10-18T09:00:00+02:00', departure: '2026-10-18T22:00:00+02:00', allAboard: '2026-10-18T21:30:00+02:00',
      location: { lat: 43.2727, lng: 6.6406 },
      summary: 'Morning markets on Place des Lices, afternoon on the Pampelonne shore.',
      hero: { alt: 'Saint-Tropez old port', tone: tone.stone },
    },
    {
      id: 'pc_3', day: 3, date: '2026-10-19', type: 'overnight',
      portName: 'Monte Carlo', country: 'Monaco', timeZone: 'Europe/Monaco',
      arrival: '2026-10-19T08:00:00+02:00',
      location: { lat: 43.7347, lng: 7.4206 },
      summary: 'Overnight in Port Hercule. The Corniche roads, the Opéra and the Principality after dark.',
      hero: { alt: 'Port Hercule, Monaco', tone: tone.sea },
    },
    {
      id: 'pc_4', day: 4, date: '2026-10-20', type: 'port',
      portName: 'Monte Carlo', country: 'Monaco', timeZone: 'Europe/Monaco',
      departure: '2026-10-20T18:00:00+02:00', allAboard: '2026-10-20T17:30:00+02:00',
      location: { lat: 43.7347, lng: 7.4206 },
      summary: 'A leisurely morning in the Principality before sailing east along the Italian Riviera.',
      hero: { alt: 'Monaco at morning', tone: tone.dusk },
    },
    {
      id: 'pc_5', day: 5, date: '2026-10-21', type: 'tender',
      portName: 'Portofino', country: 'Italy', timeZone: 'Europe/Rome',
      arrival: '2026-10-21T08:30:00+02:00', departure: '2026-10-21T19:00:00+02:00', allAboard: '2026-10-21T18:30:00+02:00',
      location: { lat: 44.3036, lng: 9.2097 },
      summary: 'The piazzetta, the lighthouse path, and San Fruttuoso reached only by sea.',
      hero: { alt: 'Portofino harbour', tone: tone.olive },
    },
    {
      id: 'pc_6', day: 6, date: '2026-10-22', type: 'port',
      portName: 'Portovenere', country: 'Italy', timeZone: 'Europe/Rome',
      arrival: '2026-10-22T08:00:00+02:00', departure: '2026-10-22T18:00:00+02:00', allAboard: '2026-10-22T17:30:00+02:00',
      location: { lat: 44.0503, lng: 9.8361 },
      summary: 'Gateway to the Cinque Terre. Vineyards terraced into cliffs above the Gulf of Poets.',
      hero: { alt: 'Portovenere waterfront', tone: tone.terracotta },
    },
    {
      id: 'pc_7', day: 7, date: '2026-10-23', type: 'tender',
      portName: 'Bonifacio', country: 'France (Corsica)', timeZone: 'Europe/Paris',
      arrival: '2026-10-23T09:00:00+02:00', departure: '2026-10-23T20:00:00+02:00', allAboard: '2026-10-23T19:30:00+02:00',
      location: { lat: 41.3874, lng: 9.1594 },
      summary: 'A citadel atop white limestone cliffs. The marina platform opens in the Lavezzi lee.',
      hero: { alt: 'Bonifacio cliffs', tone: tone.stone },
    },
    {
      id: 'pc_8', day: 8, date: '2026-10-24', type: 'disembark',
      portName: 'Civitavecchia (Rome)', country: 'Italy', timeZone: 'Europe/Rome',
      arrival: '2026-10-24T07:00:00+02:00',
      location: { lat: 42.0930, lng: 11.7920 },
      summary: 'Breakfast on your terrace, then a private transfer to Rome or Fiumicino.',
      hero: { alt: 'Roman countryside', tone: tone.olive },
    },
  ],
};

export const pastVoyages: Voyage[] = [
  {
    id: 'voy_adr_0524',
    code: 'SE240518',
    name: 'Dalmatian Coast & Venice',
    yachtId: 'yct_serena',
    startDate: '2024-05-18',
    endDate: '2024-05-25',
    nights: 7,
    region: 'Adriatic',
    itinerary: [],
    hero: { alt: 'Dubrovnik walls', tone: tone.terracotta },
    source: { system: 'mock' },
  },
  {
    id: 'voy_cyc_0925',
    code: 'AU250906',
    name: 'Cyclades in Late Summer',
    yachtId: yacht.id,
    startDate: '2025-09-06',
    endDate: '2025-09-16',
    nights: 10,
    region: 'Aegean',
    itinerary: [],
    hero: { alt: 'Whitewashed Milos coastline', tone: tone.sea },
    source: { system: 'mock' },
  },
];

export const reservation: VoyageReservation = {
  id: 'rsv_88412',
  bookingReference: 'AU-88412',
  voyageId: voyage.id,
  suiteId: suite.id,
  leadGuestId: LEAD_GUEST_ID,
  partyGuestIds: [LEAD_GUEST_ID, COMPANION_GUEST_ID],
  status: 'pending-documents',
  suiteAmbassador: 'Sophie Marchetti',
  source: { system: 'mock' },
};

export const embarkation: Embarkation = {
  reservationId: reservation.id,
  terminalName: 'Port Vell Yacht Terminal',
  address: 'Moll de la Fusta, 08039 Barcelona',
  location: { lat: 41.3756, lng: 2.1812 },
  arrivalWindowStart: '2026-10-17T14:00:00+02:00',
  arrivalWindowEnd: '2026-10-17T14:30:00+02:00',
  suiteReadyAt: '2026-10-17T15:00:00+02:00',
  allAboard: '2026-10-17T19:00:00+02:00',
  departure: '2026-10-17T20:00:00+02:00',
  checkInStatus: 'in-progress',
  notes: [
    'Your luggage will be collected at the terminal kerb and delivered to Suite 712.',
    'Sophie will greet you at the gangway with your welcome amenity.',
  ],
};

export const travelDocuments: TravelDocument[] = [
  { id: 'doc_1', guestId: LEAD_GUEST_ID, type: 'passport', label: 'Passport — Isabelle', status: 'verified', detail: 'Valid until 2031' },
  { id: 'doc_2', guestId: COMPANION_GUEST_ID, type: 'passport', label: 'Passport — James', status: 'submitted', detail: 'Awaiting verification' },
  { id: 'doc_3', guestId: LEAD_GUEST_ID, type: 'health-declaration', label: 'Health declaration', status: 'required', dueBy: '2026-10-16' },
  { id: 'doc_4', guestId: LEAD_GUEST_ID, type: 'guest-contract', label: 'Guest ticket contract', status: 'verified' },
  { id: 'doc_5', guestId: LEAD_GUEST_ID, type: 'emergency-contact', label: 'Emergency contact', status: 'verified' },
];
