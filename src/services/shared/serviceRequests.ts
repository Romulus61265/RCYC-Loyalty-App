/**
 * Service request rules shared by every ServiceRequestService: categories,
 * routing to a team, the guest-facing status, the timeline and validation.
 * Pure: no I/O, no clock.
 */
import type {
  GuestServiceRequest,
  NewServiceRequest,
  ServiceRequest,
  ServiceRequestCategory,
  ServiceRequestStatus,
  ServiceRequestType,
} from '@/domain';

export const DESCRIPTION_MAX = 1000;

export interface CategoryInfo {
  key: ServiceRequestCategory;
  label: string;
  /** A hint under the label when choosing. */
  hint: string;
  /** Placeholder for the description. */
  example: string;
}

export const SERVICE_REQUEST_CATEGORIES: CategoryInfo[] = [
  { key: 'suite', label: 'Suite', hint: 'Bedding, minibar, amenities', example: 'An extra set of feather-free pillows, please.' },
  { key: 'dining', label: 'Dining', hint: 'Tables, menus, in-suite dining', example: 'Could we have breakfast on the terrace at 08:00?' },
  { key: 'housekeeping', label: 'Housekeeping', hint: 'Turndown, laundry, pressing', example: 'Pressing for a dinner jacket by 18:00.' },
  { key: 'maintenance', label: 'Maintenance', hint: 'Something not working', example: 'The terrace door is difficult to close.' },
  { key: 'transportation', label: 'Transportation', hint: 'Cars, transfers, flights', example: 'A car to the station in Monaco at 10:30.' },
  { key: 'excursion', label: 'Excursion', hint: 'Time ashore', example: 'A later start for the Portofino walk?' },
  { key: 'spa', label: 'Spa', hint: 'Treatments and times', example: 'A second massage on the sea day, if possible.' },
  { key: 'concierge', label: 'Concierge', hint: 'Anything you would like arranged', example: 'A table for two in Saint-Tropez this evening.' },
  { key: 'special-assistance', label: 'Special assistance', hint: 'Mobility, access, support', example: 'Assistance at the tender in Portofino.' },
  { key: 'other', label: 'Other', hint: 'Something else', example: 'Tell us what you need.' },
];

export const categoryLabel = (c: ServiceRequestCategory) => SERVICE_REQUEST_CATEGORIES.find((x) => x.key === c)?.label ?? 'Other';
export const isCategory = (v: unknown): v is ServiceRequestCategory => SERVICE_REQUEST_CATEGORIES.some((c) => c.key === v);

/** Requests raised before categories existed (or by the concierge) carry only a type. */
const CATEGORY_OF_TYPE: Record<ServiceRequestType, ServiceRequestCategory> = {
  'dining-change': 'dining',
  transport: 'transportation',
  occasion: 'concierge',
  suite: 'suite',
  excursion: 'excursion',
  medical: 'special-assistance',
  general: 'concierge',
};

export function categoryOf(r: Pick<ServiceRequest, 'category' | 'type'>): ServiceRequestCategory {
  return r.category ?? CATEGORY_OF_TYPE[r.type] ?? 'other';
}

/** The underlying type stored with a new request (the concierge reads it). */
export function typeFor(c: ServiceRequestCategory): ServiceRequestType {
  return c === 'suite' || c === 'housekeeping' ? 'suite' : c === 'transportation' ? 'transport' : c === 'excursion' ? 'excursion' : c === 'dining' ? 'dining-change' : 'general';
}

const TEAM_LABEL: Record<ServiceRequest['assignedTeam'], string> = {
  'shoreside-concierge': 'Shoreside Concierge',
  'suite-ambassador': 'Suite Ambassador',
  'guest-services': 'Guest Services',
  medical: 'Medical Centre',
  'destination-services': 'Destination Services',
};

