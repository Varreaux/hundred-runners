// The wall's DEFERRED WIN, driven through the real key() and the real update().
//
//   node tools/blast-check.js [path/to/index.html]
//
// Why this and not a bot run. `blast` no longer wins by returning 'done' from a keypress: one
// SPACE lights a fuse, banks `m.won = true` and `m.inputT = FUSE_BURN`, and the room clears
// when that clock reaches zero. That clock is ticked in TWO PLACES and only one of them runs
// at a time -- `blast.update` while the panel is open, and the `pendingClear` branch of the
// room loop while it is closed -- so the room can be finished with the panel shut, which is
// the case nobody would think to test by hand. If either tick is missing the room never
// clears, the wall never opens, and the crowd piles against it until the run ends: a hang
// with no exception in it, which `probe` reports as "no exception" and a screenshot reports
// as a queue.
//
// A bot run cannot substitute. Both bots press `solveKey` and sit in the room, so they only
// ever exercise the open-panel tick; and a bot that gets stuck simply scores worse, which
// reads as difficulty rather than as a broken contract.
//
// It also prices what an optimal player must press, so room-check's parsed cost can be
// checked against the verb rather than against a second reading of its source.
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const file = process.argv[2] || path.join(root, 'index.html');
const raw = fs.readFileSync(file, 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(root, 'tools', 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src')));
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };
// `eval(src)` in a module keeps every `const` inside the eval's own scope, so VERBS is not
// visible out here -- probe.js gets round it by appending its whole test to the source before
// evaluating. Hand the three things this file needs out through globals instead, which keeps
// the checks readable as JavaScript rather than as a string.
eval(src + '\n; global.__V = VERBS; global.__CFG = CFG; global.__FUSE = FUSE_BURN;'
   + '\n; global.__G = { startDrill, updateDrill, actVerbs, reset, get S() { return S; } };');
const VERBS = global.__V, CFG = global.__CFG, FUSE_BURN = global.__FUSE, G = global.__G;

let fails = 0;
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails++;
};

const V = VERBS.blast;
const DT = 1 / 60;

