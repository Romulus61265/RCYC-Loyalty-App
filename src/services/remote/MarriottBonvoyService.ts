/**
 * Future production implementation of `LoyaltyService`.
 *
 * The Bonvoy partner API is called server-side by the `loyalty` Edge
 * Function, which holds the OAuth client credentials, maps Bonvoy DTOs to
 * our domain types and applies field-level PII minimisation. This class is
 * a thin, typed client of that BFF route — the UI never knows the difference
 * between it and `MockLoyaltyService`.
 */
import type { GuestPrivilege, GuestRelationship, ID, LoyaltyMembership, LoyaltyRecognition } from '@/domain';
import type { LoyaltyService } from '@/services/contracts';
import type { ApiClient } from './apiClient';

export class MarriottBonvoyService implements LoyaltyService {
  constructor(private readonly api: ApiClient) {}

  getMembership(guestId: ID) {
    return this.api.get<LoyaltyMembership | null>(`/loyalty/${guestId}/membership`);
  }
  getRelationship(guestId: ID) {
    return this.api.get<GuestRelationship>(`/loyalty/${guestId}/relationship`);
  }
  getPrivileges(guestId: ID, voyageId?: ID) {
    const q = voyageId ? `?voyageId=${encodeURIComponent(voyageId)}` : '';
    return this.api.get<GuestPrivilege[]>(`/loyalty/${guestId}/privileges${q}`);
  }
  getRecognition(guestId: ID, voyageId?: ID) {
    const q = voyageId ? `?voyageId=${encodeURIComponent(voyageId)}` : '';
    return this.api.get<LoyaltyRecognition>(`/loyalty/${guestId}/recognition${q}`);
  }
  linkMembership(guestId: ID, authorizationCode: string) {
    return this.api.post<LoyaltyMembership>(`/loyalty/${guestId}/link`, { authorizationCode });
  }
}
