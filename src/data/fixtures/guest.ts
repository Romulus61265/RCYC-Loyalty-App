/**
 * Fictional guest data. Any resemblance to real persons is coincidental.
 */
import type {
  GuestPrivilege,
  GuestProfile,
  GuestRelationship,
  LoyaltyMembership,
} from '@/domain';

export const LEAD_GUEST_ID = 'gst_7f3a91';
export const COMPANION_GUEST_ID = 'gst_7f3a92';

export const guestProfile: GuestProfile = {
  guest: {
    id: LEAD_GUEST_ID,
    salutation: 'Mrs. Laurent-Hale',
    firstName: 'Isabelle',
    lastName: 'Laurent-Hale',
    preferredName: 'Isabelle',
    emailMasked: 'i•••••@l•••••.co.uk',
    phoneMasked: '+44 •••• ••• 218',
    dateOfBirth: '1972-03-14',
    nationality: 'British',
    homeCity: 'London',
    guestSince: '2024-05-18',
    source: { system: 'mock' },
  },
  preferences: {
    guestId: LEAD_GUEST_ID,
    preferredDestinations: ['French Riviera', 'Amalfi Coast', 'Greek Islands', 'Dalmatian Coast'],
    dining: {
      cuisines: ['Ligurian', 'Provençal', 'Japanese omakase'],
      tablePreference: 'terrace',
      preferredSeating: 'Ocean-side, away from service stations',
      notes: 'Prefers dinner at 20:00 or later. Enjoys meeting the chef.',
    },
    dietary: {
      restrictions: ['Pescatarian (James)'],
      allergies: [{ allergen: 'Tree nuts', severity: 'allergy' }],
    },
    beverage: {
      wine: ['Barolo', 'White Burgundy', 'Provence rosé'],
      spirits: ['Japanese whisky'],
      nonAlcoholic: ['San Pellegrino', 'Fresh mint tea'],
      welcomeAmenity: 'Ruinart Blanc de Blancs, chilled',
    },
    suite: {
      pillow: 'Firm, hypoallergenic',
      bedConfiguration: 'king',
      temperatureCelsius: 20,
      turndown: 'Shades drawn, terrace doors closed, lavender mist',
      minibar: ['Still water', 'Dark chocolate (nut-free)', 'Champagne'],
      newspapers: ['Financial Times', 'Le Figaro'],
    },
    activityInterests: ['Wine & viticulture', 'Contemporary art', 'Coastal walking', 'Open-water swimming', 'Architecture'],
    communication: {
      channels: { push: true, email: true, sms: false, whatsapp: true },
      quietHours: { start: '22:30', end: '07:30' },
      language: 'en-GB',
      marketingConsent: false,
    },
  },
  companions: [
    {
      id: COMPANION_GUEST_ID,
      guestId: COMPANION_GUEST_ID,
      firstName: 'James',
      lastName: 'Hale',
      relationship: 'spouse',
      isMinor: false,
      notes: 'Pescatarian. Keen sailor; enjoys early-morning swims from the marina.',
    },
  ],
  occasions: [
    {
      id: 'occ_25anniv',
      type: 'anniversary',
      label: '25th wedding anniversary',
      date: '2026-10-21',
      personIds: [LEAD_GUEST_ID, COMPANION_GUEST_ID],
      recognition: 'discreet',
    },
    {
      id: 'occ_bday_isabelle',
      type: 'birthday',
      label: "Isabelle's birthday",
      date: '2027-03-14',
      personIds: [LEAD_GUEST_ID],
      recognition: 'celebrate',
    },
  ],
};

export const loyaltyMembership: LoyaltyMembership = {
  programme: 'marriott-bonvoy',
  memberNumberMasked: '•••• •••• 4821',
  tier: 'titanium',
  tierLabel: 'Titanium Elite',
  lifetimeStatus: 'Lifetime Platinum Elite',
  memberSince: '2006-09-01',
  pointsBalance: 1_284_350,
  source: { system: 'mock' },
};

export const guestRelationship: GuestRelationship = {
  guestId: LEAD_GUEST_ID,
  voyagesCompleted: 2,
  nightsSailed: 17,
  firstVoyageDate: '2024-05-18',
  yachtsSailed: ['Serena', 'Aurelia'],
  valueSegment: 'distinguished',
  ambassadorName: 'Sophie Marchetti',
};

export const privileges: GuestPrivilege[] = [
  {
    id: 'prv_arrival',
    title: 'Priority, unhurried embarkation',
    description: 'A personal arrival window and escort directly to your suite — no queue, no formalities at the gangway.',
    category: 'arrival',
    basis: 'bonvoy-tier',
    appliesToVoyageId: 'voy_riv_1026',
  },
  {
    id: 'prv_amenity',
    title: 'Welcome amenity of your choosing',
    description: 'Ruinart Blanc de Blancs awaiting you, chilled, with a note from your Suite Ambassador.',
    category: 'suite',
    basis: 'bonvoy-tier',
    appliesToVoyageId: 'voy_riv_1026',
  },
  {
    id: 'prv_chefs',
    title: "An evening at the Chef's Counter",
    description: 'Reserved seating at the eight-seat tasting counter on an evening of your choice, with wine pairing.',
    category: 'dining',
    basis: 'voyage-tenure',
    appliesToVoyageId: 'voy_riv_1026',
  },
  {
    id: 'prv_spa',
    title: 'Preferred spa scheduling',
    description: 'First access to treatment times before they open to all guests, 72 hours ahead of each port day.',
    category: 'wellness',
    basis: 'bonvoy-tier',
  },
  {
    id: 'prv_late',
    title: 'Late disembarkation',
    description: 'Remain in your suite until 11:00 on the final morning, with breakfast served on your terrace.',
    category: 'suite',
    basis: 'suite-category',
    appliesToVoyageId: 'voy_riv_1026',
  },
  {
    id: 'prv_occasion',
    title: 'A quiet celebration, arranged',
    description: 'Your Suite Ambassador is aware of your anniversary and will arrange anything you wish — or nothing at all.',
    category: 'recognition',
    basis: 'occasion',
    appliesToVoyageId: 'voy_riv_1026',
  },
];
