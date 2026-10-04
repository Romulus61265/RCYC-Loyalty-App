/**
 * The presenter's script for the executive demonstration (DEMO_MODE=executive,
 * docs/23). Fifteen steps, each showing one thing, in the order a senior
 * audience is walked through it. The data behind every step is fixed
 * (src/data/fixtures/executiveDemo.ts), so the story is the same every time.
 */
import type { DemoStep } from '@/services/contracts';
import { EXECUTIVE_DEMO_VINEYARD } from '@/data/fixtures/executiveDemo';

const PALMA = `/port/${EXECUTIVE_DEMO_VINEYARD.portCallId}`;

export const EXECUTIVE_DEMO_SCRIPT: DemoStep[] = [
  { n: 1, title: 'Open Home', route: '/', cue: 'Embarkation morning. Alexander Laurent and his wife Camille are in the air to Barcelona.' },
  { n: 2, title: 'Titanium recognition', route: '/', cue: 'The Marriott Bonvoy Titanium Elite card: their fourth voyage, Lifetime Platinum, seven privileges. Recognised before they arrive.' },
  { n: 3, title: 'The upcoming voyage', route: '/', cue: 'Balearics & the Riviera aboard Evrima, 15–22 May: today, Barcelona.' },
  { n: 4, title: 'The Grand Suite', route: '/', cue: 'Grand Suite 612 on Deck 6, with Elena Moreau as their Suite Ambassador.' },
  { n: 5, title: 'A personalised recommendation', route: '/', cue: '“Chosen for you”: each suggestion says why, drawn from their past voyages (a Barolo they loved, the helm off Hvar).' },
  { n: 6, title: 'Open Voyage', route: '/voyage', cue: 'Everything about the voyage in one place: suite, embarkation, dining, spa, documents.' },
  { n: 7, title: 'The itinerary', route: '/voyage?section=itinerary', cue: 'Eight days, port by port: times, what is booked, and what has been chosen for them.' },
  { n: 8, title: 'Open Mallorca', route: PALMA, cue: 'Day 2, Palma de Mallorca: the day in full.' },
  { n: 9, title: 'The private vineyard', route: PALMA, cue: 'Binissalem vineyards, privately, with the reason it was chosen: the Barolo vertical in 2023. One tap passes it to the concierge.' },
  { n: 10, title: 'Open Concierge', route: '/concierge', cue: 'A digital concierge, with Elena a tap away.' },
  { n: 11, title: 'Ask about the anniversary', route: '/concierge', cue: 'Tap “Help me celebrate my anniversary.”' },
  { n: 12, title: 'Curated options', route: '/concierge', cue: 'What is already in place for the 20th in Monte Carlo, a few more ideas, and a surprise kept for Camille: offered, never booked, until they choose.' },
  { n: 13, title: 'The inbound flight is delayed', action: 'inbound-delay', cue: 'Report AA 7412 two hours late (simulated: no flight-data service is connected).' },
  { n: 14, title: 'Travel arrangements adjust themselves', route: '/arrival', cue: 'The transfer re-timed, the driver following the flight, the embarkation team told, the arrival window moved, without the guest asking.' },
  { n: 15, title: 'Service continuity', route: '/concierge', cue: 'Elena writes to them herself, unprompted: the new landing time, the driver at 12:00, the Sagrada Família moved to after they land. Nothing for them to do.' },
];
