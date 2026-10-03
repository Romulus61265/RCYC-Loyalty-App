/**
 * Guest record and loyalty projection from Supabase.
 *
 * Both are read-only to the guest: CRM and Marriott Bonvoy are the systems of
 * record and sync into these tables server-side. Edits to preferences go
 * through SupabasePreferencesRepository.
 */
import type { GuestPrivilege, GuestProfile, GuestRelationship, ID, LoyaltyMembership, LoyaltyRecognition } from '@/domain';
import type { LoyaltyService } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import type { GuestRecordSource } from '@/services/profile/RepositoryGuestProfileService';
import { defaultPreferences } from '@/services/shared/defaultPreferences';
import { buildRecognition, privilegesFor } from '@/services/shared/recognition';
import {
  COMPANION_COLUMNS,
  GUEST_COLUMNS,
  MEMBERSHIP_COLUMNS,
  OCCASION_COLUMNS,
  toCompanion,
  toGuest,
  toMembership,
  toOccasion,
  toPrivilege,
  type CompanionRow,
  type GuestRow,
  type MembershipRow,
  type OccasionRow,
  type PrivilegeRow,
} from './rows';
import { compact, many, maybe, one, opt, uuid, type SupabaseDeps } from './support';

export class SupabaseGuestRecordSource implements GuestRecordSource {
  constructor(private readonly deps: SupabaseDeps) {}

  async getProfile(guestId: ID): Promise<GuestProfile> {
    const id = uuid(guestId, 'Guest');
    const db = this.deps.db();
    const [row, details, companions, occasions] = await Promise.all([
      one<GuestRow>(db.from('guests').select(GUEST_COLUMNS).eq('id', id).maybeSingle(), 'Guest', id),
      many<{ nationality: string | null }>(db.rpc('my_personal_details')),
      this.listCompanions(id),
      this.listOccasions(id),
    ]);
    return { guest: toGuest(row, details[0]?.nationality), preferences: defaultPreferences(id), companions, occasions };
  }

  async listCompanions(guestId: ID) {
    const rows = await many<CompanionRow>(this.deps.db().from('travel_companions').select(COMPANION_COLUMNS).eq('guest_id', uuid(guestId, 'Guest')).order('last_name').order('first_name'));
    return rows.map(toCompanion);
  }

  async listOccasions(guestId: ID) {
    const rows = await many<OccasionRow>(this.deps.db().from('guest_occasions').select(OCCASION_COLUMNS).eq('guest_id', uuid(guestId, 'Guest')).order('occasion_date'));
    return rows.map(toOccasion);
  }
}

interface RelationshipRow {
  guest_id: string;
  voyages_completed: number;
  nights_sailed: number;
  first_voyage_date: string | null;
  yachts_sailed: string[] | null;
  ambassador_name: string | null;
}

export class SupabaseLoyaltyService implements LoyaltyService {
  constructor(private readonly deps: SupabaseDeps) {}

  async getMembership(guestId: ID): Promise<LoyaltyMembership | null> {
    const row = await maybe<MembershipRow>(this.deps.db().from('loyalty_memberships').select(MEMBERSHIP_COLUMNS).eq('guest_id', uuid(guestId, 'Guest')).maybeSingle());
    return row ? toMembership(row) : null;
  }

  /** Through `my_relationship()`: the guest never sees internal segmentation. */
  async getRelationship(guestId: ID): Promise<GuestRelationship> {
    const id = uuid(guestId, 'Guest');
    const rows = await many<RelationshipRow>(this.deps.db().rpc('my_relationship'));
    const r = rows.find((x) => x.guest_id === id);
    if (!r) return { guestId: id, voyagesCompleted: 0, nightsSailed: 0, firstVoyageDate: '', yachtsSailed: [] };
    return compact({
      guestId: r.guest_id,
      voyagesCompleted: r.voyages_completed,
      nightsSailed: r.nights_sailed,
      firstVoyageDate: r.first_voyage_date ?? '',
      yachtsSailed: r.yachts_sailed ?? [],
      ambassadorName: opt(r.ambassador_name),
    });
  }

  async getPrivileges(guestId: ID, voyageId?: ID): Promise<GuestPrivilege[]> {
    const rows = await many<PrivilegeRow>(
      this.deps
        .db()
        .from('guest_privileges')
        .select('voyage_id, privilege:privileges(id, title, description, category, basis)')
        .eq('guest_id', uuid(guestId, 'Guest'))
        .order('sort_order'),
    );
    return privilegesFor(
      rows.map(toPrivilege).filter((p): p is GuestPrivilege => p !== null),
      voyageId,
    );
  }

  async getRecognition(guestId: ID, voyageId?: ID): Promise<LoyaltyRecognition> {
    const [membership, relationship, privileges] = await Promise.all([this.getMembership(guestId), this.getRelationship(guestId), this.getPrivileges(guestId, voyageId)]);
    if (!membership) throw new ServiceError('not_found', 'No loyalty membership linked');
    return buildRecognition(membership, relationship, privileges);
  }

  /**
   * Linking needs the Bonvoy OAuth exchange, which holds a client secret and
   * so can only run server-side (BFF / Edge Function). Not connected yet.
   */
  async linkMembership(_guestId: ID, _authorizationCode: string): Promise<LoyaltyMembership> {
    throw new ServiceError('unavailable', 'Marriott Bonvoy linking is not connected in this environment');
  }
}
