/// <reference types="node" />
/**
 * Post-voyage checks.  Run: `npm run check:post-voyage`
 *
 * "Welcome home." only once the voyage is over; memories only of what took
 * place (never a private occasion); destinations; favourite moments,
 * suggested then chosen; the Bonvoy placeholder (no invented numbers); the
 * Suite Ambassador's note; recommendations and inspiration that follow the
 * guest's own interests; and the reflections: optional, validated, saved as
 * the guest goes, sent once, never a score.
 */
import { devDataset as d, IDS } from '@/data/fixtures';
import type { VoyageRecap } from '@/domain';
import { FEEDBACK_WORDS } from '@/domain';
import { reflectionSteps, reviewLines, shared, welcomeHomeCard } from '@/features/welcomeHome/welcomeHomeModel';
import { ServiceError } from '@/services/contracts';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockLoyaltyService } from '@/services/mock/MockLoyaltyService';
import { MockGuestRecordSource } from '@/services/mock/MockMiscServices';
import { MockServiceRequestService } from '@/services/mock/MockServiceRequestService';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { MockRequestStore } from '@/services/mock/requestStore';
import { ComposedPostVoyageService } from '@/services/postVoyage/ComposedPostVoyageService';
import { buildRecap, emptyFeedback, happened, isVoyageComplete, type RecapInput } from '@/services/postVoyage/recap';
import { MemoryPostVoyageStore } from '@/services/postVoyage/store';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';

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

const G = IDS.guest;
const R = IDS.reservation;
const HOME = new Date('2027-05-26T10:00:00-04:00');

function world(now: Date) {
  let clockNow = now;
  const clock = { now: () => clockNow };
  const profile = new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore()));
  const voyage = new MockVoyageService();
  const experience = new MockExperienceService();
  const loyalty = new MockLoyaltyService();
  const requests = new MockServiceRequestService({ store: new MockRequestStore(), voyage });
  const service = new ComposedPostVoyageService({ profile, loyalty, voyage, experience, requests, clock }, new MemoryPostVoyageStore(d.postVoyage.voyageInspirations));
  return { service, experience, requests, setNow: (n: Date) => (clockNow = n) };
}

/** The same input the service builds, for the pure rules. */
async function inputAt(now: Date): Promise<RecapInput> {
  const profile = await new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore())).getProfile(G);
  const voyage = new MockVoyageService();
  const overview = await voyage.getOverview(R);
  const experience = new MockExperienceService();
  return {
    now,
    guest: { id: G, firstName: 'Alexander', companions: ['Camille'] },
    occasions: profile.occasions,
    voyage: overview.voyage,
    yachtName: overview.yacht.name,
    suite: 'Grand Suite 612',
    reservationId: R,
    ambassador: { name: 'Elena Moreau', firstName: 'Elena', title: 'Suite Ambassador' },
    bookings: await experience.listBookings(R),
    catalogue: await experience.listCatalogue(overview.voyage.id),
    destinations: await experience.listDestinations(overview.voyage.id),
    requests: [],
    membership: await new MockLoyaltyService().getMembership(G),
    pastVoyages: await voyage.getPastVoyages(G),
    preferences: profile.preferences,
    inspirations: d.postVoyage.voyageInspirations,
    feedback: emptyFeedback(G, R, now.toISOString()),
  };
}

