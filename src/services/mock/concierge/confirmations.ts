/** What the concierge says once an action has been carried out. Pure, like answers.ts. */
import type { ConciergeAttachment, EscalationResult, EscalationTarget, Experience, ExperienceBooking, ServiceRequest } from '@/domain';
import { formatLongDate, formatTime } from '@/utils/format';
import type { ConciergeSnapshot } from './snapshot';

export interface Confirmation {
  body: string;
  attachments: ConciergeAttachment[];
  suggestions?: string[];
}

/** How the guest knows the owner: the Suite Ambassador by first name, a team by its name. */
const ownerOf = (s: ConciergeSnapshot, r?: ServiceRequest) =>
  !r || r.assignedTeam === 'suite-ambassador' ? s.ambassador.firstName : (r.assignedTo?.split(',')[0] ?? 'the team');

const table = (s: ConciergeSnapshot, b: ExperienceBooking) =>
  b.category === 'dining' && s.profile.preferences.dining.tablePreference === 'window' && /window/i.test(b.note ?? '') ? ' Your window table is held.' : '';

export function bookingMoved(s: ConciergeSnapshot, before: ExperienceBooking, after: ExperienceBooking, reference: string): Confirmation {
  const confirmed = after.status === 'confirmed';
  const venue = after.venue.split(',')[0] ?? after.title;
  return {
    body: confirmed
      ? `Done. ${after.title} is now at ${formatTime(after.start)} on ${formatLongDate(after.start)}.${table(s, after)}`
      : `I have asked ${venue} for ${formatTime(after.start)}. ${s.ambassador.firstName} will confirm shortly; until then your ${formatTime(before.start)} table stands.`,
    attachments: [
      {
        kind: 'confirmation',
        status: after.status,
        title: after.title,
        detail: `${formatLongDate(after.start)} · ${formatTime(after.start)} · party of ${after.partySize}${confirmed ? '' : ` · was ${formatTime(before.start)}`}`,
        reference,
        bookingId: after.id,
      },
    ],
  };
}

export function experienceRequested(s: ConciergeSnapshot, e: Experience, booking: ExperienceBooking, reference: string, request?: ServiceRequest): Confirmation {
  const confirmed = booking.status === 'confirmed';
  const when = `${formatLongDate(booking.start)} at ${formatTime(booking.start)}`;
  return {
    body: confirmed
      ? `Reserved: ${e.title}, ${when}.${e.inclusive ? ' It is included in your voyage.' : ''}`
      : `Requested: ${e.title}, ${when}. ${ownerOf(s, request)} is arranging it${request?.nextUpdateBy ? ` and will confirm by ${formatTime(request.nextUpdateBy)}` : ''}.`,
    attachments: [
      {
        kind: 'confirmation',
        status: booking.status,
        title: e.title,
        detail: `${formatLongDate(booking.start)} · ${formatTime(booking.start)} · party of ${booking.partySize}${e.destination ? ` · ${e.destination}` : ''}`,
        reference,
        bookingId: booking.id,
        requestId: request?.id,
      },
    ],
  };
}

export function requestRaised(s: ConciergeSnapshot, r: ServiceRequest, reference: string): Confirmation {
  const who = ownerOf(s, r);
  return {
    body: `I have passed this to ${who}${r.nextUpdateBy ? `, who will update you by ${formatTime(r.nextUpdateBy)} on ${formatLongDate(r.nextUpdateBy)}` : ''}.`,
    attachments: [{ kind: 'confirmation', status: r.status, title: r.summary, detail: r.details ?? 'Request received', reference, requestId: r.id }],
  };
}

export function handoffCard(to: EscalationTarget, result: EscalationResult, requestId?: string): ConciergeAttachment {
  return { kind: 'handoff', to, team: result.team, agentName: result.agentName, expectedResponseMinutes: result.expectedResponseMinutes, requestId };
}

/** What a person says when they join, picking up the thread so the guest needn't repeat it. */
export function humanJoins(s: ConciergeSnapshot, to: EscalationTarget, topic: string | undefined, agentFirstName: string): string {
  const name = s.profile.guest.preferredName ?? s.profile.guest.firstName;
  if (to === 'medical') return `This is ${agentFirstName} at the Medical Centre. I have your details and I am available now. Can you tell me what is happening?`;
  const about = topic ? ` about ${topic}` : '';
  return `Hello ${name}, it's ${agentFirstName}. I have read our conversation${about} and I will take it from here: leave it with me.`;
}
