/**
 * FICTIONAL experience catalogue. Venue names aboard are invented for this
 * concept; destinations and landmarks are real places used for realism only.
 * Prices are illustrative.
 */
import type { DevExperienceData } from './types';
import { tones } from './tones';

type Catalogue = DevExperienceData['catalogue'];

export const catalogue: Catalogue = [
  // ── Dining aboard ────────────────────────────────────────────────────────
  {
    id: 'dev_exp_mediterraneo', category: 'dining', title: 'Mediterraneo',
    subtitle: 'The coast’s kitchens, by the window',
    description: 'Catalan, Provençal and Ligurian dishes cooked from the morning’s market, in a room lined with sea-facing windows.',
    inclusive: true, privateAvailable: false, format: 'shared', includes: ['Window table held each evening', 'Wine by the glass from the sommelier’s list'], tags: ['mediterranean', 'window', 'fine-dining'],
    hero: { alt: 'Window table at Mediterraneo at dusk', tone: tones.sea },
  },
  {
    id: 'dev_exp_lumiere', category: 'dining', title: 'Lumière',
    subtitle: 'Contemporary French, by candlelight',
    description: 'Twelve tables and a cellar of grower Champagnes and Right Bank Bordeaux.',
    inclusive: true, privateAvailable: false, format: 'shared', includes: ['Twelve-table dining room', 'Champagne and Bordeaux cellar'], tags: ['french', 'fine-dining', 'window'],
    hero: { alt: 'Candlelit table at Lumière', tone: tones.night },
  },
  {
    id: 'dev_exp_giardino', category: 'dining', title: 'Il Giardino',
    subtitle: 'Riviera Italian on the open terrace',
    description: 'Trofie al pesto, branzino al sale and a glass-screened terrace on Deck 9.',
    inclusive: true, privateAvailable: false, format: 'shared', includes: ['Glass-screened terrace table'], tags: ['italian', 'mediterranean', 'al-fresco'],
    hero: { alt: 'Terrace dining at sunset', tone: tones.terracotta },
  },
  {
    id: 'dev_exp_chefs_counter', category: 'dining', title: "The Chef's Counter",
    subtitle: 'Eight seats, one menu, the chef in front of you',
    description: 'A seven-course Mediterranean tasting with a red-wine pairing led by the head sommelier.',
    durationMinutes: 165, inclusive: false, privateAvailable: true, format: 'small-group', includes: ['Seven courses', 'Red-wine pairing by the head sommelier', 'Conversation with the chef'], capacity: 8,
    price: { amountMinor: 34000, currency: 'EUR' }, tags: ['tasting', 'chef', 'wine', 'fine-dining'],
    hero: { alt: 'Chef plating at the counter', tone: tones.champagne },
  },
  {
    id: 'dev_exp_anniversary_terrace', category: 'dining', title: 'Dinner on a Private Terrace',
    subtitle: 'A table for two, set above the harbour',
    description: 'A menu composed with the chef, a sommelier for the evening, and Monaco’s lights all around.',
    durationMinutes: 180, inclusive: false, privateAvailable: true, format: 'private', includes: ['Menu composed with the chef', 'Sommelier for the evening', 'Flowers and candlelight'], capacity: 2,
    price: { amountMinor: 120000, currency: 'EUR' }, tags: ['private', 'occasion', 'fine-dining', 'wine'],
    hero: { alt: 'Candlelit table on a terrace above a harbour', tone: tones.claret },
  },

  // ── Wine ─────────────────────────────────────────────────────────────────
  {
    id: 'dev_exp_wine_masterclass', category: 'wine', title: 'Barolo & Saint-Émilion, Side by Side',
    subtitle: 'A sea-day masterclass in the wine library',
    description: 'Six reds, two great regions, one table of twelve, led by the head sommelier.',
    durationMinutes: 90, inclusive: false, privateAvailable: true, format: 'small-group', includes: ['Six reds, poured side by side', 'Tasting notes to take home'], capacity: 12,
    price: { amountMinor: 16000, currency: 'EUR' }, tags: ['wine', 'red-wine'],
    hero: { alt: 'Glasses of red wine in a wine library', tone: tones.claret },
  },
  {
    id: 'dev_exp_mallorca_wine', category: 'wine', portCallId: 'dev_pc_2', destination: 'Palma de Mallorca',
    title: 'Binissalem Vineyards & Lunch in Deià',
    subtitle: 'A family estate, a private guide, a clifftop table',
    description: 'Taste Mantonegro reds with the winemaker, then drive the Tramuntana to lunch above the sea in Deià.',
    durationMinutes: 300, inclusive: false, privateAvailable: true, format: 'private', includes: ['Private car and guide', 'Barrel tasting with the winemaker', 'Lunch in Deià'],
    price: { amountMinor: 145000, currency: 'EUR' }, tags: ['wine', 'red-wine', 'private', 'culinary'],
    hero: { alt: 'Vineyards below the Tramuntana mountains', tone: tones.olive },
  },

  // ── Spa ──────────────────────────────────────────────────────────────────
  {
    id: 'dev_exp_deep_tissue', category: 'spa', title: 'Deep-Tissue Recovery Massage',
    subtitle: 'Ninety minutes, firm pressure, unscented oil',
    description: 'Focused work on back and shoulders after long-haul travel, followed by time in the relaxation room.',
    durationMinutes: 90, inclusive: false, privateAvailable: true, format: 'private', includes: ['90-minute treatment', 'Relaxation room afterwards'],
    price: { amountMinor: 26000, currency: 'EUR' }, tags: ['spa', 'massage'],
    hero: { alt: 'Spa treatment room with sea view', tone: tones.stone },
  },
  {
    id: 'dev_exp_thalasso', category: 'spa', title: 'Thalassotherapy Circuit',
    subtitle: 'Warm seawater pool, sauna and cold deluge',
    description: 'A sixty-minute circuit with a private lounger reserved.',
    durationMinutes: 60, inclusive: true, privateAvailable: false, format: 'shared', includes: ['Seawater pool, sauna and cold deluge', 'Reserved lounger'], tags: ['spa', 'thalassotherapy'],
    hero: { alt: 'Thalassotherapy pool', tone: tones.sea },
  },
  {
    id: 'dev_exp_couples_ritual', category: 'spa', title: 'Couples Terrace Ritual',
    subtitle: 'Side by side, open to the sea',
    description: 'Two hours in the couples suite: sea-salt exfoliation, massage and Champagne on its private terrace.',
    durationMinutes: 120, inclusive: false, privateAvailable: true, format: 'private', includes: ['Couples suite with private terrace', 'Champagne'],
    price: { amountMinor: 68000, currency: 'EUR' }, tags: ['spa', 'couples', 'occasion'],
    hero: { alt: 'Couples spa terrace', tone: tones.champagne },
  },

  // ── Excursions & private culture ─────────────────────────────────────────
  {
    id: 'dev_exp_sagrada_private', category: 'culture', portCallId: 'dev_pc_1', destination: 'Barcelona',
    title: 'The Sagrada Família, Privately',
    subtitle: 'An architect-guide and the towers, before embarkation',
    description: 'Your driver meets you at arrivals; luggage goes ahead to the yacht while you see Gaudí’s basilica with an architect.',
    durationMinutes: 120, inclusive: false, privateAvailable: true, format: 'private', includes: ['Architect-guide', 'Tower access', 'Car waits throughout'],
    price: { amountMinor: 85000, currency: 'EUR' }, tags: ['private', 'culture', 'architecture'],
    hero: { alt: 'Sagrada Família interior light', tone: tones.terracotta },
  },
  {
    id: 'dev_exp_classic_sail', category: 'private', portCallId: 'dev_pc_4', destination: 'Saint-Tropez',
    title: 'Under Sail on a 1930s Classic Yacht',
    subtitle: 'Take the helm in the Bay of Saint-Tropez',
    description: 'A restored gaff-rigged sloop, her skipper and a steward. Swim stop at Pampelonne and lunch aboard.',
    durationMinutes: 210, inclusive: false, privateAvailable: true, format: 'private', includes: ['Skipper and steward', 'Swim stop at Pampelonne', 'Lunch aboard'], capacity: 6,
    price: { amountMinor: 240000, currency: 'EUR' }, tags: ['private', 'yachting', 'sailing'],
    hero: { alt: 'Classic wooden yacht under full sail', tone: tones.sea },
  },
  {
    id: 'dev_exp_oceanographic', category: 'culture', portCallId: 'dev_pc_5', destination: 'Monte Carlo',
    title: 'The Oceanographic Museum Before Opening',
    subtitle: 'The cliff-top museum, with a curator, before the doors open',
    description: 'A private hour among the aquariums and the collections of Prince Albert I’s oceanographic voyages, then coffee on the terrace.',
    durationMinutes: 120, inclusive: false, privateAvailable: true, format: 'private', includes: ['Curator-led visit before opening', 'Coffee on the terrace', 'Private car'],
    price: { amountMinor: 78000, currency: 'EUR' }, tags: ['private', 'culture', 'early-access', 'yachting'],
    hero: { alt: 'Museum façade on the cliff above the sea', tone: tones.stone },
  },
  {
    id: 'dev_exp_villa_ephrussi', category: 'culture', portCallId: 'dev_pc_6', destination: 'Monte Carlo',
    title: 'Villa Ephrussi de Rothschild, Quietly',
    subtitle: 'Nine gardens on Cap Ferrat, with a curator',
    description: 'An early private visit to the villa and its gardens, then lunch in Beaulieu-sur-Mer.',
    durationMinutes: 180, inclusive: false, privateAvailable: true, format: 'private', includes: ['Curator', 'Private car', 'Lunch in Beaulieu-sur-Mer'],
    price: { amountMinor: 96000, currency: 'EUR' }, tags: ['private', 'culture', 'gardens', 'occasion'],
    hero: { alt: 'Formal gardens above the bay', tone: tones.olive },
  },
  {
    id: 'dev_exp_riva_fruttuoso', category: 'private', portCallId: 'dev_pc_7', destination: 'Portofino',
    title: 'San Fruttuoso by Riva',
    subtitle: 'A mahogany launch to the abbey reachable only by sea',
    description: 'Captain and steward, a swim in the cove, and lunch at the water’s edge.',
    durationMinutes: 240, inclusive: false, privateAvailable: true, format: 'private', includes: ['Captain and steward', 'Swim in the cove', 'Lunch at the water’s edge'], capacity: 4,
    price: { amountMinor: 280000, currency: 'EUR' }, tags: ['private', 'yachting', 'boat'],
    hero: { alt: 'Riva launch in a turquoise cove', tone: tones.sea },
  },
  {
    id: 'dev_exp_palma_seu', category: 'culture', portCallId: 'dev_pc_2', destination: 'Palma de Mallorca',
    title: 'La Seu with a Historian',
    subtitle: 'Gothic stone and Gaudí’s canopy',
    description: 'A private hour in Palma’s cathedral, including the terraces when open.',
    durationMinutes: 75, inclusive: false, privateAvailable: true, format: 'private', includes: ['Historian-guide', 'Terraces when open'],
    price: { amountMinor: 42000, currency: 'EUR' }, tags: ['private', 'culture', 'architecture'],
    hero: { alt: 'Palma cathedral rose window', tone: tones.stone },
  },
  {
    id: 'dev_exp_lighthouse_walk', category: 'excursion', portCallId: 'dev_pc_7', destination: 'Portofino',
    title: 'The Lighthouse Path at Golden Hour',
    subtitle: 'An easy walk to Punta Capo',
    description: 'Twenty minutes from the piazzetta, with a glass of Vermentino at the lighthouse.',
    durationMinutes: 90, inclusive: true, privateAvailable: true, format: 'private-or-group', includes: ['Guide', 'A glass of Vermentino at the lighthouse'], capacity: 10, tags: ['walking', 'culture'],
    hero: { alt: 'Portofino lighthouse at sunset', tone: tones.terracotta },
  },

  // ── Wellness ─────────────────────────────────────────────────────────────
  {
    id: 'dev_exp_sunrise_yoga', category: 'wellness', title: 'Sunrise Yoga on the Bow',
    subtitle: 'Forty-five minutes as the coast wakes',
    description: 'A gentle flow on the forward deck with the yacht’s wellness coach. Mats, towels and fresh juices provided.',
    durationMinutes: 45, inclusive: true, privateAvailable: false, format: 'small-group', capacity: 12,
    includes: ['Mats and towels', 'Fresh juices afterwards'], tags: ['wellness', 'yoga', 'morning'],
    hero: { alt: 'Yoga mats on a yacht deck at sunrise', tone: tones.champagne },
  },
  {
    id: 'dev_exp_private_coach', category: 'wellness', title: 'A Private Session with the Wellness Coach',
    subtitle: 'Mobility, breathwork and stretching, after the flight',
    description: 'One-to-one in the fitness studio or on your terrace, shaped around long-haul recovery.',
    durationMinutes: 60, inclusive: false, privateAvailable: true, format: 'private',
    price: { amountMinor: 18000, currency: 'EUR' }, includes: ['One-to-one coaching', 'A recovery plan for the voyage'], tags: ['wellness', 'private', 'recovery'],
    hero: { alt: 'Fitness studio with sea view', tone: tones.sea },
  },
  {
    id: 'dev_exp_tramuntana_walk', category: 'wellness', portCallId: 'dev_pc_2', destination: 'Palma de Mallorca',
    title: 'Morning Walk in the Tramuntana',
    subtitle: 'Olive terraces and dry-stone paths above Valldemossa',
    description: 'An easy two-hour walk with a mountain guide, ending with coffee in the village square.',
    durationMinutes: 150, inclusive: false, privateAvailable: true, format: 'private',
    price: { amountMinor: 52000, currency: 'EUR' }, includes: ['Private mountain guide', 'Private car', 'Coffee in Valldemossa'], tags: ['wellness', 'walking', 'private', 'nature'],
    hero: { alt: 'Terraced olive groves in the Tramuntana', tone: tones.olive },
  },

  // ── Aboard ───────────────────────────────────────────────────────────────
  {
    id: 'dev_exp_bridge', category: 'private', title: 'A Visit to the Bridge',
    subtitle: 'Navigation with the Officer of the Watch',
    description: 'By invitation, on the sea day: charts, systems and the view from the bridge wings.',
    durationMinutes: 45, inclusive: true, privateAvailable: true, format: 'private', includes: ['Officer of the Watch', 'Bridge wings'], capacity: 4, tags: ['yachting', 'private'],
    hero: { alt: 'Bridge of a yacht at sea', tone: tones.dusk },
  },
  {
    id: 'dev_exp_marina', category: 'marina', portCallId: 'dev_pc_4', destination: 'Saint-Tropez',
    title: 'The Marina Platform',
    subtitle: 'Swim, paddleboard and kayak from the aft of the yacht',
    description: 'Weather permitting, the marina opens at anchor in the bay from 14:30.',
    durationMinutes: 150, inclusive: true, privateAvailable: false, format: 'shared', includes: ['Paddleboards, kayaks and snorkelling gear', 'Marina team in attendance'], tags: ['swimming', 'watersports', 'boat'],
    hero: { alt: 'Swimmers off the yacht’s marina platform', tone: tones.sea },
  },
  {
    id: 'dev_exp_jazz', category: 'entertainment', title: 'Jazz in the Observation Lounge',
    subtitle: 'A trio, an aged rum, and the wake behind you',
    description: 'Nightly from 21:30 on Deck 10.',
    inclusive: true, privateAvailable: false, format: 'shared', tags: ['music', 'evening'],
    hero: { alt: 'Lounge at night', tone: tones.night },
  },
  {
    id: 'dev_exp_monaco_atelier', category: 'shopping', portCallId: 'dev_pc_5', destination: 'Monte Carlo',
    title: 'Private Atelier Appointments',
    subtitle: 'Fine watchmaking and jewellery, by appointment',
    description: 'Your concierge arranges private viewings on Avenue des Beaux-Arts.',
    durationMinutes: 90, inclusive: true, privateAvailable: true, format: 'private', includes: ['Private viewings arranged by your concierge'], tags: ['shopping', 'private', 'occasion'],
    hero: { alt: 'Jewellery atelier', tone: tones.champagne },
  },

  // ── Transfers ────────────────────────────────────────────────────────────
  {
    id: 'dev_exp_transfer_bcn', category: 'transfer', portCallId: 'dev_pc_1', destination: 'Barcelona',
    title: 'Private Arrival Transfer',
    subtitle: 'El Prat → Sagrada Família → Port Vell',
    description: 'Met at arrivals by name; your car waits during your visit, and luggage goes directly to your suite.',
    durationMinutes: 210, inclusive: true, privateAvailable: true, format: 'private', includes: ['Meet and greet at arrivals', 'Luggage sent ahead to your suite'], tags: ['transfer'],
    hero: { alt: 'Chauffeured car', tone: tones.night },
  },
  {
    id: 'dev_exp_transfer_fco', category: 'transfer', portCallId: 'dev_pc_8', destination: 'Rome',
    title: 'Private Departure Transfer',
    subtitle: 'Civitavecchia → Fiumicino',
    description: 'From the gangway to your terminal, luggage handled throughout.',
    durationMinutes: 60, inclusive: true, privateAvailable: true, format: 'private', includes: ['Luggage handled from suite to terminal'], tags: ['transfer'],
    hero: { alt: 'Car on a coastal road', tone: tones.olive },
  },
  {
    id: 'dev_exp_helicopter', category: 'transfer', portCallId: 'dev_pc_5', destination: 'Monte Carlo',
    title: 'Helicopter Along the Coast',
    subtitle: 'Seven minutes from Monaco to Nice',
    description: 'Private charter from the Monaco Heliport, arranged around your plans.',
    durationMinutes: 15, inclusive: false, privateAvailable: true, format: 'private', includes: ['Private charter', 'Car to and from the heliport'],
    price: { amountMinor: 190000, currency: 'EUR' }, tags: ['private', 'transport'],
    hero: { alt: 'Helicopter over the coast', tone: tones.sea },
  },
];

