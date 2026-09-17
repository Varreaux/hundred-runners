// How the hundred die: how many, where, and HOW MANY AT ONCE.
//
//   node tools/deaths-check.js [runs] [solve|nosolve|both]
//
// The last of those three is the one this exists for. A total tells you how lethal the
// course is; it says nothing about whether a room takes people one at a time or swallows a
// clump whole, and those are completely different things to watch. Twenty people going into
// the same hole on the same 1/60th of a second is ONE event on screen -- you cannot count
// them, you cannot see who they were, and the number in the HUD simply jumps. The same
// twenty spread over eight seconds is twenty events, and the player can act between them.
//
// So it reports, per room and overall:
//   worst      the most deaths on any single FRAME. This is the clumping number.
//   burst      the most deaths inside any 0.25s window, which is what the eye reads as "at
//              once" even when the frames differ
//   gap        the median seconds between consecutive deaths AT THE SAME ROOM, which is the
//              number that says "one at a time" if it is big enough to see
//
// And then a second, unrelated-looking check that belongs here because it exists because of
// the first: NOBODY MAY CROSS AN OPEN GAP AT DECK LEVEL. Letting people past a reloading
// hazard is what makes a room less catastrophic, and the first thing it buys you is runners
// walking over a hole on a floor that is not there. They are given a hop; this measures that
// the hop is actually under them, because at play zoom a body is 19px and a hop is a handful
// and "it looks fine" is not evidence in either direction.
//
// It also always takes the TOTAL, not just the room under test. CLAUDE.md records why: a fix
// that MOVES the damage and a fix that removes it look identical if you only count where you
// were already looking, and a change scored on one room relocates its regression to wherever
// the metric is not.
//
// Both play styles, because they answer different questions. `nosolve` is the ceiling -- the
// player does nothing, every room is live, and it measures the hazards themselves. `solve`
// is the ranking bot clearing rooms as it goes, which is the floor for perfect play and NOT
// a report on how the game plays for a human.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');

function makeCtx() {
  const grad = { addColorStop() {} };
  const c = {
    canvas: { width: 960, height: 540 },
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, clip() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, clearRect() {}, rect() {},
    arc(a, b, r) { if (!isFinite(r) || r < 0) throw new Error('bad radius ' + r); },
    arcTo() {}, ellipse() {}, setLineDash() {}, drawImage() {}, fillText() {}, strokeText() {},
    measureText(t) { return { width: String(t).length * 6 }; },
    createLinearGradient() { return grad; }, createRadialGradient() { return grad; }, createPattern() { return grad; },
    getImageData() { return { data: new Uint8ClampedArray(4 * 8 * 8) }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(4 * (w || 8) * (h || 8)), width: w || 8, height: h || 8 }; },
    putImageData() {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '', font: '', textAlign: '',
    globalAlpha: 1, globalCompositeOperation: '', shadowBlur: 0, shadowColor: '', shadowOffsetY: 0, filter: '',
  };
  return c;
}
global.document = { getElementById: () => ({ getContext: makeCtx, width: 960, height: 540 }),
                    createElement: () => ({ getContext: makeCtx, width: 8, height: 8 }) };
let keyHandler = null;
global.window = { addEventListener: (ev, fn) => { if (ev === 'keydown') keyHandler = fn; } };
global.performance = { now: () => 0 };
global.requestAnimationFrame = () => {};
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };
global.localStorage = { getItem: () => null, setItem: () => {} };
const { makeAudioMock } = require(path.join(__dirname, 'audio-mock.js'));
global.__audio = { nodes: 0, live: 0 };
global.window.AudioContext = makeAudioMock(global.__audio);
global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
global.window.dispatchEvent = e => { if (keyHandler) keyHandler({ key: e.key, repeat: false, preventDefault() {} }); };

const RUNS = Math.max(1, +(process.argv[2] || 8));
const STYLE = process.argv[3] || 'both';

