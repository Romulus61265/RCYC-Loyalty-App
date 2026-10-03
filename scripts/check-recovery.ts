/// <reference types="node" />
/**
 * Service recovery checks.  Run: `npm run check:recovery`
 *
 * Every disruption kind (transfer delay, dining and excursion cancellation,
 * suite issue, port change, weather, missed service, complaint), from journey
 * events and from the guest's own data; the playbook (inform calmly, explain
 * only when the reason is known, comparable alternatives, assistance,
 * record); severity and follow-up; alternatives that are free, comparable,
 * not booked and safe in the weather; the guest-safe notice; that nothing is
 * requested without the guest's explicit approval; and goodwill, which only
 * authorised, approved rules propose, never financially in the MVP, and only
 * the person a rule names may approve.
 */
import { devDataset as d, IDS } from '@/data/fixtures';
import type { RecoveryNotice } from '@/domain';
import { buildRecoveryModel, recoveryCard } from '@/features/recovery/recoveryModel';
import { ServiceError, type Services } from '@/services/contracts';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockGuestRecordSource } from '@/services/mock/MockMiscServices';
import { MockLoyaltyService } from '@/services/mock/MockLoyaltyService';
import { MockServiceRequestService } from '@/services/mock/MockServiceRequestService';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { MockRequestStore } from '@/services/mock/requestStore';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { buildRecoveryContext } from '@/services/recovery/buildContext';
import { ComposedRecoveryService } from '@/services/recovery/ComposedRecoveryService';
import { MemoryRecoveryStore } from '@/services/recovery/store';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';
import { assess, dateLabel, detectDisruptions, ENGINE_VERSION, fromJourneyEvent, inZone, money, planRecovery, toGuestDisruption, voyageNow, withSubjectSnapshot } from '../supabase/functions/_shared/recovery/engine';
import { decideProposal, evaluateGoodwill } from '../supabase/functions/_shared/recovery/goodwill';
import type { Disruption, DisruptionKind, GoodwillRule, RecoveryContext, RecoveryPlan } from '../supabase/functions/_shared/recovery/types';
import { DISRUPTION_KINDS, MVP_GOODWILL_POLICY } from '../supabase/functions/_shared/recovery/types';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}`}`);
};
async function rejects(p: Promise<unknown>, code: string) {
  try {
    await p;
    return false;
  } catch (e) {
    return e instanceof ServiceError && e.code === code;
  }
}

const R = IDS.reservation;
const G = IDS.guest;
const NOW = new Date(d.meta.referenceNow);
const rules = d.recovery.goodwillRules;
const demo = d.recovery.demoDisruption;

function services(now = NOW) {
  const clock = { now: () => now };
  const profile = new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore()));
  const voyage = new MockVoyageService();
  const experience = new MockExperienceService();
  const loyalty = new MockLoyaltyService();
  const requests = new MockServiceRequestService({ store: new MockRequestStore(), voyage });
  return { profile, voyage, experience, loyalty, requests, clock } satisfies Pick<Services, 'profile' | 'voyage' | 'experience' | 'loyalty' | 'requests' | 'clock'>;
}

const base = (kind: DisruptionKind, extra: Partial<Disruption> = {}): Disruption => ({
  key: `test:${kind}`,
  kind,
  reservationId: R,
  guestIds: [G, IDS.companion],
  occurredAt: '2027-05-11T08:30:00-04:00',
  source: 'journey-event',
  cause: 'unknown',
  subject: {},
  ...extra,
});

/** Every sentence the guest reads. */
const guestText = (p: RecoveryPlan) => [p.message.eyebrow, p.message.title, ...p.message.body, p.explanation ?? '', p.assurance, p.assistance.label, ...p.alternatives.flatMap((a) => [a.title, a.detail, a.actionLabel])].join('\n');
const NO_COMPENSATION = /\b(refund|compensat\w*|credit|voucher|discount|free of charge|complimentary|on us|points)\b/i;
const NO_BLAME = /\b(fault|blame|unfortunately the (supplier|skipper|crew)|their mistake)\b/i;

