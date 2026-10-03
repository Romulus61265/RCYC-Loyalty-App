/**
 * View models for an arrival update: the headline, then each change with
 * whether it is done or only requested. Pure.
 */
import type { ArrivalStepKind, ArrivalUpdate } from '@/domain';
import type { Tone } from '@/features/shared/status';

export type ArrivalIcon = 'airplane-outline' | 'car-outline' | 'boat-outline' | 'time-outline' | 'flag-outline' | 'chatbubble-ellipses-outline';

const ICON: Record<ArrivalStepKind, ArrivalIcon> = {
  'flight-delay': 'airplane-outline',
  'transfer-updated': 'car-outline',
  'embarkation-notified': 'boat-outline',
  'transfer-time': 'time-outline',
  'arrival-estimate': 'flag-outline',
  concierge: 'chatbubble-ellipses-outline',
};

export interface ArrivalStepModel {
  kind: ArrivalStepKind;
  icon: ArrivalIcon;
  label: string;
  detail: string;
  value?: string;
  status?: { label: string; tone: Tone };
}

export interface ArrivalModel {
  headline: string;
  intro: string;
  steps: ArrivalStepModel[];
  alsoAffected: { title: string; detail: string; status: { label: string; tone: Tone } }[];
  attention?: string;
  /** Shown when the flight status came from a simulated source. */
  demoNote?: string;
  ambassador: string;
}

const statusOf = (state: 'done' | 'pending' | 'info'): ArrivalStepModel['status'] =>
  state === 'done' ? { label: 'Done', tone: 'calm' } : state === 'pending' ? { label: 'Requested', tone: 'pending' } : undefined;

export function buildArrivalModel(u: ArrivalUpdate): ArrivalModel {
  const concierge = u.steps.find((s) => s.kind === 'concierge');
  return {
    headline: u.headline,
    intro: u.intro,
    steps: u.steps.map((s) => {
      const status = statusOf(s.state);
      return { kind: s.kind, icon: ICON[s.kind], label: s.label, detail: s.detail, ...(s.value ? { value: s.value } : {}), ...(status ? { status } : {}) };
    }),
    alsoAffected: u.alsoAffected.map((a) => ({ title: a.title, detail: a.detail, status: a.state === 'done' ? { label: 'Done', tone: 'calm' } : { label: 'Requested', tone: 'pending' } })),
    ...(u.attention ? { attention: u.attention } : {}),
    ...(u.simulated ? { demoNote: 'Demonstration: this flight status is simulated. No flight-data service is connected.' } : {}),
    ambassador: concierge?.detail.split(' ')[0] ?? 'Your Suite Ambassador',
  };
}

/** The Home card: the headline and the six lines, briefly. */
export interface ArrivalCardModel {
  headline: string;
  lines: { icon: ArrivalIcon; label: string; value?: string; pending: boolean }[];
  demoNote?: string;
}

export function arrivalCard(u: ArrivalUpdate): ArrivalCardModel {
  const m = buildArrivalModel(u);
  return { headline: m.headline, lines: m.steps.map((s) => ({ icon: s.icon, label: s.label, ...(s.value ? { value: s.value } : {}), pending: s.status?.label === 'Requested' })), ...(m.demoNote ? { demoNote: m.demoNote } : {}) };
}