const OUT = eval(src + `
;(function(){
  // Deaths are recorded by standing in front of killRunner, which is the ONE place a runner
  // stops being alive -- a faller is not dead until it lands, so counting r.state === 'fall'
  // would count them early and count them again.
  const realKill = killRunner;
  let log = [];
  killRunner = function(r, how) {
    const d = r.doom;
    log.push({ t: S.t, how: how,
               room: d && d.type ? d.type + '@' + d.x : (d === 'final' ? 'final gate' : 'the dark'),
               lane: r.lane });
    return realKill(r, how);
  };

  function once(solve) {
    reset(); startRun(); log = [];
    // DERIVED from the course, not written down: a constant here encodes a fact about the
    // thing being measured and goes stale the first time somebody lengthens the world.
    const cap = 60 * (S.camMax / CFG.scroll + 90);
    for (let i = 0; i < cap && S.mode === 'play'; i++) { update(1/60); if (solve) devSolve(); }
    for (let i = 0; i < 60 * 200 && S.mode === 'finale'; i++) update(1/60);
    return { log: log.slice(), dead: S.stats.dead, arrived: S.stats.arrived, mode: S.mode };
  }

  const out = { nosolve: [], solve: [] };
  for (let n = 0; n < ${RUNS}; n++) {
    if ('${STYLE}' !== 'solve') out.nosolve.push(once(false));
    if ('${STYLE}' !== 'nosolve') out.solve.push(once(true));
  }
  killRunner = realKill;

  // ---- AND NOBODY GETS PAST AN UNSOLVED ROOM.
  // This replaces the old "nobody at deck level over an open hole" invariant, which existed
  // only because a reloading hazard used to let people past it. Nobody is let past anything
  // now, so the hole is never occupied -- and the thing that needs guarding instead is the
  // rule Morgan actually asked for: a room you have not solved is not skipped.
  const past = {};
  reset(); startRun();
  const cap2 = 60 * (S.camMax / CFG.scroll + 90);
  for (let i = 0; i < cap2 && S.mode === 'play'; i++) {
    update(1/60);
    for (const room of S.rooms) {
      if (room.state === 'solved') continue;
      // a press and a crusher are not barriers: you walk under them and they may miss you
      if (room.hazard === 'press' || room.hazard === 'burst') continue;
      const e = past[room.type] || (past[room.type] = { through: 0, spared: 0 });
      for (const q of S.runners) {
        if (q.state !== 'run' || q.lane !== room.lane || q.ramp) continue;
        // just past the far edge, where somebody who skipped it would be
        if (q.x <= room.x + CFG.gapWidth || q.x > room.x + CFG.gapWidth + 30) continue;
        if (q.spared === room) e.spared++; else e.through++;
      }
    }
  }
  out.past = past;
  return out;
})()
`);

const med = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const FRAME = 1 / 60 + 1e-9;

function analyse(runs) {
  const rooms = new Map();
  let dead = 0, arrived = 0, worstFrame = 0, worstBurst = 0;
  const allGaps = [];
  for (const r of runs) {
    dead += r.dead; arrived += r.arrived;
    // deaths on one frame, over the whole course rather than at one room
    const byFrame = new Map();
    for (const d of r.log) {
      const k = Math.round(d.t * 60);
      byFrame.set(k, (byFrame.get(k) || 0) + 1);
    }
    for (const n of byFrame.values()) worstFrame = Math.max(worstFrame, n);
    // and inside a quarter second, which is what the eye reads as simultaneous
    const ts = r.log.map(d => d.t).sort((a, b) => a - b);
    for (let i = 0; i < ts.length; i++) {
      let j = i; while (j < ts.length && ts[j] - ts[i] <= 0.25) j++;
      worstBurst = Math.max(worstBurst, j - i);
    }
    // Per-room counts are accumulated PER RUN and then maxed, not pooled. Pooled, the frame
    // key collides across runs -- the same room at the same game time in six runs reads as
    // six deaths on one frame, and the tool accuses the game of a clump it did not draw.
    const seen = new Map();
    for (const d of r.log) {
      const e = rooms.get(d.room) || { n: 0, ts: [], worst: 0, bursts: [], gaps: [] };
      e.n++; e.ts.push(d.t);
      rooms.set(d.room, e);
      const s2 = seen.get(d.room) || { frames: new Map(), ts: [] };
      const k = Math.round(d.t * 60);
      s2.frames.set(k, (s2.frames.get(k) || 0) + 1);
      s2.ts.push(d.t);
      seen.set(d.room, s2);
    }
    for (const [name, s2] of seen) {
      const e = rooms.get(name);
      e.worst = Math.max(e.worst, ...s2.frames.values());
      const ts = s2.ts.sort((x, y) => x - y);
      let b2 = 0;
      for (let i = 0; i < ts.length; i++) { let j = i; while (j < ts.length && ts[j] - ts[i] <= 0.25) j++; b2 = Math.max(b2, j - i); }
      e.bursts.push(b2);
      // Gaps are differenced WITHIN a run and then pooled. Pooling the timestamps first and
      // differencing after interleaves six runs of the same room on the same game clock, which
      // manufactures gaps a fraction of the real one: it reported 0.05s against a true 0.117.
      // Same per-run/pooled fault that was fixed for the frame counts and missed here.
      for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > 1e-9) e.gaps.push(ts[i] - ts[i - 1]);
    }
  }
  for (const [name, e] of rooms) {
    e.burst = Math.max(0, ...e.bursts);
    e.name = name;
    allGaps.push(...e.gaps);
  }
  return { dead: dead / runs.length, arrived: arrived / runs.length, worstFrame, worstBurst,
           gap: med(allGaps), rooms: [...rooms.values()].sort((a, b) => b.n - a.n) };
}