export const collections: DevExperienceData['collections'] = [
  { id: 'dev_col_private', title: 'Privately Yours', standfirst: 'Arranged for the two of you alone.', category: 'private', experienceIds: ['dev_exp_classic_sail', 'dev_exp_riva_fruttuoso', 'dev_exp_oceanographic', 'dev_exp_villa_ephrussi', 'dev_exp_sagrada_private'] },
  { id: 'dev_col_table', title: 'At the Table', standfirst: 'Mediterranean kitchens, window tables, the Chef’s Counter.', category: 'dining', experienceIds: ['dev_exp_mediterraneo', 'dev_exp_chefs_counter', 'dev_exp_lumiere', 'dev_exp_giardino'] },
  { id: 'dev_col_wine', title: 'The Cellar & the Vine', standfirst: 'Great reds, aboard and ashore.', category: 'wine', experienceIds: ['dev_exp_wine_masterclass', 'dev_exp_mallorca_wine'] },
  { id: 'dev_col_wellness', title: 'Well, Rested', standfirst: 'Yoga at sunrise, a private coach, mountain air.', category: 'wellness', experienceIds: ['dev_exp_sunrise_yoga', 'dev_exp_private_coach', 'dev_exp_tramuntana_walk'] },
  { id: 'dev_col_spa', title: 'Stillness', standfirst: 'Deep-tissue, thalassotherapy and the couples terrace.', category: 'spa', experienceIds: ['dev_exp_deep_tissue', 'dev_exp_thalasso', 'dev_exp_couples_ritual'] },
  { id: 'dev_col_yachting', title: 'A Life at Sea', standfirst: 'Classic sail, the bridge, and the marina platform.', category: 'marina', experienceIds: ['dev_exp_classic_sail', 'dev_exp_bridge', 'dev_exp_marina', 'dev_exp_riva_fruttuoso'] },
  { id: 'dev_col_culture', title: 'Doors Opened Early', standfirst: 'Curators, architects and historians.', category: 'culture', experienceIds: ['dev_exp_sagrada_private', 'dev_exp_palma_seu', 'dev_exp_oceanographic', 'dev_exp_villa_ephrussi'] },
  { id: 'dev_col_evenings', title: 'After Dark', standfirst: 'A jazz trio and the wake behind you.', category: 'entertainment', experienceIds: ['dev_exp_jazz'] },
  { id: 'dev_col_shopping', title: 'By Appointment', standfirst: 'The maisons of Monaco, privately.', category: 'shopping', experienceIds: ['dev_exp_monaco_atelier'] },
  { id: 'dev_col_transport', title: 'Getting There, Beautifully', standfirst: 'Chauffeurs and helicopters.', category: 'transfer', experienceIds: ['dev_exp_transfer_bcn', 'dev_exp_transfer_fco', 'dev_exp_helicopter'] },
];

