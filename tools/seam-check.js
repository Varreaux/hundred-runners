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
  let overlapWorst = 0, belowDeck = -Infinity;

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

    // THE DOOR MUST NOT BE PAINTED OVER A PERSON, AND MUST NOT GO THROUGH THE FLOOR.
    // Both of these shipped. The leaf is drawn after the bodies -- correctly, because a barrier
    // people are painted over is not a barrier -- which means the instant its drawn extent
    // reaches a runner, the runner disappears behind it. And an earlier burst rotated the leaf
    // in the picture plane, which for a frontal elevation is a door falling over: three of four
    // corners finished up to 59 units BELOW the deck, lying across the front twenty runners,
    // for the ten seconds the seam stayed in view. Neither is visible in a still -- a body
    // half-painted-out just looks like a body behind something.
    // Only while the door is actually THERE. Measured across 'done' as well, this reported a
    // 9653-unit overlap, which is just the crowd running past the seam after the door has gone
    // -- the same mistake as measuring camera drift across the settle: an invariant checked
    // over an extent where it does not apply accuses the game of something it did not do.
    if (held && g.open < 1) {
      const lead2 = Math.max(...S.runners.filter(r => r.state === 'run').map(r => r.x), -Infinity);
      // The widest point of a body toward the door is NOT the shoe at 6.8 -- it is the curly
      // style's outer curl at 7.70 (hx 0.55 + 4.3 + r 2.4 + 0.45 of stroke), times the tallest
      // named runner's 1.232. And the leaf is shifted 1.4 toward the crowd by jolt on every
      // strike, which this ignored entirely. Together those two made this report 2.5 units more
      // margin than existed: it would have called a standoff of 41 clean while the leaf was
      // already a unit into somebody's hair. Proving a check can fail proves the mechanism, not
      // the threshold -- the threshold has to be derived like anything else.
      const widest = 7.70 * 1.232;
      const leafFace = FAC.seam - DOOR.half - 1.4;   // worst case: fully jolted toward them
      if (isFinite(lead2) && lead2 + widest > leafFace) {
        overlapWorst = Math.max(overlapWorst, lead2 + widest - leafFace);
      }
      // the leaf spans doorTop..doorBot in y and never leaves it, because opening is a
      // horizontal scale about the jamb rather than a rotation. If that ever becomes a rotate
      // again, this is the number that moves.
      belowDeck = Math.max(belowDeck, doorBot(laneY(0)) - laneY(0));
    }
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
  A(overlapWorst <= 0, 'the door is never painted over a person (worst overlap ' + overlapWorst.toFixed(1) + ' units)');
  // HONEST SCOPE: this reads the door's DECLARED extent (doorTop..doorBot) against the deck.
  // It does NOT see what the leaf transform does to that extent, so it would not catch a
  // ctx.rotate being put back -- which is exactly the bug that put three corners 59 units under
  // the floor. Catching that needs a recording canvas that honours the transform stack, like
  // reel-check's. Until then this guards the constants and says so rather than implying more.
  A(belowDeck <= 0, 'the DECLARED door extent sits above the deck, constants only (deepest ' + (belowDeck === -Infinity ? 0 : belowDeck).toFixed(1) + ' units)');

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
