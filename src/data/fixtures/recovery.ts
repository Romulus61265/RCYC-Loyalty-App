/**
 * FICTIONAL service recovery data: the goodwill rules an authorised person
 * has approved (and one still in draft), and the disruption the
 * `?demo=disruption` mock shows. Rules are business configuration: the engine
 * only matches them and proposes; people decide.
 */
import type { Disruption, GoodwillRule } from '../../../supabase/functions/_shared/recovery/types';
import { IDS } from './ids';

const AUTHORISED = { authorizedBy: 'Director of Guest Experience (fictional)', authorizedAt: '2026-09-01T10:00:00+02:00', effectiveFrom: '2026-09-01T00:00:00+02:00' };

export const goodwillRules: GoodwillRule[] = [
  {
    id: 'dev_gw_private_lost_gesture', version: 1, status: 'approved', name: 'A private experience lost',
    appliesTo: ['excursion-cancellation', 'weather-disruption', 'dining-cancellation'], minSeverity: 'high', conditions: { privateOrPaid: true },
    action: { kind: 'gesture', description: 'A handwritten note from the Captain, with a bottle from the sommelier’s reserve in the suite' },
    approval: { role: 'suite_ambassador', maxPerReservation: 1 }, ...AUTHORISED,
  },
  {
    id: 'dev_gw_occasion_amenity', version: 1, status: 'approved', name: 'A disruption on a celebration day',
    appliesTo: ['transfer-delay', 'dining-cancellation', 'excursion-cancellation', 'suite-issue', 'port-change', 'weather-disruption', 'missed-service', 'guest-complaint'],
    minSeverity: 'moderate', conditions: { occasionDay: true },
    action: { kind: 'amenity', description: 'Flowers and a celebration amenity in the suite, chosen by the Suite Ambassador' },
    approval: { role: 'suite_ambassador', maxPerReservation: 1 }, ...AUTHORISED,
  },
  {
    id: 'dev_gw_complaint_visit', version: 1, status: 'approved', name: 'A guest who is unhappy',
    appliesTo: ['guest-complaint'], minSeverity: 'high',
    action: { kind: 'gesture', description: 'A personal visit from the Hotel Director' },
    approval: { role: 'concierge_agent', maxPerReservation: 2 }, ...AUTHORISED,
  },
  {
    // Financial, and only a draft: never proposed (and the MVP policy keeps financial goodwill off regardless).
    id: 'dev_gw_repeat_service_credit', version: 1, status: 'draft', name: 'Repeated disruption on one voyage',
    appliesTo: ['transfer-delay', 'dining-cancellation', 'excursion-cancellation', 'suite-issue', 'missed-service', 'guest-complaint'],
    minSeverity: 'high', conditions: { minRecoveries: 3 },
    action: { kind: 'service-credit', description: 'An onboard credit', maxValue: { amountMinor: 50000, currency: 'EUR' } },
    approval: { role: 'admin', maxPerReservation: 1 },
  },
];

/** The demo: the classic sail in Saint-Tropez cancelled for a forecast mistral. */
export const demoDisruption: Disruption = {
  key: 'event:dev_evt_classic_sail_mistral',
  kind: 'excursion-cancellation',
  reservationId: IDS.reservation,
  guestIds: [IDS.guest, IDS.companion],
  occurredAt: '2027-05-11T08:30:00-04:00',
  source: 'journey-event',
  cause: 'weather',
  subject: { bookingId: 'dev_bkg_classic_sail' },
  reason: {
    guest: 'A strong mistral is forecast across the Bay of Saint-Tropez that morning, and the skipper will not take guests out in it.',
    internal: 'Skipper cancelled for forecast gusts of 35 knots (forecast issued 10 May, 18:00). Supplier to confirm no charge.',
  },
};

export const recoveryData = { goodwillRules, demoDisruption };