async function main() {
  // ─── When ────────────────────────────────────────────────────────────────
  check('only after the voyage', ['return-home', 'remember', 'rebook'].every((p) => isVoyageComplete(p as never)) && !['prepare', 'travel-to-embarkation', 'embark', 'sail'].some((p) => isVoyageComplete(p as never)));
  check('before the voyage: nothing', (await world(new Date(d.meta.referenceNow)).service.getRecap(G, R)) === null);
  check('during the voyage: nothing', (await world(new Date('2027-05-18T12:00:00+02:00')).service.getRecap(G, R)) === null);
  const w = world(HOME);
  const recap = (await w.service.getRecap(G, R)) as VoyageRecap;
  check('after: the recap', recap !== null);

  // ─── Welcome home ────────────────────────────────────────────────────────
  check('the title, exactly', recap.welcome.title === 'Welcome home.');
  check('the welcome, personal', recap.welcome.line === 'Alexander, we hope the journey home was a gentle one. Here is your voyage, as we will remember it.' && recap.welcome.eyebrow === 'Balearics & the Riviera · 15 – 22 May 2027');
  check('the voyage in a sentence', recap.summary.line === 'Seven nights, six ports and four countries aboard Evrima, in Grand Suite 612.', recap.summary.line);

  // ─── Memories ────────────────────────────────────────────────────────────
  check('a page for each day', recap.days.length === 8 && recap.days.map((x) => x.place).join() === 'Barcelona,Palma de Mallorca,At sea,Saint-Tropez,Monte Carlo,Monte Carlo,Portofino,Rome (Civitavecchia)', recap.days.map((x) => x.place));
  const day6 = recap.days.find((x) => x.dayNumber === 6)!;
  check('the anniversary first on its day, with Camille', day6.memories[0]?.kind === 'occasion' && day6.memories[0].title === '20th wedding anniversary' && day6.memories[0].line === 'In Monte Carlo, with Camille', day6.memories[0]);
  check('then the day in order', day6.memories.slice(1).map((m) => m.time).join() === '09:30,16:00,20:30');
  check('transfers are not memories', !recap.days.some((x) => x.memories.some((m) => /transfer/i.test(m.title))));
  check('the last day: nothing invented', recap.days.at(-1)!.memories.length === 0);
  const memoryIds = recap.days.flatMap((x) => x.memories.map((m) => m.id));
  check('memory ids are stable and unique', new Set(memoryIds).size === memoryIds.length && memoryIds.includes('booking:dev_bkg_sagrada'));
  // Only what took place.
  const w2 = world(HOME);
  await w2.experience.cancelBooking('dev_bkg_classic_sail');
  await w2.experience.requestBooking(R, 'dev_exp_jazz', '2027-05-17T21:30:00+02:00', 2);
  const r2 = (await w2.service.getRecap(G, R))!;
  const titles2 = r2.days.flatMap((x) => x.memories.map((m) => m.title));
  check('a cancelled booking is not a memory; nor is one never confirmed', !titles2.includes('Under sail on a 1930s classic yacht') && !titles2.some((t) => /Jazz/.test(t)), titles2);
  check('happened: completed, or confirmed and over', happened({ status: 'completed', start: '2030-01-01T00:00:00Z' } as never, HOME) && !happened({ status: 'confirmed', start: '2027-06-01T00:00:00Z' } as never, HOME) && !happened({ status: 'received', start: '2027-05-01T00:00:00Z' } as never, HOME));
  const input = await inputAt(HOME);
  const privately = buildRecap({ ...input, occasions: input.occasions.map((o) => ({ ...o, recognition: 'private' as const })) });
  check('a private occasion is never mentioned', !privately.days.some((x) => x.memories.some((m) => m.kind === 'occasion')) && !privately.thankYou.body.some((l) => /anniversary/i.test(l)) && !privately.favourites.memories.some((m) => m.kind === 'occasion'));

  // ─── Destinations ────────────────────────────────────────────────────────
  check('destinations: six, each once', recap.destinations.map((x) => x.portName).join() === 'Barcelona,Palma de Mallorca,Saint-Tropez,Monte Carlo,Portofino,Rome (Civitavecchia)');
  check('destinations: two days in Monte Carlo read as one stay', recap.destinations.find((x) => x.portName === 'Monte Carlo')?.when === '19 – 20 May');
  check('destinations: with their country and a line', recap.destinations.every((x) => x.country && x.standfirst));

  // ─── Favourites ──────────────────────────────────────────────────────────
  check('favourites: suggested until chosen — the anniversary, its dinner, then the most personal', !recap.favourites.chosen && recap.favourites.memories.map((m) => m.title).join(' | ') === '20th wedding anniversary | Anniversary dinner on a private terrace | Villa Ephrussi de Rothschild, quietly', recap.favourites.memories.map((m) => m.title));

  // ─── Bonvoy ──────────────────────────────────────────────────────────────
  check('Bonvoy: status, a placeholder, not connected', recap.bonvoy.tierLabel === 'Titanium Elite' && recap.bonvoy.lifetimeStatus === 'Lifetime Platinum Elite' && recap.bonvoy.connected === false && /once Marriott Bonvoy has posted them/.test(recap.bonvoy.note));
  check('Bonvoy: no invented numbers', !/\d+\s*(points|nights earned)/i.test(JSON.stringify(recap.bonvoy)) && !('pointsBalance' in recap.bonvoy));

  // ─── The note from Elena ─────────────────────────────────────────────────
  check('thank-you: to both of them', recap.thankYou.body[0] === 'Dear Alexander and Camille,' && recap.thankYou.title === 'A note from Elena');
  check('thank-you: the anniversary, quietly, as they wished', recap.thankYou.body.includes('It was a privilege to help mark your 20th wedding anniversary in Monte Carlo, quietly, as you wished.'));
  check('thank-you: signed', recap.thankYou.signature === 'Elena Moreau, Suite Ambassador');
  check('nothing exclamatory anywhere', !/!/.test([recap.welcome.line, ...recap.thankYou.body, ...recap.recommendations.map((r) => r.reason)].join(' ')));

  // ─── Recommendations and inspiration ─────────────────────────────────────
  check('three recommendations', recap.recommendations.length === 3);
  check('…led by Amalfi and the Aeolian Islands', recap.recommendations[0]?.name === 'Amalfi, Sicily & the Aeolian Islands', recap.recommendations.map((r) => r.name));
  check('…not the Adriatic, sailed in 2024', !recap.recommendations.some((r) => r.region === 'Adriatic'));
  check('…each with a reason from the voyage’s own lines, and the guest’s moment behind it', recap.recommendations.every((r) => r.reason.length > 10 && Object.values(d.postVoyage.voyageInspirations.find((i) => i.id === r.inspirationId)!.hooks).includes(r.reason)) && recap.recommendations.every((r) => !r.because || memoryIds.some((id) => recap.days.flatMap((x) => x.memories).find((m) => m.id === id)?.title === r.because)), recap.recommendations);
  const later = buildRecap({ ...input, now: new Date('2028-06-20T12:00:00Z') });
  check('voyages already sailing are not suggested', later.recommendations.every((r) => d.postVoyage.voyageInspirations.find((i) => i.id === r.inspirationId)!.startDate > '2028-06-20'));
  const sailor = buildRecap({ ...input, feedback: { ...input.feedback, favourites: ['booking:dev_bkg_riva', 'booking:dev_bkg_classic_sail', 'booking:dev_bkg_oceanographic'] } });
  const corsica = sailor.recommendations.find((r) => r.inspirationId === 'dev_insp_corsica');
  check('favourites change the reasons: a sailor hears about the sea', corsica?.reason === 'Anchorages you can only reach by sea.' && corsica.because === 'San Fruttuoso by Riva', corsica);
  check('favourites chosen are shown as theirs', sailor.favourites.chosen && sailor.favourites.memories.map((m) => m.id).join() === 'booking:dev_bkg_riva,booking:dev_bkg_classic_sail,booking:dev_bkg_oceanographic');
  check('inspiration: the first recommendation, editorially', recap.inspiration?.voyage.inspirationId === recap.recommendations[0]?.inspirationId && recap.inspiration?.eyebrow === 'Next voyage inspiration');
  check('inspiration: their preferences travel with them, for a fifth voyage', recap.inspiration?.closing === 'Your preferences travel with you: a window table and private guides ashore, for what would be your fifth voyage with us.', recap.inspiration?.closing);

  // ─── People to thank ─────────────────────────────────────────────────────
  check('crew to thank: Elena first, then the sommelier and the teams', recap.crew.map((c) => c.id).join() === 'ambassador,luca-ferraro,restaurants,spa,deck' && recap.crew[1]?.role === 'Head Sommelier', recap.crew);

  // ─── Reflections ─────────────────────────────────────────────────────────
  const s = w.service;
  check('reflections: not before the voyage is over', await rejects(world(new Date(d.meta.referenceNow)).service.saveFeedback(G, R, { words: ['Restful'] }), 'validation'));
  check('reflections: favourites must be moments from the voyage', await rejects(s.saveFeedback(G, R, { favourites: ['booking:nope'] }), 'validation'));
  check('reflections: five favourites at most', await rejects(s.saveFeedback(G, R, { favourites: memoryIds.slice(0, 6) }), 'validation'));
  check('reflections: words from the list, three at most', (await rejects(s.saveFeedback(G, R, { words: ['Meh'] }), 'validation')) && (await rejects(s.saveFeedback(G, R, { words: FEEDBACK_WORDS.slice(0, 4) }), 'validation')));
  check('reflections: thanks only to the crew of the voyage', await rejects(s.saveFeedback(G, R, { thanks: [{ crewId: 'someone' }] }), 'validation'));
  check('reflections: notes kept short', await rejects(s.saveFeedback(G, R, { thanks: [{ crewId: 'ambassador', note: 'x'.repeat(301) }] }), 'validation'));
  check('reflections: nothing yet, nothing to send', await rejects(s.sendFeedback(G, R), 'validation'));
  const f1 = await s.saveFeedback(G, R, { favourites: ['occasion:dev_occ_anniv_20', 'booking:dev_bkg_riva', 'booking:dev_bkg_riva'] }, { expectedVersion: 0 });
  check('saved as they go: a draft, versioned, duplicates folded', f1.status === 'draft' && f1.version === 1 && f1.favourites.join() === 'occasion:dev_occ_anniv_20,booking:dev_bkg_riva');
  check('a stale edit is refused', await rejects(s.saveFeedback(G, R, { words: ['Restful'] }, { expectedVersion: 0 }), 'conflict'));
  const f2 = await s.saveFeedback(G, R, { words: ['Celebratory', 'Unhurried'], thanks: [{ crewId: 'ambassador', note: '  Everything, quietly.  ' }, { crewId: 'luca-ferraro' }] }, { expectedVersion: 1 });
  check('words and thanks, notes trimmed', f2.words.join() === 'Celebratory,Unhurried' && f2.thanks[0]?.note === 'Everything, quietly.' && f2.thanks[1]?.note === undefined && f2.version === 2);
  const f3 = await s.saveFeedback(G, R, { better: '', followUp: true });
  check('no words, no follow-up', f3.followUp === false && f3.better === undefined);
  const f4 = await s.saveFeedback(G, R, { better: 'The tender in Portofino ran late, and nobody told us why.', followUp: true, nextTime: 'The same suite, please.' });
  check('what could be better, and a wish to hear back', f4.better?.startsWith('The tender') === true && f4.followUp && f4.nextTime === 'The same suite, please.');
  const r3 = (await s.getRecap(G, R))!;
  check('the recap now shows their own favourites', r3.favourites.chosen && r3.favourites.memories.map((m) => m.title).join(' | ') === '20th wedding anniversary | San Fruttuoso by Riva');
  const sent = await s.sendFeedback(G, R);
  check('sent: once, with a time', sent.status === 'sent' && Boolean(sent.sentAt));
  const followReq = await w.requests.get(sent.followUpRequestId!);
  check('asked to be contacted: a request for the team, in their words', followReq.category === 'concierge' && followReq.priority === 'priority' && followReq.description.includes('The tender in Portofino ran late'), followReq);
  check('sent reflections are not edited, nor sent twice', (await rejects(s.saveFeedback(G, R, { words: ['Restful'] }), 'conflict')) && (await rejects(s.sendFeedback(G, R), 'conflict')));
  check('the recap knows', (await s.getRecap(G, R))!.feedback.status === 'sent');

  // ─── View models ─────────────────────────────────────────────────────────
  const steps = reflectionSteps(recap);
  check('reflections: five questions and a review', steps.map((x) => x.key).join() === 'moments,words,thanks,better,nextTime,review' && steps[0]?.eyebrow === '1 of 5' && steps[5]?.eyebrow === 'Your reflections');
  check('reflections: the questions, in the house voice', steps.map((x) => x.title).join(' | ') === 'Which moments stay with you? | If the voyage were a word or two… | Is there anyone you would like us to thank? | Was there anything we could have done better? | Anything to remember for next time? | Ready when you are');
  check('reflections: not a survey (no ratings, scores or scales)', !/rate|rating|score|stars?\b|scale|1[–-]10|likely to recommend|survey/i.test(JSON.stringify(steps)));
  const lines = reviewLines(recap, f4);
  check('review: what will be sent, in plain words', lines[0] === 'The moments that stay with you: 20th wedding anniversary and San Fruttuoso by Riva.' && lines[1] === 'In a word: celebratory and unhurried.' && lines[2] === 'Your thanks to Elena Moreau and Luca Ferraro.' && /and that you would like someone to get in touch/.test(lines[3] ?? '') && lines[4] === 'A note for next time.', lines);
  check('progress: how many of the five', shared(f4) === 5 && shared(f1) === 1 && shared(emptyFeedback(G, R, '')) === 0);
  const card = welcomeHomeCard(recap);
  check('Home card: Welcome home.', card.title === 'Welcome home.' && card.cta === 'Your voyage, remembered' && card.reflections === 'A few words, when you are ready.');
  check('Home card: after sending, thanks', welcomeHomeCard((await s.getRecap(G, R))!).reflections === 'Thank you for your reflections.');

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Post-voyage: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Post-voyage: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
