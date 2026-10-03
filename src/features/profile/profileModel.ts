/**
 * Profile view model: everything Profile renders, from service data. Pure.
 */
import type { GuestProfile, LoyaltyRecognition, MediaAsset, VersionedPreferences, Voyage, VoyageOverview } from '@/domain';
import { formatDateRange, formatLongDate } from '@/utils/format';
import { PREFERENCE_GROUPS, PREFERENCE_SECTION_GROUPS, type GroupKey } from './preferenceSchema';

export const PROFILE_SECTIONS = [
  { key: 'personal', label: 'Personal' },
  { key: 'bonvoy', label: 'Bonvoy' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'companions', label: 'Companions' },
  { key: 'occasions', label: 'Occasions' },
  { key: 'history', label: 'Voyage History' },
  { key: 'communication', label: 'Communication' },
  { key: 'privacy', label: 'Privacy' },
] as const;

export type ProfileSectionKey = (typeof PROFILE_SECTIONS)[number]['key'];

export function parseProfileSection(v: unknown): ProfileSectionKey {
  const s = Array.isArray(v) ? v[0] : v;
  return PROFILE_SECTIONS.some((x) => x.key === s) ? (s as ProfileSectionKey) : 'personal';
}

export interface Row {
  label: string;
  value: string;
  detail?: string;
}

export interface GroupSummary {
  key: GroupKey;
  label: string;
  usedBy: string;
  lines: string[];
  sensitive: boolean;
}

export interface VoyageLine {
  id: string;
  name: string;
  detail: string;
  media: MediaAsset;
}

export interface ProfileModel {
  name: string;
  subtitle: string;
  personal: { rows: Row[]; note: string };
  bonvoy: {
    tierLabel: string;
    lifetimeStatus?: string;
    memberNumber: string;
    since: string;
    points?: string;
    line: string;
    stats: Row[];
    privileges: { title: string; description: string }[];
  };
  preferences: GroupSummary[];
  communication: GroupSummary;
  privacy: GroupSummary;
  companions: { id: string; name: string; relationship: string; notes?: string }[];
  occasions: { id: string; label: string; date: string; recognition: string; thisVoyage: boolean }[];
  occasionsShared: boolean;
  history: { upcoming: VoyageLine | null; past: VoyageLine[]; totals: Row[] };
  saved: { label: string; source: string };
}

const RELATIONSHIP: Record<string, string> = { spouse: 'Spouse', partner: 'Partner', child: 'Child', parent: 'Parent', friend: 'Friend', colleague: 'Colleague', other: 'Travelling with you' };
const RECOGNITION: Record<string, string> = { celebrate: 'Celebrate with us', discreet: 'Acknowledge with discretion', private: 'Keep private' };

function summary(key: GroupKey, p: VersionedPreferences['preferences']): GroupSummary {
  const g = PREFERENCE_GROUPS.find((x) => x.key === key)!;
  return { key, label: g.label, usedBy: g.usedBy, lines: g.summary(p).filter(Boolean), sensitive: !!g.sensitive };
}

export function buildProfileModel(input: {
  profile: GuestProfile;
  versioned: VersionedPreferences;
  recognition: LoyaltyRecognition;
  overview: VoyageOverview;
  pastVoyages: Voyage[];
  now: Date;
}): ProfileModel {
  const { profile, versioned, recognition, overview, pastVoyages } = input;
  const { guest } = profile;
  const p = versioned.preferences;
  const { membership, relationship } = recognition;
  const year = (iso: string) => iso.slice(0, 4);

  const savedLabel =
    versioned.version === 0 || !versioned.updatedAt
      ? 'Your preferences come from your reservation. Edit anything below.'
      : `Last updated ${formatLongDate(versioned.updatedAt)}`;
  const source = versioned.source === 'supabase' ? 'Saved to your account' : versioned.source === 'device' ? 'Saved on this device' : 'From your reservation';

  return {
    name: `${guest.firstName} ${guest.lastName}`,
    subtitle: `Our guest since ${year(guest.guestSince)}`,
    personal: {
      rows: [
        { label: 'Address as', value: guest.salutation },
        { label: 'Name', value: `${guest.firstName} ${guest.lastName}`, detail: guest.preferredName && guest.preferredName !== guest.firstName ? `Known as ${guest.preferredName}` : undefined },
        { label: 'E-mail', value: guest.emailMasked },
        ...(guest.phoneMasked ? [{ label: 'Telephone', value: guest.phoneMasked }] : []),
        ...(guest.homeCity ? [{ label: 'Home', value: guest.homeCity }] : []),
        ...(guest.homeAirport ? [{ label: 'Home airport', value: guest.homeAirport }] : []),
        ...(guest.nationality ? [{ label: 'Nationality', value: guest.nationality }] : []),
        { label: 'Guest since', value: formatLongDate(guest.guestSince) },
      ],
      note: 'Contact details are shown partly hidden for your privacy. To change your name, e-mail or telephone, your concierge will update your record securely.',
    },
    bonvoy: {
      tierLabel: membership.tierLabel,
      lifetimeStatus: membership.lifetimeStatus,
      memberNumber: membership.memberNumberMasked,
      since: year(membership.memberSince),
      points: membership.pointsBalance !== undefined ? membership.pointsBalance.toLocaleString('en-US') : undefined,
      line: recognition.recognitionLine,
      stats: [
        { label: 'Voyages', value: String(relationship.voyagesCompleted) },
        { label: 'Nights', value: String(relationship.nightsSailed) },
        { label: 'Yachts', value: String(relationship.yachtsSailed.length) },
      ],
      privileges: recognition.privileges.map((x) => ({ title: x.title, description: x.description })),
    },
    preferences: PREFERENCE_SECTION_GROUPS.map((k) => summary(k, p)),
    communication: summary('communication', p),
    privacy: summary('privacy', p),
    companions: profile.companions.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, relationship: RELATIONSHIP[c.relationship] ?? c.relationship, notes: c.notes })),
    occasions: profile.occasions
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((x) => ({
        id: x.id,
        label: x.label,
        date: formatLongDate(x.date),
        recognition: RECOGNITION[x.recognition] ?? x.recognition,
        thisVoyage: x.date >= overview.voyage.startDate && x.date <= overview.voyage.endDate,
      })),
    occasionsShared: p.privacy.shareOccasionsWithCrew,
    history: {
      upcoming: {
        id: overview.voyage.id,
        name: overview.voyage.name,
        detail: `${overview.yacht.name} · ${formatDateRange(overview.voyage.startDate, overview.voyage.endDate)} · ${overview.suite.name} ${overview.suite.number}`,
        media: overview.voyage.hero,
      },
      past: [...pastVoyages]
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .map((v) => ({ id: v.id, name: v.name, detail: `${v.region} · ${formatDateRange(v.startDate, v.endDate)} · ${v.nights} nights`, media: v.hero })),
      totals: [
        { label: 'Voyages', value: String(relationship.voyagesCompleted) },
        { label: 'Nights', value: String(relationship.nightsSailed) },
        { label: 'Yachts', value: relationship.yachtsSailed.join(', ') },
      ],
    },
    saved: { label: savedLabel, source },
  };
}