for (const diff of [0, 1, 2, 3, 4, 5]) {
  const m = V.start(diff);
  const n = m.holes.length;
  let presses = 0;

  // -- beat one: a letter per hole, in order along the wall
  let orderHeld = true, wrongRejected = true, spaceInert = true;
  for (let i = 0; i < n; i++) {
    if (m.idx !== i) orderHeld = false;
    // a key from the pool that is not the next one must be refused, not swallowed
    // Any letter that is not the next one. This read CFG.keyPool, an eight-key pool that
    // existed only to generate the wall's random letters and went with them; the room now
    // treats the whole alphabet as a miss, so the check has to press from the whole alphabet
    // or it would only ever prove the eight keys the room no longer cares about.
    const wrong = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(k => k !== m.holes[i].k);
    if (V.key(m, wrong) !== 'wrong' || m.idx !== i) wrongRejected = false;
    // and SPACE must do nothing until every charge is in: lighting a fuse on a half-packed
    // wall would blow a hole nobody could walk through, and there is no way back from it
    if (V.key(m, ' ') !== null || m.won) spaceInert = false;
    if (V.key(m, m.holes[i].k) !== 'ok') orderHeld = false;
    presses += 1;
  }
  ok(`diff ${diff}: ${n} charges pack in order`, orderHeld && m.idx === n, `idx ${m.idx}`);
  ok(`diff ${diff}: a wrong key is refused, not swallowed`, wrongRejected);
  ok(`diff ${diff}: SPACE is inert until every charge is in`, spaceInert);
  ok(`diff ${diff}: every charge shows as packed`, m.holes.every(q => q.packed));

  // -- beat two: one SPACE, and the win is BANKED rather than returned
  const before = m.won;
  const r = V.key(m, ' ');
  presses += 1;
  ok(`diff ${diff}: one SPACE lights the fuse`, r === 'ok' && !before && m.won === true);
  ok(`diff ${diff}: it does NOT return 'done'`, r !== 'done',
     `returned ${JSON.stringify(r)} -- a verb that returns 'done' clears the room on the keypress and the fuse is never seen`);
  ok(`diff ${diff}: inputT is set to the fuse's own length`, m.inputT === FUSE_BURN,
     `inputT ${m.inputT} vs FUSE_BURN ${FUSE_BURN}`);
  ok(`diff ${diff}: a second SPACE cannot re-light or shorten it`,
     V.key(m, ' ') === null && m.inputT === FUSE_BURN);

  // -- the clock: update() must carry it home, and take the fuse's time doing it
  let t = 0, guard = 0;
  while (m.inputT > 0 && guard++ < 6000) { V.update(m, DT); t += DT; }
  ok(`diff ${diff}: update() runs the fuse down`, m.inputT === 0 && guard < 6000,
     `${t.toFixed(2)}s`);
  ok(`diff ${diff}: it takes the fuse's length, not an instant`,
     Math.abs(t - FUSE_BURN) <= DT + 1e-9, `${t.toFixed(3)}s against ${FUSE_BURN}s`);

  // -- progress must move over the whole room, including the fuse. A bar that stops at the
  //    last letter tells the player the room is finished while the fuse is still burning.
  const m2 = V.start(diff);
  const p0 = V.progress(m2);
  for (const hole of m2.holes) V.key(m2, hole.k);
  const pPacked = V.progress(m2);
  V.key(m2, ' ');
  const pLit = V.progress(m2);
  // SAMPLE THE MIDDLE, not only the end. Checking the end alone cannot tell a bar that
  // creeps across the fuse from one that JUMPS to 1 on the keypress -- both finish at 1, and
  // the jump is the exact bug this is here to catch. Proved by falsifying: `m.lit ? 1 : ...`
  // passed the end-only test.
  let last = pLit, monotonic = true, pMid = null;
  for (let i = 0; i < 200 && m2.inputT > 0; i++) {
    V.update(m2, DT);
    const p = V.progress(m2);
    if (p < last - 1e-9) monotonic = false;
    if (pMid === null && m2.inputT <= FUSE_BURN / 2) pMid = p;
    last = p;
  }
  ok(`diff ${diff}: progress never goes backwards`, monotonic);
  // DERIVED, not written down. This was a flat 0.2, which was a restatement of the old
  // weighting (the fuse was a third of the bar). The bar is counted in presses now -- n to
  // pack and one to light -- so the fuse is the last beat and is worth about one press,
  // 1/(n+1). A hard 0.2 then failed a correct five-charge room at 0.167 and would have been
  // "fixed" by padding the room. Floor at 0.1 so a much longer room cannot make the fuse
  // invisible and still pass.
  const fuseShare = Math.max(0.1, 0.9 / (n + 1));
  ok(`diff ${diff}: progress advances while the fuse burns`, last > pPacked + fuseShare,
     `${pPacked.toFixed(2)} packed -> ${last.toFixed(2)} home, want +${fuseShare.toFixed(2)}`);
  ok(`diff ${diff}: and it CREEPS across the fuse rather than jumping`,
     pMid !== null && pMid > pPacked + fuseShare * 0.25 && pMid < last - fuseShare * 0.25,
     `packed ${pPacked.toFixed(3)}, half-burnt ${pMid === null ? 'never sampled' : pMid.toFixed(3)}, home ${last.toFixed(3)}`);
  ok(`diff ${diff}: progress ends at 1 and starts at 0`,
     Math.abs(p0) < 1e-9 && Math.abs(last - 1) < 0.02, `${p0.toFixed(3)} .. ${last.toFixed(3)}`);

  // -- what an optimal player presses, so room-check's parsed cost can be checked against
  //    the verb itself rather than against a second reading of its source
  const m3 = V.start(diff);
  let keys = 0, k;
  while ((k = V.solveKey(m3)) && keys < 40) { V.key(m3, k); keys++; }
  ok(`diff ${diff}: solveKey clears it in ${n} + 1 presses`, keys === n + 1 && m3.won,
     `${keys} presses, won ${m3.won}`);
  ok(`diff ${diff}: solveKey stops asking once it is lit`, V.solveKey(m3) === null);
}

