// Service request rules shared by the app and the Edge Functions: the five
// guest-facing statuses, the timeline, and routing to a team. Self-contained
// (structural types, no imports) so both runtimes use the same rules.

export type RequestStatus = 'received' | 'in_progress' | 'awaiting_guest' | 'confirmed' | 'completed' | 'declined' | 'cancelled';
export type GuestRequestStatus = 'submitted' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';
export type Team = 'shoreside-concierge' | 'suite-ambassador' | 'guest-services' | 'medical' | 'destination-services';
export type Category = 'suite' | 'dining' | 'housekeeping' | 'maintenance' | 'transportation' | 'excursion' | 'spa' | 'concierge' | 'special-assistance' | 'other';
export type RequestType = 'dining-change' | 'transport' | 'occasion' | 'suite' | 'excursion' | 'medical' | 'general';

export interface RequestStamps {
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  startedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
}

export const TEAM_LABEL: Record<Team, string> = {
  'shoreside-concierge': 'Shoreside Concierge',
  'suite-ambassador': 'Suite Ambassador',
  'guest-services': 'Guest Services',
  medical: 'Medical Centre',
  'destination-services': 'Destination Services',
};

const CATEGORY_OF_TYPE: Record<RequestType, Category> = {
  'dining-change': 'dining',
  transport: 'transportation',
  occasion: 'concierge',
  suite: 'suite',
  excursion: 'excursion',
  medical: 'special-assistance',
  general: 'concierge',
};

export function categoryFromType(type: string): Category {
  return CATEGORY_OF_TYPE[type as RequestType] ?? 'other';
}

/** Who looks after a category: the team, and the department within it. */
export function routeFor(c: Category, where: 'home' | 'aboard'): { team: Team; label: string } {
  switch (c) {
    case 'suite':
    case 'other':
      return { team: 'suite-ambassador', label: 'Suite Ambassador' };
    case 'dining':
      return { team: 'guest-services', label: 'Restaurants' };
    case 'housekeeping':
      return { team: 'guest-services', label: 'Housekeeping' };
    case 'maintenance':
      return { team: 'guest-services', label: 'Engineering' };
    case 'spa':
      return { team: 'guest-services', label: 'The Spa' };
    case 'transportation':
    case 'excursion':
      return { team: 'destination-services', label: 'Destination Services' };
    case 'special-assistance':
      return { team: 'guest-services', label: 'Guest Services' };
    case 'concierge':
      return where === 'home' ? { team: 'shoreside-concierge', label: 'Shoreside Concierge' } : { team: 'guest-services', label: 'Guest Services' };
  }
}

/** The department when the request is with the category's own team, else the team. */
export function teamLabel(c: Category, team: Team, where: 'home' | 'aboard'): string {
  const route = routeFor(c, where);
  return route.team === team ? route.label : TEAM_LABEL[team];
}

/** Underlying state → the five guest-facing statuses. */
export function statusOf(r: Pick<RequestStamps, 'status' | 'acknowledgedAt' | 'closedAt'>): GuestRequestStatus {
  if (r.closedAt || r.status === 'cancelled' || r.status === 'declined') return 'closed';
  if (r.status === 'completed' || r.status === 'confirmed') return 'resolved';
  if (r.status === 'in_progress' || r.status === 'awaiting_guest') return 'in_progress';
  return r.acknowledgedAt ? 'acknowledged' : 'submitted';
}

/**
 * The moments each status was reached. While a request is open, every step
 * up to the current one is shown (missing stamps fall back to the last
 * update). A closed request shows only the steps it actually went through.
 */
export function timelineOf(r: RequestStamps): { status: GuestRequestStatus; at: string }[] {
  const status = statusOf(r);
  const out: { status: GuestRequestStatus; at: string }[] = [{ status: 'submitted', at: r.createdAt }];
  const done = r.status === 'completed' || r.status === 'confirmed';
  if (status !== 'closed') {
    const reached = ['submitted', 'acknowledged', 'in_progress', 'resolved'].indexOf(status);
    if (reached >= 1) out.push({ status: 'acknowledged', at: r.acknowledgedAt ?? r.startedAt ?? r.updatedAt });
    if (reached >= 2) out.push({ status: 'in_progress', at: r.startedAt ?? r.updatedAt });
    if (reached >= 3) out.push({ status: 'resolved', at: r.resolvedAt ?? r.updatedAt });
    return out;
  }
  if (r.acknowledgedAt) out.push({ status: 'acknowledged', at: r.acknowledgedAt });
  if (r.startedAt) out.push({ status: 'in_progress', at: r.startedAt });
  if (r.resolvedAt || done) out.push({ status: 'resolved', at: r.resolvedAt ?? r.closedAt ?? r.updatedAt });
  out.push({ status: 'closed', at: r.closedAt ?? r.updatedAt });
  return out;
}
