// The drill: does it complete, and how long does it take?
//
//   node tools/drill-check.js [presses-per-second]      (default 4)
//
// The drill is the run-through of one of every kind of room that happens between the
// shift assembling at the doors and the doors opening. It is the answer to a measured
// problem: a room's usable window is 0.36 * V.vw ahead of the crowd -- 3.13s at zoom 1 --
// and every one of those budgets is an EXPERT's, with no allowance for meeting the puzzle
// for the first time. The drill is where that reading happens, with nobody on the road.
//
// Why this needs its own tool. tools/probe.js presses no keys, so it reaches the drill's
// FIRST panel and stops there for ever -- "no exception" from it is a verdict on one of
// eleven panels and on none of the state machine. This drives every type through the real
// keydown/keyup handlers, draws every frame, and then checks the run actually starts.
//
// What it reports:
//   - an exception out of update() or draw(), with which type was on screen
//   - per-type time to solve, and the total: the FLOOR, since the driver already knows
//     the answer. A player meeting these for the first time is two to four times slower,
//     which is the entire point of the drill and must not be read as its real length.
//   - whether every type was reached, and whether the doors opened afterwards
const fs = require('fs'), path = require('path');
// argv: [rate] [skip] [root] in any order after the script; `skip` is a flag, not a path
const root = process.argv.slice(2).find(a => a !== 'skip' && isNaN(+a)) || path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(__dirname, 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", "path.join(" + JSON.stringify(__dirname) + ",'audio-mock.js')"));
global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
let KD = null, KU = null;
global.window.addEventListener = (ev, fn) => { if (ev === 'keydown') KD = fn; if (ev === 'keyup') KU = fn; };
global.window.dispatchEvent = () => {};
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };
const RATE = +(process.argv[2] || 4);
// `skip` presses ESC on every panel instead of playing it, to prove the escape hatch
const SKIP = process.argv.includes('skip');

eval(src + `
;(function(){
  const rate = ${RATE}, dt = 1/60, SKIP = ${SKIP};
  const press = k => KD({ key: k, repeat: false, preventDefault(){} });
  const lift  = k => KU({ key: k, repeat: false, preventDefault(){} });
  let held = null;
  const log = [];
  let err = null, at = null;

  S.mode = 'intro'; S.introT = 0;
  let t = 0, nextPress = 0, seen = null, startedAt = 0;
  try {
    for (let i = 0; i < 60 * 400; i++) {
      // The proprietor speaks before the drill and CANNOT be skipped: SPACE fills the
      // line being typed, SPACE again moves past a filled one, and the drill starts after
      // the last. Pressing every frame walks him at his own dwell, so this waits exactly
      // as long as he makes a player wait and no longer.
      if (S.boss && !S.boss.gone) press(' ');
      const d = S.drill;
      if (d && !d.done && d.room) {
        at = d.room.verb;
        if (d.room.verb !== seen) { seen = d.room.verb; startedAt = t; nextPress = t; }
        // ESC has to move past a kind without stranding anyone: the ditch cannot be cut
        // below about 2.5 presses a second at all, so a player who cannot drum needs a way
        // out that is not "abandon the whole drill". Proving it here means proving the
        // doors still open at the end of it.
        if (SKIP && d.phase === 'play') press('Escape');
        else if (d.phase === 'play' && t >= nextPress) {
          const v = VERBS[d.room.verb], m = d.room.mg;
          // bar declares no solveKey -- it is a timing bar, so it is played by watching
          const k = v.solveKey ? v.solveKey(m)
                  : (m.pos >= m.zone && m.pos <= m.zone + m.zoneW ? ' ' : null);
          if (k != null) {
            nextPress = t + 1/rate;
            // a hold verb is toggled by keydown and must be let go of, or the spring bites
            if (held) { lift(held); held = null; }
            press(k);
            if (VERBS[d.room.verb].takesHold && k === ' ' && d.room.mg.holding) held = k;
          }
        }
      } else if (d && d.done && !log.closed) {
        log.closed = true;
      }
      if (S.drill && S.drill.room && S.drill.phase === 'out' && S.drill.room.verb === seen && seen !== null) {
        if (!log.find(e => e.verb === seen)) log.push({ verb: seen, secs: t - startedAt });
      }
      update(dt); draw(); t += dt;
      if (S.mode === 'play') break;
    }
  } catch (e) { err = e; }

  console.log('drill-check -- driven at ' + rate + ' presses/sec, every frame drawn');
  console.log('');
  if (err) {
    console.log('THREW while ' + at + ' was on screen: ' + err.message);
    console.log(err.stack.split('\\n').slice(1,5).join('\\n'));
    process.exitCode = 1;
  }
  const types = new Set();
  for (const r of CFG.rooms) types.add(CFG.types[r.type].verb);
  let total = 0;
  for (const e of log) { total += e.secs; console.log('  ' + e.verb.padEnd(8) + e.secs.toFixed(2).padStart(7) + 's'); }
  console.log('');
  console.log('  reached ' + log.length + ' of ' + types.size + ' types');
  // Which one it died on matters more than the count. A stall here is usually the DRIVER,
  // not the room: bar and lift are not rate puzzles -- bar wants SPACE when the marker is
  // in the green and lift wants a key held down -- so metronoming them at a fixed rate
  // measures the metronome. Check which kind the verb is before believing a red run.
  if (S.mode !== 'play' && S.drill && S.drill.room) console.log('  stalled on: ' + S.drill.room.verb);
  console.log('  total ' + total.toFixed(1) + 's of puzzle, ' + t.toFixed(1) + 's of drill including the slides');
  console.log('  mode after the drill: ' + S.mode + (S.mode === 'play' ? '  (the doors opened)' : '  (the run never started)'));
  console.log('');
  const ok = !err && log.length === types.size && S.mode === 'play';
  console.log(ok ? 'PASS' : 'FAIL');
  if (!ok) process.exitCode = 1;
  console.log('');
  console.log('This total is the FLOOR: the driver already knows every answer. Do not quote');
  console.log('it to Morgan as how long the drill takes to play the first time.');
})();
`);
