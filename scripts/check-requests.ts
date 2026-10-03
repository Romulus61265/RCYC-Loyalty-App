/// <reference types="node" />
/**
 * Service request checks.  Run: `npm run check:requests`
 *
 * Categories, routing, the five guest statuses and how underlying states map
 * onto them, timelines, validation, the mock ServiceRequestService (submit,
 * lists, close, live updates, the store shared with the concierge), and the
 * Requests view models.
 */
import type { ServiceRequest, ServiceRequestStatus } from '@/domain';
import { devDataset as d, IDS } from '@/data/fixtures';
import { buildRequestDetail, buildRequestsList } from '@/features/requests/requestsModel';
import { MockConciergeService } from '@/services/mock/MockConciergeService';
import { MockServiceRequestService } from '@/services/mock/MockServiceRequestService';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { MockRequestStore } from '@/services/mock/requestStore';
import { ServiceError } from '@/services/contracts';
import { categoryOf, routeFor, SERVICE_REQUEST_CATEGORIES, statusOf, timelineOf, toGuestRequest, validateNewRequest } from '@/services/shared/serviceRequests';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${typeof detail === 'string' ? detail.slice(0, 700) : JSON.stringify(detail).slice(0, 700)}`}`);
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
const base: ServiceRequest = { id: 'x', reservationId: R, type: 'general', summary: 'x', status: 'received', priority: 'routine', assignedTeam: 'guest-services', createdAt: '2027-05-01T10:00:00-04:00', updatedAt: '2027-05-01T10:00:00-04:00' };

