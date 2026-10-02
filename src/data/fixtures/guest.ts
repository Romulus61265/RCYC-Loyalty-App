/**
 * FICTIONAL guest: Alexander Laurent. Any resemblance to real persons is
 * coincidental. Privileges below are illustrative for this concept and are
 * NOT actual Marriott Bonvoy terms or benefits.
 */
import type { DevGuestData } from './types';
import { IDS } from './ids';

export const guestData: DevGuestData = {
  profile: {
    guest: {
      id: IDS.guest,
      salutation: 'Mr. Laurent',
      firstName: 'Alexander',
      lastName: 'Laurent',
      preferredName: 'Alexander',
      emailMasked: 'a•••••••@example.com',
      phoneMasked: '+1 (305) •••-••47',
      dateOfBirth: '1968-09-23',
      nationality: 'American',
      homeCity: 'Miami, Florida',
      homeAirport: 'MIA',
      guestSince: '2023-12-02',
      source: { system: 'mock' },
    },
    preferences: {
      guestId: IDS.guest,
      preferredDestinations: ['French Riviera', 'Italian Riviera', 'Balearic Islands', 'Adriatic', 'Greek Islands'],
      dining: {
        cuisines: ['Mediterranean', 'Ligurian', 'Provençal', 'Catalan'],
        tablePreference: 'window',
        preferredSeating: 'Window table for two, facing the sea',
        notes: 'Prefers dinner from 20:30. Enjoys a word with the chef; dislikes long tasting menus on port days.',
      },
      dietary: {
        restrictions: [],
        allergies: [],
      },
      beverage: {
        wine: ['Red wine — Barolo, Brunello di Montalcino, Saint-Émilion', 'Champagne for celebrations'],
        spirits: ['Aged rum (neat)'],
        nonAlcoholic: ['Sparkling water — San Pellegrino, no ice, with lemon', 'Espresso after dinner'],
        welcomeAmenity: 'A bottle of Brunello di Montalcino, decanted on request, with chilled sparkling water',
      },
      suite: {
        pillow: 'Feather-free (synthetic down alternative) — all pillows and duvet',
        bedConfiguration: 'king',
        temperatureCelsius: 21,
        turndown: 'Blinds half-closed to keep the sea view; sparkling water on both nightstands',
        minibar: ['Sparkling water (case)', 'Dark chocolate', 'No sugary soft drinks'],
        newspapers: ['The Wall Street Journal', 'Financial Times (digital)'],
      },
      activityInterests: ['Fine dining', 'Wine', 'Private cultural experiences', 'Spa', 'Yachting & sailing'],
      excursions: {
        style: 'private',
        pace: 'leisurely',
        maxDurationMinutes: 300,
        notes: 'Private guide and vehicle always. Prefers early access before crowds; avoids large-group coaches.',
      },
      spa: {
        favouriteTreatments: ['Deep-tissue massage', 'Thalassotherapy', 'Couples ritual (with Camille)'],
        pressure: 'firm',
        preferredTime: 'morning',
        notes: 'Male or female therapist, no preference. Unscented oil.',
      },
      communication: {
        channels: { push: true, email: true, sms: true, whatsapp: false },
        quietHours: { start: '23:00', end: '07:00' },
        language: 'en-US',
        marketingConsent: true,
      },
    },
    companions: [
      {
        id: IDS.companion,
        guestId: IDS.companion,
        firstName: 'Camille',
        lastName: 'Laurent',
        relationship: 'spouse',
        isMinor: false,
        notes: 'Enjoys art and gardens; prefers lighter afternoon activities. Shares the spa ritual on the anniversary.',
      },
    ],
    occasions: [
      {
        id: 'dev_occ_anniv_20',
        type: 'anniversary',
        label: '20th wedding anniversary',
        date: '2027-05-20',
        personIds: [IDS.guest, IDS.companion],
        recognition: 'discreet',
      },
      {
        id: 'dev_occ_bday_alexander',
        type: 'birthday',
        label: "Alexander's birthday",
        date: '2027-09-23',
        personIds: [IDS.guest],
        recognition: 'discreet',
      },
    ],
  },

  membership: {
    programme: 'marriott-bonvoy',
    memberNumberMasked: '•••• •••• 7314',
    tier: 'titanium',
    tierLabel: 'Titanium Elite',
    lifetimeStatus: 'Lifetime Platinum Elite',
    memberSince: '2009-03-12',
    pointsBalance: 486_250,
    source: { system: 'mock' },
  },

  relationship: {
    guestId: IDS.guest,
    voyagesCompleted: 3,
    nightsSailed: 24,
    firstVoyageDate: '2023-12-02',
    yachtsSailed: ['Evrima', 'Ilma'],
    valueSegment: 'distinguished',
    ambassadorName: 'Elena Moreau',
  },

  privileges: [
    {
      id: 'dev_prv_embark',
      title: 'Priority, unhurried embarkation',
      description: 'A personal arrival window and escort straight to your Grand Suite. No queue at the gangway.',
      category: 'arrival',
      basis: 'bonvoy-tier',
      appliesToVoyageId: IDS.voyage,
    },
    {
      id: 'dev_prv_amenity',
      title: 'Your welcome amenity',
      description: 'Brunello di Montalcino and chilled sparkling water, waiting in your suite with a note from Elena.',
      category: 'suite',
      basis: 'bonvoy-tier',
      appliesToVoyageId: IDS.voyage,
    },
    {
      id: 'dev_prv_chefs',
      title: "An evening at the Chef's Counter",
      description: 'Reserved seats at the eight-seat counter on the sea day, with the head sommelier pairing red wines.',
      category: 'dining',
      basis: 'voyage-tenure',
      appliesToVoyageId: IDS.voyage,
    },
    {
      id: 'dev_prv_spa',
      title: 'Preferred spa scheduling',
      description: 'First choice of morning treatment times, 72 hours before they open to all guests.',
      category: 'wellness',
      basis: 'bonvoy-tier',
    },
    {
      id: 'dev_prv_window',
      title: 'Your window table, held',
      description: 'A window table for two is held for you each evening in Mediterraneo, unless you choose elsewhere.',
      category: 'dining',
      basis: 'voyage-tenure',
      appliesToVoyageId: IDS.voyage,
    },
    {
      id: 'dev_prv_late',
      title: 'Late disembarkation',
      description: 'Remain in your Grand Suite until your car to Fiumicino, with breakfast on your terrace.',
      category: 'suite',
      basis: 'suite-category',
      appliesToVoyageId: IDS.voyage,
    },
    {
      id: 'dev_prv_occasion',
      title: 'Your anniversary, quietly arranged',
      description: 'Elena knows about your 20th anniversary in Monte Carlo and will arrange as much, or as little, as you wish.',
      category: 'recognition',
      basis: 'occasion',
      appliesToVoyageId: IDS.voyage,
    },
  ],
};
