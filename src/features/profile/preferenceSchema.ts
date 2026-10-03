/**
 * Editable preference groups, described as data.
 *
 * Each group declares its fields, how to read them from GuestPreferences,
 * how to write them back as a PreferencesPatch, a one-glance summary, and
 * validation. One generic editor renders any group. Pure and testable
 * (`scripts/check-profile.ts`).
 */
import type { DietaryProfile, GuestPreferences, PreferencesPatch } from '@/domain';

export type Allergy = DietaryProfile['allergies'][number];
export type FieldValue = string | string[] | boolean | number | Allergy[];
export type FormValues = Record<string, FieldValue>;

export interface Option {
  value: string;
  label: string;
}

export type Field =
  | { kind: 'single'; key: string; label: string; options: Option[] }
  | { kind: 'multi'; key: string; label: string; options: Option[]; allowCustom?: boolean }
  | { kind: 'toggle'; key: string; label: string; hint?: string }
  | { kind: 'text'; key: string; label: string; placeholder?: string; max: number; multiline?: boolean }
  | { kind: 'number'; key: string; label: string; min: number; max: number; step: number; unit: string }
  | { kind: 'allergies'; key: string; label: string };

export type GroupKey =
  | 'dining'
  | 'dietary'
  | 'beverage'
  | 'suite'
  | 'pillow'
  | 'spa'
  | 'activities'
  | 'destinations'
  | 'transportation'
  | 'accessibility'
  | 'communication'
  | 'privacy';

export interface PreferenceGroup {
  key: GroupKey;
  label: string;
  /** Who sees it, in the guest's terms. */
  usedBy: string;
  sensitive?: boolean;
  fields: (p: GuestPreferences) => Field[];
  read: (p: GuestPreferences) => FormValues;
  write: (p: GuestPreferences, v: FormValues) => PreferencesPatch;
  summary: (p: GuestPreferences) => string[];
}

const NOTE_MAX = 400;

const o = (...values: string[]): Option[] => values.map((v) => ({ value: v, label: v }));
const ol = (pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));
/** Options always include whatever the guest already has, so nothing is lost. */
const withExisting = (opts: Option[], existing: (string | undefined)[]): Option[] => [
  ...opts,
  ...existing.filter((e): e is string => !!e && !opts.some((x) => x.value === e)).map((e) => ({ value: e, label: e })),
];
const str = (v: FieldValue | undefined) => (typeof v === 'string' ? v.trim() : '');
/** Free text: an empty field means "no value" (and stays cleared once saved). */
const text = (v: FieldValue | undefined) => str(v) || undefined;
const list = (v: FieldValue | undefined) => (Array.isArray(v) ? (v as string[]) : []);
const bool = (v: FieldValue | undefined) => v === true;
const optional = <T extends string>(v: FieldValue | undefined): T | undefined => (str(v) ? (str(v) as T) : undefined);
const labelOf = (opts: Option[], v: string | undefined) => opts.find((x) => x.value === v)?.label ?? v;

