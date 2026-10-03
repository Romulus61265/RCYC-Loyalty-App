/**
 * GuestProfileService composed from two sources:
 *   - a GuestRecordSource for the guest record, companions and occasions
 *     (mastered by CRM; mock in the MVP), which also supplies defaults;
 *   - a PreferencesRepository for what the guest edits (device or Supabase).
 *
 * The UI depends on GuestProfileService only.
 */
import type { GuestPreferences, GuestProfile, ID, PreferencesPatch, SpecialOccasion, TravelCompanion, VersionedPreferences } from '@/domain';
import type { GuestProfileService } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { mergePreferences, type PreferencesRepository } from '@/services/repositories/PreferencesRepository';

export interface GuestRecordSource {
  getProfile(guestId: ID): Promise<GuestProfile>;
  listCompanions(guestId: ID): Promise<TravelCompanion[]>;
  listOccasions(guestId: ID): Promise<SpecialOccasion[]>;
}

const NOTE_MAX = 400;

/** Server-style validation: the UI validates too, but this is the gate. */
export function validatePatch(patch: PreferencesPatch): string[] {
  const issues: string[] = [];
  const t = patch.suite?.temperatureCelsius;
  if (t !== undefined && (t < 16 || t > 28)) issues.push('Suite temperature must be between 16 and 28 °C.');
  const notes = [patch.dining?.notes, patch.spa?.notes, patch.excursions?.notes, patch.transportation?.notes, patch.accessibility?.notes, patch.beverage?.welcomeAmenity];
  if (notes.some((n) => (n?.length ?? 0) > NOTE_MAX)) issues.push(`Notes are limited to ${NOTE_MAX} characters.`);
  if (patch.dietary?.allergies.some((a) => !a.allergen.trim())) issues.push('Each allergy needs a name.');
  const qh = patch.communication?.quietHours;
  if (qh && (!/^\d{2}:\d{2}$/.test(qh.start) || !/^\d{2}:\d{2}$/.test(qh.end))) issues.push('Quiet hours must be times like 22:30.');
  return issues;
}

export class RepositoryGuestProfileService implements GuestProfileService {
  constructor(
    private readonly source: GuestRecordSource,
    private readonly repository: PreferencesRepository,
  ) {}

  private async defaults(guestId: ID): Promise<GuestPreferences> {
    return (await this.source.getProfile(guestId)).preferences;
  }

  async getPreferences(guestId: ID): Promise<VersionedPreferences> {
    const [defaults, saved] = await Promise.all([this.defaults(guestId), this.repository.load(guestId)]);
    if (!saved) return { preferences: defaults, version: 0, updatedAt: null, source: 'seed' };
    return { ...saved, preferences: mergePreferences(defaults, saved.preferences) };
  }

  async getProfile(guestId: ID): Promise<GuestProfile> {
    const [profile, prefs] = await Promise.all([this.source.getProfile(guestId), this.getPreferences(guestId)]);
    return { ...profile, preferences: prefs.preferences };
  }

  async updatePreferences(guestId: ID, patch: PreferencesPatch, opts?: { expectedVersion?: number }): Promise<VersionedPreferences> {
    const issues = validatePatch(patch);
    if (issues.length) throw new ServiceError('validation', issues.join(' '));
    const defaults = await this.defaults(guestId);
    const saved = await this.repository.save(guestId, defaults, patch, opts?.expectedVersion);
    return { ...saved, preferences: mergePreferences(defaults, saved.preferences) };
  }

  listCompanions(guestId: ID) {
    return this.source.listCompanions(guestId);
  }

  listOccasions(guestId: ID) {
    return this.source.listOccasions(guestId);
  }
}
