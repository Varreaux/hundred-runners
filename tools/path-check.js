// Every path the game strokes or fills, checked for a subpath appended to a path that was
// already consumed.
//
//   node tools/path-check.js [path/to/index.html]
//
// WHAT THE FAULT IS. The canvas current path is not context state. `ctx.save()` does not
// save it and `ctx.restore()` does not restore it, and `rect`, `moveTo`, `arc` and the rest
// APPEND to whatever path is already there. So a helper that builds a shape without calling
// `beginPath()` first does not draw its own shape -- it sweeps up whatever the last helper
// left behind and inks that too.
//
// It was found in the last room: one callback of six in `markInk` omitted `beginPath`, and
// the stroke re-inked a figure's arm from the previous shape. The others were identical in
// form and correct, which is what makes this worth a sweep -- the missing one is invisible
// beside five that look the same.
//
// AND IT DRAWS A PLAUSIBLE FRAME. Nothing throws. The extra subpath is usually somewhere
// reasonable, drawn in the current fill or stroke style, so the result reads as "that mark
// is a bit heavy" or "why is there a line there" rather than as a defect -- and if the two
// shapes happen to overlap, it reads as nothing at all. Same family as the negative rect in
// tools/rect-check.js, which is why this borrows that file's sweep wholesale.
//
// WHAT COUNTS AS THE FAULT, precisely: a path-BUILDING call (moveTo, lineTo, rect, arc,
// arcTo, ellipse, quadraticCurveTo, bezierCurveTo, roundRect, closePath) made after a
// fill/stroke/clip has consumed the path, with no beginPath in between. Consuming the SAME
// path twice is not a fault and is not flagged -- `fill(); stroke();` on one shape is the
// ordinary way to ink an outline, and a check that flagged it would cry wolf on every
// figure in the game.
//
// WHAT IT COVERS. The same ground as rect-check: the opening, the whole course at 140-unit
// steps with somebody in every lane, a solved run through the finale, and all sixteen
// closing-reel vignettes plus both podiums.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const raw = fs.readFileSync(process.argv[2] || path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');

