// The mill hall's geometry as arithmetic. Run `node tools/hall-check.js`.
//
// The big engines in act one stand on the SAME 200-unit bay grid as the bench plant, and
// their widths are hand-set numbers scattered through three drawing functions. Nothing
// stops the next person who lengthens a bedplate from putting it through the neighbouring
// machine, and nothing in a screenshot shows it: the hall is dark, the machines are behind
// a hundred people, and two overlapping silhouettes read as one big machine.
//
// So this does not restate any of those numbers. It DRAWS each machine against a context
// that records where paint actually lands, and asks four questions of the result:
//
//   1. do two machines in neighbouring bays overlap on their drawn extents?
//   2. does a machine reach above the corridor ceiling, or below its own floor?
//   3. does the line shaft's belt land ON the machine it is supposed to drive?
//   4. does every feature bay have a power source that matches what is drawn?
//
// Deriving the extents rather than writing them down is the point: change a coordinate in
// millEngine and this moves with it, so it goes stale by failing rather than by lying.
//
// It measures the MACHINES, not their smoke. Two plumes overlapping is not a defect --
// smoke fills a room, that is what it is for -- and a puff 40 units across either side of
// a nozzle would swamp every extent here and make the overlap number meaningless.
const fs = require('fs'), path = require('path');
const target = process.argv[2] || path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(target, 'utf8').split('<script>')[1].split('</script>')[0].replace("'use strict';", '');