function report(label, runs) {
  if (!runs.length) return;
  const a = analyse(runs);
  console.log(`\n=== ${label}  (${runs.length} runs)`);
  console.log(`    lost ${a.dead.toFixed(1)} of ${100}, reached the exit ${a.arrived.toFixed(1)}`);
  console.log(`    worst single FRAME      ${a.worstFrame} deaths      <- the clumping number`);
  console.log(`    worst quarter second    ${a.worstBurst} deaths`);
  console.log(`    median gap between two deaths at one room  ${a.gap ? a.gap.toFixed(2) + 's' : 'n/a'}`);
  console.log(`\n    ${'room'.padEnd(22)} ${'per run'.padStart(8)} ${'frame'.padStart(6)} ${'0.25s'.padStart(6)}  median gap`);
  for (const r of a.rooms.slice(0, 14)) {
    console.log(`    ${r.name.padEnd(22)} ${(r.n / runs.length).toFixed(1).padStart(8)} ${String(r.worst).padStart(6)} ${String(r.burst).padStart(6)}  ${r.gaps.length ? med(r.gaps).toFixed(2) + 's' : '-'}`);
  }
  return a;
}

console.log(`${RUNS} runs per style. Totals are per run.`);
const A = report('nobody touches a key', OUT.nosolve);
const B = report('the ranking bot clears rooms as it goes', OUT.solve);
console.log('\nThe bot line is the ceiling for perfect play, not a report on how the game plays.');

console.log('\n=== runners found PAST an unsolved room');
console.log(`    ${'type'.padEnd(10)} ${'skipped it'.padStart(12)} ${'spared by the half rule'.padStart(24)}`);
let airBad = 0, airN = 0;
for (const [t, e] of Object.entries(OUT.past || {})) {
  airN += e.through + e.spared;
  console.log(`    ${t.padEnd(10)} ${String(e.through).padStart(12)} ${String(e.spared).padStart(24)}`);
  if (e.through > 0) airBad++;
}

if (A) {
  // The per-room worst is the claim that matters. The course-wide worst counts two DIFFERENT
  // rooms taking one person each on the same frame, which is two rooms behaving correctly.
  const perRoom = Math.max(0, ...A.rooms.map(r => r.worst));
  const perRoomBurst = Math.max(0, ...A.rooms.map(r => r.burst));
  console.log(`\nOne-at-a-time verdict, on the run where every room is live:`);
  // <= 2, not === 1. This counts killRunner, which for a crossing fires when the body LANDS,
  // about half a second after the hazard took them -- so two people taken 0.55s apart can hit
  // the water on the same frame. The hazard still took them one at a time, which is the thing
  // being asked about; the quarter-second figure below is the one that reads on screen.
  console.log(`  ${perRoom <= 2 ? 'PASS' : 'no  '}  no ROOM takes more than two on a frame, landings included (worst ${perRoom})`);
  console.log(`  ${perRoomBurst <= 3 ? 'PASS' : 'no  '}  no room takes more than three in a quarter second (worst ${perRoomBurst})`);
  console.log(`  ${airBad === 0 ? 'PASS' : 'no  '}  nobody gets past a room they did not solve (${airN} sightings past a room)`);
  console.log(`\n  worst single room, per run: ${A.rooms.length ? A.rooms[0].name + ' takes ' + (A.rooms[0].n / OUT.nosolve.length).toFixed(1) : 'n/a'}`);
}