const BAD = new Map();
// The stack frame the call came from. FOUR up, and the count is not a guess -- [0] is the
// Error line, [1] is blame, [2] is note, [3] is the wrapped rect method, and [4] is the
// game's own function. Taking [3] names the wrapper on every row, which is a report that
// says only "something called fillRect" and is worth nothing.
function blame() {
  const st = (new Error().stack || '').split('\n');
  const f = (st[4] || st[3] || '?').trim();
  const line = /<anonymous>:(\d+):/.exec(f);
  const name = f.replace(/^at\s+/, '').replace(/\s*\(.*$/, '');
  return (name || '?') + (line ? '  script line ' + line[1] : '');
}
// PER-CONTEXT path state. The game builds offscreen canvases (grain, textures), and those
// have their own current path -- tracking one global flag would blame a helper for a
// beginPath that happened on a different canvas entirely.
function note(c, kind) {
  if (c.__fresh) return;                 // a path is open; appending to it is the normal way
  // Keyed on the CALL SITE, not on the shape. Keyed on the shape, one fault drawn at many
  // sizes fragments into an entry per size and buries a rarer second one -- the reporting
  // bug the audio mock hit, recorded in CLAUDE.md.
  const key = blame() + ' | ' + kind;
  const e = BAD.get(key) || { key, n: 0, sample: kind };
  e.n++; BAD.set(key, e);
}

function makeCtx() {
  const grad = { addColorStop() {} };
  const c = {
    canvas: { width: 960, height: 540 },
    // __fresh: a beginPath has happened and nothing has consumed the path since.
    // It starts FALSE deliberately: the very first builder on a context with no beginPath
    // before it is the same fault, appending to the empty initial path and then inking
    // whatever a later consumer picks up.
    __fresh: false,
    // save/restore do NOT touch the current path. That is the whole point of this check, so
    // they must not touch __fresh either -- carrying it across a save would hide exactly the
    // case where a helper wraps its work in save/restore and forgets beginPath.
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, setTransform() {},
    beginPath() { c.__fresh = true; },
    closePath() { note(c, 'closePath'); },
    moveTo() { note(c, 'moveTo'); }, lineTo() { note(c, 'lineTo'); },
    quadraticCurveTo() { note(c, 'quadraticCurveTo'); }, bezierCurveTo() { note(c, 'bezierCurveTo'); },
    rect(x, y, w, h) { note(c, 'rect'); },
    roundRect() { note(c, 'roundRect'); },
    arcTo() { note(c, 'arcTo'); },
    ellipse() { note(c, 'ellipse'); },
    arc(a, b, r) { if (!isFinite(r) || r < 0) throw new Error('IndexSizeError: bad radius ' + r); note(c, 'arc'); },
    // consumers. They do not flag -- filling and then stroking one shape is ordinary -- but
    // they close the path, so the NEXT builder must open a new one.
    fill() { c.__fresh = false; }, stroke() { c.__fresh = false; }, clip() { c.__fresh = false; },
    clearRect() {}, fillRect() {}, strokeRect() {},
    setLineDash() {}, drawImage() {},
    fillText() {}, strokeText() {},
    measureText(t) { return { width: String(t).length * 6 }; },
    createLinearGradient() { return grad; }, createRadialGradient() { return grad; },
    createPattern() { return grad; },
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

const OUT = eval(src + `
;(function(){
  const seen = { frames: 0, acts: [] };

  // ---- the opening, which draws the yard, the belt, the doors and the drill
  S.mode = 'intro'; S.introT = 0;
  for (let i = 0; i < 60 * 30; i++) { update(1/60); draw(); seen.frames++; }

  // ---- the whole course. STEPPED, not played: the point is to put the camera at every part
  // of the world and draw it, which a single run does only for the lanes that run happened to
  // use. Derived from the course length, not written down, so lengthening the world cannot
  // silently shorten the sweep.
  startRun();
  for (let x = 0; x <= S.camMax + 200; x += 140) {
    S.cam = Math.min(x, S.camMax); updateView(1);
    for (const lane of [0, 1, 2, 3, 4, 5]) {
      // put somebody in every lane so the lane-conditional drawing runs
      S.runners.forEach((r, i) => { if (i % 6 === lane) r.lane = lane; });
    }
    draw(); seen.frames++;
  }
  seen.acts.push('course to ' + Math.round(S.camMax));

  // ---- a real run, so the hazards, panels, particles and the finale all draw
  reset(); startRun();
  // Derived, not written down. 400s was a generous margin over a 12300-unit course and is
  // still generous over 20370, but it encodes a fact about the world inside a test of the
  // world -- the exact shape that broke the freeze harness, and that truncated
  // tools/cover-check.js silently the day act three doubled. Derive it and lengthening the
  // course cannot quietly shorten the sweep.
  const playBudget = Math.round(60 * (S.camMax / CFG.scroll + 90));
  let ranOut = true;
  for (let i = 0; i < playBudget && S.mode === 'play'; i++) { update(1/60); devSolve(); if (i % 3 === 0) { draw(); seen.frames++; } }
  if (S.mode !== 'play') ranOut = false;
  seen.truncated = ranOut;
  for (let i = 0; i < 60 * 200 && S.mode === 'finale'; i++) { update(1/60); if (i % 3 === 0) { draw(); seen.frames++; } }
  seen.acts.push('a solved run, ending in ' + S.mode);

  // ---- EVERY VERB'S PANEL, deliberately. A solved run draws panels 392 times and still
  // never once reaches VERBS.code.draw: devSolve clears a room in the frame it opens it and
  // the sweep samples every third frame, so which panels get drawn is down to luck and the
  // press keypad loses. The first version of this file reported "all clear" while executing
  // none of the press room, and a beginPath deliberately removed from thumbMark did not
  // fail it -- a green about code it had never run. Panels are opened here by hand instead,
  // every verb, each stepped through its own states so the branches inside draw() run too.
  reset(); startRun();
  const verbsSeen = new Set();
  for (const room of S.rooms) {
    const v = VERBS[room.verb];
    if (!v || verbsSeen.has(room.verb)) continue;
    verbsSeen.add(room.verb);
    room.hot = 1;
    for (let d = 1; d <= 5; d++) {
      room.mg = v.start(d);
      S.active = room;
      for (let step = 0; step < 24; step++) {
        draw(); seen.frames++;
        // walk the puzzle forward the way a player does, so later states draw as well as the
        // opening one -- a keypad with three prints entered looks nothing like an empty one
        try { const k = v.solveKey ? v.solveKey(room.mg) : null; if (k) v.key(room.mg, k); } catch (e) {}
        try { v.update(room.mg, 1 / 30); } catch (e) {}
      }
      // and the failed state, which draws in its own colours
      room.mg = v.start(d); room.mg.failed = true; draw(); seen.frames++;
    }
    S.active = null;
  }
  seen.acts.push('every panel: ' + verbsSeen.size + ' verbs, five difficulties, stepped');

  // ---- and the closing reel, every vignette across its whole clock. A sweep of the course
  // never reaches these: they are drawn on an end screen only, and two of the three known
  // instances of this fault were in them.
  const kinds = Object.keys(TRAPS), pool = S.runners.filter(r => r.name);
  S.endT = 0; S.endRoll = null;
  const roll = buildRoll();
  roll.cards = kinds.map(function(k, i) {
    const r = pool[i % pool.length] || S.runners[0];
    return { r: r, at: (i + 1) / (kinds.length + 1) * CFG.finale.x, doom: doomOf(r), kind: k, wet: i % 2 === 0 };
  });
  roll.n = roll.cards.length;
  roll.end = REEL.at + roll.n * roll.step;
  S.mode = 'lose'; S.endRoll = roll;
  for (let i = 0; i < Math.ceil((roll.end + 4) * 60); i++) {
    S.endT = i / 60; S.t += 1/60; draw(); seen.frames++;
  }
  // the won podium too, which draws dancers and the rank stamp
  S.mode = 'win'; S.finale = { attempts: 40, len: 6, seq: [], idx: 0, timer: 1, line: [], leaving: [] };
  S.endRoll.out = pool.slice(0, 8);
  S.endRoll.out.forEach(function(r){ r.state = 'arrived'; });
  for (let i = 0; i < 60 * 6; i++) { S.endT = roll.end + i / 60; S.t += 1/60; draw(); seen.frames++; }
  seen.acts.push('all ' + kinds.length + ' reel vignettes, plus both podiums');

  return seen;
})()
`);

if (OUT.truncated) {
  console.log('NOTE: the solved run hit its frame budget without finishing. The sweep below');
  console.log('covers only the part of the course it reached -- fix that before believing it.');
}
console.log(`swept ${OUT.frames} frames: 30s of the opening, ${OUT.acts.join(', ')}\n`);
const rows = [...BAD.values()].sort((a, b) => b.n - a.n);
if (!rows.length) {
  console.log('  every path that is stroked or filled was opened with beginPath');
  console.log('\nall clear');
  process.exit(0);
}
console.log('subpaths appended to an already-consumed path, by call site:\n');
for (const r of rows) console.log(`  ${String(r.n).padStart(6)}x  ${r.sample.padEnd(16)}  ${r.key}`);
console.log(`\n${rows.length} FAILED`);
console.log('Each of these appends to a path something else already inked, so whatever that');
console.log('path held gets drawn again in the current style. Add ctx.beginPath() before the');
console.log('shape. ctx.save() does NOT do this for you -- the path is not context state.');
process.exit(1);

// PROVED ABLE TO FAIL, and the first attempt was not. Removing the beginPath from
// thumbMark's ring loop in a copy reports "1500x ellipse  thumbMark script line 567" and
// exits 1. Before the per-verb panel pass above existed, that same injected fault came back
// ALL CLEAR: the sweep drew panels 392 times without once reaching VERBS.code.draw, so the
// check was green about code it had never executed. Proving the mechanism is not proving the
// coverage, and this file had the mechanism right and the coverage wrong.
//
// It also has to stay quiet on the ordinary idiom. `ctx.fill(); ctx.stroke();` on one path
// is how an inked outline is drawn and appears 20 times in index.html; none of them is
// flagged, which is what makes the clean run mean something rather than nothing.
