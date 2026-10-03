/**
 * Service request rules shared by every ServiceRequestService: categories,
 * routing to a team, the guest-facing status, the timeline and validation.
 * Pure: no I/O, no clock. Status, timeline and routing rules are shared with
 * the Edge Functions (supabase/functions/_shared/requests/rules.ts).
 */
import { categoryFromType, routeFor, statusOf, teamLabel, timelineOf } from '../../../supabase/functions/_shared/requests/rules';
import type {
  GuestServiceRequest,
  NewServiceRequest,
  ServiceRequest,
  ServiceRequestCategory,
  ServiceRequestStatus,
  ServiceRequestType,
} from '@/domain';

export { routeFor, statusOf, timelineOf };

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
export function categoryOf(r: Pick<ServiceRequest, 'category' | 'type'>): ServiceRequestCategory {
  return r.category ?? categoryFromType(r.type);
}

/** The underlying type stored with a new request (the concierge reads it). */
export function typeFor(c: ServiceRequestCategory): ServiceRequestType {
  return c === 'suite' || c === 'housekeeping' ? 'suite' : c === 'transportation' ? 'transport' : c === 'excursion' ? 'excursion' : c === 'dining' ? 'dining-change' : 'general';
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

export interface RequestContext {
  guest: { id: string; name: string };
  voyage: { id: string; name: string };
  where: 'home' | 'aboard';
}

export function toGuestRequest(r: ServiceRequest, ctx: RequestContext): GuestServiceRequest {
  const category = categoryOf(r);
  const status = statusOf(r);
  const label = teamLabel(category, r.assignedTeam, ctx.where);
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
