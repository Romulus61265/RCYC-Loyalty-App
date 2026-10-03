/**
 * DEVELOPMENT DATASET — FICTIONAL.
 *
 * Only mock services may import this module (enforced by ESLint). It is never
 * sent to, or read from, a production API. See README.md in this folder.
 */
import type { DevDataset } from './types';
import { bookings, daySchedules } from './bookings';
import { availability } from './availability';
import { catalogue, collections, destinations } from './catalogue';
import { communicationData } from './communication';
import { conciergeData } from './concierge';
import { guestData } from './guest';
import { personalizationData } from './personalization';
import { recoveryData } from './recovery';
import { postVoyageData } from './postVoyage';
import { voyageData } from './voyage';

export const devDataset: DevDataset = {
  meta: {
    datasetId: 'dev-laurent-evrima-2027-05',
    description: 'Alexander & Camille Laurent, Grand Suite on Evrima, Barcelona → Rome, 15–22 May 2027.',
    fictional: true,
    allowedConsumers: 'mock-services-only',
    referenceNow: '2027-05-11T09:00:00-04:00',
    disclaimer:
      'Fictional development data. People, crew, bookings, flight numbers, prices and privileges are invented; ' +
      'they are not real Marriott Bonvoy benefits or operator information.',
  },
  guest: guestData,
  voyage: voyageData,
  experiences: { catalogue, bookings, daySchedules, collections, destinations, availability },
  concierge: conciergeData,
  communication: communicationData,
  personalization: personalizationData,
  recovery: recoveryData,
  postVoyage: postVoyageData,
};

export type { DevDataset } from './types';
export { IDS } from './ids';
