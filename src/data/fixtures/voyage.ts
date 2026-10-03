/**
 * FICTIONAL voyage data. "Evrima" is used as the yacht name at the product
 * team's request; all specifications, venues, times, crew names and flight
 * details here are illustrative and are not sourced from any operator.
 *
 * All times carry the local port offset (CEST, +02:00, in May; Miami EDT, -04:00).
 */
import type { DevVoyageData } from './types';
import { IDS } from './ids';
import { tones } from './tones';

const R = IDS.reservation;

export const voyageData: DevVoyageData = {
  yacht: {
    id: IDS.yacht,
    name: 'Evrima',
    tagline: 'A yacht with the soul of a grand hotel, at the scale of a private residence.',
    guestCapacity: 298,
    suites: 149,
    crew: 246,
    lengthMeters: 190,
    highlights: [
      'Every suite with a private terrace',
      'Aft marina platform for swimming, paddleboarding and tenders',
      "Five restaurants, including an eight-seat Chef's Counter",
      'Spa with thalassotherapy pool and couples treatment suite',
    ],
    hero: { alt: 'Evrima at anchor off the Riviera at dusk', tone: tones.dusk },
  },

  suite: {
    id: IDS.suite,
    number: '612',
    name: 'Grand Suite',
    category: 'signature',
    deck: 6,
    areaSqm: 62,
    terraceSqm: 18,
    features: [
      'Separate living room and bedroom, both facing the sea',
      'Wraparound terrace with dining table and daybed',
      'Marble bathroom with soaking tub and rain shower',
      'Dedicated Suite Ambassador, aboard and ashore',
    ],
    hero: { alt: 'Grand Suite living room opening onto the terrace', tone: tones.champagne },
  },

  voyage: {
    id: IDS.voyage,
    code: 'EV270515',
    name: 'Balearics & the Riviera',
    yachtId: IDS.yacht,
    startDate: '2027-05-15',
    endDate: '2027-05-22',
    nights: 7,
    region: 'Western Mediterranean',
    hero: { alt: 'Monte Carlo harbour at golden hour', tone: tones.sea },
    source: { system: 'mock' },
    itinerary: [
      {
        id: 'dev_pc_1', day: 1, date: '2027-05-15', type: 'embark',
        portName: 'Barcelona', country: 'Spain', timeZone: 'Europe/Madrid',
        allAboard: '2027-05-15T19:00:00+02:00', departure: '2027-05-15T20:00:00+02:00',
        location: { lat: 41.3712, lng: 2.1856 },
        summary: 'A private morning with Gaudí, then embarkation and a sunset sail-away past Montjuïc.',
        hero: { alt: 'Barcelona from the sea', tone: tones.terracotta },
      },
      {
        id: 'dev_pc_2', day: 2, date: '2027-05-16', type: 'port',
        portName: 'Palma de Mallorca', country: 'Spain', timeZone: 'Europe/Madrid',
        arrival: '2027-05-16T08:00:00+02:00', allAboard: '2027-05-16T18:30:00+02:00', departure: '2027-05-16T19:00:00+02:00',
        location: { lat: 39.5627, lng: 2.6290 },
        summary: 'La Seu cathedral at the water’s edge, Tramuntana villages and the vineyards of Binissalem.',
        hero: { alt: 'Palma cathedral above the harbour', tone: tones.stone },
      },
      {
        id: 'dev_pc_3', day: 3, date: '2027-05-17', type: 'sea',
        portName: 'At sea', country: 'Balearic Sea', timeZone: 'Europe/Madrid',
        summary: 'A day under way: the spa, a visit to the bridge, and the Chef’s Counter in the evening.',
        hero: { alt: 'Open sea from the terrace', tone: tones.sea },
      },
      {
        id: 'dev_pc_4', day: 4, date: '2027-05-18', type: 'tender',
        portName: 'Saint-Tropez', country: 'France', timeZone: 'Europe/Paris',
        arrival: '2027-05-18T08:00:00+02:00', allAboard: '2027-05-18T22:30:00+02:00', departure: '2027-05-18T23:00:00+02:00',
        location: { lat: 43.2727, lng: 6.6406 },
        summary: 'A classic yacht under sail in the bay, and the marina platform open in the afternoon.',
        hero: { alt: 'Classic sailing yachts off Saint-Tropez', tone: tones.sea },
      },
      {
        id: 'dev_pc_5', day: 5, date: '2027-05-19', type: 'overnight',
        portName: 'Monte Carlo', country: 'Monaco', timeZone: 'Europe/Monaco',
        arrival: '2027-05-19T08:00:00+02:00',
        location: { lat: 43.7347, lng: 7.4206 },
        summary: 'Overnight in Port Hercule. The Oceanographic Museum before opening and the Principality after dark.',
        hero: { alt: 'Port Hercule, Monaco', tone: tones.dusk },
      },
      {
        id: 'dev_pc_6', day: 6, date: '2027-05-20', type: 'port',
        portName: 'Monte Carlo', country: 'Monaco', timeZone: 'Europe/Monaco',
        allAboard: '2027-05-20T23:30:00+02:00', departure: '2027-05-21T00:00:00+02:00',
        location: { lat: 43.7347, lng: 7.4206 },
        summary: 'Your anniversary in Monaco: gardens above the sea and dinner on a private terrace.',
        hero: { alt: 'Monaco at night', tone: tones.claret },
      },
      {
        id: 'dev_pc_7', day: 7, date: '2027-05-21', type: 'tender',
        portName: 'Portofino', country: 'Italy', timeZone: 'Europe/Rome',
        arrival: '2027-05-21T08:30:00+02:00', allAboard: '2027-05-21T18:00:00+02:00', departure: '2027-05-21T18:30:00+02:00',
        location: { lat: 44.3036, lng: 9.2097 },
        summary: 'A mahogany launch to San Fruttuoso and the lighthouse path above the harbour.',
        hero: { alt: 'Portofino harbour', tone: tones.olive },
      },
      {
        id: 'dev_pc_8', day: 8, date: '2027-05-22', type: 'disembark',
        portName: 'Rome (Civitavecchia)', country: 'Italy', timeZone: 'Europe/Rome',
        arrival: '2027-05-22T06:30:00+02:00',
        location: { lat: 42.0930, lng: 11.7920 },
        summary: 'Breakfast on your terrace, then a private car to Fiumicino for your flight home to Miami.',
        hero: { alt: 'Roman countryside at morning', tone: tones.olive },
      },
    ],
  },

  reservation: {
    id: R,
    bookingReference: 'EV-270515-LAU',
    voyageId: IDS.voyage,
    suiteId: IDS.suite,
    leadGuestId: IDS.guest,
    partyGuestIds: [IDS.guest, IDS.companion],
    status: 'pending-documents',
    suiteAmbassador: 'Elena Moreau',
    suiteAmbassadorContact: {
      name: 'Elena Moreau',
      title: 'Suite Ambassador',
      availability: '07:00 – 23:00 ship time; urgent matters at any hour',
      suiteTelephone: 'Dial 9 from your suite telephone',
      languages: ['English', 'French', 'Italian'],
      channels: ['chat', 'suite-telephone', 'in-person'],
    },
    source: { system: 'mock' },
  },

  embarkation: {
    reservationId: R,
    terminalName: 'Port Vell Yacht Terminal',
    address: 'Moll de la Fusta, 08039 Barcelona',
    location: { lat: 41.3756, lng: 2.1812 },
    arrivalWindowStart: '2027-05-15T13:30:00+02:00',
    arrivalWindowEnd: '2027-05-15T14:00:00+02:00',
    suiteReadyAt: '2027-05-15T14:00:00+02:00',
    allAboard: '2027-05-15T19:00:00+02:00',
    departure: '2027-05-15T20:00:00+02:00',
    checkInStatus: 'in-progress',
    luggage: {
      method: 'airport-collection',
      summary: 'Collected by your driver at El Prat and taken straight to Grand Suite 612. You keep only what you need for the morning.',
      deliveredBy: '2027-05-15T15:30:00+02:00',
      tags: 'e-tags-issued',
      pieces: 4,
    },
    notes: [
      'Your luggage travels directly from the airport to Grand Suite 612 while you are at the Sagrada Família.',
      'Elena will meet you at the gangway; feather-free bedding and your welcome amenity will be in place.',
    ],
  },

  documents: [
    { id: 'dev_doc_1', guestId: IDS.guest, type: 'passport', label: 'Passport — Alexander', status: 'verified', detail: 'Valid until 2033' },
    { id: 'dev_doc_2', guestId: IDS.companion, type: 'passport', label: 'Passport — Camille', status: 'verified', detail: 'Valid until 2031' },
    { id: 'dev_doc_3', guestId: IDS.guest, type: 'health-declaration', label: 'Health questionnaire', status: 'required', dueBy: '2027-05-13' },
    { id: 'dev_doc_4', guestId: IDS.guest, type: 'guest-contract', label: 'Guest ticket contract', status: 'verified' },
    { id: 'dev_doc_5', guestId: IDS.guest, type: 'emergency-contact', label: 'Emergency contact', status: 'verified' },
    { id: 'dev_doc_6', guestId: IDS.guest, type: 'payment-folio', label: 'Onboard account', status: 'verified', detail: 'Set up — no action needed' },
  ],

  // Fictional flight numbers and schedules.
  flights: [
    {
      id: 'dev_flt_in', reservationId: R, direction: 'inbound',
      carrier: 'American Airlines', flightNumber: 'AA 7412',
      origin: 'MIA', destination: 'BCN',
      departure: '2027-05-14T18:40:00-04:00', arrival: '2027-05-15T09:10:00+02:00',
      cabin: 'business', status: 'scheduled', trackedForTransfer: true,
    },
    {
      id: 'dev_flt_out', reservationId: R, direction: 'outbound',
      carrier: 'American Airlines', flightNumber: 'AA 7419',
      origin: 'FCO', destination: 'MIA',
      departure: '2027-05-22T13:35:00+02:00', arrival: '2027-05-22T18:25:00-04:00',
      cabin: 'business', status: 'scheduled', trackedForTransfer: true,
    },
  ],

  pastVoyages: [
    {
      id: IDS.pastVoyages.caribbean, code: 'EV231202', name: 'Caribbean Winter Light',
      yachtId: IDS.yacht, startDate: '2023-12-02', endDate: '2023-12-09', nights: 7, region: 'Caribbean',
      itinerary: [], hero: { alt: 'Turquoise anchorage in the Grenadines', tone: tones.sea }, source: { system: 'mock' },
    },
    {
      id: IDS.pastVoyages.adriatic, code: 'EV240831', name: 'Dalmatian Coast & Venice',
      yachtId: IDS.yacht, startDate: '2024-08-31', endDate: '2024-09-07', nights: 7, region: 'Adriatic',
      itinerary: [], hero: { alt: 'Hvar harbour at dusk', tone: tones.terracotta }, source: { system: 'mock' },
    },
    {
      id: IDS.pastVoyages.greekIsles, code: 'IL250614', name: 'Cyclades in Early Summer',
      yachtId: IDS.yachtIlma, startDate: '2025-06-14', endDate: '2025-06-24', nights: 10, region: 'Aegean',
      itinerary: [], hero: { alt: 'Whitewashed Milos coastline', tone: tones.stone }, source: { system: 'mock' },
    },
  ],
};
