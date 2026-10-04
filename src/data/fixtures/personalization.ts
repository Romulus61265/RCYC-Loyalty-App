/**
 * FICTIONAL personalization inputs (signals about the guest) and the
 * resulting recommendations. Crew-audience items never reach the guest app.
 * What the guest did on past voyages lives in voyageHistory.ts and reaches
 * the engine as history from there.
 */
import type { DevPersonalizationData } from './types';
import { IDS } from './ids';

const G = IDS.guest;
const V = IDS.pastVoyages;

export const personalizationData: DevPersonalizationData = {
  signals: [
    { id: 'dev_sig_01', guestId: G, kind: 'bonvoy-status', summary: 'Marriott Bonvoy Titanium Elite; Lifetime Platinum', weight: 0.6, observedAt: '2027-05-01T00:00:00Z', source: 'bonvoy', tags: ['titanium'] },
    { id: 'dev_sig_02', guestId: G, kind: 'voyage-history', summary: 'Three voyages, 24 nights, since December 2023', weight: 0.7, observedAt: '2025-06-24T12:00:00Z', source: 'reservations', tags: ['returning'] },
    { id: 'dev_sig_10', guestId: G, kind: 'suite-preference', summary: 'Feather-free pillows requested on all three voyages', weight: 0.9, observedAt: '2025-06-14T15:00:00Z', source: 'crm', tags: ['bedding', 'feather-free'] },
    { id: 'dev_sig_11', guestId: G, kind: 'destinations-visited', summary: 'Grenadines, St Barths, Dubrovnik, Hvar, Venice, Mykonos, Santorini, Milos', weight: 0.5, observedAt: '2025-06-24T12:00:00Z', source: 'reservations', tags: ['caribbean', 'adriatic', 'aegean'] },
    { id: 'dev_sig_12', guestId: G, kind: 'future-itinerary', summary: 'First visit to Palma, Saint-Tropez, Monaco and Portofino', voyageId: IDS.voyage, weight: 0.7, observedAt: '2027-02-10T12:00:00Z', source: 'reservations', tags: ['first-visit', 'riviera'] },
    { id: 'dev_sig_13', guestId: G, kind: 'travel-companions', summary: 'Sailing with Camille, who enjoys gardens and art', weight: 0.6, observedAt: '2027-02-10T12:00:00Z', source: 'crm', tags: ['couple', 'gardens', 'art'] },
    { id: 'dev_sig_14', guestId: G, kind: 'special-occasion', summary: '20th wedding anniversary on 20 May, in Monte Carlo (discreet)', voyageId: IDS.voyage, weight: 1, observedAt: '2027-04-26T19:02:00Z', source: 'concierge', tags: ['anniversary', 'discreet'] },
    { id: 'dev_sig_15', guestId: G, kind: 'lifetime-value', summary: 'Value segment: distinguished (internal)', weight: 0.6, observedAt: '2027-01-01T00:00:00Z', source: 'crm', tags: ['internal'] },
    { id: 'dev_sig_16', guestId: G, kind: 'feedback', summary: 'Post-voyage NPS 9 — "Exceptional crew; embarkation in Piraeus was slow"', voyageId: V.greekIsles, rating: 4, weight: 0.6, observedAt: '2025-06-30T14:00:00Z', source: 'survey', tags: ['nps-9'] },
    { id: 'dev_sig_17', guestId: G, kind: 'service-recovery', summary: 'Luggage delivered 90 minutes late at Piraeus embarkation; apology and amenity given', voyageId: V.greekIsles, weight: 0.8, observedAt: '2025-06-14T17:30:00Z', source: 'concierge', tags: ['luggage', 'embarkation', 'resolved'] },
  ],

  recommendations: [
    {
      id: 'dev_rec_bridge', surface: 'home', kind: 'experience', experienceId: 'dev_exp_bridge', category: 'private',
      title: 'A visit to the bridge on the sea day',
      rationale: 'You took the helm off Hvar. The Captain would be glad to show you Evrima’s bridge.',
      score: 0.95, drivers: ['excursion-history', 'future-itinerary'], audience: 'guest',
    },
    {
      id: 'dev_rec_masterclass', surface: 'home', kind: 'experience', experienceId: 'dev_exp_wine_masterclass', category: 'wine',
      title: 'Barolo & Saint-Émilion, side by side',
      rationale: 'You loved the Barolo vertical aboard Evrima in 2023.',
      score: 0.91, drivers: ['dining-history', 'future-itinerary'], audience: 'guest',
    },
    {
      id: 'dev_rec_atelier', surface: 'home', kind: 'experience', experienceId: 'dev_exp_monaco_atelier', category: 'shopping',
      title: 'Private atelier appointments in Monaco',
      rationale: 'Should you wish to mark the twentieth: a quiet hour on Avenue des Beaux-Arts.',
      score: 0.84, drivers: ['special-occasion', 'travel-companions'], audience: 'guest',
    },
    {
      id: 'dev_rec_seu', surface: 'discover', kind: 'experience', experienceId: 'dev_exp_palma_seu', category: 'culture',
      title: 'La Seu with a historian',
      rationale: 'Like your early morning in the Doge’s Palace: private, and before the crowds.',
      score: 0.8, drivers: ['excursion-history'], audience: 'guest',
    },
    {
      id: 'dev_rec_lighthouse', surface: 'discover', kind: 'experience', experienceId: 'dev_exp_lighthouse_walk', category: 'excursion',
      title: 'The lighthouse path at golden hour',
      rationale: 'A gentle walk after San Fruttuoso; private on request.',
      score: 0.72, drivers: ['future-itinerary', 'travel-companions'], audience: 'guest',
    },
    // ── Crew-only service opportunities ──
    {
      id: 'dev_rec_crew_luggage', surface: 'crew-console', kind: 'service-gesture',
      title: 'Walk luggage to Grand Suite 612 personally at embarkation',
      rationale: 'Luggage was 90 minutes late at Piraeus in 2025. Make this arrival seamless.',
      score: 0.93, drivers: ['service-recovery', 'feedback'], audience: 'crew',
    },
    {
      id: 'dev_rec_crew_private', surface: 'crew-console', kind: 'service-gesture',
      title: 'Offer private alternatives to any group activity',
      rationale: 'Rated a small-group tour 2/5 ("felt crowded"). Prefers private guides.',
      score: 0.88, drivers: ['excursion-history', 'feedback'], audience: 'crew',
    },
    {
      id: 'dev_rec_crew_amenity', surface: 'crew-console', kind: 'service-gesture',
      title: 'Decant the Brunello on arrival; sparkling water with lemon, no ice',
      rationale: 'Standing preferences across all three voyages.',
      score: 0.82, drivers: ['suite-preference', 'dining-history'], audience: 'crew',
    },
  ],
};