async function main() {
  // ─── Categories and routing ─────────────────────────────────────────────
  check('ten categories', SERVICE_REQUEST_CATEGORIES.map((c) => c.key).join() === 'suite,dining,housekeeping,maintenance,transportation,excursion,spa,concierge,special-assistance,other');
  check('every category routes to a team and a department', SERVICE_REQUEST_CATEGORIES.every((c) => Boolean(routeFor(c.key, 'aboard').team && routeFor(c.key, 'aboard').label)));
  check('housekeeping and maintenance aboard', routeFor('housekeeping', 'aboard').label === 'Housekeeping' && routeFor('maintenance', 'aboard').label === 'Engineering');
  check('concierge: shoreside at home, Guest Services aboard', routeFor('concierge', 'home').team === 'shoreside-concierge' && routeFor('concierge', 'aboard').team === 'guest-services');
  check('transport and excursions: Destination Services', routeFor('transportation', 'home').team === 'destination-services' && routeFor('excursion', 'aboard').team === 'destination-services');
  check('older requests get a category from their type', categoryOf({ type: 'dining-change' }) === 'dining' && categoryOf({ type: 'transport' }) === 'transportation' && categoryOf({ type: 'medical' }) === 'special-assistance');

  // ─── Statuses ───────────────────────────────────────────────────────────
  const map: [Partial<ServiceRequest>, ServiceRequestStatus][] = [
    [{ status: 'received' }, 'submitted'],
    [{ status: 'received', acknowledgedAt: '2027-05-01T11:00:00-04:00' }, 'acknowledged'],
    [{ status: 'in_progress' }, 'in_progress'],
    [{ status: 'awaiting_guest' }, 'in_progress'],
    [{ status: 'confirmed' }, 'resolved'],
    [{ status: 'completed' }, 'resolved'],
    [{ status: 'completed', closedAt: '2027-05-02T10:00:00-04:00' }, 'closed'],
    [{ status: 'cancelled' }, 'closed'],
    [{ status: 'declined' }, 'closed'],
  ];
  const wrong = map.filter(([r, s]) => statusOf({ ...base, ...r }) !== s);
  check('underlying states map onto the five statuses', wrong.length === 0, wrong);
  const tl = timelineOf({ ...base, status: 'completed', acknowledgedAt: '2027-05-01T11:00:00-04:00', startedAt: '2027-05-01T12:00:00-04:00', resolvedAt: '2027-05-02T09:00:00-04:00', closedAt: '2027-05-03T09:00:00-04:00' });
  check('timeline: all five steps, in order, in time', tl.map((t) => t.status).join() === 'submitted,acknowledged,in_progress,resolved,closed' && tl.every((t, i) => i === 0 || Date.parse(tl[i - 1]!.at) <= Date.parse(t.at)), tl);
  const withdrawn = timelineOf({ ...base, status: 'cancelled', closedAt: '2027-05-01T10:30:00-04:00' });
  check('timeline: withdrawn before anyone started skips the middle', withdrawn.map((t) => t.status).join() === 'submitted,closed', withdrawn);
  check('timeline: in progress fills acknowledged', timelineOf({ ...base, status: 'in_progress' }).map((t) => t.status).join() === 'submitted,acknowledged,in_progress');

  // ─── Validation ─────────────────────────────────────────────────────────
  check('validation: category, description, priority', Object.keys(validateNewRequest({})).sort().join() === 'category,description' && Boolean(validateNewRequest({ category: 'spa', description: 'x'.repeat(1001) }).description) && Boolean(validateNewRequest({ category: 'spa', description: 'Fine', priority: 'whenever' as never }).priority));
  check('validation: a good request passes', Object.keys(validateNewRequest({ category: 'maintenance', description: 'The terrace door sticks.' })).length === 0);

  // ─── The fixture requests, as the guest sees them ───────────────────────
  const ctx = { guest: { id: IDS.guest, name: 'Alexander Laurent' }, voyage: { id: IDS.voyage, name: d.voyage.voyage.name }, where: 'home' as const };
  const all = d.concierge.requests.map((r) => toGuestRequest(r, ctx));
  const missing = all.filter((r) => !r.id || !r.guest.name || !r.voyage.name || !r.category || !r.description || !r.priority || !r.status || !r.createdAt || !r.assignedTeam.label);
  check('every request has id, guest, voyage, category, description, priority, status, created time, team', missing.length === 0, missing.map((r) => r.id));
  check('resolved and closed requests carry resolution notes', all.filter((r) => r.status === 'resolved' || r.status === 'closed').every((r) => Boolean(r.resolutionNotes)));
  check('fixture covers every status', new Set(all.map((r) => r.status)).size === 5, [...new Set(all.map((r) => r.status))]);
  check('the bridge request is waiting on the guest', all.find((r) => r.id === 'dev_srq_bridge')?.awaitingGuest === true);

  // ─── Mock service ───────────────────────────────────────────────────────
  {
    const store = new MockRequestStore();
    const svc = new MockServiceRequestService({ store, voyage: new MockVoyageService() });
    const active = await svc.listActive(R);
    const history = await svc.listHistory(R);
    check('active: submitted, acknowledged and in progress', active.length === 4 && active.every((r) => ['submitted', 'acknowledged', 'in_progress'].includes(r.status)), active.map((r) => r.status));
    check('history: resolved and closed', history.length === 3 && history.every((r) => r.status === 'resolved' || r.status === 'closed'));
    check('newest activity first', active.every((r, i) => i === 0 || Date.parse(active[i - 1]!.updatedAt) >= Date.parse(r.updatedAt)));
    check('submit refuses an empty request', await rejects(svc.submit({ reservationId: R, category: 'suite', description: ' ' }), 'validation'));

    const seen: string[] = [];
    const off = svc.subscribe(R, (r) => seen.push(`${r.id}:${r.status}`));
    const created = await svc.submit({ reservationId: R, category: 'maintenance', description: 'The terrace door is difficult to close.\n\nNo rush.', priority: 'priority' });
    check('submitted: status, team, guest, voyage', created.status === 'submitted' && created.assignedTeam.label === 'Engineering' && created.guest.name === 'Alexander Laurent' && created.voyage.name === d.voyage.voyage.name);
    check('submitted: title from the first line, description kept', created.title === 'The terrace door is difficult to close.' && created.description.includes('No rush.'));
    check('submitted: next update promised', Boolean(created.nextUpdateBy));
    check('appears in active', (await svc.listActive(R)).some((r) => r.id === created.id));
    const concierge = new MockConciergeService({ requests: store });
    check('the concierge sees the same request (one store)', (await concierge.listServiceRequests(R)).some((r) => r.id === created.id && r.category === 'maintenance'));
    const raised = await concierge.createServiceRequest(R, { type: 'transport', summary: 'A car to Monaco station' });
    check('… and requests the concierge raises appear in Requests', (await svc.listActive(R)).some((r) => r.id === raised.id && r.category === 'transportation'));
    const closed = await svc.close(created.id);
    check('withdraw before work starts: closed, with a note', closed.status === 'closed' && closed.timeline.map((t) => t.status).join() === 'submitted,closed' && /Withdrawn/.test(closed.resolutionNotes ?? ''));
    check('withdrawn: in history', (await svc.listHistory(R)).some((r) => r.id === created.id));
    check('cannot close twice', await rejects(svc.close(created.id), 'conflict'));
    check('cannot withdraw once in progress', await rejects(svc.close('dev_srq_bridge'), 'conflict'));
    const wine = await svc.close('dev_srq_wine_2007');
    check('a resolved request can be closed, keeping its resolution', wine.status === 'closed' && wine.timeline.some((t) => t.status === 'resolved') && /Barolo/.test(wine.resolutionNotes ?? ''));
    check('live updates reach subscribers', seen.some((s) => s === `${created.id}:submitted`) && seen.some((s) => s === `${created.id}:closed`), seen);
    off();
    check('not found', await rejects(svc.get('srq_nope'), 'not_found'));
  }
  {
    const store = new MockRequestStore();
    const svc = new MockServiceRequestService({ store, voyage: new MockVoyageService(), simulateCrew: { acknowledgeMs: 900, startMs: 2600 } });
    const r = await svc.submit({ reservationId: R, category: 'housekeeping', description: 'Pressing for a dinner jacket by 18:00.' });
    await new Promise((res) => setTimeout(res, 800));
    const ack = await svc.get(r.id);
    await new Promise((res) => setTimeout(res, 2000));
    const started = await svc.get(r.id);
    check('crew simulation: acknowledged, then in progress', ack.status === 'acknowledged' && /Housekeeping team/.test(ack.assignedTeam.person ?? '') && started.status === 'in_progress', [ack.status, started.status]);
  }

  // ─── View models ────────────────────────────────────────────────────────
  {
    const list = buildRequestsList(all.filter((r) => ['submitted', 'acknowledged', 'in_progress'].includes(r.status)), all.filter((r) => r.status === 'resolved' || r.status === 'closed'));
    check('list: one needs the guest', list.attention === 1 && list.active.some((r) => r.status.label === 'Needs your reply' && r.status.tone === 'attention'));
    check('list rows: category, status, opened and team', list.active.every((r) => r.category && r.status.label && /^Opened \d+ \w+ · /.test(r.meta)));
    const bedding = buildRequestDetail(all.find((r) => r.id === 'dev_srq_bedding')!);
    check('detail: five steps, all reached', bedding.steps.map((s) => s.state).join() === 'done,done,done,done,current' && bedding.steps.every((s) => s.when));
    check('detail: resolution and fields', Boolean(bedding.resolution) && ['Category', 'Priority', 'With', 'Opened', 'Requested by', 'Voyage'].every((l) => bedding.facts.some((f) => f.label === l)));
    check('detail: closed requests offer no action', bedding.close === undefined);
    const transfer = buildRequestDetail(all.find((r) => r.id === 'dev_srq_transfer_early')!);
    check('detail: withdrawn shows only what happened', transfer.steps.map((s) => s.label).join() === 'Submitted,Acknowledged,Closed', transfer.steps);
    const heli = buildRequestDetail(all.find((r) => r.id === 'dev_srq_heli')!);
    check('detail: submitted can be withdrawn', heli.close?.label === 'Withdraw this request' && heli.steps.filter((s) => s.state === 'todo').length === 4);
    const wine = buildRequestDetail(all.find((r) => r.id === 'dev_srq_wine_2007')!);
    check('detail: resolved can be closed', wine.close?.label === 'Close this request');
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Service requests: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Service requests: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
