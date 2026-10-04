/**
 * EXECUTIVE DEMO: the development dataset, prepared for a presentation.
 * FICTIONAL, like everything in this folder.
 *
 * The story runs on embarkation morning (15 May 2027, 07:30 in Barcelona), with
 * Alexander and Camille in the air on AA 7412. It differs from the development
 * dataset in three ways, so that each step of the presenter's script
 * (docs/23-demo-mode.md) shows exactly one thing:
 *   • the Binissalem vineyard day in Mallorca is not booked yet: it is the
 *     private recommendation shown at Palma, with its reason;
 *   • the paperwork is done: no overdue questionnaire competes for attention;
 *   • nothing is late yet: the presenter reports the inbound flight delay
 *     when the story reaches it.
 *
 * It is derived from the development dataset (never edited by hand), so the
 * two cannot drift apart. Mock services copy what they read, so a reset is
 * simply a new set of services.
 */
import type { DevDataset } from './types';

const VINEYARD_BOOKING = 'dev_bkg_mallorca_wine';
const HEALTH_DOCUMENT = 'dev_doc_3';
const HEALTH_ALERT = 'dev_alr_health';

export const EXECUTIVE_DEMO_DATASET_ID = 'dev-laurent-evrima-2027-05-executive';

/** Embarkation morning in Barcelona, AA 7412 in the air: where the executive demo starts. */
export const EXECUTIVE_DEMO_NOW = '2027-05-15T07:30:00+02:00';

/** The private vineyard recommendation the script opens at Palma. */
export const EXECUTIVE_DEMO_VINEYARD = {
  recommendationId: 'dev_rec_vineyard',
  experienceId: 'dev_exp_mallorca_wine',
  portCallId: 'dev_pc_2',
} as const;

export function executiveDemoDataset(base: DevDataset): DevDataset {
  const { experiences, voyage, communication, personalization } = base;
  return {
    ...base,
    meta: {
      ...base.meta,
      datasetId: EXECUTIVE_DEMO_DATASET_ID,
      description: `${base.meta.description} Executive demonstration: embarkation morning, presenter-led.`,
      referenceNow: EXECUTIVE_DEMO_NOW,
    },
    experiences: {
      ...experiences,
      bookings: experiences.bookings.filter((b) => b.id !== VINEYARD_BOOKING),
      daySchedules: experiences.daySchedules.map((d) => ({ ...d, items: d.items.filter((i) => i.bookingId !== VINEYARD_BOOKING) })),
    },
    voyage: {
      ...voyage,
      reservation: { ...voyage.reservation, status: 'confirmed' },
      embarkation: { ...voyage.embarkation, checkInStatus: 'complete' },
      documents: voyage.documents.map((d) => (d.id === HEALTH_DOCUMENT ? { ...d, status: 'verified', detail: 'Received 12 May', dueBy: undefined } : d)),
    },
    communication: { ...communication, alerts: communication.alerts.filter((a) => a.id !== HEALTH_ALERT) },
    personalization: {
      ...personalization,
      recommendations: [
        {
          id: EXECUTIVE_DEMO_VINEYARD.recommendationId,
          surface: 'voyage',
          kind: 'experience',
          experienceId: EXECUTIVE_DEMO_VINEYARD.experienceId,
          category: 'wine',
          title: 'Binissalem vineyards, privately',
          rationale: 'Mantonegro reds with the winemaker himself: you loved the Barolo vertical aboard Evrima in 2023.',
          score: 0.93,
          drivers: ['dining-history', 'future-itinerary'],
          audience: 'guest',
        },
        ...personalization.recommendations,
      ],
    },
  };
}