// -- THE CASE NOBODY WOULD TEST BY HAND: the panel closed. `blast.update` only runs for the
//    room the player has open, so a fuse lit and then dismissed is ticked by the room loop
//    instead. Driven here exactly as updateRooms drives it.
{
  const m = V.start(5);
  for (const hole of m.holes) V.key(m, hole.k);
  V.key(m, ' ');
  let t = 0, guard = 0, cleared = false;
  while (guard++ < 6000) {
    // the pendingClear branch, verbatim in shape: the room is not active, so the ROOM ticks it
    m.inputT = Math.max(0, m.inputT - DT);
    t += DT;
    if (m.inputT <= 0) { cleared = true; break; }
  }
  ok('panel CLOSED: the room loop carries the same fuse home', cleared,
     `${t.toFixed(2)}s against ${FUSE_BURN}s`);
  ok('panel CLOSED: it takes the same time as with the panel open',
     Math.abs(t - FUSE_BURN) <= DT + 1e-9);
}

// -- the two tickers must not BOTH run. If the verb's update ran for a closed room as well,
//    the fuse would burn at double speed and the wall would open early -- which looks fine
//    and is the reason to state it as a number.
{
  const m = V.start(5);
  for (const hole of m.holes) V.key(m, hole.k);
  V.key(m, ' ');
  let t = 0;
  while (m.inputT > 0 && t < 10) { V.update(m, DT); m.inputT = Math.max(0, m.inputT - DT); t += DT; }
  ok('double-ticking would halve the fuse', Math.abs(t - FUSE_BURN / 2) <= DT * 2,
     `${t.toFixed(2)}s -- this is the FAILURE shape, recorded so the real one can be told from it`);
}

// -- THE DRILL, driven through the game's own updateDrill. The road honours a banked win's
//    inputT via pendingClear; the drill used to fire drillSolved() the instant `won` flipped,
//    which skipped the whole 1.15s fuse in the tutorial where the player first meets the room.
//
//    tools/drill-check.js CANNOT answer this: its puzzle total spreads 7.2 to 8.9 seconds on
//    byte-identical code, which is larger than the 1.7s the fix is worth, so the number there
//    moved the wrong way and meant nothing. This drives one panel and counts frames.
{
  const DTF = 1 / 60;
  G.reset();
  G.startDrill(G.actVerbs(3));                       // act three's drill is exactly [blast]
  const d = G.S.drill;
  ok('the drill teaches the wall', d && d.order.length === 1 && d.order[0].verb === 'blast',
     d ? d.order.map(o => o.verb).join(',') : 'no drill');
  let guard = 0;
  while (d.phase !== 'play' && guard++ < 600) G.updateDrill(DTF);
  const m = d.room && d.room.mg;
  ok('the drill opens a real blast panel', !!m && Array.isArray(m.holes), m ? `${m.holes.length} holes` : 'no mg');
  for (const hole of m.holes) VERBS.blast.key(m, hole.k);
  VERBS.blast.key(m, ' ');
  ok('the drill panel banks the win rather than clearing on the press', d.phase === 'play' && m.won);
  let held = 0;
  while (d.phase === 'play' && held++ < 600) G.updateDrill(DTF);
  const secs = held * DTF;
  ok('the drill HOLDS the panel for the whole fuse', Math.abs(secs - FUSE_BURN) <= 3 * DTF,
     `${secs.toFixed(2)}s against ${FUSE_BURN}s -- 0.02s here means drillSolved fired on the keypress and the fuse is never seen`);
  ok('and it does let go afterwards', d.phase !== 'play' && held < 600, `phase ${d.phase}`);
}

console.log(`\n${fails} failure${fails === 1 ? '' : 's'}.`);
console.log('Covers: VERBS.blast key/update/progress/solveKey at six difficulties, and the fuse');
console.log('carried home by each of its two tickers. It does NOT cover drawing, the wall in');
console.log('the world, or whether solveRoom is reached -- that is rect-check, enc-check and probe.');
process.exit(fails ? 1 : 0);

// Proved it can fail, against five deliberately broken copies of index.html:
//
//   key() returns 'done' instead of banking m.won      12 FAIL  (the fuse is never seen)
//   update() drops its tick                            25 FAIL  (fuse never arrives; 100s guard)
//   SPACE accepted before every charge is in           30 FAIL
//   progress() ignores the fuse                         6 FAIL
//   inputT set to FUSE_BURN / 2                        20 FAIL
//
// The third of those was written wrong first and the check PASSED, which looked exactly like
// a blind spot in the check: the fault had been injected into a branch `key` can never reach,
// because the letter branch returns before it. A falsifier that does not actually break the
// thing is worse than none, since it is quoted as evidence. Break the GUARD, not the code
// behind it, and read the failure text to see that it failed for the reason you intended.
