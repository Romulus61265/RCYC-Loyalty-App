/**
 * Pure view model for Concierge: turns the conversation, its attachments and
 * the guest's requests into what the screen renders (message blocks, action
 * cards, confirmations, hand-offs, request status). No answers are written
 * here: every word of a reply comes from ConciergeService.
 */
import type {
  ConciergeAction,
  ConciergeAttachment,
  ConciergeMessage,
  DaySchedule,
  EscalationTarget,
  Experience,
  ExperienceBooking,
  GuestContext,
  GuestPrivilege,
  GuestProfile,
  JourneyPhase,
  LoyaltyRecognition,
  MediaAsset,
  ServiceRequest,
  VoyageOverview,
} from '@/domain';
import { bookingStatus, type Tone } from '@/features/shared/status';
import { formatLongDate, formatShortDate, formatTime } from '@/utils/format';

export interface ConciergeInputs {
  messages: ConciergeMessage[];
  overview: VoyageOverview;
  catalogue: Experience[];
  days: DaySchedule[];
  privileges: GuestPrivilege[];
  requests: ServiceRequest[];
  bookings: ExperienceBooking[];
  phase: JourneyPhase;
}

export interface UiState {
  /** Actions the guest has carried out this session (by actionKey). */
  performed: ReadonlySet<string>;
  /** The action in flight, if any. */
  busyKey?: string;
  /** True while a reply is awaited (quick replies are hidden). */
  sending: boolean;
  now: Date;
}

export type Paragraph = { type: 'text'; text: string } | { type: 'list'; heading?: string; items: { time?: string; text: string }[] };

export interface ActionButton {
  key: string;
  label: string;
  action: ConciergeAction;
  state: 'idle' | 'busy' | 'done' | 'disabled';
}

export type Card =
  | { type: 'schedule'; title: string; subtitle: string; rows: { key: string; time: string; title: string; location: string; status?: { label: string; tone: Tone }; suggestion: boolean }[]; footer: string[] }
  | { type: 'action'; title: string; detail?: string; media?: MediaAsset; status?: { label: string; tone: Tone }; buttons: ActionButton[]; resolved: boolean }
  | { type: 'confirmation'; tone: Tone; statusLabel: string; title: string; detail: string; reference?: string }
  | { type: 'handoff'; to: EscalationTarget; agentName: string; initials: string; teamLabel: string; line: string }
  | { type: 'privileges'; items: { id: string; title: string; description: string; basis: string }[] }
  | { type: 'request'; request: RequestCardModel };

export type ThreadItem =
  | { kind: 'divider'; key: string; label: string }
  | { kind: 'message'; key: string; side: 'guest' | 'concierge' | 'person'; name: string; initials?: string; time: string; paragraphs: Paragraph[]; note?: string }
  | { kind: 'card'; key: string; card: Card };

export interface RequestCardModel {
  id: string;
  title: string;
  typeLabel: string;
  status: { label: string; tone: Tone };
  owner?: string;
  nextUpdate?: string;
  details?: string;
  opened: string;
  steps: { label: string; state: 'done' | 'current' | 'todo' }[];
  open: boolean;
}

export interface PersonOption {
  to: EscalationTarget;
  title: string;
  detail: string;
  label: string;
}