/** Who looks after a category: the team, and the department within it. */
export function routeFor(c: ServiceRequestCategory, where: 'home' | 'aboard'): { team: ServiceRequest['assignedTeam']; label: string } {
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

/** Underlying state → the five guest-facing statuses. */
export function statusOf(r: Pick<ServiceRequest, 'status' | 'acknowledgedAt' | 'closedAt'>): ServiceRequestStatus {
  if (r.closedAt || r.status === 'cancelled' || r.status === 'declined') return 'closed';
  if (r.status === 'completed' || r.status === 'confirmed') return 'resolved';
  if (r.status === 'in_progress' || r.status === 'awaiting_guest') return 'in_progress';
  return r.acknowledgedAt ? 'acknowledged' : 'submitted';
}

export const ACTIVE_STATUSES: ServiceRequestStatus[] = ['submitted', 'acknowledged', 'in_progress'];
export const isActive = (s: ServiceRequestStatus) => ACTIVE_STATUSES.includes(s);

export const STATUS_LABEL: Record<ServiceRequestStatus, string> = {
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const PRIORITY_LABEL: Record<ServiceRequest['priority'], string> = { routine: 'When convenient', priority: 'Soon', urgent: 'Urgent' };

/**
 * The moments each status was reached. While a request is open, every step
 * up to the current one is shown (missing stamps fall back to the last
 * update). A closed request shows only the steps it actually went through.
 */
export function timelineOf(r: ServiceRequest): GuestServiceRequest['timeline'] {
  const status = statusOf(r);
  const out: GuestServiceRequest['timeline'] = [{ status: 'submitted', at: r.createdAt }];
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

export interface RequestContext {
  guest: { id: string; name: string };
  voyage: { id: string; name: string };
  where: 'home' | 'aboard';
}

export function toGuestRequest(r: ServiceRequest, ctx: RequestContext): GuestServiceRequest {
  const category = categoryOf(r);
  const status = statusOf(r);
  const route = routeFor(category, ctx.where);
  const label = route.team === r.assignedTeam ? route.label : TEAM_LABEL[r.assignedTeam];
  const description = r.details ? `${r.summary}\n\n${r.details}` : r.summary;
  const out: GuestServiceRequest = {
    id: r.id,
    guest: ctx.guest,
    voyage: ctx.voyage,
    reservationId: r.reservationId,
    category,
    title: r.summary,
    description,
    priority: r.priority,
    status,
    awaitingGuest: r.status === 'awaiting_guest' && status === 'in_progress',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    assignedTeam: r.assignedTo ? { team: r.assignedTeam, label, person: r.assignedTo } : { team: r.assignedTeam, label },
    timeline: timelineOf(r),
    canClose: status === 'submitted' || status === 'acknowledged' || status === 'resolved',
  };
  if (r.resolutionNotes) out.resolutionNotes = r.resolutionNotes;
  if (r.nextUpdateBy && isActive(status)) out.nextUpdateBy = r.nextUpdateBy;
  if (r.experienceId) out.experienceId = r.experienceId;
  if (r.bookingId) out.bookingId = r.bookingId;
  if (r.occasionStep) out.occasionStep = r.occasionStep;
  return out;
}

/** The first line of the description, for the list title. */
export function titleFrom(description: string): string {
  const first = description.trim().split('\n')[0]!.trim();
  return first.length <= 80 ? first : `${first.slice(0, 77).replace(/\s+\S*$/, '')}…`;
}

export type NewRequestErrors = Partial<Record<'category' | 'description' | 'priority', string>>;

export function validateNewRequest(input: Partial<NewServiceRequest>): NewRequestErrors {
  const errors: NewRequestErrors = {};
  if (!isCategory(input.category)) errors.category = 'Please choose what it is about.';
  const d = (input.description ?? '').trim();
  if (d.length < 3) errors.description = 'Please tell us a little more.';
  else if (d.length > DESCRIPTION_MAX) errors.description = `Please keep it under ${DESCRIPTION_MAX} characters.`;
  if (input.priority && !['routine', 'priority', 'urgent'].includes(input.priority)) errors.priority = 'Please choose how soon.';
  return errors;
}

/** Newest activity first. */
export const byUpdated = (a: GuestServiceRequest, b: GuestServiceRequest) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || (a.id < b.id ? -1 : 1);
