/**
 * Data access for Discover: the only place it touches services.
 * Catalogue, destinations, voyage and profile are required; availability,
 * bookings and recommendations each degrade on their own.
 */
import { useCallback, useState } from 'react';
import { toAppError } from '@/core/errors';
import { settle } from '@/features/shared/status';
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServices } from '@/services/ServiceProvider';
import { buildDiscoverModel, type ExperienceCardModel } from './discoverModel';

export function useDiscover() {
  const services = useServices();
  const { guestId, reservationId, voyageId } = useJourney();

  const state = useAsync(async () => {
    const now = services.clock.now();
    const s = <T,>(call: () => Promise<T>) => settle(call, toAppError);
    const [core, availability, bookings, recommendations] = await Promise.all([
      Promise.all([
        services.voyage.getOverview(reservationId),
        services.profile.getProfile(guestId),
        services.experience.listCatalogue(voyageId),
        services.experience.listDestinations(voyageId),
      ]),
      s(() => services.experience.listAvailability(voyageId)),
      s(() => services.experience.listBookings(reservationId)),
      s(() => services.personalization.getRecommendations(guestId, 'discover', { reservationId, limit: 100 })),
    ]);
    const [overview, profile, catalogue, destinations] = core;
    return buildDiscoverModel({ overview, profile, catalogue, destinations }, { availability, bookings, recommendations }, now);
  }, [guestId, reservationId, voyageId]);
  useRefreshOnFocus(state.reload);

  // Saved for later, this session. Saving tells personalization the guest is interested.
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const toggleSave = useCallback(
    (card: ExperienceCardModel) => {
      const on = !saved.has(card.id);
      setSaved((s) => {
        const next = new Set(s);
        if (on) next.add(card.id);
        else next.delete(card.id);
        return next;
      });
      services.analytics.track('experience_saved', { experience_id: card.id, category: card.category, saved: on ? 'yes' : 'no' });
      if (on) void services.personalization.recordFeedback(guestId, card.id, 'saved').catch(() => undefined);
    },
    [saved, services, guestId],
  );
  const viewed = useCallback((card: ExperienceCardModel) => services.analytics.track('experience_viewed', { experience_id: card.id, category: card.category, surface: 'discover' }), [services]);
  const requested = useCallback(
    (card: ExperienceCardModel) => {
      if (card.recommendation) services.analytics.track('recommendation_accepted', { recommendation_id: card.recommendation.id, surface: 'discover', action: 'request' });
    },
    [services],
  );
  return { ...state, saved, toggleSave, viewed, requested };
}
