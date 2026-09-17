// Which mini-game goes in which act.  node tools/act-check.js [root]
//
// Linh's "Family difficulty and weights" sheet ranks every room type into a family and then
// says which ranks may stand at which point along the course. Her ramp is written against
// room NUMBERS on her own 12630-unit course:
//
//   No 2 -> rank 0    No 3-6 -> 1    No 7-11 -> 2    No 12-16 -> 3    No 17-22 -> 4    No 23-42 -> 5
//
// which as a fraction of her course is 7% / 21% / 35% / 50% / 64% / 96%. Our three acts end
// at 38% and 79% of ours, so collapsing her six bands onto three acts lands on nearly the
// same line, and that collapse is what CFG.maxRankAt encodes:
//
//   act one   the mill        ranks 0-2   lever, gear, slider, typing
//   act two   the mountain    ranks 0-4   + wiring, + trace
//   act three the enclosure   ranks 0-5   everything that can stand in open country
//
// This reads the families and the rooms out of index.html rather than restating either, so
// it goes stale by failing instead of by lying. It prints the roster first -- that table is
// the answer to "which mini-games go into which act" and is worth reading even when every
// check passes -- and then tests four things:
//
//   1. no room stands in an act that does not admit its rank
//   2. every act introduces at least one family the act before it did not have
//   3. the last act mixes: it is not a private set of its own types
//   4. every type in CFG.types has a family, so a new room cannot slip in unranked
//
// Check 2 is the one that earned this tool. Act two used to contain nothing act one did not
// -- winch, rickety, bridge, crusher, rope, all of them already seen in the mill -- so the
// whole middle of the game introduced no new idea. Nothing measured that, because every
// room in it was individually fine.
const fs = require('fs'), path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(__dirname, 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", JSON.stringify(path.join(__dirname, 'audio-mock.js'))));
global.window.addEventListener = () => {};
global.window.dispatchEvent = () => {};
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

let bad = 0;
const ok = (name, pass, detail) => { if (!pass) bad++; console.log((pass ? 'ok  ' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : '')); };

eval(src + `
;(function(){
  const ACTS = ['the mill', 'the mountain', 'the enclosure'];
  const rooms = CFG.rooms.slice().sort((a, b) => a.x - b.x);
  const fam = CFG.families;

  // ---------------------------------------------------------------- the roster
  const byAct = [[], [], []];
  for (const r of rooms) byAct[CFG.actAt(r.x) - 1].push(r);
  console.log('WHICH MINI-GAMES GO IN WHICH ACT');
  console.log('');
  const seen = new Set();
  const firstIn = new Map();
  for (let a = 0; a < 3; a++) {
    const bound = a === 0 ? CFG.roofFrom : a === 1 ? CFG.exit : CFG.finale.x;
    const cap = CFG.maxRankAt(a === 0 ? 0 : a === 1 ? CFG.roofFrom : CFG.exit);
    console.log('  ACT ' + (a + 1) + '  ' + ACTS[a] + '  (to x ' + bound + ', ranks 0-' + cap + ')');
    // group this act's rooms by family, and mark which families are new here
    const fams = new Map();
    for (const r of byAct[a]) {
      const f = fam[r.type];
      if (!f) continue;
      if (!fams.has(f.family)) fams.set(f.family, { rank: f.rank, types: new Map() });
      const e = fams.get(f.family);
      e.types.set(r.type, (e.types.get(r.type) || 0) + 1);
    }
    const order = [...fams.entries()].sort((x, y) => x[1].rank - y[1].rank);
    for (const [name, e] of order) {
      const isNew = !seen.has(name);
      if (isNew) { seen.add(name); firstIn.set(name, a + 1); }
      const list = [...e.types.entries()].map(([t, n]) => t + (n > 1 ? ' x' + n : '')).join(', ');
      console.log('      ' + (isNew ? 'NEW  ' : '     ') + 'rank ' + e.rank + '  ' +
                  name.padEnd(12) + list);
    }
    if (!order.length) console.log('      (no rooms)');
    console.log('');
  }

  // ---------------------------------------------------------------- 1. the ramp holds
  const over = [];
  for (const r of rooms) {
    const f = fam[r.type];
    if (!f) continue;
    const cap = CFG.maxRankAt(r.x);
    if (f.rank > cap) over.push(r.type + '@' + r.x + ' rank ' + f.rank + ' in act ' + CFG.actAt(r.x) + ' (max ' + cap + ')');
  }
  // ONE named exception, with its reason, rather than a check that is simply red every run
  // and so stops being read. NO BACKTICKS anywhere below this line: the whole block is
  // inside a template literal, and a stray pair closes it and reopens it as code -- the
  // error then points at the eval on line 46 and says nothing about where it really is.
  // The presses room is the old three-digit fingerprint one. Linh's sheet
  // RETIRES it and puts Calculation (rank 5) in its place, and another session is mid-rewrite
  // turning it into exactly that room -- so moving it now would collide with work in flight,
  // and ranking it lower to make this line go green would be padding the number rather than
  // fixing the room. It is listed, explained, and the check below fails the moment it stops
  // being the only one, so the excuse cannot outlive the reason for it.
  const EXCEPT = { presses: 'being rewritten into Linh\\'s rank-5 calculation room by another session; where it ends up is theirs and Morgan\\'s to settle, not something to move underneath them' };
  const unexcused = over.filter(o => !Object.keys(EXCEPT).some(t => o.startsWith(t + '@')));
  ok('no room stands in an act that does not admit its rank, bar the listed exception',
     unexcused.length === 0,
     unexcused.length ? unexcused.join('; ') : rooms.length + ' rooms, all within their act\\'s ceiling');
  for (const t of Object.keys(EXCEPT)) {
    const still = over.some(o => o.startsWith(t + '@'));
    ok('the exception for ' + t + ' is still needed', still,
       still ? over.find(o => o.startsWith(t + '@'))
             : 'it no longer breaks the ramp -- DELETE it from EXCEPT, or the next room that does will be excused in silence');
    if (still) console.log('      why: ' + EXCEPT[t]);
  }

  // ---------------------------------------------------------------- 2. each act introduces something
  for (let a = 1; a < 3; a++) {
    const introduced = [...firstIn.entries()].filter(([, v]) => v === a + 1).map(([k]) => k);
    ok('act ' + (a + 1) + ' introduces a family act ' + a + ' did not have', introduced.length > 0,
       introduced.length ? introduced.join(', ') : 'nothing new in ' + ACTS[a] + ' -- it repeats act ' + a);
  }

  // ---------------------------------------------------------------- 3. the last act mixes
  const lastFams = new Set(byAct[2].map(r => fam[r.type] && fam[r.type].family).filter(Boolean));
  const earlier = new Set();
  for (const r of byAct[0].concat(byAct[1])) { const f = fam[r.type]; if (f) earlier.add(f.family); }
  const revisited = [...lastFams].filter(f => earlier.has(f));
  ok('the last act MIXES rather than holding a private set of its own',
     revisited.length >= 2,
     revisited.length + ' famil' + (revisited.length === 1 ? 'y' : 'ies') + ' from earlier acts return: ' +
     (revisited.join(', ') || 'none'));

  // ---------------------------------------------------------------- 4. nothing unranked
  const unranked = Object.keys(CFG.types).filter(t => !fam[t]);
  ok('every room type in CFG.types has a family and a rank', unranked.length === 0,
     unranked.length ? 'no family for: ' + unranked.join(', ') : Object.keys(CFG.types).length + ' types, all ranked');

  // ---------------------------------------------------------------- and the ramp itself
  // A monotone ceiling is the whole idea: it must never get EASIER further along.
  let slips = 0, prev = -1;
  for (const r of rooms) { const cap = CFG.maxRankAt(r.x); if (cap < prev) slips++; prev = Math.max(prev, cap); }
  ok('the ceiling never falls as the course goes on', slips === 0, slips + ' places where it drops');

  console.log('');
  console.log(bad ? (bad + ' FAILED') : 'the acts introduce in order and the last one mixes.');
  if (bad) process.exitCode = 1;
})();
`);
