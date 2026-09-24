// The speed-up: does the line run faster exactly when Morgan asked, and nowhere else?
//
//   node tools/speed-check.js [path/to/checkout]
//
// His rule, 2026-09-24: when the survivors are all in ONE lane of several, the line runs at
// 1.5x -- but not at the act transitions, where everyone is in one lane because the course
// only has one. And he was explicit that the commoner way in is not a fork: it is two lanes
// occupied and one of them dying out at a room.
//
// Four scenes, each driven through update() and the real bot (devSolve):
//
//   1. a full crowd, solved -- a hundred people are never all in one lane, so the pace
//      must never leave 1
//   2. one survivor over the whole course -- sped up on every stretch the course is more
//      than one lane wide, and at 1 on every single-lane stretch, the seam and the mouth
//      named separately because they are the case he raised; and the proprietor's line
//      said once, not once per activation
//   3. two survivors in two lanes, then the one in the other lane dies -- no speed-up while
//      both live, the speed-up within a second of the death, and no fork crossed meanwhile
//   4. a held gate turns it off
//
// Each scene has a COVERAGE GATE: a scene that never reached the state it asserts about
// exits 1 rather than reporting a pass it did not earn. The ease takes (pace - 1)/ease
// seconds, so every assertion about a settled pace allows that long after the condition
// changes; read from the game, not written down.
const fs = require('fs'), path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(__dirname, 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", "path.join(" + JSON.stringify(__dirname) + ",'audio-mock.js')"));
global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
let __kh = null;
global.window.addEventListener = (ev, fn) => { if (ev === 'keydown') __kh = fn; };
global.window.dispatchEvent = e => { if (__kh) __kh({ key: e.key, repeat: false, preventDefault() {} }); };
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

let bad = 0;
const ok = (name, pass, detail) => { if (!pass) bad++; console.log((pass ? 'ok  ' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : '')); };

eval(src + `
;(function(){
  const dt = 1/60, EASE = (SPEEDUP.pace - 1) / SPEEDUP.ease, SETTLE = EASE + 0.1;
  const FAST = SPEEDUP.pace, near = (a, b) => Math.abs(a - b) < 1e-6;
  // start a run the way ?start does, and let the bot carry it
  const begin = () => { reset(); startRun(); };
  const step = () => { devSolve(); update(dt); };
  const live = () => S.runners.filter(r => r.state === 'run');
  const kill = r => { r.state = 'dead'; r.deathT = S.t; };
  const budget = 60 * (S.camMax / CFG.scroll + 90);

  // ---------------------------------------------------------------- 1. a full crowd
  begin();
  let maxPace = 1, frames1 = 0;
  for (let i = 0; i < budget && S.mode === 'play'; i++) { step(); maxPace = Math.max(maxPace, S.pace); frames1++; }
  ok('a full solved crowd never speeds up', near(maxPace, 1) && live().length + S.stats.arrived > 50,
     'max pace ' + maxPace.toFixed(3) + ' over ' + frames1 + ' frames, ' + S.stats.arrived + ' arrived');

  // ---------------------------------------------------------------- 2. one survivor
  begin();
  const one = S.runners[0];
  for (const r of S.runners) if (r !== one) kill(r);
  let since = 0, wasWide = null;
  const tally = { wideFast: 0, wideSlow: 0, narrowFast: 0, narrowSlow: 0, seamFast: 0, seamSeen: 0, mouthFast: 0, mouthSeen: 0 };
  const perAct = { 1: 0, 2: 0, 3: 0 };
  const worst = [];
  let speedLines = 0;
  // HOW FAST SHE ACTUALLY WALKS, settled fast frames against settled slow ones. The pace is a
  // number the game reads back to itself; this is the ground covered. A falsifier that set
  // the speed-up to 1.0x passed every other assertion here, because "reached the target pace"
  // is true of a target of 1 -- so the rate is measured, not taken from S.pace.
  const gait = { fastD: 0, fastN: 0, slowD: 0, slowN: 0 };
  const _start = startBoss;
  startBoss = function (script, auto, cb) { if (script === BOSS_SPEED) speedLines++; return _start(script, auto, cb); };
  for (let i = 0; i < budget && S.mode === 'play' && one.state === 'run'; i++) {
    const x0 = one.x, standing = !!one.held || !!one.atRoom;
    step();
    if (one.state !== 'run') break;
    const dx = one.x - x0;
    const want = speedUpWanted(), wide = lanesOpenAt(one.x) >= 2;
    if (want !== wasWide) { since = 0; wasWide = want; } else since += dt;
    if (since < SETTLE) continue;                       // still easing; judge settled frames only
    if (!standing && !one.held && !one.atRoom && S.cam < S.camMax) {
      if (want) { gait.fastD += dx; gait.fastN++; } else { gait.slowD += dx; gait.slowN++; }
    }
    if (want) { if (near(S.pace, FAST)) { tally.wideFast++; perAct[CFG.actAt(one.x)]++; } else { tally.wideSlow++; worst.push('slow at ' + one.x.toFixed(0)); } }
    else if (!wide) { if (near(S.pace, 1)) tally.narrowSlow++; else { tally.narrowFast++; worst.push('fast at ' + one.x.toFixed(0)); } }
    // the two transitions he named, judged on their own
    if (one.x > FAC.seam - 250 && one.x < FAC.seam + 250) { tally.seamSeen++; if (!near(S.pace, 1)) tally.seamFast++; }
    if (one.x > CFG.exit - 250 && one.x < CFG.exit + 900) { tally.mouthSeen++; if (!near(S.pace, 1)) tally.mouthFast++; }
  }
  startBoss = _start;
  ok('one survivor got through the course', one.state === 'arrived',
     'state ' + one.state + ' at x ' + one.x.toFixed(0));
  ok('sped up wherever the course is more than one lane wide', tally.wideFast > 60 * 20 && tally.wideSlow === 0,
     tally.wideFast + ' settled frames at ' + FAST + 'x, ' + tally.wideSlow + ' not' + (worst.length ? ' -- ' + worst.slice(0, 3).join(', ') : ''));
  ok('...in every act that has lanes', perAct[1] > 0 && perAct[2] > 0 && perAct[3] > 0,
     'act one ' + perAct[1] + ', act two ' + perAct[2] + ', act three ' + perAct[3] + ' frames');
  ok('never sped up where the course is one lane', tally.narrowSlow > 60 * 10 && tally.narrowFast === 0,
     tally.narrowSlow + ' settled frames at 1x, ' + tally.narrowFast + ' fast');
  ok('not at the seam (mill to mountain)', tally.seamSeen > 30 && tally.seamFast === 0, tally.seamSeen + ' frames seen, ' + tally.seamFast + ' fast');
  ok('not at the mouth (mountain to enclosure)', tally.mouthSeen > 30 && tally.mouthFast === 0, tally.mouthSeen + ' frames seen, ' + tally.mouthFast + ' fast');
  ok('he says it once a run, not once per speed-up', speedLines === 1, speedLines + ' times');
  const vFast = gait.fastD / Math.max(1, gait.fastN) / dt, vSlow = gait.slowD / Math.max(1, gait.slowN) / dt, ratio = vFast / vSlow;
  ok('and she really covers the ground faster', FAST > 1 && gait.fastN > 600 && gait.slowN > 600 && Math.abs(ratio - FAST) < 0.1 * FAST,
     vFast.toFixed(1) + ' against ' + vSlow.toFixed(1) + ' units/s, ' + ratio.toFixed(2) + 'x (target ' + FAST + 'x)');

  // ---------------------------------------------------------------- 3. a lane dies out
  // A full solved crowd walked into act two until it is spread over several lanes, then cut
  // to two people in two lanes, then to one -- by a death, with no fork in between.
  begin();
  for (let i = 0; i < budget && S.mode === 'play'; i++) {
    step();
    const L = live();
    if (L.length && Math.min(...L.map(r => r.x)) > 8800 && new Set(L.map(r => r.lane)).size >= 2) break;
  }
  const L = live();
  const a = L.find(r => r.lane === 0), b = L.find(r => r.lane !== 0);
  ok('the crowd reached a spread of lanes in act two', !!a && !!b, a && b ? 'lanes ' + a.lane + ' and ' + b.lane + ' at x ' + a.x.toFixed(0) : 'no pair');
  if (a && b) {
    for (const r of L) if (r !== a && r !== b) kill(r);
    let hi = 1;
    for (let i = 0; i < 60 * 2; i++) { step(); hi = Math.max(hi, S.pace); }
    ok('two survivors in two lanes: no speed-up', near(hi, 1), 'max pace ' + hi.toFixed(3));
    const forkBefore = a.lastForkX, laneBefore = a.lane;
    kill(b);
    let t = 0;
    for (; t < 3 && !near(S.pace, FAST); t += dt) step();
    ok('the other lane dies out: sped up within the ease', near(S.pace, FAST) && t <= SETTLE,
       'reached ' + S.pace.toFixed(2) + 'x in ' + t.toFixed(2) + 's (ease ' + EASE.toFixed(2) + 's)');
    ok('...with no fork crossed in between', a.lastForkX === forkBefore && a.lane === laneBefore,
       'lane ' + laneBefore + ' -> ' + a.lane + ', last fork ' + forkBefore + ' -> ' + a.lastForkX);
    // ---------------------------------------------------------------- 4. a held gate
    const g = S.gates[0];
    const was = g.state; g.state = 'holding';
    ok('a held gate turns it off', !speedUpWanted());
    g.state = was;
  }
})();
`);
console.log('');
console.log(bad ? bad + ' check(s) failed.' : 'the line speeds up where Morgan asked, and nowhere else.');
process.exit(bad ? 1 : 0);