const TABLE = ol([['window', 'Window table'], ['terrace', 'Terrace'], ['quiet-corner', 'A quiet corner'], ['chefs-table', "Chef's table"], ['no-preference', 'No preference']]);
const TIMES = o('19:00', '19:30', '20:00', '20:30', '21:00', '21:30');
const SEVERITY = ol([['intolerance', 'Intolerance'], ['allergy', 'Allergy'], ['anaphylactic', 'Severe (anaphylactic)']]);
const PRESSURE = ol([['light', 'Light'], ['medium', 'Medium'], ['firm', 'Firm']]);
const DAYPART = ol([['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening']]);
const STYLE = ol([['private', 'Private'], ['small-group', 'Small group'], ['any', 'Either']]);
const PACE = ol([['leisurely', 'Leisurely'], ['moderate', 'Moderate'], ['active', 'Active']]);
const DURATION = ol([['120', 'Up to 2 hours'], ['180', 'Up to 3 hours'], ['240', 'Up to 4 hours'], ['300', 'Up to 5 hours'], ['480', 'A full day']]);
const ARRIVALS = ol([['private-car', 'Private car'], ['private-van', 'Private van (more luggage)'], ['self-arranged', 'I’ll arrange my own']]);
const CABIN = ol([['first', 'First'], ['business', 'Business'], ['premium-economy', 'Premium economy'], ['economy', 'Economy']]);
const MOBILITY = ol([['none', 'No assistance needed'], ['short-walks', 'Prefer short walks'], ['wheelchair-distances', 'Wheelchair for longer distances'], ['wheelchair', 'Wheelchair user']]);
const PILLOWS = o('Feather-free (synthetic down alternative)', 'Soft goose down', 'Firm', 'Memory foam', 'Buckwheat', 'Hypoallergenic');
const QUIET = o('21:00', '21:30', '22:00', '22:30', '23:00', '23:30', '06:00', '06:30', '07:00', '07:30', '08:00');
const LANGUAGES = ol([['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['fr-FR', 'Français'], ['it-IT', 'Italiano'], ['es-ES', 'Español'], ['de-DE', 'Deutsch']]);

export const PREFERENCE_GROUPS: PreferenceGroup[] = [
  {
    key: 'dining',
    label: 'Dining',
    usedBy: 'Your restaurants aboard and your Suite Ambassador',
    fields: (p) => [
      { kind: 'multi', key: 'cuisines', label: 'Cuisines you enjoy', options: withExisting(o('Mediterranean', 'Ligurian', 'Provençal', 'Catalan', 'Italian', 'French', 'Japanese', 'Seafood'), p.dining.cuisines), allowCustom: true },
      { kind: 'single', key: 'table', label: 'Table', options: TABLE },
      { kind: 'single', key: 'time', label: 'Usual dinner time', options: TIMES },
      { kind: 'text', key: 'notes', label: 'Anything else', placeholder: 'e.g. Enjoys a word with the chef', max: NOTE_MAX, multiline: true },
    ],
    read: (p) => ({ cuisines: p.dining.cuisines, table: p.dining.tablePreference ?? 'no-preference', time: p.dining.preferredTime ?? '', notes: p.dining.notes ?? '' }),
    write: (p, v) => ({
      dining: {
        ...p.dining,
        cuisines: list(v.cuisines),
        tablePreference: optional<NonNullable<GuestPreferences['dining']['tablePreference']>>(v.table) ?? 'no-preference',
        preferredTime: str(v.time) || undefined,
        notes: text(v.notes),
      },
    }),
    summary: (p) => [p.dining.cuisines.join(', '), [labelOf(TABLE, p.dining.tablePreference), p.dining.preferredTime && `from ${p.dining.preferredTime}`].filter(Boolean).join(', ')].filter(Boolean),
  },
  {
    key: 'dietary',
    label: 'Dietary',
    usedBy: 'Every kitchen aboard; restaurants ashore only if you allow it in Privacy',
    sensitive: true,
    fields: (p) => [
      { kind: 'multi', key: 'restrictions', label: 'Dietary choices', options: withExisting(o('Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free', 'Halal', 'Kosher', 'Low sodium'), p.dietary.restrictions), allowCustom: true },
      { kind: 'allergies', key: 'allergies', label: 'Allergies and intolerances' },
    ],
    read: (p) => ({ restrictions: p.dietary.restrictions, allergies: p.dietary.allergies }),
    write: (_p, v) => ({ dietary: { restrictions: list(v.restrictions), allergies: (v.allergies as Allergy[]).map((a) => ({ allergen: a.allergen.trim(), severity: a.severity })) } }),
    summary: (p) =>
      p.dietary.restrictions.length || p.dietary.allergies.length
        ? [p.dietary.restrictions.join(', '), p.dietary.allergies.map((a) => `${a.allergen} (${labelOf(SEVERITY, a.severity)?.toLowerCase()})`).join(', ')].filter(Boolean)
        : ['No dietary requirements'],
  },
  {
    key: 'beverage',
    label: 'Beverage',
    usedBy: 'Your sommelier, bars and Suite Ambassador',
    fields: (p) => [
      { kind: 'multi', key: 'wine', label: 'Wine', options: withExisting(o('Red wine', 'White Burgundy', 'Champagne', 'Provence rosé', 'Barolo', 'Brunello di Montalcino', 'Bordeaux'), p.beverage.wine), allowCustom: true },
      { kind: 'multi', key: 'spirits', label: 'Spirits', options: withExisting(o('Aged rum', 'Japanese whisky', 'Single malt', 'Cognac', 'Gin', 'None'), p.beverage.spirits), allowCustom: true },
      { kind: 'multi', key: 'soft', label: 'Without alcohol', options: withExisting(o('Sparkling water', 'Still water', 'Fresh juices', 'Espresso', 'Herbal tea'), p.beverage.nonAlcoholic), allowCustom: true },
      { kind: 'text', key: 'amenity', label: 'Welcome amenity', placeholder: 'e.g. A bottle of Brunello, decanted', max: NOTE_MAX },
    ],
    read: (p) => ({ wine: p.beverage.wine, spirits: p.beverage.spirits, soft: p.beverage.nonAlcoholic, amenity: p.beverage.welcomeAmenity ?? '' }),
    write: (_p, v) => ({ beverage: { wine: list(v.wine), spirits: list(v.spirits), nonAlcoholic: list(v.soft), welcomeAmenity: text(v.amenity) } }),
    summary: (p) => [...p.beverage.wine.slice(0, 2), ...p.beverage.nonAlcoholic.slice(0, 1)],
  },
  {
    key: 'suite',
    label: 'Suite',
    usedBy: 'Your Suite Ambassador and housekeeping',
    fields: (p) => [
      { kind: 'single', key: 'bed', label: 'Bed', options: ol([['king', 'King'], ['twin', 'Twin']]) },
      { kind: 'number', key: 'temperature', label: 'Temperature', min: 16, max: 28, step: 1, unit: '°C' },
      { kind: 'text', key: 'turndown', label: 'Turndown', placeholder: 'e.g. Blinds half-closed', max: NOTE_MAX },
      { kind: 'multi', key: 'minibar', label: 'In your bar', options: withExisting(o('Sparkling water (case)', 'Still water', 'Dark chocolate', 'Champagne', 'Fresh fruit', 'No sugary soft drinks'), p.suite.minibar ?? []), allowCustom: true },
      { kind: 'multi', key: 'newspapers', label: 'Reading', options: withExisting(o('The Wall Street Journal', 'Financial Times (digital)', 'The New York Times', 'Le Figaro', 'Corriere della Sera'), p.suite.newspapers ?? []), allowCustom: true },
    ],
    read: (p) => ({ bed: p.suite.bedConfiguration ?? 'king', temperature: p.suite.temperatureCelsius ?? 21, turndown: p.suite.turndown ?? '', minibar: p.suite.minibar ?? [], newspapers: p.suite.newspapers ?? [] }),
    write: (p, v) => ({
      suite: {
        ...p.suite,
        bedConfiguration: (optional<'king' | 'twin'>(v.bed) ?? 'king'),
        temperatureCelsius: typeof v.temperature === 'number' ? v.temperature : p.suite.temperatureCelsius,
        turndown: text(v.turndown),
        minibar: list(v.minibar),
        newspapers: list(v.newspapers),
      },
    }),
    summary: (p) => [[p.suite.bedConfiguration === 'twin' ? 'Twin beds' : 'King bed', p.suite.temperatureCelsius && `${p.suite.temperatureCelsius} °C`].filter(Boolean).join(' · '), p.suite.turndown ?? ''].filter(Boolean),
  },
  {
    key: 'pillow',
    label: 'Pillow',
    usedBy: 'Housekeeping, prepared before you arrive',
    fields: (p) => [{ kind: 'single', key: 'pillow', label: 'Pillows and duvet', options: withExisting(PILLOWS, [p.suite.pillow]) }],
    read: (p) => ({ pillow: p.suite.pillow ?? '' }),
    write: (p, v) => ({ suite: { ...p.suite, pillow: str(v.pillow) } }),
    summary: (p) => [p.suite.pillow || 'No preference'],
  },
  {
    key: 'spa',
    label: 'Spa',
    usedBy: 'The spa team',
    fields: (p) => [
      { kind: 'multi', key: 'treatments', label: 'Favourite treatments', options: withExisting(o('Deep-tissue massage', 'Thalassotherapy', 'Facial', 'Hot stone', 'Reflexology', 'Couples ritual'), p.spa.favouriteTreatments), allowCustom: true },
      { kind: 'single', key: 'pressure', label: 'Pressure', options: PRESSURE },
      { kind: 'single', key: 'time', label: 'Preferred time', options: DAYPART },
      { kind: 'text', key: 'notes', label: 'Notes for your therapist', max: NOTE_MAX, multiline: true },
    ],
    read: (p) => ({ treatments: p.spa.favouriteTreatments, pressure: p.spa.pressure ?? '', time: p.spa.preferredTime ?? '', notes: p.spa.notes ?? '' }),
    write: (_p, v) => ({
      spa: { favouriteTreatments: list(v.treatments), pressure: optional<'light' | 'medium' | 'firm'>(v.pressure), preferredTime: optional<'morning' | 'afternoon' | 'evening'>(v.time), notes: text(v.notes) },
    }),
    summary: (p) => [p.spa.favouriteTreatments.join(', '), [labelOf(PRESSURE, p.spa.pressure) && `${labelOf(PRESSURE, p.spa.pressure)} pressure`, p.spa.preferredTime && `${p.spa.preferredTime}s`].filter(Boolean).join(' · ')].filter(Boolean),
  },
  {
    key: 'activities',
    label: 'Activities',
    usedBy: 'Destination services and your recommendations',
    fields: (p) => [
      { kind: 'multi', key: 'interests', label: 'Your interests', options: withExisting(o('Fine dining', 'Wine', 'Private cultural experiences', 'Spa', 'Yachting & sailing', 'Walking', 'Art', 'History', 'Swimming', 'Photography'), p.activityInterests), allowCustom: true },
      { kind: 'single', key: 'style', label: 'Excursions', options: STYLE },
      { kind: 'single', key: 'pace', label: 'Pace', options: PACE },
      { kind: 'single', key: 'duration', label: 'Time ashore', options: DURATION },
      { kind: 'text', key: 'notes', label: 'Anything else', max: NOTE_MAX, multiline: true },
    ],
    read: (p) => ({ interests: p.activityInterests, style: p.excursions.style, pace: p.excursions.pace, duration: p.excursions.maxDurationMinutes ? String(p.excursions.maxDurationMinutes) : '', notes: p.excursions.notes ?? '' }),
    write: (p, v) => ({
      activityInterests: list(v.interests),
      excursions: {
        style: optional<'private' | 'small-group' | 'any'>(v.style) ?? p.excursions.style,
        pace: optional<'leisurely' | 'moderate' | 'active'>(v.pace) ?? p.excursions.pace,
        maxDurationMinutes: str(v.duration) ? Number(str(v.duration)) : undefined,
        notes: text(v.notes),
      },
    }),
    summary: (p) => [p.activityInterests.join(', '), `${labelOf(STYLE, p.excursions.style)} excursions, ${labelOf(PACE, p.excursions.pace)?.toLowerCase()} pace`],
  },
  {
    key: 'destinations',
    label: 'Destinations',
    usedBy: 'Your future voyage suggestions',
    fields: (p) => [
      { kind: 'multi', key: 'destinations', label: 'Places you love', options: withExisting(o('French Riviera', 'Italian Riviera', 'Balearic Islands', 'Amalfi Coast', 'Adriatic', 'Greek Islands', 'Caribbean', 'Norwegian Fjords', 'Japan'), p.preferredDestinations), allowCustom: true },
    ],
    read: (p) => ({ destinations: p.preferredDestinations }),
    write: (_p, v) => ({ preferredDestinations: list(v.destinations) }),
    summary: (p) => [p.preferredDestinations.join(', ') || 'Open to anywhere'],
  },
  {
    key: 'transportation',
    label: 'Transportation',
    usedBy: 'Transfers and shore operations',
    fields: () => [
      { kind: 'single', key: 'arrivals', label: 'Arrivals and departures', options: ARRIVALS },
      { kind: 'single', key: 'cabin', label: 'Flights', options: CABIN },
      { kind: 'toggle', key: 'helicopter', label: 'Helicopter transfers welcome', hint: 'Where it saves time along the coast' },
      { kind: 'text', key: 'notes', label: 'Notes for your driver', max: NOTE_MAX },
    ],
    read: (p) => ({ arrivals: p.transportation.arrivals, cabin: p.transportation.cabin ?? '', helicopter: p.transportation.helicopterWelcome, notes: p.transportation.notes ?? '' }),
    write: (p, v) => ({
      transportation: {
        arrivals: optional<'private-car' | 'private-van' | 'self-arranged'>(v.arrivals) ?? p.transportation.arrivals,
        cabin: optional<'first' | 'business' | 'premium-economy' | 'economy'>(v.cabin),
        helicopterWelcome: bool(v.helicopter),
        notes: text(v.notes),
      },
    }),
    summary: (p) => [labelOf(ARRIVALS, p.transportation.arrivals) ?? '', [p.transportation.cabin && `${labelOf(CABIN, p.transportation.cabin)} flights`, p.transportation.helicopterWelcome && 'helicopter welcome'].filter(Boolean).join(', ')].filter(Boolean),
  },
  {
    key: 'accessibility',
    label: 'Accessibility',
    usedBy: 'Crew, tenders and shore operations, only if you share it',
    sensitive: true,
    fields: () => [
      { kind: 'single', key: 'mobility', label: 'Mobility', options: MOBILITY },
      { kind: 'toggle', key: 'tender', label: 'Assistance on tenders', hint: 'A crew member at the platform for every tender' },
      { kind: 'toggle', key: 'hearing', label: 'Hearing support', hint: 'Visual alerts and written briefings' },
      { kind: 'toggle', key: 'visual', label: 'Visual support', hint: 'Large-print menus and a guided tour of your suite' },
      { kind: 'text', key: 'notes', label: 'Anything we should know', max: NOTE_MAX, multiline: true },
      { kind: 'toggle', key: 'share', label: 'Share with crew and guides', hint: 'Only what’s needed to help you' },
    ],
    read: (p) => ({ mobility: p.accessibility.mobility, tender: p.accessibility.tenderAssistance, hearing: p.accessibility.hearingSupport, visual: p.accessibility.visualSupport, notes: p.accessibility.notes ?? '', share: p.accessibility.shareWithCrew }),
    write: (p, v) => ({
      accessibility: {
        mobility: optional<GuestPreferences['accessibility']['mobility']>(v.mobility) ?? p.accessibility.mobility,
        tenderAssistance: bool(v.tender),
        hearingSupport: bool(v.hearing),
        visualSupport: bool(v.visual),
        notes: text(v.notes),
        shareWithCrew: bool(v.share),
      },
    }),
    summary: (p) => {
      const needs = [p.accessibility.tenderAssistance && 'tender assistance', p.accessibility.hearingSupport && 'hearing support', p.accessibility.visualSupport && 'visual support'].filter(Boolean);
      return [labelOf(MOBILITY, p.accessibility.mobility) ?? '', needs.join(', '), p.accessibility.shareWithCrew ? 'Shared with crew' : 'Kept private'].filter(Boolean) as string[];
    },
  },
  {
    key: 'communication',
    label: 'Communication',
    usedBy: 'How and when we contact you',
    fields: () => [
      { kind: 'toggle', key: 'push', label: 'App notifications' },
      { kind: 'toggle', key: 'email', label: 'E-mail' },
      { kind: 'toggle', key: 'sms', label: 'Text message' },
      { kind: 'toggle', key: 'whatsapp', label: 'WhatsApp' },
      { kind: 'single', key: 'quietStart', label: 'Quiet from', options: QUIET },
      { kind: 'single', key: 'quietEnd', label: 'Quiet until', options: QUIET },
      { kind: 'single', key: 'language', label: 'Language', options: LANGUAGES },
      { kind: 'toggle', key: 'marketing', label: 'Voyage ideas and invitations', hint: 'Otherwise, only what concerns your voyages' },
    ],
    read: (p) => ({
      push: p.communication.channels.push,
      email: p.communication.channels.email,
      sms: p.communication.channels.sms,
      whatsapp: p.communication.channels.whatsapp,
      quietStart: p.communication.quietHours?.start ?? '',
      quietEnd: p.communication.quietHours?.end ?? '',
      language: p.communication.language,
      marketing: p.communication.marketingConsent,
    }),
    write: (p, v) => ({
      communication: {
        channels: { push: bool(v.push), email: bool(v.email), sms: bool(v.sms), whatsapp: bool(v.whatsapp) },
        quietHours: str(v.quietStart) && str(v.quietEnd) ? { start: str(v.quietStart), end: str(v.quietEnd) } : undefined,
        language: str(v.language) || p.communication.language,
        marketingConsent: bool(v.marketing),
      },
    }),
    summary: (p) => [
      (Object.entries(p.communication.channels) as [string, boolean][]).filter(([, on]) => on).map(([k]) => ({ push: 'App', email: 'E-mail', sms: 'Text', whatsapp: 'WhatsApp' })[k]).join(', ') || 'Urgent matters only',
      p.communication.quietHours ? `Quiet ${p.communication.quietHours.start} – ${p.communication.quietHours.end}` : '',
    ].filter(Boolean),
  },
  {
    key: 'privacy',
    label: 'Privacy',
    usedBy: 'What we may do with what you share',
    fields: () => [
      { kind: 'toggle', key: 'personalised', label: 'Personalised recommendations', hint: 'Suggestions based on your past voyages and preferences' },
      { kind: 'toggle', key: 'occasions', label: 'Let crew prepare for occasions', hint: 'Quiet gestures for anniversaries and birthdays' },
      { kind: 'toggle', key: 'dietary', label: 'Share dietary needs ashore', hint: 'With restaurants we book for you' },
      { kind: 'toggle', key: 'analytics', label: 'Anonymous app analytics', hint: 'Helps us improve the app; never linked to your name' },
    ],
    read: (p) => ({ personalised: p.privacy.personalisedRecommendations, occasions: p.privacy.shareOccasionsWithCrew, dietary: p.privacy.shareDietaryWithPartners, analytics: p.privacy.analytics }),
    write: (_p, v) => ({ privacy: { personalisedRecommendations: bool(v.personalised), shareOccasionsWithCrew: bool(v.occasions), shareDietaryWithPartners: bool(v.dietary), analytics: bool(v.analytics) } }),
    summary: (p) => [p.privacy.personalisedRecommendations ? 'Personalised recommendations on' : 'Personalised recommendations off'],
  },
];

export const PREFERENCE_SECTION_GROUPS: GroupKey[] = ['dining', 'dietary', 'beverage', 'suite', 'pillow', 'spa', 'activities', 'destinations', 'transportation', 'accessibility'];

export function groupByKey(key: GroupKey): PreferenceGroup {
  const g = PREFERENCE_GROUPS.find((x) => x.key === key);
  if (!g) throw new Error(`Unknown preference group ${key}`);
  return g;
}

/** Field-level validation; empty object when valid. */
export function validateForm(group: PreferenceGroup, p: GuestPreferences, values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of group.fields(p)) {
    const v = values[f.key];
    if (f.kind === 'text' && typeof v === 'string' && v.length > f.max) errors[f.key] = `Please keep this under ${f.max} characters.`;
    if (f.kind === 'number' && (typeof v !== 'number' || v < f.min || v > f.max)) errors[f.key] = `Choose between ${f.min} and ${f.max} ${f.unit}.`;
    if (f.kind === 'allergies' && Array.isArray(v) && (v as Allergy[]).some((a) => !a.allergen.trim())) errors[f.key] = 'Each allergy needs a name.';
  }
  if (group.key === 'communication' && Boolean(str(values.quietStart)) !== Boolean(str(values.quietEnd))) errors.quietEnd = 'Choose both a start and an end, or neither.';
  return errors;
}

/** True when the form differs from what is saved. */
export function isDirty(group: PreferenceGroup, p: GuestPreferences, values: FormValues): boolean {
  return JSON.stringify(group.read(p)) !== JSON.stringify(values);
}
