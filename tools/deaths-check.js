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

  // ---- and nobody over an open hole at deck level.
  // The SAME expression drawRunners uses for the lift, so this cannot quietly drift from what
  // is actually drawn: change the drawing without changing this and the check goes stale by
  // failing rather than by lying.
  const lift = r => r.hop > 0 ? Math.sin(r.hop / (r.hopMax || 0.5) * Math.PI) * 16 * Math.min(2.6, (r.hopMax || 0.5) / 0.5) : 0;
  const air = {};
  reset(); startRun();
  const cap2 = 60 * (S.camMax / CFG.scroll + 90);
  for (let i = 0; i < cap2 && S.mode === 'play'; i++) {
    update(1/60);
    for (const room of S.rooms) {
      if (room.state === 'solved') continue;
      // only the crossings are holes. A machine, a press and a crusher are things you run
      // past or under, and the wall is the one nobody gets past at all.
      if (room.hazard === 'machine' || room.hazard === 'press' || room.hazard === 'burst') continue;
      if (room.type === 'wall') continue;
      for (const r of S.runners) {
        if (r.state !== 'run' || r.lane !== room.lane) continue;
        // strictly INSIDE the hole; the lips themselves are solid ground
        if (r.x <= room.x + 14 || r.x >= room.x + CFG.gapWidth - 14) continue;
        const e = air[room.type] || (air[room.type] = { n: 0, flat: 0, mid: 0, min: Infinity });
        const L = lift(r), frac = (r.x - room.x) / CFG.gapWidth;
        e.n++; e.min = Math.min(e.min, L);
        if (L < 4) { e.flat++; if (frac > 0.3 && frac < 0.7) e.mid++; }
      }
    }
  }
  out.air = air;
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
      const e = rooms.get(d.room) || { n: 0, ts: [], worst: 0, bursts: [] };
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
    }
  }
  for (const [name, e] of rooms) {
    e.ts.sort((a, b) => a - b);
    e.gaps = [];
    for (let i = 1; i < e.ts.length; i++) if (e.ts[i] - e.ts[i - 1] > 1e-9) e.gaps.push(e.ts[i] - e.ts[i - 1]);
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

console.log('\n=== bodies strictly inside an OPEN crossing');
console.log(`    ${'type'.padEnd(10)} ${'samples'.padStart(8)} ${'at deck level'.padStart(14)} ${'of those, mid-gap'.padStart(18)} ${'least lift'.padStart(11)}`);
let airBad = 0, airN = 0;
for (const [t, e] of Object.entries(OUT.air || {})) {
  airN += e.n;
  console.log(`    ${t.padEnd(10)} ${String(e.n).padStart(8)} ${String(e.flat).padStart(14)} ${String(e.mid).padStart(18)} ${e.min.toFixed(1).padStart(11)}`);
  if (e.mid > 0) airBad++;
}

if (A) {
  // The per-room worst is the claim that matters. The course-wide worst counts two DIFFERENT
  // rooms taking one person each on the same frame, which is two rooms behaving correctly.
  const perRoom = Math.max(0, ...A.rooms.map(r => r.worst));
  const perRoomBurst = Math.max(0, ...A.rooms.map(r => r.burst));
  console.log(`\nOne-at-a-time verdict, on the run where every room is live:`);
  console.log(`  ${perRoom === 1 ? 'PASS' : 'no  '}  no ROOM takes more than one person on a frame (worst ${perRoom})`);
  console.log(`  ${perRoomBurst <= 3 ? 'PASS' : 'no  '}  no room takes more than three in a quarter second (worst ${perRoomBurst})`);
  console.log(`  ${airBad === 0 ? 'PASS' : 'no  '}  nobody drawn at deck level mid-way over an open crossing (${airN} sampled)`);
  console.log(`\n  worst single room, per run: ${A.rooms.length ? A.rooms[0].name + ' takes ' + (A.rooms[0].n / OUT.nosolve.length).toFixed(1) : 'n/a'}`);
}
