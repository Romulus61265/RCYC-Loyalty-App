/**
 * FICTIONAL records of the guest's three past voyages: where they went,
 * the suite, what they did ashore, at the spa and at the table, and what
 * was learned. Moments with a weight are the history the personalization
 * engine reads (they were "history" signals before voyage records existed).
 */
import type { PastVoyageRecord } from '@/domain';
import { IDS } from './ids';

const G = IDS.guest;
const V = IDS.pastVoyages;

export const pastVoyageRecords: PastVoyageRecord[] = [
  {
    guestId: G, voyageId: V.caribbean, yachtName: 'Evrima', suite: 'Grand Suite 608',
    destinations: [
      { name: 'Bridgetown', country: 'Barbados' },
      { name: 'The Grenadines', country: 'Saint Vincent and the Grenadines' },
      { name: 'St Barths', country: 'Saint Barthélemy' },
    ],
    moments: [
      { id: 'dev_sig_05', kind: 'dining', title: 'A Barolo vertical tasting', place: 'Aboard Evrima, with the sommelier', date: '2023-12-05', memory: 'the Barolo vertical tasting with our sommelier', category: 'wine', rating: 5, weight: 0.85, tags: ['wine', 'red-wine'] },
      { id: 'dev_sig_04', kind: 'dining', title: 'A window table, each evening', place: 'Aboard Evrima', date: '2023-12-08', memory: 'your window table each evening', category: 'dining', weight: 0.8, tags: ['window'] },
    ],
    savedPreferences: [
      { id: 'dev_pref_carib_window', label: 'A window table each evening', key: 'dining.tablePreference', value: 'window' },
      { id: 'dev_pref_carib_pillows', label: 'Feather-free pillows and duvet', key: 'suite.pillow', value: 'Feather-free' },
    ],
    photos: [],
  },
  {
    guestId: G, voyageId: V.adriatic, yachtName: 'Evrima', suite: 'Grand Suite 612',
    destinations: [
      { name: 'Dubrovnik', country: 'Croatia' },
      { name: 'Hvar', country: 'Croatia' },
      { name: 'Venice', country: 'Italy' },
    ],
    moments: [
      { id: 'dev_sig_06', kind: 'excursion', title: 'Under sail on a classic yacht', place: 'Hvar', date: '2024-09-02', memory: 'taking the helm of a classic yacht off Hvar', category: 'private', rating: 5, weight: 0.95, tags: ['yachting', 'sailing', 'private'] },
      { id: 'dev_sig_18', kind: 'excursion', title: 'A vineyard lunch with the winemaker', place: 'Hvar', date: '2024-09-02', memory: 'a private vineyard lunch on Hvar', category: 'wine', rating: 5, weight: 0.9, tags: ['wine', 'red-wine', 'private', 'culinary', 'vineyard'] },
      { id: 'dev_sig_08', kind: 'excursion', title: 'The Doge’s Palace before opening', place: 'Venice', date: '2024-09-07', memory: 'your early, private morning in the Doge’s Palace', category: 'culture', rating: 5, weight: 0.85, tags: ['private', 'culture', 'early-access'] },
      { id: 'dev_sig_03', kind: 'dining', title: 'The Chef’s Counter, with the wine pairing', place: 'Aboard Evrima', date: '2024-09-03', memory: 'the Chef’s Counter and its wine pairing aboard Evrima', category: 'dining', rating: 5, weight: 0.9, tags: ['tasting', 'chef', 'wine'] },
    ],
    savedPreferences: [
      { id: 'dev_pref_adriatic_reds', label: 'Great reds: Barolo, Brunello, Saint-Émilion', key: 'beverage.wine', value: 'Barolo' },
      { id: 'dev_pref_adriatic_private', label: 'Private guides ashore', key: 'excursions.style', value: 'private' },
    ],
    photos: [],
  },
  {
    guestId: G, voyageId: V.greekIsles, yachtName: 'Ilma', suite: 'Owner’s Suite 701',
    destinations: [
      { name: 'Piraeus', country: 'Greece' },
      { name: 'Mykonos', country: 'Greece' },
      { name: 'Santorini', country: 'Greece' },
      { name: 'Milos', country: 'Greece' },
    ],
    moments: [
      { id: 'dev_sig_09', kind: 'spa', title: 'A deep-tissue massage', place: 'Aboard Ilma', date: '2025-06-16', memory: 'your deep-tissue massage aboard Ilma', category: 'spa', rating: 5, weight: 0.8, tags: ['massage', 'firm'] },
      { id: 'dev_sig_07', kind: 'excursion', title: 'Santorini, in a small group', place: 'Santorini', date: '2025-06-17', category: 'excursion', rating: 2, weight: 0.7, tags: ['small-group', 'avoid'], note: 'You told us it felt crowded, so we have kept to private guides since.' },
    ],
    savedPreferences: [
      { id: 'dev_pref_aegean_firm', label: 'Firm pressure, unscented oil', key: 'spa.pressure', value: 'firm' },
      { id: 'dev_pref_aegean_private', label: 'Private rather than small-group ashore', key: 'excursions.style', value: 'private' },
      { id: 'dev_pref_aegean_pillows', label: 'Feather-free pillows and duvet', key: 'suite.pillow', value: 'Feather-free' },
    ],
    photos: [],
  },
];

export const voyageHistoryData = { records: pastVoyageRecords };