async function main() {
  const s = services();
  const ctx0 = await buildRecoveryContext(s, G, R, 0);

  // ─── Context ─────────────────────────────────────────────────────────────
  check('context: port time, the party, the ambassador', ctx0.now === '2027-05-11T15:00:00+02:00' && ctx0.guest.firstName === 'Alexander' && ctx0.guest.partySize === 2 && ctx0.ambassador.firstName === 'Elena', { now: ctx0.now, g: ctx0.guest, a: ctx0.ambassador });
  check('context: the anniversary is a celebration day', ctx0.occasionDates.includes('2027-05-20'), ctx0.occasionDates);
  check('inZone: Paris in May is +02:00', inZone(new Date('2027-05-18T08:00:00Z'), 'Europe/Paris') === '2027-05-18T10:00:00+02:00');
  check('voyageNow: before the voyage, the first port', voyageNow(new Date('2027-05-01T12:00:00Z'), [{ date: '2027-05-15', timeZone: 'Europe/Madrid' }]) === '2027-05-01T14:00:00+02:00');
  check('dateLabel and money', dateLabel('2027-05-18') === 'Tuesday 18 May' && money({ amountMinor: 240000, currency: 'EUR' }) === '€2,400' && money({ amountMinor: 65000, currency: 'EUR' }) === '€650');

  // ─── From journey events ─────────────────────────────────────────────────
  const EVENTS: [string, DisruptionKind][] = [
    ['transfer.delayed', 'transfer-delay'],
    ['dining.cancelled', 'dining-cancellation'],
    ['excursion.cancelled', 'excursion-cancellation'],
    ['suite.issue_reported', 'suite-issue'],
    ['itinerary.port_changed', 'port-change'],
    ['weather.disruption', 'weather-disruption'],
    ['service.missed', 'missed-service'],
    ['guest.complaint', 'guest-complaint'],
  ];
  for (const [type, kind] of EVENTS) {
    const x = fromJourneyEvent({ type, reservationId: R, guestIds: [G], occurredAt: '2027-05-18T07:00:00+02:00', payload: {}, dedupeKey: `k-${type}` });
    check(`event ${type} → ${kind}`, x?.kind === kind && x.key === `event:k-${type}` && x.source === 'journey-event', x);
  }
  check('every kind has an event', DISRUPTION_KINDS.every((k) => EVENTS.some(([, kk]) => kk === k)));
  check('other events are not disruptions', ['flight.delayed', 'occasion.anniversary', 'service.request_updated', 'medical.assistance_requested'].every((type) => fromJourneyEvent({ type, reservationId: R, guestIds: [], occurredAt: '', payload: {}, dedupeKey: 'x' }) === null));
  const parsed = fromJourneyEvent({
    type: 'excursion.cancelled',
    reservationId: R,
    guestIds: [G],
    occurredAt: '2027-05-11T08:30:00-04:00',
    payload: { bookingId: 'dev_bkg_classic_sail', guestReason: 'Wind.', internalReason: 'Gusts 35 kn', cause: 'weather', delayMinutes: '20', ignored: 42 },
    dedupeKey: 'abc',
  });
  check('event payload: subject, reasons, cause, numbers', parsed?.subject.bookingId === 'dev_bkg_classic_sail' && parsed.reason?.guest === 'Wind.' && parsed.reason.internal === 'Gusts 35 kn' && parsed.cause === 'weather' && parsed.details?.delayMinutes === 20, parsed);
  check('weather events default to a weather cause', fromJourneyEvent({ type: 'weather.disruption', reservationId: R, guestIds: [], occurredAt: '', payload: {}, dedupeKey: 'w' })?.cause === 'weather');

  // ─── The demo: the classic sail cancelled for a mistral ──────────────────
  const snap = withSubjectSnapshot(demo, ctx0);
  check('snapshot: the booking’s title, time, venue and party travel with the disruption', snap.subject.title === 'Under sail on a 1930s classic yacht' && snap.subject.start === '2027-05-18T10:00:00+02:00' && snap.subject.partySize === 2 && Boolean(snap.subject.venue), snap.subject);
  const plan = planRecovery(snap, ctx0);
  check('plan: engine version', plan.engineVersion === ENGINE_VERSION);
  check('playbook order: inform, explain, alternatives, assist, record (then the crew’s steps)', plan.steps.map((x) => x.kind).join() === 'inform,explain,alternatives,assist,record,escalate,follow-up', plan.steps.map((x) => x.kind));
  check('guest steps first, crew steps after', plan.steps.slice(0, 4).every((x) => x.audience === 'guest') && plan.steps.slice(4).every((x) => x.audience === 'crew'));
  check('message: calm and personal', plan.message.title === 'Under sail on a 1930s classic yacht will not go ahead' && plan.message.body[0] === 'Alexander, we are sorry to tell you that “Under sail on a 1930s classic yacht” on Tuesday 18 May cannot take place as planned.', plan.message);
  check('message: signed by the Suite Ambassador', plan.message.signature === 'Elena, Suite Ambassador');
  check('the known reason is explained', plan.explanation === demo.reason?.guest);
  check('nothing exclamatory, no blame, no compensation in anything the guest reads', !/!/.test(guestText(plan)) && !NO_BLAME.test(guestText(plan)) && !NO_COMPENSATION.test(guestText(plan)), guestText(plan));
  check('the internal reason stays with the crew', !guestText(plan).includes('35 knots') && plan.crewBrief.some((l) => l.includes('35 knots')));
  check('severity: a private, paid experience lost is high, and escalates', plan.assessment.severity === 'high' && plan.assessment.escalate && plan.assessment.owner === 'shore-operations', plan.assessment);
  check('follow-up: within 30 minutes for high, in port time', plan.assessment.followUpBy === '2027-05-11T15:30:00+02:00', plan.assessment.followUpBy);
  check('crew brief: says no compensation has been offered', plan.crewBrief.some((l) => /No compensation has been offered/.test(l)));

  const alts = plan.alternatives;
  check('alternatives: three at most', alts.length === 3, alts.map((a) => a.title));
  check('alternatives: the private walk in Saint-Tropez that morning comes first', alts[0]?.experienceId === 'dev_exp_tropez_village' && alts[0].time === '10:00' && alts[0].date === '2027-05-18', alts[0]);
  check('alternatives: nothing on the water on the day of the mistral', !alts.some((a) => ['dev_exp_marina', 'dev_exp_classic_sail'].includes(a.experienceId ?? '')));
  const booked = new Set(ctx0.bookings.filter((b) => b.status !== 'cancelled').map((b) => b.experienceId));
  check('alternatives: nothing already booked or requested', !alts.some((a) => booked.has(a.experienceId ?? '') || a.experienceId === 'dev_exp_bridge' || a.experienceId === 'dev_exp_helicopter'));
  const busy = ctx0.bookings.filter((b) => b.id !== 'dev_bkg_classic_sail' && b.status !== 'cancelled').map((b) => [Date.parse(b.start), b.end ? Date.parse(b.end) : Date.parse(b.start) + 7_200_000]);
  check('alternatives: no clash with the rest of the programme', alts.every((a) => a.proposal.kind !== 'request-experience' || !busy.some(([x, y]) => Date.parse(a.proposal.kind === 'request-experience' ? a.proposal.start : '') < y! && Date.parse((a.proposal as { start: string }).start) + 3_600_000 > x!)));
  check('alternatives: a choice, not three of a kind', new Set(alts.map((a) => ctx0.catalogue.find((x) => x.id === a.experienceId)?.category)).size === alts.length);
  check('alternatives: each is a proposal for the guest to approve, priced honestly', alts.every((a) => a.proposal.kind === 'request-experience' && a.proposal.partySize === 2 && a.actionLabel.startsWith('Request ') && (a.chargeable ? /^€/.test(a.price ?? '') : a.price === 'Included')), alts);
  check('alternatives: stable ids', alts.every((a) => a.id === `${demo.key}:${a.experienceId}`));
  check('deterministic', JSON.stringify(planRecovery(snap, ctx0)) === JSON.stringify(plan));
  const later = planRecovery(snap, { ...ctx0, now: '2027-05-18T09:00:00+02:00' });
  check('alternatives: never too close to the start', later.alternatives.every((a) => Date.parse((a.proposal as { start: string }).start) >= Date.parse('2027-05-18T11:00:00+02:00')), later.alternatives.map((a) => a.time));

  // The reason unknown: nothing is explained, and the crew are told not to speculate.
  const unknown = planRecovery(withSubjectSnapshot({ ...demo, reason: undefined, cause: 'unknown' }, ctx0), ctx0);
  check('no reason: no explain step, no explanation', !unknown.steps.some((x) => x.kind === 'explain') && unknown.explanation === undefined);
  check('no reason: crew told not to speculate', unknown.crewBrief.some((l) => /do not speculate/.test(l)));
  check('no reason: alternatives on the water are fine again', unknown.alternatives.length > 0);

  // ─── Every kind ──────────────────────────────────────────────────────────
  const KIND_CASES: Disruption[] = [
    base('transfer-delay', { subject: { bookingId: 'dev_bkg_transfer_bcn' }, details: { delayMinutes: 25, newTime: '2027-05-15T10:25:00+02:00' } }),
    base('dining-cancellation', { subject: { bookingId: 'dev_bkg_dinner_4' }, reason: { guest: 'Il Giardino is closed that evening for a private event.' } }),
    base('excursion-cancellation', { subject: { bookingId: 'dev_bkg_ephrussi' } }),
    base('suite-issue', { source: 'crew', details: { quote: 'The terrace door will not close.' } }),
    base('port-change', { subject: { portCallId: 'dev_pc_7' }, details: { fromPort: 'Portofino', toPort: 'Santa Margherita', toPortCallId: 'dev_pc_7', date: '2027-05-21' }, reason: { guest: 'The harbour master has closed Portofino to tenders that day.' } }),
    base('weather-disruption', { cause: 'weather', details: { date: '2027-05-18' } }),
    base('missed-service', { source: 'detected', subject: { requestId: 'dev_srq_heli' } }),
    base('guest-complaint', { source: 'detected', cause: 'guest-feedback', details: { quote: 'Disappointed nobody came.' } }),
  ];
  for (const c of KIND_CASES) {
    const p = planRecovery(withSubjectSnapshot(c, ctx0), ctx0);
    const kinds = p.steps.map((x) => x.kind);
    check(`${c.kind}: informs, offers help, records, follows up`, kinds[0] === 'inform' && kinds.includes('assist') && kinds.includes('record') && kinds.at(-1) === 'follow-up', kinds);
    check(`${c.kind}: explains only a known reason`, kinds.includes('explain') === Boolean(c.reason?.guest));
    check(`${c.kind}: calm, no blame, no compensation`, !/!/.test(guestText(p)) && !NO_BLAME.test(guestText(p)) && !NO_COMPENSATION.test(guestText(p)), guestText(p));
    check(`${c.kind}: the guest never reads the quote`, !c.details?.quote || !guestText(p).includes(c.details.quote));
  }
  const [transfer, dining, , suite, port, weather, missed, complaint] = KIND_CASES.map((c) => planRecovery(withSubjectSnapshot(c, ctx0), ctx0));
  check('transfer: rounded delay and the new time', transfer!.message.title === 'Your transfer is running about 25 minutes late' && transfer!.message.body[0]!.includes('10:25'), transfer!.message);
  check('transfer: no alternatives; low under 30 minutes', transfer!.alternatives.length === 0 && transfer!.assessment.severity === 'low');
  check('transfer: moderate from 30, high from 60 minutes', assess(base('transfer-delay', { details: { delayMinutes: 30 } }), ctx0).severity === 'moderate' && assess(base('transfer-delay', { details: { delayMinutes: 75 } }), ctx0).severity === 'high');
  check('dining: other tables that evening near the time, then dinner in the suite', dining!.alternatives.length >= 2 && dining!.alternatives.slice(0, -1).every((a) => a.date === '2027-05-18' && ctx0.catalogue.find((x) => x.id === a.experienceId)?.category === 'dining') && dining!.alternatives.at(-1)?.id.endsWith(':in-suite') === true, dining!.alternatives);
  check('dining: within 90 minutes of the booking', dining!.alternatives.filter((a) => a.experienceId).every((a) => Math.abs(Date.parse((a.proposal as { start: string }).start) - Date.parse('2027-05-18T20:30:00+02:00')) <= 90 * 60_000));
  check('dining: in-suite dinner is a request to the team, at no charge', dining!.alternatives.at(-1)?.proposal.kind === 'service-request' && dining!.alternatives.at(-1)?.chargeable === false);
  check('dining: the reason, plainly', dining!.explanation === 'Il Giardino is closed that evening for a private event.');
  check('suite issue: housekeeping owns it, no alternatives', suite!.assessment.owner === 'housekeeping' && suite!.alternatives.length === 0 && suite!.message.title === 'We are attending to your suite');
  check('port change: high, and alternatives only in the new port that day', port!.assessment.severity === 'high' && port!.alternatives.every((a) => a.date === '2027-05-21'), port!.alternatives);
  check('port change: names both ports', port!.message.title === 'We will call at Santa Margherita instead of Portofino');
  check('weather with nothing of the guest’s: aboard only, nothing on the water', weather!.alternatives.length > 0 && weather!.alternatives.every((a) => !a.destination && !['dev_exp_marina'].includes(a.experienceId ?? '')), weather!.alternatives);
  check('missed service: owns up to the promised time', missed!.message.title === 'We owe you an update' && missed!.message.body[0]!.includes('by 12:00') && missed!.assessment.owner === 'suite-ambassador', missed!.message);
  check('complaint: high, the Guest Services Manager owns it, escalated', complaint!.assessment.severity === 'high' && complaint!.assessment.owner === 'guest-services-manager' && complaint!.assessment.escalate);
  check('complaint: the guest’s words reach the crew brief', complaint!.crewBrief.some((l) => l.includes('Disappointed nobody came.')));

  // Severity modifiers.
  const onAnniversary = assess(base('dining-cancellation', { subject: { bookingId: 'dev_bkg_anniversary' } }), ctx0);
  check('a celebration day raises the severity', onAnniversary.factors.some((f) => /celebration/.test(f)) && onAnniversary.severity === 'critical' && onAnniversary.followUpBy === '2027-05-11T15:15:00+02:00', onAnniversary);
  const third = assess(base('suite-issue'), { ...ctx0, priorRecoveries: 2 });
  check('a third disruption raises the severity', third.severity === 'high' && third.factors.some((f) => /number 3/.test(f)), third);

  // ─── From the guest's own data ───────────────────────────────────────────
  check('nothing to detect at the reference time', detectDisruptions(ctx0, R, [G]).length === 0, detectDisruptions(ctx0, R, [G]));
  const ctxLate = await buildRecoveryContext(services(new Date('2027-05-12T13:00:00-04:00')), G, R, 0);
  const missedFound = detectDisruptions(ctxLate, R, [G]);
  check('missed updates detected once the promised time passes', missedFound.length === 2 && missedFound.every((x) => x.kind === 'missed-service' && x.source === 'detected') && missedFound.some((x) => x.key === 'missed:dev_srq_heli:2027-05-12T12:00:00-04:00'), missedFound.map((x) => x.key));
  const extra: RecoveryContext = {
    ...ctx0,
    requests: [
      ...ctx0.requests,
      { id: 'r_maint', title: 'Terrace door', category: 'maintenance', description: 'The terrace door is difficult to close.', status: 'submitted', createdAt: '2027-05-16T09:00:00+02:00' },
      { id: 'r_upset', title: 'Breakfast', category: 'dining', description: 'Very disappointed: breakfast was cold again and no one came.', status: 'acknowledged', createdAt: '2027-05-16T09:10:00+02:00' },
      { id: 'r_tagged', title: 'Recovery help', category: 'concierge', description: 'Unacceptable, frankly.', status: 'submitted', createdAt: '2027-05-16T09:20:00+02:00', occasionStep: 'recovery:ntc_1:assist' },
      { id: 'r_fine', title: 'Pillows', category: 'suite', description: 'More pillows, please.', status: 'submitted', createdAt: '2027-05-16T09:30:00+02:00' },
    ],
  };
  const found = detectDisruptions(extra, R, [G]);
  check('a maintenance request is a suite issue', found.some((x) => x.key === 'suite:r_maint' && x.kind === 'suite-issue'));
  check('a request that reads as a complaint is a complaint', found.some((x) => x.key === 'complaint:r_upset' && x.kind === 'guest-complaint'));
  check('requests raised from a recovery are not detected again; ordinary ones are not disruptions', !found.some((x) => x.key.includes('r_tagged') || x.key.includes('r_fine')), found.map((x) => x.key));

  // ─── Guest-safe ──────────────────────────────────────────────────────────
  const safe = toGuestDisruption({ ...snap, details: { quote: 'Private words', delayMinutes: 5 } });
  check('guest-safe: no internal reason, no quote, no guest ids', safe.reason?.guest === demo.reason?.guest && !('internal' in (safe.reason ?? {})) && !('quote' in (safe.details ?? {})) && !('guestIds' in safe) && safe.details?.delayMinutes === 5, safe);
  check('guest-safe plans read the same', JSON.stringify(planRecovery(toGuestDisruption(snap), ctx0).message) === JSON.stringify(plan.message) && JSON.stringify(planRecovery(toGuestDisruption(snap), ctx0).alternatives) === JSON.stringify(plan.alternatives));

  // ─── Goodwill ────────────────────────────────────────────────────────────
  const gw = evaluateGoodwill({ plan, ctx: ctx0, rules, policy: MVP_GOODWILL_POLICY, approvedByRule: {} });
  check('goodwill: the approved gesture for a private experience lost is proposed', gw.proposals.length === 1 && gw.proposals[0]?.ruleId === 'dev_gw_private_lost_gesture' && gw.proposals[0].status === 'proposed' && !gw.proposals[0].financial && gw.proposals[0].approvalRole === 'suite_ambassador', gw.proposals);
  check('goodwill: the draft (financial) rule is ignored', gw.skipped.some((x) => x.ruleId === 'dev_gw_repeat_service_credit' && x.reason === 'not-approved'));
  check('goodwill: rationale names the rule, version and who authorised it', /v1, authorised by Director of Guest Experience/.test(gw.proposals[0]?.rationale ?? ''));
  const onDay = planRecovery(withSubjectSnapshot(base('dining-cancellation', { subject: { bookingId: 'dev_bkg_dinner_5' }, details: { date: '2027-05-20' } }), ctx0), ctx0);
  check('goodwill: a disruption on the anniversary proposes the celebration amenity', evaluateGoodwill({ plan: onDay, ctx: ctx0, rules, policy: MVP_GOODWILL_POLICY, approvedByRule: {} }).proposals.some((p) => p.ruleId === 'dev_gw_occasion_amenity'));
  check('goodwill: limit per reservation', evaluateGoodwill({ plan, ctx: ctx0, rules, policy: MVP_GOODWILL_POLICY, approvedByRule: { dev_gw_private_lost_gesture: 1 } }).skipped.some((x) => x.ruleId === 'dev_gw_private_lost_gesture' && x.reason === 'limit'));
  const credit: GoodwillRule = { ...rules[3]!, status: 'approved', authorizedBy: 'CFO (fictional)', authorizedAt: '2026-09-01T10:00:00+02:00', minSeverity: 'moderate', conditions: {}, appliesTo: ['excursion-cancellation'] };
  const offPolicy = evaluateGoodwill({ plan, ctx: ctx0, rules: [credit], policy: MVP_GOODWILL_POLICY, approvedByRule: {} });
  check('MVP: an approved financial rule is still never proposed', offPolicy.proposals.length === 0 && offPolicy.skipped[0]?.reason === 'financial-disabled', offPolicy);
  const onPolicy = evaluateGoodwill({ plan, ctx: ctx0, rules: [credit], policy: { financialEnabled: true }, approvedByRule: {} });
  check('future: with the policy on, a financial proposal needs an admin', onPolicy.proposals[0]?.financial === true && onPolicy.proposals[0].approvalRole === 'admin', onPolicy);
  check('goodwill: approved but not authorised is ignored', evaluateGoodwill({ plan, ctx: ctx0, rules: [{ ...rules[0]!, authorizedBy: undefined }], policy: MVP_GOODWILL_POLICY, approvedByRule: {} }).skipped[0]?.reason === 'not-authorized');
  check('goodwill: outside its dates is ignored', evaluateGoodwill({ plan, ctx: ctx0, rules: [{ ...rules[0]!, effectiveTo: '2027-04-01T00:00:00Z' }], policy: MVP_GOODWILL_POLICY, approvedByRule: {} }).skipped[0]?.reason === 'not-effective');
  check('goodwill: severity below the rule is ignored', evaluateGoodwill({ plan: transfer!, ctx: ctx0, rules: [{ ...rules[0]!, appliesTo: ['transfer-delay'] }], policy: MVP_GOODWILL_POLICY, approvedByRule: {} }).skipped[0]?.reason === 'severity');

  const proposal = gw.proposals[0]!;
  const at = '2027-05-11T15:05:00+02:00';
  const pol = { policy: MVP_GOODWILL_POLICY, approvedForRule: 0 };
  const byElena = decideProposal(proposal, rules[0], { approve: true, actor: { id: 'elena', roles: ['suite_ambassador'] }, now: at, note: '  The 2007 Barolo, perhaps. ' }, pol);
  check('decide: the Suite Ambassador may approve the gesture', byElena.ok && byElena.proposal.status === 'approved' && byElena.proposal.decidedBy === 'elena' && byElena.proposal.note === 'The 2007 Barolo, perhaps.', byElena);
  check('decide: a guest may not', !decideProposal(proposal, rules[0], { approve: true, actor: { id: 'g', roles: ['guest'] }, now: at }, pol).ok);
  check('decide: another crew role may not', (decideProposal(proposal, rules[0], { approve: true, actor: { id: 's', roles: ['shore_ops'] }, now: at }, pol) as { reason?: string }).reason === 'forbidden');
  check('decide: an admin may', decideProposal(proposal, rules[0], { approve: true, actor: { id: 'a', roles: ['admin'] }, now: at }, pol).ok);
  check('decide: declining is fine', (decideProposal(proposal, rules[0], { approve: false, actor: { id: 'elena', roles: ['suite_ambassador'] }, now: at }, pol) as { proposal?: { status: string } }).proposal?.status === 'declined');
  check('decide: only once', (decideProposal({ ...proposal, status: 'approved' }, rules[0], { approve: true, actor: { id: 'a', roles: ['admin'] }, now: at }, pol) as { reason?: string }).reason === 'already-decided');
  check('decide: a rule changed since is re-checked', (decideProposal(proposal, { ...rules[0]!, version: 2 }, { approve: true, actor: { id: 'a', roles: ['admin'] }, now: at }, pol) as { reason?: string }).reason === 'rule-inactive');
  check('decide: the limit holds', (decideProposal(proposal, rules[0], { approve: true, actor: { id: 'a', roles: ['admin'] }, now: at }, { ...pol, approvedForRule: 1 }) as { reason?: string }).reason === 'limit');
  const fin = onPolicy.proposals[0]!;
  check('decide: financial needs an admin and the policy on', (decideProposal(fin, credit, { approve: true, actor: { id: 'e', roles: ['suite_ambassador'] }, now: at }, { policy: { financialEnabled: true }, approvedForRule: 0 }) as { reason?: string }).reason === 'forbidden' && (decideProposal(fin, credit, { approve: true, actor: { id: 'a', roles: ['admin'] }, now: at }, pol) as { reason?: string }).reason === 'financial-disabled' && decideProposal(fin, credit, { approve: true, actor: { id: 'a', roles: ['admin'] }, now: at }, { policy: { financialEnabled: true }, approvedForRule: 0 }).ok);

  // ─── The service ─────────────────────────────────────────────────────────
  const m = services();
  const store = new MemoryRecoveryStore(m, { rules });
  const svc = new ComposedRecoveryService(m, store);
  check('no notices before anything happens', (await svc.listNotices(G, R)).length === 0);
  const first = await store.report(demo);
  await m.experience.cancelBooking('dev_bkg_classic_sail');
  check('recorded once, with its proposal', first.status === 'recorded' && first.severity === 'high' && first.alternatives === 3 && first.proposals === 1, first);
  check('reported again: a duplicate', (await store.report(demo)).status === 'duplicate');
  let changes = 0;
  const unsub = svc.subscribe(R, () => (changes += 1));
  const [notice] = await svc.listNotices(G, R);
  check('the notice reads as planned, after the booking was cancelled', notice?.title === plan.message.title && notice.alternatives.length === 3 && notice.alternatives[0]?.experienceId === 'dev_exp_tropez_village' && notice.status === 'open', notice);
  check('the notice carries nothing for the crew', !JSON.stringify(notice).match(/severity|crewBrief|35 knots|proposal|goodwill|escalat/i), notice);
  const n = notice!;
  check('get one', (await svc.getNotice(G, R, n.id)).id === n.id && (await rejects(svc.getNotice(G, R, 'nope'), 'not_found')));
  const village = n.alternatives[0]!;
  check('no approval, nothing requested', await rejects(svc.acceptAlternative(G, R, n.id, { alternativeId: village.id } as never), 'validation'));
  check('a price must be acknowledged', await rejects(svc.acceptAlternative(G, R, n.id, { alternativeId: village.id, approved: true }), 'validation'));
  check('an unknown alternative', await rejects(svc.acceptAlternative(G, R, n.id, { alternativeId: 'x', approved: true }), 'not_found'));
  const before = (await m.experience.listBookings(R)).length;
  const chosen = await svc.acceptAlternative(G, R, n.id, { alternativeId: village.id, approved: true, acknowledgedCharge: true, note: 'Coffee first, please.' });
  const bookings = await m.experience.listBookings(R);
  const req = bookings.find((b) => b.id === chosen.bookingId);
  check('accepted: a booking request for the team to confirm, never a booking', req?.status === 'received' && req.experienceId === 'dev_exp_tropez_village' && req.start === '2027-05-18T10:00:00+02:00' && req.partySize === 2 && bookings.length === before + 1, req);
  check('accepted: the note says what it replaces', req?.note === 'In place of Under sail on a 1930s classic yacht. Coffee first, please.', req?.note);
  check('accepted: the notice shows the choice and offers nothing else', chosen.notice.accepted?.title === 'Saint-Tropez on Foot, Privately' && chosen.notice.accepted.bookingId === chosen.bookingId && chosen.notice.alternatives.length === 0 && chosen.notice.status === 'resolved', chosen.notice);
  check('accepted once only', await rejects(svc.acceptAlternative(G, R, n.id, { alternativeId: n.alternatives[1]!.id, approved: true, acknowledgedCharge: true }), 'conflict'));
  const help = await svc.requestAssistance(G, R, n.id, 'Something quiet for the afternoon.');
  const helpReq = await m.requests.get(help.requestId!);
  check('assistance: a request to the team, tagged to the notice', helpReq.category === 'excursion' && helpReq.priority === 'priority' && helpReq.occasionStep === `recovery:${n.id}:assist` && helpReq.description.includes('Something quiet for the afternoon.'), helpReq);
  check('assistance: shown on the notice', help.notice.assistance.requested && help.notice.assistance.requestId === help.requestId);
  check('assistance: once', await rejects(svc.requestAssistance(G, R, n.id), 'conflict'));
  check('listeners hear each change', changes === 2, changes);
  unsub();

  const ops = store.operations({ id: 'elena', roles: ['suite_ambassador'] });
  const [rec] = await ops.listRecords(R);
  check('crew: the record, with the plan and the brief', rec?.kind === 'excursion-cancellation' && rec.status === 'in-hand' && rec.crewBrief.length > 3 && rec.steps.some((x) => x.kind === 'record'), rec);
  const [prop] = await ops.listProposals(R);
  check('crew: the proposal awaits a decision; nothing was applied', prop?.status === 'proposed' && prop.ruleId === 'dev_gw_private_lost_gesture', prop);
  check('guests cannot see the crew side', await rejects(store.operations({ id: 'g', roles: ['guest'] }).listRecords(R), 'forbidden'));
  check('shore operations may not approve a Suite Ambassador’s gesture', await rejects(store.operations({ id: 's', roles: ['shore_ops'] }).decideProposal(prop!.id, { approve: true }), 'forbidden'));
  const decided = await ops.decideProposal(prop!.id, { approve: true, note: 'The 2007 Barolo.' });
  check('the Suite Ambassador approves: recorded, by whom', decided.status === 'approved' && decided.decidedBy === 'elena');
  check('decided once', await rejects(ops.decideProposal(prop!.id, { approve: false }), 'conflict'));

  // A second and a third disruption: the count escalates, and the assistance request is not detected again.
  await store.report({ ...base('suite-issue', { key: 'k2', source: 'crew' }) });
  const third2 = await store.report({ ...base('missed-service', { key: 'k3', subject: { requestId: 'dev_srq_heli' } }) });
  check('third disruption is escalated', third2.severity === 'high', third2);
  const notices = await svc.listNotices(G, R);
  check('open notices first, then resolved', notices.length === 3 && notices[0]!.status === 'open' && notices.at(-1)!.status === 'resolved', notices.map((x) => x.status));

  // ─── View models ─────────────────────────────────────────────────────────
  const vm = buildRecoveryModel(n, 2);
  const villageVm = vm.alternatives[0]!;
  check('model: says exactly what will be sent, and that nothing is booked yet', villageVm.summary === 'A request for Saint-Tropez on Foot, Privately on Tuesday 18 May at 10:00, for two, in place of “Under sail on a 1930s classic yacht”. The team will confirm it with you; nothing is booked until they do.', villageVm.summary);
  check('model: the price to acknowledge', villageVm.acknowledgement === 'I understand €650 will be charged to my account once the team confirms it.' && villageVm.confirmLabel === 'Send the request');
  check('model: an included alternative has nothing to acknowledge', vm.alternatives.filter((a) => !a.chargeable).every((a) => !a.acknowledgement));
  check('model: Elena can arrange something else entirely', vm.assistance.line === 'Or Elena can arrange something else entirely.' && vm.explanation === demo.reason?.guest);
  const card = recoveryCard(n);
  check('Home card', card.eyebrow === 'A change to your plans · 18 May' && card.line === 'Elena has 3 comparable alternatives for you.' && card.cta === 'See the alternatives', card);
  const after = buildRecoveryModel((await svc.getNotice(G, R, n.id)) as RecoveryNotice, 2);
  check('model after choosing: the choice, and Elena in hand', after.accepted?.title === 'Saint-Tropez on Foot, Privately' && after.alternatives.length === 0 && after.assistance.line === 'Elena has this in hand and will come back to you personally.' && after.resolved);

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Service recovery: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Service recovery: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
