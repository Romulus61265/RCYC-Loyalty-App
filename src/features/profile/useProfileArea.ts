/**
 * Data access for Profile: loading, and saving one preference group at a
 * time with validation and optimistic concurrency. The only place Profile
 * touches services — which repository persists the data is invisible here.
 */
import { useCallback } from 'react';
import { reportError, toAppError, type AppError } from '@/core/errors';
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useServices } from '@/services/ServiceProvider';
import { buildProfileModel } from './profileModel';
import { groupByKey, validateForm, type FormValues, type GroupKey } from './preferenceSchema';

export type SaveResult = { ok: true } | { ok: false; fieldErrors?: Record<string, string>; error?: AppError };

export function useProfileArea() {
  const services = useServices();
  const { guestId, reservationId } = useJourney();

  const state = useAsync(async () => {
    const [profile, versioned, recognition, overview, pastVoyages] = await Promise.all([
      services.profile.getProfile(guestId),
      services.profile.getPreferences(guestId),
      services.loyalty.getRecognition(guestId),
      services.voyage.getOverview(reservationId),
      services.voyage.getPastVoyages(guestId),
    ]);
    return { versioned, model: buildProfileModel({ profile, versioned, recognition, overview, pastVoyages, now: services.clock.now() }) };
  }, [guestId, reservationId]);

  const { data, reload } = state;

  const save = useCallback(
    async (key: GroupKey, values: FormValues): Promise<SaveResult> => {
      if (!data) return { ok: false };
      const group = groupByKey(key);
      const current = data.versioned.preferences;
      const fieldErrors = validateForm(group, current, values);
      if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
      try {
        await services.profile.updatePreferences(guestId, group.write(current, values), { expectedVersion: data.versioned.version });
        services.audit.record({ action: 'preferences.update', resource: 'guest_preferences', resourceId: guestId, outcome: 'success', metadata: { group: key } });
        reload();
        return { ok: true };
      } catch (e) {
        const error = toAppError(e);
        reportError(error, { source: 'profile.save', group: key });
        services.audit.record({ action: 'preferences.update', resource: 'guest_preferences', resourceId: guestId, outcome: 'failure', metadata: { group: key, code: error.code } });
        // Someone saved elsewhere: fetch the latest so the guest edits current data.
        if (error.code === 'conflict') reload();
        return { ok: false, error };
      }
    },
    [data, services, guestId, reload],
  );

  const requestData = useCallback(
    async (kind: 'copy' | 'erasure') => {
      try {
        await services.concierge.createServiceRequest(reservationId, {
          type: 'general',
          summary: kind === 'copy' ? 'Request a copy of my personal data' : 'Request deletion of my personal data',
          details: 'Raised from Profile › Privacy. To be handled by the privacy team within statutory timelines.',
          priority: 'priority',
        });
        services.audit.record({ action: `privacy.${kind}-request`, resource: 'guest', resourceId: guestId, outcome: 'success' });
        return true;
      } catch (e) {
        reportError(e, { source: 'profile.requestData' });
        return false;
      }
    },
    [services, reservationId, guestId],
  );

  return { ...state, model: data?.model, preferences: data?.versioned.preferences, save, requestData };
}
