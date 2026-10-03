/**
 * View models for the Requests screens. Pure: from GuestServiceRequest to
 * what is shown. Words and states only; no service calls.
 */
import type { GuestServiceRequest, ServiceRequestCategory, ServiceRequestPriority, ServiceRequestStatus } from '@/domain';
import type { Tone } from '@/features/shared/status';
import { categoryLabel, PRIORITY_LABEL, SERVICE_REQUEST_CATEGORIES, STATUS_LABEL } from '@/services/shared/serviceRequests';
import { formatShortDate, formatTime } from '@/utils/format';

export const STEPS: ServiceRequestStatus[] = ['submitted', 'acknowledged', 'in_progress', 'resolved', 'closed'];

const at = (iso: string) => `${formatTime(iso)}, ${formatShortDate(iso)}`;

export function statusFor(r: Pick<GuestServiceRequest, 'status' | 'awaitingGuest'>): { label: string; tone: Tone } {
  if (r.awaitingGuest) return { label: 'Needs your reply', tone: 'attention' };
  if (r.status === 'resolved' || r.status === 'closed') return { label: STATUS_LABEL[r.status], tone: 'calm' };
  return { label: STATUS_LABEL[r.status], tone: 'pending' };
}

export interface RequestRowModel {
  id: string;
  title: string;
  category: string;
  status: { label: string; tone: Tone };
  /** "Opened 10 May · Destination Services" */
  meta: string;
  /** Next update, or the resolution, in one line. */
  note?: string;
  accessibilityLabel: string;
}

export function requestRow(r: GuestServiceRequest): RequestRowModel {
  const status = statusFor(r);
  const meta = `Opened ${formatShortDate(r.createdAt)} · ${r.assignedTeam.label}`;
  const note = r.awaitingGuest ? 'The team is waiting for your choice.' : r.nextUpdateBy ? `Next update by ${at(r.nextUpdateBy)}` : r.resolutionNotes;
  return {
    id: r.id,
    title: r.title,
    category: categoryLabel(r.category),
    status,
    meta,
    ...(note ? { note } : {}),
    accessibilityLabel: `${categoryLabel(r.category)} request: ${r.title}. ${status.label}. ${meta}.`,
  };
}

export interface RequestsListModel {
  active: RequestRowModel[];
  history: RequestRowModel[];
  /** How many need the guest. */
  attention: number;
}

export function buildRequestsList(active: GuestServiceRequest[], history: GuestServiceRequest[]): RequestsListModel {
  return { active: active.map(requestRow), history: history.map(requestRow), attention: active.filter((r) => r.awaitingGuest).length };
}

export interface StepModel {
  status: ServiceRequestStatus;
  label: string;
  state: 'done' | 'current' | 'todo';
  when?: string;
}

export interface RequestDetailModel {
  id: string;
  title: string;
  category: string;
  description: string[];
  status: { label: string; tone: Tone };
  steps: StepModel[];
  facts: { label: string; value: string }[];
  resolution?: string;
  nextUpdate?: string;
  /** Withdraw before work starts, or close once resolved. */
  close?: { label: string; confirm: string; done: string };
}

export function buildRequestDetail(r: GuestServiceRequest): RequestDetailModel {
  const reached = new Map(r.timeline.map((t) => [t.status, t.at]));
  const current = r.status;
  // A request closed without being worked on skips the middle steps.
  const shown = STEPS.filter((s) => current !== 'closed' || reached.has(s));
  const steps: StepModel[] = shown.map((s) => {
    const when = reached.get(s);
    const state = s === current ? 'current' : when ? 'done' : 'todo';
    return { status: s, label: STATUS_LABEL[s], state, ...(when ? { when: at(when) } : {}) };
  });
  const facts = [
    { label: 'Category', value: categoryLabel(r.category) },
    { label: 'Priority', value: PRIORITY_LABEL[r.priority] },
    { label: 'With', value: r.assignedTeam.person ?? r.assignedTeam.label },
    { label: 'Opened', value: at(r.createdAt) },
    { label: 'Requested by', value: r.guest.name },
    { label: 'Voyage', value: r.voyage.name },
  ];
  const model: RequestDetailModel = {
    id: r.id,
    title: r.title,
    category: categoryLabel(r.category),
    description: r.description.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    status: statusFor(r),
    steps,
    facts,
  };
  if (r.resolutionNotes) model.resolution = r.resolutionNotes;
  if (r.nextUpdateBy) model.nextUpdate = `Next update by ${at(r.nextUpdateBy)}`;
  if (r.canClose) {
    model.close =
      r.status === 'resolved'
        ? { label: 'Close this request', confirm: 'Close this request? It will move to your history.', done: 'Closed. Thank you.' }
        : { label: 'Withdraw this request', confirm: 'Withdraw this request? The team will stop working on it.', done: 'Withdrawn. It is in your history.' };
  }
  return model;
}

// ─── New request form ──────────────────────────────────────────────────────

export const CATEGORY_OPTIONS = SERVICE_REQUEST_CATEGORIES.map((c) => ({ value: c.key, label: c.label }));
export const PRIORITY_OPTIONS: { value: ServiceRequestPriority; label: string }[] = [
  { value: 'routine', label: PRIORITY_LABEL.routine },
  { value: 'priority', label: PRIORITY_LABEL.priority },
  { value: 'urgent', label: PRIORITY_LABEL.urgent },
];

export function categoryHelp(c: ServiceRequestCategory | ''): { hint?: string; placeholder: string } {
  const info = SERVICE_REQUEST_CATEGORIES.find((x) => x.key === c);
  return info ? { hint: info.hint, placeholder: info.example } : { placeholder: 'Tell us what you would like.' };
}

/** Shown under "Urgent": real emergencies don't wait for a request. */
export const URGENT_NOTE = 'For anything about your safety or health, please call: press the red key on any suite telephone aboard, or your local emergency number at home.';
