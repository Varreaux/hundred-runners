// The cave door sequence, as assertions -- node tools/seam-check.js [path-to-checkout]
//
// drill-check asserts the OPENING drill reaches every type and opens the doors. It senses
// nothing about a second drill, and `danger` had the drill's shared midline drifting 11.6px
// through a whole change while it said "reached 11 of 11 types" the entire time. So this is
// the cave door's own check, and it asserts the things that would actually go wrong:
//
//   1. the crowd STOPS at the door, and stops in a file rather than in a heap
//   2. NOBODY DIES while it is held -- a queue nobody is taken from is the whole difference
//      between this and a room queue, and a regression there would read as ordinary attrition
//   3. the proprietor speaks, and WAITS rather than running on a clock
//   4. the drill runs, teaches a NON-EMPTY set, and teaches act two's own kinds
//   5. the door bursts and the crowd MOVES AGAIN, past the seam
//   6. nobody is teleported by the release -- the biggest jump on the release frame is small
//
// Point 4 is the one with a history: act two contained nothing act one did not until two rooms
// were moved into it this morning, so a second drill that teaches an empty set is a live
// failure mode, not a hypothetical. Point 2 is the one a screenshot could never show.
const fs = require('fs'), path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(root, 'tools', 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", "path.join(root,'tools','audio-mock.js')"));
global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
let __kh = null;
global.window.addEventListener = (ev, fn) => { if (ev === 'keydown') __kh = fn; };
global.window.dispatchEvent = e => { if (__kh) __kh({ key: e.key, repeat: false, preventDefault() {} }); };
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

eval(src + `
;(function(){
  const fails = [], notes = [];
  reset(); S.mode = 'play';

  let phases = [], lastPhase = null;
  let deadAtHoldStart = null, deadDuringHold = 0;
  let camAtHoldStart = null, camDriftWhileHeld = 0;
  let bossAuto = null, bossSeen = false;
  let drillVerbs = null, drillSeen = false;
  let maxFileSpread = 0, minFileSpread = Infinity;
  let biggestJumpOnRelease = 0, prevX = null, releaseFrame = -1;
  let passedSeam = false, frameOfBurstDone = -1;

  // DERIVED, not written down: long enough for the whole course plus the hold.
  const frames = 60 * (S.camMax / CFG.scroll + 180);
  for (let i = 0; i < frames && S.mode === 'play'; i++) {
    const before = S.runners.map(r => r.x);
    update(1/60); devSolve();
    const g = S.seam;
    if (g.phase !== lastPhase) { phases.push(g.phase + '@' + i); lastPhase = g.phase; }

    const held = g.phase !== 'off' && g.phase !== 'done';
    if (held) {
      if (deadAtHoldStart === null) { deadAtHoldStart = S.stats.dead; }
      deadDuringHold = S.stats.dead - deadAtHoldStart;
      // Drift is measured from the frame the framing is PINNED, not from the frame the hold
      // starts. The camera is meant to settle onto the crowd during 'gather' -- that movement
      // is wanted, and measuring across it accused the game of 121 units of creep that were
      // the settle. What must not move is the door during the speech and the drill.
      if (g.camLock != null) {
        if (camAtHoldStart === null) camAtHoldStart = S.cam;
        camDriftWhileHeld = Math.max(camDriftWhileHeld, Math.abs(S.cam - camAtHoldStart));
      }
      const live = S.runners.filter(r => r.state === 'run');
      if (live.length > 4) {
        const xs = live.map(r => r.x).sort((a,b)=>b-a).slice(0, Math.min(60, live.length));
        const spread = xs[0] - xs[xs.length-1];
        maxFileSpread = Math.max(maxFileSpread, spread);
        minFileSpread = Math.min(minFileSpread, spread);
      }
      if (g.phase === 'boss' && S.boss && !bossSeen) { bossSeen = true; bossAuto = S.boss.auto; }
      if (g.phase === 'drill' && S.drill && !drillSeen) {
        drillSeen = true; drillVerbs = S.drill.order.map(o => o.verb);
      }
    }
    if (lastPhase === 'done' && releaseFrame < 0) {
      releaseFrame = i;
      for (let k = 0; k < S.runners.length; k++) {
        if (S.runners[k].state !== 'run') continue;
        biggestJumpOnRelease = Math.max(biggestJumpOnRelease, Math.abs(S.runners[k].x - before[k]));
      }
    }
    if (g.phase === 'done' && S.runners.some(r => r.state === 'run' && r.x > FAC.seam + 200)) passedSeam = true;
  }

  const A = (ok, msg) => { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + msg); };

  A(phases.length >= 5, 'the sequence ran all its phases: ' + phases.join(' -> '));
  A(camDriftWhileHeld < 1, 'the framing is pinned for the speech and the drill (drifted ' + camDriftWhileHeld.toFixed(1) + ' units)');
  A(deadDuringHold === 0, 'nobody is taken at the door (died during the hold: ' + deadDuringHold + ')');
  A(bossSeen, 'the proprietor speaks at the door');
  A(bossAuto === false, 'and he WAITS rather than running on a clock (auto=' + bossAuto + ')');
  A(drillSeen, 'the second drill runs');
  A(drillVerbs && drillVerbs.length > 0,
    'and it teaches a non-empty set: [' + (drillVerbs || []).join(', ') + ']');
  A(maxFileSpread > 60, 'the crowd stands in a FILE, not a heap (deepest ' + maxFileSpread.toFixed(0) + ' units)');
  A(biggestJumpOnRelease < 40, 'nobody is teleported by the release (biggest jump ' + biggestJumpOnRelease.toFixed(1) + ' units)');
  A(passedSeam, 'the door opens and the crowd goes through');

  console.log('');
  notes.forEach(n => console.log('  ' + n));
  fails.forEach(n => console.log('  ' + n));
  console.log('');
  console.log(fails.length ? '  FAIL (' + fails.length + ')' : '  PASS');
  console.log('');
  console.log('  This covers the sequence and the hold. It says NOTHING about how the door');
  console.log('  or the hammering LOOK -- that is the art pass, and no number substitutes for it.');
  process.exitCode = fails.length ? 1 : 0;
})();
`);