// ---- a context that measures instead of painting.
//
// It carries a TRANSFORM STACK, and that is not optional: without one it reported a
// contact shadow as 65 units deep into the floor, because the shadow is an arc of radius
// 64 drawn under ctx.scale(1, 7/64). A measuring context that ignores save/scale/translate
// does not under-report, it invents -- and it accuses the game while doing it.
let M = [1, 0, 0, 1, 0, 0];
const mstack = [];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const xf = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
const mscale = () => (Math.hypot(M[0], M[1]) + Math.hypot(M[2], M[3])) / 2;
const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
let path0 = null, recording = false;
const resetBox = () => { box.x0 = box.y0 = Infinity; box.x1 = box.y1 = -Infinity; };
function hit(x0, y0, x1, y1) {
  if (!recording) return;
  if (![x0, y0, x1, y1].every(Number.isFinite)) return;
  box.x0 = Math.min(box.x0, x0); box.y0 = Math.min(box.y0, y0);
  box.x1 = Math.max(box.x1, x1); box.y1 = Math.max(box.y1, y1);
}
function pt(rx, ry) {
  if (!Number.isFinite(rx) || !Number.isFinite(ry)) return;
  const [x, y] = xf(rx, ry);
  if (!path0) path0 = { x0: x, y0: y, x1: x, y1: y };
  else { path0.x0 = Math.min(path0.x0, x); path0.y0 = Math.min(path0.y0, y);
         path0.x1 = Math.max(path0.x1, x); path0.y1 = Math.max(path0.y1, y); }
}
function makeCtx() {
  const grad = { addColorStop() {} };
  const c = {
    canvas: { width: 960, height: 540 },
    save() { mstack.push(M.slice()); },
    restore() { M = mstack.pop() || [1, 0, 0, 1, 0, 0]; },
    translate(x, y) { M = mul(M, [1, 0, 0, 1, x, y]); },
    scale(x, y) { M = mul(M, [x, 0, 0, y, 0, 0]); },
    rotate(a) { const c = Math.cos(a), n = Math.sin(a); M = mul(M, [c, n, -n, c, 0, 0]); },
    setTransform(a, b, c2, d, e, f) { M = [a, b, c2, d, e, f]; },
    // a clip is a promise not to paint outside it, so it cannot ENLARGE an extent
    clip() { path0 = null; },
    beginPath() { path0 = null; }, closePath() {},
    moveTo(x, y) { pt(x, y); }, lineTo(x, y) { pt(x, y); },
    quadraticCurveTo(cx, cy, x, y) { pt(cx, cy); pt(x, y); },
    bezierCurveTo(a, b, cx, cy, x, y) { pt(a, b); pt(cx, cy); pt(x, y); },
    rect(x, y, w, h) { pt(x, y); pt(x + w, y + h); },
    arc(x, y, r) { if (!isFinite(r) || r < 0) throw new Error('bad radius ' + r); pt(x - r, y - r); pt(x + r, y + r); },
    ellipse(x, y, rx, ry) { pt(x - rx, y - ry); pt(x + rx, y + ry); },
    arcTo() {}, setLineDash() {},
    fill() { if (path0) hit(path0.x0, path0.y0, path0.x1, path0.y1); },
    stroke() { const w = (c.lineWidth || 1) / 2 * mscale(); if (path0) hit(path0.x0 - w, path0.y0 - w, path0.x1 + w, path0.y1 + w); },
    // the four corners, each through the transform: under a scale the rect is not a rect
    fillRect(x, y, w, h) { const p = path0; path0 = null;
      pt(x, y); pt(x + w, y); pt(x, y + h); pt(x + w, y + h);
      if (path0) hit(path0.x0, path0.y0, path0.x1, path0.y1); path0 = p; },
    strokeRect(x, y, w, h) { c.fillRect(x, y, w, h); },
    clearRect() {},
    drawImage(img, x, y, w, h) { const p = path0; path0 = null;
      pt(x, y); pt(x + w, y); pt(x, y + h); pt(x + w, y + h);
      if (path0) hit(path0.x0, path0.y0, path0.x1, path0.y1); path0 = p; },
    fillText() {}, strokeText() {}, measureText: t => ({ width: String(t).length * 6 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => grad,
    getImageData: () => ({ data: new Uint8ClampedArray(256) }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(4 * (w || 8) * (h || 8)), width: w || 8, height: h || 8 }),
    putImageData() {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '', font: '', textAlign: '',
    globalAlpha: 1, globalCompositeOperation: '', shadowBlur: 0, shadowColor: '', filter: '',
  };
  return c;
}
global.document = { getElementById: () => ({ getContext: makeCtx, width: 960, height: 540 }),
                    createElement: () => ({ getContext: makeCtx, width: 8, height: 8 }) };
global.window = { addEventListener() {} };
global.performance = { now: () => 0 }; global.requestAnimationFrame = () => {};
global.location = { search: '' };
global.URLSearchParams = class { has() { return false } get() { return null } };
global.localStorage = { getItem: () => null, setItem() {} };
const { makeAudioMock } = require(path.join(__dirname, 'audio-mock.js'));
global.__audio = { nodes: 0, live: 0 };
global.window.AudioContext = makeAudioMock(global.__audio);

// The eval goes inside a function on purpose. A function DECLARATION in a non-strict
// eval lands in the enclosing var scope, so evaluating the game at module level collides
// with anything this file happens to have named the same -- `say` and `reset` both did.
const api = (function () {
  return eval(src + ';({ CFG, FAC, V, S, hash, millBay, bayDrive, millFeature, millFeatureSmoke, inView, laneY })');
})();
const { CFG, FAC, V, S, hash, millBay, bayDrive, millFeature } = api;

// Draw one bay's machine at a known place and report where the paint went. The camera is
// put where millCorridor would put it so inView lets the machine through.
const NAMES = ['engine', 'hammer', 'cupola'];
function measure(gx, lane, feat, y, shy) {
  V.left = gx - 480; V.vw = 960; V.zoom = 1; S.t = 3.37;
  resetBox(); path0 = null; M = [1, 0, 0, 1, 0, 0]; mstack.length = 0; recording = true;
  millFeature(gx, y, lane, feat, shy);
  recording = false;
  const sx = gx - V.left;
  return { x0: box.x0 - sx, x1: box.x1 - sx, y0: box.y0 - y, y1: box.y1 - y };
}

// Walk the mill exactly as millCorridor does: same bay pitch, same jitter expression.
const bays = [];
for (let lane = 0; lane < CFG.laneCount; lane++) {
  const y = CFG.baseY - lane * CFG.laneGap - 2;        // millFeature is handed the floor less two
  const shy = (y + 2) - CFG.tunnelH + 52;
  for (let wx = Math.floor((FAC.x0 - 240) / 200) * 200; wx < FAC.seam + 240; wx += 200) {
    const gx = wx + 8 + (hash(wx * 0.0051) - 0.5) * 50;
    if (gx < FAC.x0 || gx > FAC.seam) continue;
    const bay = millBay(gx, lane);
    if (bay.feat < 0) continue;
    bays.push({ gx, lane, y, shy, bay, ext: measure(gx, lane, bay.feat, y, shy) });
  }
}

const fails = [];
const say = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

console.log(`${bays.length} big engines across ${CFG.laneCount} lanes ` +
  `(${NAMES.map((n, i) => bays.filter(b => b.bay.feat === i).length + ' ' + n).join(', ')})\n`);

// 1. neighbours
let worst = null;
for (const a of bays) {
  for (const b of bays) {
    if (a === b || a.lane !== b.lane || b.gx <= a.gx) continue;
    if (b.gx - a.gx > 420) continue;
    const gap = (b.gx + b.ext.x0) - (a.gx + a.ext.x1);
    if (!worst || gap < worst.gap) worst = { gap, a, b };
  }
}
// the ordinary bench plant is on the same grid; measure against its reach too
const PLANT_REACH = 46;          // millPlant's widest object, the lathe bed at +/- 40 plus its stack
for (const a of bays) {
  for (const s of [-200, 200]) {
    const wxn = a.gx + s;
    const gxn = Math.round(wxn / 200) * 200 + 8 + (hash(Math.round(wxn / 200) * 200 * 0.0051) - 0.5) * 50;
    if (Math.abs(gxn - a.gx) < 80 || Math.abs(gxn - a.gx) > 300) continue;
    const n = millBay(gxn, a.lane);
    if (!n.has || n.feat >= 0) continue;
    const gap = s < 0 ? (a.gx + a.ext.x0) - (gxn + PLANT_REACH) : (gxn - PLANT_REACH) - (a.gx + a.ext.x1);
    if (!worst || gap < worst.gap) worst = { gap, a, b: { gx: gxn, bay: n, ext: { x0: -PLANT_REACH, x1: PLANT_REACH } } };
  }
}
say(!worst || worst.gap >= 0, worst
  ? `no two machines overlap on their drawn extents  tightest ${worst.gap.toFixed(1)} units, ` +
    `${NAMES[worst.a.bay.feat]} at ${worst.a.gx | 0} beside ${worst.b.bay.feat >= 0 ? NAMES[worst.b.bay.feat] : 'plant'} at ${worst.b.gx | 0}`
  : 'no two machines overlap on their drawn extents  (none placed)');

// 2. ceiling and floor. The limit is millCorridor's CLIP, not the ceiling line: the truss
// covers the top 24 units of the hall, so a cupola flue running up into it is deliberate,
// and so is a wall glow whose gradient reaches past the roof before the truss covers it.
// What would be a bug is paint escaping the room, and that is what this measures.
// The number is printed either way, because a machine creeping up is worth seeing.
const CEIL = -(CFG.tunnelH + 8);                 // in machine coordinates: floor is 0
let hi = null, lo = null;
for (const b of bays) {
  if (!hi || b.ext.y0 < hi.ext.y0) hi = b;
  if (!lo || b.ext.y1 > lo.ext.y1) lo = b;
}
say(hi && hi.ext.y0 >= CEIL,
  `no paint escapes the room  highest ${(-hi.ext.y0).toFixed(1)} above the floor ` +
  `(${NAMES[hi.bay.feat]} at ${hi.gx | 0}); the truss covers from ${CFG.tunnelH - 24}, the clip is ${-CEIL}`);
// Same rule as the ceiling and for the same reason: the limit is the clip, not the deck.
// A heat gradient has to run PAST the floor or its ramp is cut off with a tenth of its
// alpha still on it, which in 'lighter' is a hard edge and a fire that throws no pool on
// the boards under it. 20 below is where millCorridor stops drawing.
say(lo && lo.ext.y1 <= 20,
  `no paint escapes below the deck  lowest ${lo.ext.y1.toFixed(1)} under it ` +
  `(${NAMES[lo.bay.feat]} at ${lo.gx | 0}); the clip ends at 20`);

// 3. the belt lands on the machine it drives
let bad = [];
for (const b of bays) {
  const sx = b.gx - V.left;
  const drive = bayDrive(b.bay, 0, b.y);         // sx 0, so the point is machine-relative
  if (drive === 'self' || drive === null) continue;
  const [tx, ty] = drive;
  if (tx < b.ext.x0 || tx > b.ext.x1 || ty < b.y + b.ext.y0 || ty > b.y + b.ext.y1)
    bad.push(`${NAMES[b.bay.feat]} at ${b.gx | 0}: belt lands at ${tx.toFixed(0)},${(ty - b.y).toFixed(0)} ` +
             `outside ${b.ext.x0.toFixed(0)}..${b.ext.x1.toFixed(0)} / ${b.ext.y0.toFixed(0)}..${b.ext.y1.toFixed(0)}`);
  void sx;
}
say(bad.length === 0, bad.length ? bad.join('; ') : 'every belt lands on the machine it drives');

// 4. every machine has a power source, and it is the one its drawing shows
const DRIVEN = { 0: 'self', 1: null, 2: 'belt' };
bad = [];
for (const b of bays) {
  const d = bayDrive(b.bay, 0, b.y);
  const kind = d === 'self' ? 'self' : d === null ? null : 'belt';
  if (kind !== DRIVEN[b.bay.feat])
    bad.push(`${NAMES[b.bay.feat]} at ${b.gx | 0} is driven by ${kind}, expected ${DRIVEN[b.bay.feat]}`);
}
say(bad.length === 0, bad.length ? bad.join('; ')
  : 'power sources match: the engine drives the shaft, the hammer takes steam, the blower takes a belt');

console.log(fails.length ? `\n${fails.length} problem(s) in the hall.` : '\nthe hall holds together.');
process.exit(fails.length ? 1 : 0);
