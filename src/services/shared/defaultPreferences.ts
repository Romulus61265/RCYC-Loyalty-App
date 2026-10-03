/**
 * Neutral preferences for a guest with nothing on file yet. Saved groups
 * always win (see mergePreferences); these only fill groups never saved.
 * Privacy defaults are conservative: nothing is shared until the guest says so.
 */
import type { GuestPreferences, ID } from '@/domain';

export function defaultPreferences(guestId: ID): GuestPreferences {
  return {
    guestId,
    preferredDestinations: [],
    dining: { cuisines: [] },
    dietary: { restrictions: [], allergies: [] },
    beverage: { wine: [], spirits: [], nonAlcoholic: [] },
    suite: {},
    activityInterests: [],
    excursions: { style: 'any', pace: 'moderate' },
    spa: { favouriteTreatments: [] },
    transportation: { arrivals: 'private-car', helicopterWelcome: false },
    accessibility: { mobility: 'none', tenderAssistance: false, hearingSupport: false, visualSupport: false, shareWithCrew: false },
    communication: { channels: { push: true, email: true, sms: false, whatsapp: false }, language: 'en-US', marketingConsent: false },
    privacy: { personalisedRecommendations: true, shareOccasionsWithCrew: false, shareDietaryWithPartners: false, analytics: false },
  };
}