export const destinations: DevExperienceData['destinations'] = [
  { id: 'dev_dst_bcn', name: 'Barcelona', country: 'Spain', portCallId: 'dev_pc_1', standfirst: 'Gaudí, the Gothic Quarter, and the sea at the end of every street.', hero: { alt: 'Barcelona', tone: tones.terracotta } },
  { id: 'dev_dst_palma', name: 'Palma de Mallorca', country: 'Spain', portCallId: 'dev_pc_2', standfirst: 'A cathedral at the water’s edge, and vineyards beneath the Tramuntana.', hero: { alt: 'Palma', tone: tones.stone } },
  { id: 'dev_dst_tropez', name: 'Saint-Tropez', country: 'France', portCallId: 'dev_pc_4', standfirst: 'The bay where classic yachts still race each autumn.', hero: { alt: 'Saint-Tropez', tone: tones.sea } },
  { id: 'dev_dst_monaco', name: 'Monte Carlo', country: 'Monaco', portCallId: 'dev_pc_5', standfirst: 'Two days and a night in the Principality, and your anniversary.', hero: { alt: 'Monaco', tone: tones.dusk } },
  { id: 'dev_dst_portofino', name: 'Portofino', country: 'Italy', portCallId: 'dev_pc_7', standfirst: 'Pastel façades, a lighthouse path and an abbey reached only by sea.', hero: { alt: 'Portofino', tone: tones.olive } },
  { id: 'dev_dst_rome', name: 'Rome', country: 'Italy', portCallId: 'dev_pc_8', standfirst: 'Where the voyage ends, and the journey home begins.', hero: { alt: 'Rome', tone: tones.terracotta } },
];