export interface ConciergeModel {
  header: { title: string; subtitle: string; ambassador: { name: string; firstName: string; title: string; initials: string; availability?: string; languages?: string } };
  people: PersonOption[];
  emergencyNote: string;
  thread: ThreadItem[];
  quickReplies: string[];
  requests: { open: RequestCardModel[]; closed: RequestCardModel[]; attention: number };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Stable identity of an action, so a tap is remembered across re-renders. */
export function actionKey(a: ConciergeAction): string {
  switch (a.kind) {
    case 'change-booking':
      return `cb:${a.bookingId}:${a.start}`;
    case 'request-experience':
      return `re:${a.experienceId}:${a.start}`;
    case 'service-request':
      return `sr:${a.summary}`;
    case 'escalate':
      return `es:${a.to}:${a.label}`;
    case 'open':
      return `op:${a.route}`;
  }
}

export const initials = (name: string) =>
  name
    .replace(/^(dr|mr|mrs|ms)\.?\s+/i, '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

const pad = (n: number) => String(n).padStart(2, '0');
/** Messages are shown in the device's own time (that is when the guest read them). */
const deviceDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deviceTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Splits a reply into paragraphs and bullet lists; "08:30 — …" bullets carry their time. */
export function paragraphsOf(body: string): Paragraph[] {
  return body
    .split(/\n{2,}/)
    .map((block) => block.split('\n'))
    .filter((lines) => lines.some((l) => l.trim()))
    .map((lines): Paragraph => {
      const bullets = lines.filter((l) => l.startsWith('• '));
      if (!bullets.length) return { type: 'text', text: lines.join('\n') };
      const heading = lines[0]!.startsWith('• ') ? undefined : lines[0];
      return {
        type: 'list',
        heading,
        items: bullets.map((l) => {
          const text = l.slice(2);
          const m = /^(\d{2}:\d{2}) — (.*)$/.exec(text);
          return m ? { time: m[1], text: m[2]! } : { text };
        }),
      };
    });
}

const TEAM_LABEL: Record<ServiceRequest['assignedTeam'], string> = {
  'shoreside-concierge': 'Shoreside concierge',
  'suite-ambassador': 'Suite Ambassador',
  'guest-services': 'Guest Services',
  medical: 'Medical Centre',
  'destination-services': 'Destination Services',
};

const TYPE_LABEL: Record<ServiceRequest['type'], string> = {
  'dining-change': 'Dining',
  transport: 'Transport',
  occasion: 'Occasion',
  suite: 'Your suite',
  excursion: 'Experiences',
  medical: 'Medical',
  general: 'Concierge',
};

export function requestStatus(st: ServiceRequest['status']): { label: string; tone: Tone } {
  switch (st) {
    case 'received':
      return { label: 'Received', tone: 'pending' };
    case 'in_progress':
      return { label: 'Being arranged', tone: 'pending' };
    case 'awaiting_guest':
      return { label: 'Awaiting your choice', tone: 'attention' };
    case 'confirmed':
      return { label: 'Confirmed', tone: 'calm' };
    case 'completed':
      return { label: 'Completed', tone: 'calm' };
    case 'declined':
      return { label: 'Not possible', tone: 'attention' };
    default:
      return { label: 'Cancelled', tone: 'attention' };
  }
}

function steps(st: ServiceRequest['status']): RequestCardModel['steps'] {
  const s = (label: string, state: 'done' | 'current' | 'todo') => ({ label, state });
  switch (st) {
    case 'received':
      return [s('Received', 'current'), s('Being arranged', 'todo'), s('Confirmed', 'todo')];
    case 'in_progress':
      return [s('Received', 'done'), s('Being arranged', 'current'), s('Confirmed', 'todo')];
    case 'awaiting_guest':
      return [s('Received', 'done'), s('Awaiting you', 'current'), s('Confirmed', 'todo')];
    case 'confirmed':
      return [s('Received', 'done'), s('Arranged', 'done'), s('Confirmed', 'done')];
    case 'completed':
      return [s('Received', 'done'), s('Arranged', 'done'), s('Completed', 'done')];
    case 'declined':
      return [s('Received', 'done'), s('Not possible', 'current')];
    default:
      return [s('Received', 'done'), s('Cancelled', 'current')];
  }
}

export function requestCard(r: ServiceRequest, now: Date): RequestCardModel {
  const open = ['received', 'in_progress', 'awaiting_guest'].includes(r.status);
  const due = r.nextUpdateBy && open ? (Date.parse(r.nextUpdateBy) > now.getTime() ? `Next update by ${formatTime(r.nextUpdateBy)}, ${formatShortDate(r.nextUpdateBy)}` : 'Update overdue: ask in the conversation') : undefined;
  return {
    id: r.id,
    title: r.summary,
    typeLabel: TYPE_LABEL[r.type],
    status: requestStatus(r.status),
    owner: r.assignedTo ? r.assignedTo.replace(/^(\S+)\s+\S+,/, '$1,') : TEAM_LABEL[r.assignedTeam],
    nextUpdate: due,
    details: r.details,
    opened: `Opened ${formatShortDate(r.createdAt)}`,
    steps: steps(r.status),
    open,
  };
}

const BASIS: Record<GuestPrivilege['basis'], string> = {
  'bonvoy-tier': 'Marriott Bonvoy',
  'voyage-tenure': 'Returning guest',
  'suite-category': 'Your suite',
  occasion: 'Your occasion',
  discretionary: 'With our compliments',
};

/** An action already true in the data (table moved, experience booked, request raised). */
function settledInData(a: ConciergeAction, input: ConciergeInputs): boolean {
  switch (a.kind) {
    case 'change-booking':
      return input.bookings.some((b) => b.id === a.bookingId && b.start === a.start);
    case 'request-experience':
      return input.bookings.some((b) => b.experienceId === a.experienceId && b.start === a.start && b.status !== 'cancelled');
    case 'service-request':
      return input.requests.some((r) => r.summary === a.summary);
    default:
      return false;
  }
}

function cardFor(att: ConciergeAttachment, input: ConciergeInputs, ui: UiState): Card | null {
  switch (att.kind) {
    case 'schedule': {
      const day = input.days.find((d) => d.dayNumber === att.dayNumber);
      if (!day) return null;
      const port = input.overview.voyage.itinerary.find((p) => p.id === day.portCallId);
      return {
        type: 'schedule',
        title: `Day ${day.dayNumber} · ${port?.portName ?? day.headline}`,
        subtitle: `${formatLongDate(day.date)} · ${day.headline}`,
        rows: day.items
          .map((i) => {
            const b = i.bookingId ? input.bookings.find((x) => x.id === i.bookingId) : undefined;
            return { key: i.id, time: formatTime(b?.start ?? i.start), title: i.title, location: i.location, status: b ? bookingStatus(b) : undefined, suggestion: i.kind === 'recommendation' };
          })
          .filter((r, idx, all) => all.findIndex((x) => x.key === r.key) === idx)
          .sort((a, b) => a.time.localeCompare(b.time)),
        footer: [day.dressCode && `Dress code · ${day.dressCode}`, day.sunset && `Sunset · ${formatTime(day.sunset)}`].filter((x): x is string => Boolean(x)),
      };
    }
    case 'actions': {
      const exp = att.subject?.experienceId ? input.catalogue.find((e) => e.id === att.subject?.experienceId) : undefined;
      const booking = att.subject?.bookingId ? input.bookings.find((b) => b.id === att.subject?.bookingId) : undefined;
      const request = att.subject?.requestId ? input.requests.find((r) => r.id === att.subject?.requestId) : undefined;
      const done = att.actions.filter((a) => a.kind !== 'open' && (ui.performed.has(actionKey(a)) || settledInData(a, input)));
      const resolved = done.length > 0 || (request ? !['received', 'in_progress', 'awaiting_guest'].includes(request.status) : false);
      const busy = att.actions.some((a) => actionKey(a) === ui.busyKey);
      return {
        type: 'action',
        title: att.title,
        detail: att.detail,
        media: exp?.hero,
        status: request ? requestStatus(request.status) : booking ? { ...bookingStatus(booking), label: `${bookingStatus(booking).label} · ${formatTime(booking.start)}` } : undefined,
        resolved,
        buttons: att.actions.map((a) => {
          const key = actionKey(a);
          const state: ActionButton['state'] = done.includes(a) ? 'done' : key === ui.busyKey ? 'busy' : resolved || busy ? 'disabled' : 'idle';
          return { key, label: a.label, action: a, state };
        }),
      };
    }
    case 'confirmation': {
      const live = att.bookingId ? input.bookings.find((b) => b.id === att.bookingId)?.status : att.requestId ? input.requests.find((r) => r.id === att.requestId)?.status : undefined;
      const st = live ?? att.status;
      const s = st === 'received' ? { label: 'Requested', tone: 'pending' as Tone } : requestStatus(st);
      return { type: 'confirmation', tone: s.tone, statusLabel: s.label, title: att.title, detail: att.detail, reference: att.reference };
    }
    case 'handoff':
      return {
        type: 'handoff',
        to: att.to,
        agentName: att.agentName,
        initials: initials(att.agentName.split(',')[0] ?? att.agentName),
        teamLabel: TEAM_LABEL[att.team],
        line: att.expectedResponseMinutes <= 1 ? 'Joining now' : `Usually joins within ${att.expectedResponseMinutes} minutes`,
      };
    case 'privileges':
      return {
        type: 'privileges',
        items: att.privilegeIds
          .map((id) => input.privileges.find((p) => p.id === id))
          .filter((p): p is GuestPrivilege => Boolean(p))
          .map((p) => ({ id: p.id, title: p.title, description: p.description, basis: BASIS[p.basis] })),
      };
    case 'service-request': {
      const r = input.requests.find((x) => x.id === att.requestId);
      return r ? { type: 'request', request: requestCard(r, ui.now) } : null;
    }
    default:
      // 'experiences' lists are summarised in the reply text itself.
      return null;
  }
}

// ─── Model ─────────────────────────────────────────────────────────────────

/** A quiet word in the byline: a suggestion, or a change that still needs the guest's yes. */
function noteFor(m: ConciergeMessage): string | undefined {
  if (m.classification === 'recommendation') return 'Suggestion';
  if (m.classification !== 'transactional') return undefined;
  const atts = m.attachments ?? [];
  if (atts.some((a) => a.kind === 'confirmation' || a.kind === 'handoff')) return undefined;
  return atts.some((a) => a.kind === 'actions' && a.actions.some((b) => b.kind !== 'open' && b.kind !== 'escalate')) ? 'Needs your confirmation' : undefined;
}

export function buildConciergeModel(input: ConciergeInputs, ui: UiState): ConciergeModel {
  const { reservation } = input.overview;
  const contact = reservation.suiteAmbassadorContact;
  const ambName = contact?.name ?? reservation.suiteAmbassador ?? 'Your Suite Ambassador';
  const ambFirst = ambName.split(' ')[0] ?? ambName;
  const ambTitle = contact?.title ?? 'Suite Ambassador';
  const atHome = input.phase === 'prepare' || input.phase === 'travel-to-embarkation' || input.phase === 'remember' || input.phase === 'rebook' || input.phase === 'dream' || input.phase === 'book';

  const thread: ThreadItem[] = [];
  let lastDate = '';
  const today = deviceDate(ui.now);
  for (const m of input.messages) {
    const at = new Date(m.createdAt);
    const date = deviceDate(at);
    if (date !== lastDate) {
      thread.push({ kind: 'divider', key: `d_${date}_${m.id}`, label: date === today ? 'Today' : formatLongDate(date) });
      lastDate = date;
    }
    if (m.body.trim()) {
      const side = m.author === 'guest' ? 'guest' : m.author === 'human' ? 'person' : 'concierge';
      const name = m.author === 'guest' ? 'You' : m.author === 'human' ? (m.authorName ?? ambFirst) : 'Concierge';
      thread.push({ kind: 'message', key: m.id, side, name, initials: side === 'person' ? initials(name.split(',')[0] ?? name) : undefined, time: deviceTime(at), paragraphs: paragraphsOf(m.body), note: m.author === 'ai' ? noteFor(m) : undefined });
    }
    (m.attachments ?? []).forEach((att, i) => {
      const card = cardFor(att, input, ui);
      if (card) thread.push({ kind: 'card', key: `${m.id}_${i}`, card });
    });
  }

  const lastReply = [...input.messages].reverse().find((m) => m.author !== 'guest');
  const requests = [...input.requests].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map((r) => requestCard(r, ui.now));

  return {
    header: {
      title: 'At your service',
      subtitle: `Digital concierge · ${ambFirst} and the team a tap away`,
      ambassador: { name: ambName, firstName: ambFirst, title: ambTitle, initials: initials(ambName), availability: contact?.availability, languages: contact?.languages.join(', ') },
    },
    people: [
      { to: 'suite-ambassador', title: `${ambFirst}, your ${ambTitle}`, detail: [contact?.availability, contact?.languages.length ? `Speaks ${contact.languages.join(', ')}` : undefined].filter(Boolean).join(' · '), label: `Ask ${ambFirst} to join` },
      { to: 'concierge-team', title: atHome ? 'The shoreside concierge team' : 'Guest Services', detail: 'A person, at any hour', label: 'Speak with the team' },
      { to: 'medical', title: 'The Medical Centre', detail: atHome ? 'Medical questions about your voyage' : 'Aboard, at any hour', label: 'Contact the Medical Centre' },
    ],
    emergencyNote: atHome ? 'In an emergency, call your local emergency number first.' : 'In an emergency aboard, press the red key on any suite telephone.',
    thread,
    quickReplies: ui.sending ? [] : (lastReply?.suggestions ?? []),
    requests: { open: requests.filter((r) => r.open), closed: requests.filter((r) => !r.open), attention: input.requests.filter((r) => r.status === 'awaiting_guest').length },
  };
}

/**
 * The minimised, pseudonymous context sent with each message: no raw PII,
 * dietary needs summarised, occasions by type only.
 */
export function buildGuestContext(i: { guestId: string; phase: JourneyPhase; overview: VoyageOverview; profile: GuestProfile; recognition: LoyaltyRecognition; bookings: ExperienceBooking[]; now: Date }): GuestContext {
  const { voyage } = i.overview;
  const offset = i.overview.embarkation.arrivalWindowStart.slice(-6);
  const sign = offset.startsWith('-') ? -1 : 1;
  const shift = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6))) * 60_000;
  const localToday = new Date(i.now.getTime() + shift).toISOString().slice(0, 10);
  const port = i.phase === 'sail' || i.phase === 'embark' ? voyage.itinerary.find((p) => p.date === localToday) : undefined;
  const allergies = i.profile.preferences.dietary.allergies;
  return {
    guestRef: i.guestId,
    preferredName: i.profile.guest.preferredName ?? i.profile.guest.firstName,
    phase: i.phase,
    tierLabel: i.recognition.membership.tierLabel,
    voyageName: voyage.name,
    currentDay: port?.day,
    currentPort: port && port.type !== 'sea' ? port.portName : undefined,
    upcomingBookingIds: i.bookings.filter((b) => Date.parse(b.start) > i.now.getTime()).slice(0, 5).map((b) => b.id),
    dietarySummary: allergies.length ? 'Has a declared allergy' : i.profile.preferences.dietary.restrictions.length ? 'Has dietary preferences' : undefined,
    occasionsThisVoyage: i.profile.occasions.filter((o) => o.date >= voyage.startDate && o.date <= voyage.endDate).map((o) => o.type),
    locale: i.profile.preferences.communication.language,
  };
}
