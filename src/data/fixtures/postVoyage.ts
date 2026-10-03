/**
 * FICTIONAL voyages to inspire the next one, shown after the guest returns.
 * Names, dates and ports are invented for development; they are not the
 * operator's real schedule. `hooks` are the sentence each voyage offers for
 * an interest the guest showed, so the reason reads as if written for them.
 */
import type { VoyageInspiration } from '@/domain';
import { tones } from './tones';

export const voyageInspirations: VoyageInspiration[] = [
  {
    id: 'dev_insp_aeolian', name: 'Amalfi, Sicily & the Aeolian Islands', region: 'Southern Italy', yachtName: 'Evrima',
    startDate: '2028-06-10', endDate: '2028-06-17', nights: 7,
    ports: ['Civitavecchia', 'Amalfi', 'Capri', 'Lipari', 'Taormina', 'Valletta'],
    tags: ['wine', 'private', 'culture', 'yachting', 'fine-dining', 'italy'],
    standfirst: 'Lemon terraces, volcanic islands and a morning on Etna’s slopes.',
    highlight: 'A private boat around Stromboli at dusk, with dinner aboard.',
    hooks: {
      wine: 'Etna’s volcanic vineyards, on the slopes above Taormina.',
      yachting: 'Seven islands, each best arrived at by sea.',
      culture: 'Taormina’s Greek theatre, opened early for you.',
      'fine-dining': 'A chef’s table above the harbour in Amalfi.',
    },
    hero: { alt: 'Amalfi coast terraces at sunset', tone: tones.terracotta },
  },
  {
    id: 'dev_insp_corsica', name: 'Corsica, Sardinia & the Bonifacio Strait', region: 'Western Mediterranean', yachtName: 'Ilma',
    startDate: '2028-09-02', endDate: '2028-09-09', nights: 7,
    ports: ['Nice', 'Calvi', 'Ajaccio', 'Bonifacio', 'Porto Cervo', 'Portoferraio'],
    tags: ['yachting', 'sailing', 'private', 'beaches', 'wine'],
    standfirst: 'Granite coves and the clearest water in the Mediterranean.',
    highlight: 'Under sail through the Lavezzi Islands, in September light.',
    hooks: {
      sailing: 'Under sail through the Lavezzi Islands.',
      yachting: 'Anchorages you can only reach by sea.',
      wine: 'Vermentino on the terraces above Porto Cervo.',
    },
    hero: { alt: 'Bonifacio cliffs above a turquoise strait', tone: tones.sea },
  },
  {
    id: 'dev_insp_atlantic', name: 'Bordeaux to Lisbon', region: 'Atlantic Coast', yachtName: 'Evrima',
    startDate: '2028-05-06', endDate: '2028-05-13', nights: 7,
    ports: ['Bordeaux', 'Bilbao', 'A Coruña', 'Porto', 'Lisbon'],
    tags: ['wine', 'fine-dining', 'culture', 'private'],
    standfirst: 'The great cellars of Bordeaux, the Douro, and Lisbon at the end of it.',
    highlight: 'A barrel tasting in Saint-Émilion with the winemaker, privately.',
    hooks: {
      wine: 'Saint-Émilion and the Douro, for a lover of great reds.',
      'fine-dining': 'San Sebastián’s tables are a short drive from Bilbao.',
      culture: 'The Guggenheim, before the doors open.',
    },
    hero: { alt: 'Vineyard rows in the Médoc', tone: tones.claret },
  },
  {
    id: 'dev_insp_dalmatia', name: 'The Dalmatian Coast & Montenegro', region: 'Adriatic', yachtName: 'Evrima',
    startDate: '2028-07-08', endDate: '2028-07-15', nights: 7,
    ports: ['Venice', 'Rovinj', 'Split', 'Korčula', 'Kotor', 'Dubrovnik'],
    tags: ['culture', 'yachting', 'walking'],
    standfirst: 'Stone towns, island vineyards and the fjord of Kotor.',
    highlight: 'Kotor’s bay at first light, from the bridge.',
    hooks: { culture: 'Korčula and Kotor, quieter than Dubrovnik.', yachting: 'The Bay of Kotor by sea.' },
    hero: { alt: 'Kotor bay beneath the mountains', tone: tones.stone },
  },
  {
    id: 'dev_insp_fjords', name: 'Norwegian Fjords in Midsummer', region: 'Northern Europe', yachtName: 'Ilma',
    startDate: '2028-06-24', endDate: '2028-07-01', nights: 7,
    ports: ['Copenhagen', 'Stavanger', 'Flåm', 'Geiranger', 'Ålesund', 'Bergen'],
    tags: ['nature', 'walking', 'spa', 'wellness'],
    standfirst: 'Light that barely sets, and water as still as glass.',
    highlight: 'A private walk above Geiranger, then the spa as the yacht sails.',
    hooks: { spa: 'Thalassotherapy with a view of the fjord.', wellness: 'Mountain air and long, unhurried days.' },
    hero: { alt: 'Geirangerfjord under a midsummer sky', tone: tones.olive },
  },
];

export const postVoyageData = { voyageInspirations };
