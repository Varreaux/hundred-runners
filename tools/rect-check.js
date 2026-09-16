// Every rectangle the game draws, checked for a negative or non-finite dimension.
//
//   node tools/rect-check.js
//
// WHY THIS IS A TOOL AND NOT A ONE-OFF. Three instances of this fault turned up in one day,
// in two people's code, and the sweep that found the third was twenty throwaway lines run
// by hand. A check that has been run once, by hand, will not be run again -- and this is now
// a known-live fault class in this file, so it needs something that can be re-run.
//
// WHAT THE FAULT IS. `fillRect(x, y, w, h)` with a negative w or h does not fail and does not
// warn: the rectangle simply grows the other way, leftward or upward from its x,y. Canvas is
// perfectly happy. It appears when a dimension is written as an ARITHMETIC EXPRESSION rather
// than as a length -- `fillRect(x, -74, 8, by - 74 + 74)` looks like arithmetic and is a sign
// error -- or when a width is multiplied by a direction, `8 * dir`.
//
// AND THE WORST CASE PRODUCES THE RIGHT PICTURE. The buffer stop's head timber was
// `fillRect(sx - 8 * dir, y - 13, 8 * dir, 4.5)`: on every leftward run the width was -8, and
// because the x was mirrored by the same `dir` the two errors cancelled and the timber landed
// exactly where it was meant to, 138 times a frame. Nothing ever pointed at it. The two in
// the closing reel threw ironwork clean off the top of the card and at least announced
// themselves. A trap that draws correctly is the worse one to have, because the next person
// to touch that line inherits it silently -- which is the whole argument for a sweep rather
// than for looking.
//
// WHAT IT COVERS. The opening, the whole course at 140-unit steps, the finale, and every one
// of the closing reel's sixteen death vignettes across their whole clock. The reel matters
// here: it is drawn only on an end screen, so a sweep of the course alone never reaches it,
// and two of the three known instances were in it.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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
function note(kind, w, h) {
  const which = [];
  if (!(w >= 0)) which.push('w=' + (Number.isFinite(w) ? w.toFixed(2) : String(w)));
  if (!(h >= 0)) which.push('h=' + (Number.isFinite(h) ? h.toFixed(2) : String(h)));
  if (!which.length) return;
  // Keyed on the CALL SITE, not on the value. Keyed on the value, one fault whose number
  // varies fragments into an entry per number and buries a rarer second one -- the exact
  // reporting bug the audio mock hit, recorded in CLAUDE.md.
  const key = blame() + ' | ' + kind;
  const e = BAD.get(key) || { key, n: 0, sample: which.join(' ') };
  e.n++; BAD.set(key, e);
}

function makeCtx() {
  const grad = { addColorStop() {} };
  const c = {
    canvas: { width: 960, height: 540 },
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, clip() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    fill() {}, stroke() {}, clearRect(x, y, w, h) { note('clearRect', w, h); },
    fillRect(x, y, w, h) { note('fillRect', w, h); },
    strokeRect(x, y, w, h) { note('strokeRect', w, h); },
    rect(x, y, w, h) { note('rect', w, h); },
    arc(a, b, r) { if (!isFinite(r) || r < 0) throw new Error('IndexSizeError: bad radius ' + r); },
    arcTo() {}, ellipse() {}, setLineDash() {}, drawImage() {},
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
  for (let i = 0; i < 60 * 400 && S.mode === 'play'; i++) { update(1/60); devSolve(); if (i % 3 === 0) { draw(); seen.frames++; } }
  for (let i = 0; i < 60 * 200 && S.mode === 'finale'; i++) { update(1/60); if (i % 3 === 0) { draw(); seen.frames++; } }
  seen.acts.push('a solved run, ending in ' + S.mode);

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

console.log(`swept ${OUT.frames} frames: 30s of the opening, ${OUT.acts.join(', ')}\n`);
const rows = [...BAD.values()].sort((a, b) => b.n - a.n);
if (!rows.length) {
  console.log('  no rectangle drawn with a negative or non-finite dimension');
  console.log('\nall clear');
  process.exit(0);
}
console.log('calls with a negative or non-finite dimension, by call site:\n');
for (const r of rows) console.log(`  ${String(r.n).padStart(6)}x  ${r.sample.padEnd(16)}  ${r.key}`);
console.log(`\n${rows.length} FAILED`);
console.log('A negative dimension grows the rect the other way. It may still land correctly --');
console.log('the buffer stop did, because its x was mirrored by the same factor -- so fix the');
console.log('expression rather than the picture: write the two edges and subtract them.');
process.exit(1);
