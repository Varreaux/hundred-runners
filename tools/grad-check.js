// Every gradient the game paints, checked against the extent of the fill that uses it.
//
//   node tools/grad-check.js [path/to/index.html]
//
// WHAT THE FAULT IS. A gradient and the fill that paints it are two sets of numbers written
// on two different lines, and nothing in the language ties them together. They drift.
//
//   * A fill WIDER than its gradient does not run out of gradient. `createLinearGradient`
//     HOLDS ITS END COLOUR beyond its endpoints, for ever, so the region past the last stop
//     is painted flat in that stop's colour. Harmless while the stop is transparent, and a
//     34% black wash over the wrong half of the course the moment it is not. That one
//     shipped.
//   * A fill NARROWER than its gradient truncates the ramp before it has faded out, leaving
//     a hard edge at the fill boundary rather than at the end of the ramp: 90px of a 300px
//     ramp cut off at 0.154 alpha put a visible bar down the full height of the rock. That
//     one shipped too.
//   * And `fillRect(x, -610, w, CFG.worldBottom)` -- a HEIGHT where the gradient's second
//     endpoint was an absolute y -- painted the hill's light over 47% of its own span, so
//     every terrace the crowd runs on had no light on it at all. That one shipped as well.
//
// None of the three is visible in the source unless you deliberately put the two numbers
// side by side, and none of them throws, so a syntax check, a harness run, a probe and a
// glance at the frame all pass. An unlit terrace just looks like a terrace.
//
// WHAT THIS CHECKS, per painted call:
//   SMEAR        the painted region runs past the gradient's endpoint, over at least a quarter
//                of its own AREA, AND the terminal stop is not transparent -- so a flat band
//                of that colour is really laid down, and a band you can see. The alpha gate
//                is the whole point: a glow whose last stop is rgba(...,0) may be painted
//                over any rect at all, and half the gradients in this file are that.
//   FLAT         the ramp lies entirely outside the fill, so every pixel it paints is one
//                held colour and the gradient never runs at all.
//   HARD EDGE    the terminal stop IS transparent -- the ramp was built to vanish -- and the
//                fill stops before it gets there, while the ramp is still at a readable
//                alpha. The number reported is the alpha at the cut.
//   DEAD         a linear gradient whose two endpoints are the same point, or one with no
//                colour stops. Canvas paints nothing at all: the fill is invisible.
//   THROWS       a non-finite gradient coordinate, a negative radius, a stop offset outside
//                0..1, or a colour string containing NaN/Infinity/undefined. Every one of
//                these throws a real exception in a real browser, and an exception inside
//                draw() stops requestAnimationFrame being rescheduled -- the game freezes on
//                a half-drawn frame. The mocked context here does NOT throw, deliberately,
//                so that one such call does not hide the rest of the sweep.
//   SPACE        the gradient was created under one transform and painted under another.
//                Canvas interprets a gradient's coordinates in the user space in force when
//                it is PAINTED, not when it was created, so the ramp lands somewhere other
//                than where its numbers read. No geometry verdict is given for those calls,
//                because the two numbers are genuinely in two spaces and any comparison of
//                them would be invented; they are counted and reported separately.
//
// WHICH SPACE A GRADIENT LIVES IN, settled by experiment rather than by memory, because the
// whole comparison rests on it. A ramp written createLinearGradient(0,0,0,100), painted under
// ctx.scale(1,2) over fillRect(0,0,20,100), sampled in headless Chrome down the device column:
//
//     y=2  251,0,3     y=50  190,0,64    y=100  127,0,128    y=150  63,0,191   y=198  2,0,253
//
// The ramp spans device 0..200 and its midpoint is at device y=100, i.e. user y=50. So canvas
// resolves a gradient's coordinates in the user space in force when it is PAINTED, and knows
// nothing about the transform that was in force when it was built. That is why this tool
// compares the gradient's raw numbers against the fill's raw numbers and applies no transform
// to either: they are already in one space, the paint-time user space. It is also why a
// gradient built under one transform and painted under another is reported as a NOTE and not
// as a fault -- the ramp still matches the fill, it just does not land where the source reads.
//
// THE TRANSFORM IS THE PART THAT DECIDES WHETHER THE NUMBERS MEAN ANYTHING. A tool that
// measures drawing and ignores save/scale/translate does not under-report, it invents a
// number and then accuses the game -- CLAUDE.md, after a contact shadow was read as 65 units
// deep because it is an arc of radius 64 drawn under ctx.scale(1, 7/64). So this carries a
// full CTM: translate, scale and rotate all compose into it, save/restore push and pop it,
// path points are transformed as they are ADDED (which is what canvas does -- the current
// default path lives in device space), and the painted region is mapped BACK through the
// paint-time CTM before it is compared with the gradient. Gradient and fill are therefore
// always compared in one space, the paint-time user space, which is the space canvas itself
// resolves a gradient in. Where the two spaces differ, it declines to compare rather than
// guessing -- see SPACE above.
//
// It also intersects the painted region with the canvas and with any live clip, so a world-
// space fill 20000 units long is judged on the part of it the player can actually see, and a
// glow clipped to a rect smaller than its own radius is not accused of smearing.
//
// WHAT IT COVERS. rect-check's sweep, borrowed wholesale, because that is the part that took
// the work: 30s of the opening, the whole course at 140-unit steps with somebody in every
// lane, a solved run through the finale, all the closing-reel vignettes across their whole
// clock, both podiums -- and the by-hand pass over every verb's panel at five difficulties.
// That last one is not optional. The ordinary sweep draws panels hundreds of times without
// ever reaching VERBS.code.draw, because the bot opens and clears a room in one frame and
// the sweep samples every third; without the by-hand pass this tool would be silent about a
// dozen panel painters and the silence would read as a pass.
//
// WHAT IT DOES NOT COVER is printed at the end of every run, with counts. Read it.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
// Takes an optional path, so a deliberately broken copy can be run through it. Without one a
// falsifier silently sweeps the REAL file and comes back all clear, which reads as the check
// being sound when it has not been tested at all.
const TARGET = process.argv[2] || path.join(root, 'index.html');
const raw = fs.readFileSync(TARGET, 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
// eval's line 1 is the remainder of the line <script> sits on, so a line inside the evalled
// script maps back to index.html by this offset. Derived from the file, not written down.
const LINE0 = raw.split('<script>')[0].split('\n').length;

// ---------------------------------------------------------------- thresholds
// Both floors are set from the two instances this project actually shipped, quoted in the
// header: a 34% wash over half of a fill, and a 300px ramp cut at 0.154 alpha after 90px.
const T_EPS      = 0.02;  // t slack before "past the end" / "short of the end" counts at all
const A_VISIBLE  = 0.05;  // an effective alpha at or above this is a band you can see
const A_FADED    = 0.02;  // a terminal stop at or below this was built to vanish
const OVERRUN_FR = 0.25;  // the held band must be at least this much of the fill's own AREA
const CUT_AT     = 0.90;  // ... and a cut at t above this is the end of the ramp, not a cut

// ---------------------------------------------------------------- call sites
// Structured stack frames, not formatted ones: this runs on millions of calls and formatting
// a stack costs twice what reading the CallSite objects does. The frame wanted is the first
// one inside the evalled script -- everything above it is this file's own wrappers, and
// naming those would give every row the same useless blame.
function site() {
  const old = Error.prepareStackTrace;
  Error.prepareStackTrace = (e, st) => st;
  const st = new Error().stack;
  Error.prepareStackTrace = old;
  if (!st || !st.length) return '?';
  let out = null;
  for (const cs of st) {
    try {
      if (!cs.isEval()) continue;
      const ln = cs.getLineNumber(), nm = cs.getFunctionName();
      if (!out) { out = (nm || '(anon)') + '  index.html:' + (ln + LINE0 - 1); if (nm) return out; continue; }
      // the first frame was an unnamed callback -- hills draws through one, and a row that
      // says only "eval" names nothing. Carry the enclosing named function with it.
      if (nm) return out + '  in ' + nm;
      return out;
    } catch (e) { /* a frame that will not answer is not the frame we want */ }
  }
  return out || '?';
}
Error.stackTraceLimit = 12;

const MADE = new Set();           // gradient call sites the sweep BUILT a gradient at
const SITES = new Set();          // ... and the ones it actually PAINTED one from. Not the
                                  // same number, and the second is the one a verdict rests
                                  // on: a gradient that is built and never used is a line
                                  // this tool has said nothing about.
const BAD = new Map();            // findings, keyed by call site
const SKIP = { text: 0, eccentric: 0, offCanvas: 0 };
const SPACES = new Map();         // sites whose gradient is built under one transform and painted under another

function report(kind, key, detail) {
  const e = BAD.get(key) || { key, kind, n: 0, detail };
  e.n++;
  // Keep the WORST example, not the first: one fault whose numbers vary would otherwise be
  // reported at whatever value happened to come first, and the reader has no way to tell
  // whether that is the shape of it.
  if (detail.rank > (e.detail.rank || -Infinity)) e.detail = detail;
  BAD.set(key, e);
}

// ---------------------------------------------------------------- colour
const ALPHA = new Map();
function alphaOf(col) {
  if (typeof col !== 'string') return { a: 1, bad: false };
  let hit = ALPHA.get(col);
  if (hit) return hit;
  let a = 1, bad = /NaN|Infinity|undefined|null/.test(col);
  let m = /^\s*rgba?\(([^)]*)\)\s*$/i.exec(col);
  if (m) {
    const p = m[1].split(/[,\/\s]+/).filter(s => s.length);
    if (p.length >= 4) { const v = parseFloat(p[3]); if (Number.isFinite(v)) a = Math.min(1, Math.max(0, v)); else bad = true; }
    for (const q of p) if (!Number.isFinite(parseFloat(q))) bad = true;
  } else {
    m = /^\s*#([0-9a-fA-F]{8})\s*$/.exec(col);
    if (m) a = parseInt(m[1].slice(6), 16) / 255;
    else { m = /^\s*#([0-9a-fA-F]{4})\s*$/.exec(col); if (m) a = parseInt(m[1][3] + m[1][3], 16) / 255; }
  }
  hit = { a, bad };
  // `rgba(255,190,90,${0.3 * fl})` is a NEW string every frame, so this cache would otherwise
  // grow without bound and become the tool's own leak. Capped and dropped wholesale.
  if (ALPHA.size > 20000) ALPHA.clear();
  ALPHA.set(col, hit);
  return hit;
}

// ---------------------------------------------------------------- matrices
// [a, b, c, d, e, f]:  x' = a*x + c*y + e,  y' = b*x + d*y + f
function mul(A, B) {
  return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
          A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
          A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
}
const mx = (M, x, y) => M[0] * x + M[2] * y + M[4];
const my = (M, x, y) => M[1] * x + M[3] * y + M[5];
function inv(M) {
  const det = M[0] * M[3] - M[1] * M[2];
  if (!det || !Number.isFinite(det)) return null;
  return [M[3] / det, -M[1] / det, -M[2] / det, M[0] / det,
          (M[2] * M[5] - M[3] * M[4]) / det, (M[1] * M[4] - M[0] * M[5]) / det];
}
function sameM(A, B) {
  for (let i = 0; i < 6; i++) if (Math.abs(A[i] - B[i]) > 1e-6) return false;
  return true;
}
// how much a unit length is stretched, so a tolerance in pixels can be stated in user units
function scaleOf(M) { return Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1; }

// ---------------------------------------------------------------- the context
function makeCtx(canvas) {
  const cv = canvas || { width: 960, height: 540 };
  const c = {
    canvas: cv,
    __m: [1, 0, 0, 1, 0, 0],
    __clip: null,                         // device bbox [x0,y0,x1,y1], or null for no clip
    __st: [],
    // device-space bbox of the current path, plus whether any of it was approximated
    __pX0: Infinity, __pY0: Infinity, __pX1: -Infinity, __pY1: -Infinity, __pApprox: false,
    // The single commonest fill in this file is one full circle, and its BOUNDING BOX reaches
    // 1.41 times its own radius at the corners -- so measuring a radial gradient against the
    // box says "63% of this is past the ramp" about a disc that ends exactly where the ramp
    // does. That is an invented number of precisely the kind this project keeps being bitten
    // by, so the circle is kept as a circle. Set only while the path is exactly one of them.
    __circle: null, __prims: 0,
    __lx: 0, __ly: 0,                     // last path point, device space

    save() {
      c.__st.push([c.__m.slice(), c.__clip && c.__clip.slice(), c.fillStyle, c.strokeStyle,
                   c.globalAlpha, c.lineWidth, c.globalCompositeOperation, c.font,
                   c.textAlign, c.lineCap, c.lineJoin, c.filter, c.shadowBlur, c.shadowColor]);
    },
    // A real restore puts the styles back too, and NOT modelling that would let a gradient
    // set inside a save/restore be blamed for a fill drawn after it.
    restore() {
      const s = c.__st.pop(); if (!s) return;
      c.__m = s[0]; c.__clip = s[1]; c.fillStyle = s[2]; c.strokeStyle = s[3];
      c.globalAlpha = s[4]; c.lineWidth = s[5]; c.globalCompositeOperation = s[6];
      c.font = s[7]; c.textAlign = s[8]; c.lineCap = s[9]; c.lineJoin = s[10];
      c.filter = s[11]; c.shadowBlur = s[12]; c.shadowColor = s[13];
    },
    // in place, because this runs on every translate in every frame and a fresh six-element
    // array per call is the difference between a tool people run and one they do not
    translate(x, y) { const m = c.__m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; },
    scale(x, y) { const m = c.__m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; },
    rotate(r) {
      const m = c.__m, s = Math.sin(r), co = Math.cos(r), a = m[0], b = m[1], u = m[2], d = m[3];
      m[0] = a * co + u * s; m[1] = b * co + d * s; m[2] = u * co - a * s; m[3] = d * co - b * s;
    },
    transform(a, b, d, e, f, g) { c.__m = mul(c.__m, [a, b, d, e, f, g]); },
    setTransform(a, b, d, e, f, g) { c.__m = (a === undefined) ? [1, 0, 0, 1, 0, 0] : [a, b, d, e, f, g]; },
    resetTransform() { c.__m = [1, 0, 0, 1, 0, 0]; },

    // ---- path building. Points are transformed as they are added, which is what canvas
    // does: the current default path is held in device space, so a transform changed
    // half-way through a path only affects the points added after it.
    beginPath() { c.__pX0 = c.__pY0 = Infinity; c.__pX1 = c.__pY1 = -Infinity; c.__pApprox = false; c.__circle = null; c.__prims = 0; },
    closePath() {},
    moveTo(x, y) { c.__prims++; c.__circle = null; pt(c, x, y); },
    lineTo(x, y) { c.__prims++; c.__circle = null; pt(c, x, y); },
    quadraticCurveTo(cx, cy, x, y) { c.__prims++; c.__circle = null; quad(c, cx, cy, x, y); },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { c.__prims++; c.__circle = null; cube(c, c1x, c1y, c2x, c2y, x, y); },
    rect(x, y, w, h) { c.__prims++; c.__circle = null; box(c, x, y, x + w, y + h); },
    roundRect(x, y, w, h) { c.__prims++; c.__circle = null; box(c, x, y, x + w, y + h); },
    arc(cx, cy, r, a0, a1, ccw) {
      if (!Number.isFinite(r) || r < 0) throw new Error('IndexSizeError: bad radius ' + r);
      // a full turn, written in this file as 0..6.28 as often as 0..Math.PI*2
      const whole = a0 !== undefined && a1 !== undefined && Math.abs(a1 - a0) >= TAU - 0.05;
      c.__circle = (c.__prims === 0 && whole) ? { x: cx, y: cy, r } : null;
      c.__prims++;
      arcBox(c, cx, cy, r, r, a0, a1, ccw);
    },
    ellipse(cx, cy, rx, ry, rot, a0, a1, ccw) { c.__prims++; c.__circle = null;
      // a rotated ellipse is boxed by its bounding circle: an over-estimate, never an under-
      const rr = Math.max(Math.abs(rx), Math.abs(ry));
      if (rot) { box(c, cx - rr, cy - rr, cx + rr, cy + rr); c.__pApprox = true; }
      else arcBox(c, cx, cy, Math.abs(rx), Math.abs(ry), a0, a1, ccw);
    },
    arcTo(x1, y1, x2, y2) { c.__prims++; c.__circle = null; pt(c, x1, y1); pt(c, x2, y2); c.__pApprox = true; },

    // ---- painting
    fill() { paint(c, 'fill', 'fill()', null); },
    stroke() { paint(c, 'stroke', 'stroke()', null); },
    clip() {
      // the clip is the bbox of the current path, intersected with whatever clip was live
      const b = [c.__pX0, c.__pY0, c.__pX1, c.__pY1];
      if (!Number.isFinite(b[0])) return;
      c.__clip = c.__clip ? [Math.max(c.__clip[0], b[0]), Math.max(c.__clip[1], b[1]),
                             Math.min(c.__clip[2], b[2]), Math.min(c.__clip[3], b[3])] : b;
    },
    fillRect(x, y, w, h) { paint(c, 'fill', 'fillRect', rectDev(c, x, y, w, h)); },
    strokeRect(x, y, w, h) {
      const b = rectDev(c, x, y, w, h);
      if (b) { const g = c.lineWidth * scaleOf(c.__m) / 2; b[0] -= g; b[1] -= g; b[2] += g; b[3] += g; }
      paint(c, 'stroke', 'strokeRect', b);
    },
    clearRect() {},
    fillText() { if (isGrad(c.fillStyle)) SKIP.text++; },
    strokeText() { if (isGrad(c.strokeStyle)) SKIP.text++; },

    measureText(t) { return { width: String(t).length * 6 }; },
    setLineDash() {}, drawImage() {},
    createLinearGradient(x0, y0, x1, y1) { return newGrad(c, 'linear', [x0, y0, x1, y1]); },
    createRadialGradient(x0, y0, r0, x1, y1, r1) { return newGrad(c, 'radial', [x0, y0, r0, x1, y1, r1]); },
    createConicGradient(a, x, y) { return newGrad(c, 'conic', [a, x, y]); },
    createPattern() { return { __pattern: true }; },
    getImageData() { return { data: new Uint8ClampedArray(4 * 8 * 8) }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(4 * (w || 8) * (h || 8)), width: w || 8, height: h || 8 }; },
    putImageData() {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '', font: '', textAlign: '',
    globalAlpha: 1, globalCompositeOperation: '', shadowBlur: 0, shadowColor: '', shadowOffsetY: 0,
    shadowOffsetX: 0, filter: '',
  };
  return c;
}

function pt(c, x, y) {
  const M = c.__m, dx = mx(M, x, y), dy = my(M, x, y);
  c.__lx = dx; c.__ly = dy;
  if (dx < c.__pX0) c.__pX0 = dx; if (dx > c.__pX1) c.__pX1 = dx;
  if (dy < c.__pY0) c.__pY0 = dy; if (dy > c.__pY1) c.__pY1 = dy;
}
function dev(c, x, y) {
  const M = c.__m, dx = mx(M, x, y), dy = my(M, x, y);
  if (dx < c.__pX0) c.__pX0 = dx; if (dx > c.__pX1) c.__pX1 = dx;
  if (dy < c.__pY0) c.__pY0 = dy; if (dy > c.__pY1) c.__pY1 = dy;
}
function box(c, x0, y0, x1, y1) { dev(c, x0, y0); dev(c, x1, y0); dev(c, x1, y1); dev(c, x0, y1); c.__lx = mx(c.__m, x1, y1); c.__ly = my(c.__m, x1, y1); }
// Exact extrema for a quadratic and a cubic, in device space. An affine transform maps a
// bezier to a bezier of the same degree through its control points, so transforming the
// controls first and solving there is exact -- and the control hull alone would be an
// over-estimate, which in this tool means a false SMEAR.
function ext1(p0, p1, p2, push) {
  push(p0); push(p2);
  const den = p0 - 2 * p1 + p2;
  if (Math.abs(den) > 1e-12) { const t = (p0 - p1) / den; if (t > 0 && t < 1) push((1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2); }
}
function ext2(p0, p1, p2, p3, push) {
  push(p0); push(p3);
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), cc = p1 - p0;
  const at = t => { if (t > 0 && t < 1) { const u = 1 - t; push(u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3); } };
  if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) at(-cc / b); }
  else { const d = b * b - 4 * a * cc; if (d >= 0) { const s = Math.sqrt(d); at((-b + s) / (2 * a)); at((-b - s) / (2 * a)); } }
}
function quad(c, cx, cy, x, y) {
  const M = c.__m, x0 = c.__lx, y0 = c.__ly;
  const x1 = mx(M, cx, cy), y1 = my(M, cx, cy), x2 = mx(M, x, y), y2 = my(M, x, y);
  ext1(x0, x1, x2, v => { if (v < c.__pX0) c.__pX0 = v; if (v > c.__pX1) c.__pX1 = v; });
  ext1(y0, y1, y2, v => { if (v < c.__pY0) c.__pY0 = v; if (v > c.__pY1) c.__pY1 = v; });
  c.__lx = x2; c.__ly = y2;
}
function cube(c, ax, ay, bx, by, x, y) {
  const M = c.__m, x0 = c.__lx, y0 = c.__ly;
  const x1 = mx(M, ax, ay), y1 = my(M, ax, ay), x2 = mx(M, bx, by), y2 = my(M, bx, by);
  const x3 = mx(M, x, y), y3 = my(M, x, y);
  ext2(x0, x1, x2, x3, v => { if (v < c.__pX0) c.__pX0 = v; if (v > c.__pX1) c.__pX1 = v; });
  ext2(y0, y1, y2, y3, v => { if (v < c.__pY0) c.__pY0 = v; if (v > c.__pY1) c.__pY1 = v; });
  c.__lx = x3; c.__ly = y3;
}
// The swept extent of an arc, exactly, without sampling it: the two endpoints plus whichever
// of the four cardinal angles the sweep actually crosses. Sampling would cost twelve sin/cos
// per arc on a sweep that draws millions of them.
const TAU = Math.PI * 2;
function arcBox(c, cx, cy, rx, ry, a0, a1, ccw) {
  if (a0 === undefined) { a0 = 0; a1 = TAU; }
  if (a1 === undefined) a1 = TAU;
  if (!Number.isFinite(a0) || !Number.isFinite(a1)) { dev(c, cx - rx, cy - ry); dev(c, cx + rx, cy + ry); return; }
  let raw = ccw ? a0 - a1 : a1 - a0, full = !(raw < TAU);
  let sweep = full ? TAU : ((raw % TAU) + TAU) % TAU;
  if (ccw) sweep = -sweep;
  if (full) {
    dev(c, cx - rx, cy - ry); dev(c, cx + rx, cy + ry); dev(c, cx - rx, cy + ry); dev(c, cx + rx, cy - ry);
  } else {
    const lo = Math.min(a0, a0 + sweep), hi = Math.max(a0, a0 + sweep);
    dev(c, cx + rx * Math.cos(lo), cy + ry * Math.sin(lo));
    dev(c, cx + rx * Math.cos(hi), cy + ry * Math.sin(hi));
    // and whichever of the four cardinal angles the sweep actually crosses -- the extremes of
    // an arc are its endpoints plus those, exactly, so this does not need sampling
    for (let k = Math.ceil(lo / (Math.PI / 2)); k * (Math.PI / 2) <= hi; k++) {
      const ang = k * (Math.PI / 2);
      dev(c, cx + rx * Math.cos(ang), cy + ry * Math.sin(ang));
    }
  }
  c.__lx = mx(c.__m, cx + rx * Math.cos(a1), cy + ry * Math.sin(a1));
  c.__ly = my(c.__m, cx + rx * Math.cos(a1), cy + ry * Math.sin(a1));
}
function rectDev(c, x, y, w, h) {
  const M = c.__m;
  const xs = [x, x + w], ys = [y, y + h];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const px of xs) for (const py of ys) {
    const dx = mx(M, px, py), dy = my(M, px, py);
    if (dx < x0) x0 = dx; if (dx > x1) x1 = dx; if (dy < y0) y0 = dy; if (dy > y1) y1 = dy;
  }
  return Number.isFinite(x0) && Number.isFinite(y1) ? [x0, y0, x1, y1] : null;
}

// ---------------------------------------------------------------- gradients
const isGrad = v => !!(v && v.__grad);
// A class, not an object literal with a closure on it: the sweep builds millions of these
// and a fresh addColorStop function per gradient is pure allocation.
class Grad {
  constructor(c, kind, co) {
    this.__grad = kind; this.co = co; this.stops = []; this.m = c.__m.slice();
    this.site = site(); this.threw = null; this.__sorted = true;
    MADE.add(this.site);
    for (const v of co) if (!Number.isFinite(v)) this.threw = 'non-finite coordinate ' + v;
    if (kind === 'radial' && (co[2] < 0 || co[5] < 0)) this.threw = 'negative radius';
  }
  addColorStop(o, col) {
    // A real browser THROWS IndexSizeError here rather than accepting it. This does not, so
    // that one such call cannot end the sweep and hide everything after it -- it is banked
    // and reported instead.
    if (!Number.isFinite(o) || o < 0 || o > 1) { this.threw = 'stop offset ' + o + ' outside 0..1'; return; }
    const a = alphaOf(col);
    if (a.bad) this.threw = 'colour string ' + JSON.stringify(String(col));
    const n = this.stops.length;
    if (n && o < this.stops[n - 1].o) this.__sorted = false;
    this.stops.push({ o, col, a: a.a });
  }
  // sorted once, when somebody asks, not on every stop added
  sorted() { if (!this.__sorted) { this.stops.sort((p, q) => p.o - q.o); this.__sorted = true; } return this.stops; }
}
function newGrad(c, kind, co) { return new Grad(c, kind, co); }
function alphaAt(g, t) {
  const s = g.sorted();
  if (!s.length) return 0;
  if (t <= s[0].o) return s[0].a;
  if (t >= s[s.length - 1].o) return s[s.length - 1].a;
  for (let i = 1; i < s.length; i++) {
    if (t <= s[i].o) {
      const span = s[i].o - s[i - 1].o;
      if (span <= 0) return s[i].a;
      const k = (t - s[i - 1].o) / span;
      return s[i - 1].a + (s[i].a - s[i - 1].a) * k;
    }
  }
  return s[s.length - 1].a;
}
const n2 = v => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(1));

// ---------------------------------------------------------------- the check
// The parameter range a region covers along a gradient's ramp. Points come in as the four
// corners of a device-space box, mapped back through the paint-time CTM into the space the
// gradient's own numbers are written in -- which is the space canvas resolves a gradient in.
function tRange(g, I, x0, y0, x1, y1) {
  const P = [];
  for (const px of [x0, x1]) for (const py of [y0, y1]) P.push(mx(I, px, py), my(I, px, py));
  let tmin = Infinity, tmax = -Infinity;
  if (g.__grad === 'linear') {
    const ax = g.co[0], ay = g.co[1], dx = g.co[2] - ax, dy = g.co[3] - ay;
    const L2 = dx * dx + dy * dy;
    for (let i = 0; i < 8; i += 2) {
      const t = ((P[i] - ax) * dx + (P[i + 1] - ay) * dy) / L2;
      if (t < tmin) tmin = t; if (t > tmax) tmax = t;
    }
  } else {
    const cx = g.co[0], cy = g.co[1], r0 = g.co[2], r1 = g.co[5];
    let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity, dmax = -Infinity;
    for (let i = 0; i < 8; i += 2) {
      const px = P[i], py = P[i + 1];
      if (px < ux0) ux0 = px; if (px > ux1) ux1 = px;
      if (py < uy0) uy0 = py; if (py > uy1) uy1 = py;
      const ddx = px - cx, ddy = py - cy, d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d > dmax) dmax = d;
    }
    // distance from the centre to that box: zero when the centre is inside it
    const qx = Math.min(Math.max(cx, ux0), ux1), qy = Math.min(Math.max(cy, uy0), uy1);
    const dmin = Math.sqrt((qx - cx) * (qx - cx) + (qy - cy) * (qy - cy));
    tmin = (dmin - r0) / (r1 - r0); tmax = (dmax - r0) / (r1 - r0);
    if (tmin > tmax) { const sw = tmin; tmin = tmax; tmax = sw; }
  }
  return [tmin, tmax];
}

// How much of the painted AREA falls outside the ramp, as a pair of fractions [before, past].
//
// Why an area and not a length. Along a linear ramp over a rectangle the two agree, and the
// length is enough. Around a RADIAL one they do not agree at all: the corners of any rect
// drawn around a circle are 1.41 times the radius away from its centre, and a tall window is
// worse, so an extent measured to the farthest corner says "60% of this fill is past the
// ramp" about a vignette whose corners are meant to be at full strength -- and a vignette is
// what a radial gradient over a rect USUALLY is. Sampled by area the same window comes out at
// a few per cent, which is the truth about it. Measured on the device-space region and mapped
// back one sample at a time, so a rotated transform does not turn the region into its own
// bounding box on the way.
// 21 x 21, not a handful: the fraction is a number a reader will judge severity on, and a
// 7-wide grid quantises it to 14% -- it reported 71% for a band that is exactly 65% of its
// fill. Only ever computed for a paint that has already passed the cheap gates.
const GRID = 21;
function frac(g, I, x0, y0, x1, y1) {
  let before = 0, past = 0, n = 0;
  const lin = g.__grad === 'linear';
  const ax = g.co[0], ay = g.co[1];
  const dx = lin ? g.co[2] - ax : 0, dy = lin ? g.co[3] - ay : 0;
  const L2 = dx * dx + dy * dy;
  const r0 = g.co[2], dr = lin ? 1 : (g.co[5] - g.co[2]);
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    const px = x0 + (x1 - x0) * (i + 0.5) / GRID, py = y0 + (y1 - y0) * (j + 0.5) / GRID;
    const ux = mx(I, px, py), uy = my(I, px, py);
    let t;
    if (lin) t = ((ux - ax) * dx + (uy - ay) * dy) / L2;
    else { const bx = ux - ax, by = uy - ay; t = (Math.sqrt(bx * bx + by * by) - r0) / dr; }
    n++;
    if (t < 0) before++; else if (t > 1) past++;
  }
  return [before / n, past / n];
}

// Exact, for a region that really is a disc: no sampling and no bounding box.
function tRangeDisc(g, cx0, cy0, rr) {
  if (g.__grad === 'linear') {
    const ax = g.co[0], ay = g.co[1], dx = g.co[2] - ax, dy = g.co[3] - ay;
    const L = Math.sqrt(dx * dx + dy * dy);
    const tc = ((cx0 - ax) * dx + (cy0 - ay) * dy) / (L * L), dt = rr / L;
    return [tc - dt, tc + dt];
  }
  const gx = g.co[0], gy = g.co[1], r0 = g.co[2], r1 = g.co[5];
  const dc = Math.sqrt((cx0 - gx) * (cx0 - gx) + (cy0 - gy) * (cy0 - gy));
  const a = (Math.max(0, dc - rr) - r0) / (r1 - r0), b = (dc + rr - r0) / (r1 - r0);
  return a <= b ? [a, b] : [b, a];
}
function fracDisc(g, cx0, cy0, rr) {
  let before = 0, past = 0, n = 0;
  const lin = g.__grad === 'linear';
  const ax = g.co[0], ay = g.co[1];
  const dx = lin ? g.co[2] - ax : 0, dy = lin ? g.co[3] - ay : 0, L2 = dx * dx + dy * dy;
  const r0 = g.co[2], dr = lin ? 1 : (g.co[5] - g.co[2]);
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    const ux = cx0 + rr * (2 * (i + 0.5) / GRID - 1), uy = cy0 + rr * (2 * (j + 0.5) / GRID - 1);
    const ex = ux - cx0, ey = uy - cy0;
    if (ex * ex + ey * ey > rr * rr) continue;          // the corners of the box are not in it
    let t;
    if (lin) t = ((ux - ax) * dx + (uy - ay) * dy) / L2;
    else { const bx = ux - ax, by = uy - ay; t = (Math.sqrt(bx * bx + by * by) - r0) / dr; }
    n++;
    if (t < 0) before++; else if (t > 1) past++;
  }
  return n ? [before / n, past / n] : [0, 0];
}

function paint(c, which, how, devBox) {
  const style = which === 'fill' ? c.fillStyle : c.strokeStyle;
  if (!isGrad(style)) return;
  const g = style;
  // Coverage is banked HERE and not at the constructor, before any of the bails below: what
  // this tool can be believed about is the set of gradients it saw PAINTED.
  SITES.add(g.site);

  // a gradient a real browser would have refused to build, or refused a stop on
  if (g.threw) { report('THROWS', 'THROWS | ' + g.site, { rank: 1, why: g.threw, how }); return; }
  if (!g.stops.length) {
    report('DEAD', 'DEAD | ' + g.site, { rank: 1, why: 'no colour stops: the fill paints nothing', how }); return;
  }
  if (g.__grad === 'linear' && g.co[0] === g.co[2] && g.co[1] === g.co[3]) {
    report('DEAD', 'DEAD | ' + g.site, { rank: 1, why: 'both endpoints are the same point: canvas paints nothing', how }); return;
  }
  if (g.__grad === 'conic') { SKIP.eccentric++; return; }
  if (g.__grad === 'radial') {
    if (Math.abs(g.co[3] - g.co[0]) > 1e-9 || Math.abs(g.co[4] - g.co[1]) > 1e-9) { SKIP.eccentric++; return; }
    if (g.co[5] === g.co[2]) { report('DEAD', 'DEAD | ' + g.site, { rank: 1, why: 'both radii are ' + g.co[2] + ': canvas paints nothing', how }); return; }
  }

  // Canvas resolves a gradient's coordinates in the user space in force when it is PAINTED,
  // never in the one it was created in -- measured, not assumed; the experiment is in the
  // header. So the gradient's raw numbers and the fill's raw numbers are ALREADY in one
  // space, and comparing them is exactly what canvas does. A create/paint transform mismatch
  // is therefore not a geometry error and is not a finding; it is banked as a note, because
  // it does mean the numbers on the page do not read as the place they land.
  if (!sameM(g.m, c.__m)) { SPACES.set(g.site, (SPACES.get(g.site) || 0) + 1); }

  // ---- the fill's OWN extent, in device space. Not clipped to the canvas: the screen edge
  // is where the view stops, not where the paint stops, and an earlier version of this tool
  // clipped first and then accused twelve functions of a hard edge that was the edge of the
  // window. A live clip IS counted, because a clip is a boundary the artist drew -- a lantern
  // glow clipped to a rect smaller than its own radius really is flattened in every frame.
  let b = devBox;
  if (!b) {
    if (!Number.isFinite(c.__pX0)) return;
    b = [c.__pX0, c.__pY0, c.__pX1, c.__pY1];
    if (which === 'stroke') { const gw = c.lineWidth * scaleOf(c.__m) / 2; b = [b[0] - gw, b[1] - gw, b[2] + gw, b[3] + gw]; }
  }
  const approx = !devBox && c.__pApprox;
  let fx0 = b[0], fy0 = b[1], fx1 = b[2], fy1 = b[3];
  if (c.__clip) {
    fx0 = Math.max(fx0, c.__clip[0]); fy0 = Math.max(fy0, c.__clip[1]);
    fx1 = Math.min(fx1, c.__clip[2]); fy1 = Math.min(fy1, c.__clip[3]);
  }
  if (!(fx1 > fx0) || !(fy1 > fy0)) { SKIP.offCanvas++; return; }

  // ... and the part of it the player can actually see. This is used ONLY to decide whether a
  // finding is visible -- never to measure the ramp against.
  const vx0 = Math.max(fx0, 0), vy0 = Math.max(fy0, 0);
  const vx1 = Math.min(fx1, c.canvas.width), vy1 = Math.min(fy1, c.canvas.height);
  if (!(vx1 > vx0) || !(vy1 > vy0)) { SKIP.offCanvas++; return; }

  const I = inv(c.__m);
  if (!I) return;
  // The disc case, where the region is exactly one filled circle and nothing is cutting it.
  // Containment is tested on the circle's device bounding box, which over-states the circle,
  // so a box that passes means the circle certainly does.
  let disc = null;
  if (!devBox && which === 'fill' && c.__circle) {
    const k = c.__circle, M = c.__m;
    // The image of a circle under an affine map is an ellipse, and its device half-extents
    // are r*hypot(a,c) and r*hypot(b,d) about the mapped centre -- exactly. Taking two
    // opposite corners of the circle's own square instead reads r*|cos-sin| under a rotation,
    // which is ZERO at 45 degrees: it would report a disc as fitting inside a clip that
    // actually cuts it, and then measure the ramp against the whole disc.
    const ccx = mx(M, k.x, k.y), ccy = my(M, k.x, k.y);
    const hx = k.r * Math.sqrt(M[0] * M[0] + M[2] * M[2]);
    const hy = k.r * Math.sqrt(M[1] * M[1] + M[3] * M[3]);
    const bx0 = ccx - hx, bx1 = ccx + hx, by0 = ccy - hy, by1 = ccy + hy;
    const insideClip = !c.__clip || (bx0 >= c.__clip[0] && by0 >= c.__clip[1] && bx1 <= c.__clip[2] && by1 <= c.__clip[3]);
    if (insideClip) disc = { k, seen: bx0 >= 0 && by0 >= 0 && bx1 <= c.canvas.width && by1 <= c.canvas.height };
  }
  const F = disc ? tRangeDisc(g, disc.k.x, disc.k.y, disc.k.r) : tRange(g, I, fx0, fy0, fx1, fy1);
  const V = (disc && disc.seen) ? F : tRange(g, I, vx0, vy0, vx1, vy1);
  const tmin = F[0], tmax = F[1];
  if (!Number.isFinite(tmin) || !Number.isFinite(tmax)) return;
  const span = tmax - tmin;
  if (!(span > 1e-9)) return;
  const edge = span * 0.01;              // how close a visible edge must be to the fill's own

  const ga = c.globalAlpha === undefined ? 1 : c.globalAlpha;
  const ss = g.sorted(), first = ss[0], last = ss[ss.length - 1];
  const unit = g.__grad === 'linear' ? Math.hypot(g.co[2] - g.co[0], g.co[3] - g.co[1]) : Math.abs(g.co[5] - g.co[2]);
  const axis = g.__grad === 'linear'
    ? `${n2(g.co[0])},${n2(g.co[1])} -> ${n2(g.co[2])},${n2(g.co[3])}  (ramp ${n2(unit)} units)`
    : `centre ${n2(g.co[0])},${n2(g.co[1])}  r ${n2(g.co[2])} -> ${n2(g.co[5])}  (ramp ${n2(unit)} units)`;
  const tail = (approx ? '  [curved path: the extent is an upper bound]' : '');
  let atCache = null;
  const at = () => (atCache || (atCache = site()));

  // ---- FLAT: the ramp is entirely outside the fill. Every pixel painted gets one held
  // colour, so the gradient is an expensive way of writing a constant -- and, far more often,
  // it means the two sets of numbers are in different units or off by an origin.
  if (tmax <= T_EPS && first.a * ga >= A_VISIBLE) {
    report('FLAT', 'FLAT-before | ' + g.site + ' | ' + how + ' in ' + at(), { rank: -tmax, how, axis,
      why: `the whole fill lies BEFORE the ramp (t ${tmin.toFixed(2)}..${tmax.toFixed(2)}), so every pixel of it is ` +
           `the first stop ${JSON.stringify(first.col)} held flat (alpha ${(first.a * ga).toFixed(3)}): the ramp never runs` + tail });
    return;
  }
  if (tmin >= 1 - T_EPS && last.a * ga >= A_VISIBLE) {
    report('FLAT', 'FLAT-after | ' + g.site + ' | ' + how + ' in ' + at(), { rank: tmin, how, axis,
      why: `the whole fill lies AFTER the ramp (t ${tmin.toFixed(2)}..${tmax.toFixed(2)}), so every pixel of it is ` +
           `the last stop ${JSON.stringify(last.col)} held flat (alpha ${(last.a * ga).toFixed(3)}): the ramp never runs` + tail });
    return;
  }

  // ---- SMEAR: painted past the end of the ramp, holding a colour you can see. The held band
  // must also reach the screen, or nobody is looking at it.
  let area = null;
  const over = tmax - 1, under = -tmin;
  if ((over > T_EPS && last.a * ga >= A_VISIBLE && V[1] > 1 + T_EPS) ||
      (under > T_EPS && first.a * ga >= A_VISIBLE && V[0] < -T_EPS))
    area = disc ? fracDisc(g, disc.k.x, disc.k.y, disc.k.r) : frac(g, I, fx0, fy0, fx1, fy1);

  if (area && over > T_EPS && area[1] >= OVERRUN_FR && last.a * ga >= A_VISIBLE && V[1] > 1 + T_EPS) {
    report('SMEAR', 'SMEAR-end | ' + g.site + ' | ' + how + ' in ' + at(), { rank: area[1], how, axis,
      why: `the fill reaches t=${tmax.toFixed(2)}, ${n2(over * unit)} units past the end of the ramp. ` +
           `${(100 * area[1]).toFixed(0)}% of what it paints is out there, held flat at the last stop ` +
           `${JSON.stringify(last.col)} (alpha ${(last.a * ga).toFixed(3)})` + tail });
  }
  // ... but NOT the held core of a radial gradient. r0 > 0 means the disc inside r0 is a flat
  // colour by construction, and there is no way to paint the annulus alone without building a
  // second path with a hole in it. Every radial in this file with an inner radius would be
  // reported, and every one of them would be the author's intention.
  if (area && g.__grad === 'linear' && under > T_EPS && area[0] >= OVERRUN_FR && first.a * ga >= A_VISIBLE && V[0] < -T_EPS) {
    report('SMEAR', 'SMEAR-start | ' + g.site + ' | ' + how + ' in ' + at(), { rank: area[0], how, axis,
      why: `the fill starts at t=${tmin.toFixed(2)}, ${n2(under * unit)} units before the ramp begins. ` +
           `${(100 * area[0]).toFixed(0)}% of what it paints is back there, held flat at the first stop ` +
           `${JSON.stringify(first.col)} (alpha ${(first.a * ga).toFixed(3)})` + tail });
  }

  // ---- HARD EDGE: the ramp was built to fade out and the fill stops before it has. Only when
  // the fill's own edge is on screen -- if the fill runs off the side of the canvas, the cut
  // the player sees is the window, not the paint.
  if (last.a <= A_FADED && tmax > T_EPS && tmax < CUT_AT && V[1] >= tmax - edge) {
    const aCut = alphaAt(g, tmax) * ga;
    if (aCut >= A_VISIBLE) {
      report('HARDEDGE', 'HARDEDGE-end | ' + g.site + ' | ' + how + ' in ' + at(), { rank: aCut, how, axis,
        why: `the ramp fades out to ${JSON.stringify(last.col)}, but the fill stops at t=${tmax.toFixed(2)} ` +
             `-- ${n2(tmax * unit)} of ${n2(unit)} units -- while the ramp is still at alpha ${aCut.toFixed(3)}. ` +
             `The edge in the frame is the fill's boundary, not the end of the fade` + tail });
    }
  }
  if (first.a <= A_FADED && tmin < 1 - T_EPS && tmin > 1 - CUT_AT && V[0] <= tmin + edge) {
    const aCut = alphaAt(g, tmin) * ga;
    if (aCut >= A_VISIBLE) {
      report('HARDEDGE', 'HARDEDGE-start | ' + g.site + ' | ' + how + ' in ' + at(), { rank: aCut, how, axis,
        why: `the ramp fades in from ${JSON.stringify(first.col)}, but the fill only starts at t=${tmin.toFixed(2)} ` +
             `-- ${n2((1 - tmin) * unit)} of ${n2(unit)} units used -- where the ramp is already at alpha ${aCut.toFixed(3)}. ` +
             `The edge in the frame is the fill's boundary, not the start of the fade` + tail });
    }
  }
}

// ---------------------------------------------------------------- stubs
const canvases = [];
function mkCanvas(w, h) {
  const cv = { width: w, height: h };
  cv.getContext = () => (cv.__ctx || (cv.__ctx = makeCtx(cv)));
  canvases.push(cv);
  return cv;
}
let mainCv = null;
global.document = { getElementById: () => (mainCv || (mainCv = mkCanvas(960, 540))), createElement: () => mkCanvas(8, 8) };
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

// ---------------------------------------------------------------- the sweep
// rect-check's, wholesale. See the header for why the by-hand panel pass is not optional.
const OUT = eval(src + `
;(function(){
  const seen = { frames: 0, acts: [] };

  S.mode = 'intro'; S.introT = 0;
  for (let i = 0; i < 60 * 30; i++) { update(1/60); draw(); seen.frames++; }

  startRun();
  for (let x = 0; x <= S.camMax + 200; x += 140) {
    S.cam = Math.min(x, S.camMax); updateView(1);
    for (const lane of [0, 1, 2, 3, 4, 5]) {
      S.runners.forEach((r, i) => { if (i % 6 === lane) r.lane = lane; });
    }
    draw(); seen.frames++;
  }
  seen.acts.push('course to ' + Math.round(S.camMax));

  reset(); startRun();
  const playBudget = Math.round(60 * (S.camMax / CFG.scroll + 90));
  let ranOut = true;
  for (let i = 0; i < playBudget && S.mode === 'play'; i++) { update(1/60); devSolve(); if (i % 3 === 0) { draw(); seen.frames++; } }
  if (S.mode !== 'play') ranOut = false;
  seen.truncated = ranOut;
  for (let i = 0; i < 60 * 200 && S.mode === 'finale'; i++) { update(1/60); if (i % 3 === 0) { draw(); seen.frames++; } }
  seen.acts.push('a solved run, ending in ' + S.mode);

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
        try { const k = v.solveKey ? v.solveKey(room.mg) : null; if (k) v.key(room.mg, k); } catch (e) {}
        try { v.update(room.mg, 1 / 30); } catch (e) {}
      }
      room.mg = v.start(d); room.mg.failed = true; draw(); seen.frames++;
    }
    S.active = null;
  }
  seen.acts.push('every panel: ' + verbsSeen.size + ' verbs, five difficulties, stepped');

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
  S.mode = 'win'; S.finale = { attempts: 40, len: 6, seq: [], idx: 0, timer: 1, line: [], leaving: [] };
  S.endRoll.out = pool.slice(0, 8);
  S.endRoll.out.forEach(function(r){ r.state = 'arrived'; });
  for (let i = 0; i < 60 * 6; i++) { S.endT = roll.end + i / 60; S.t += 1/60; draw(); seen.frames++; }
  seen.acts.push('all ' + kinds.length + ' reel vignettes, plus both podiums');

  return seen;
})()
`);

// ---------------------------------------------------------------- the report
// How many of the gradients WRITTEN in the file the sweep actually painted. A tool that does
// not say this looks like a pass when it is a silence: path-check came back ALL CLEAR on a
// deliberately broken copy because its sweep never reached the line that was broken.
const declared = [];
{
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/create(Linear|Radial|Conic)Gradient\s*\(/g);
    if (m) for (let k = 0; k < m.length; k++) declared.push(i + 1);
  }
}
const lineSet = set => { const o = new Set(); for (const s of set) { const m = /index\.html:(\d+)/.exec(s); if (m) o.add(+m[1]); } return o; };
const madeLines = lineSet(MADE), reachedLines = lineSet(SITES);
const missed = declared.filter(l => !reachedLines.has(l));
const builtNotPainted = declared.filter(l => madeLines.has(l) && !reachedLines.has(l));

if (OUT.truncated) {
  console.log('NOTE: the solved run hit its frame budget without finishing. The sweep below');
  console.log('covers only the part of the course it reached -- fix that before believing it.\n');
}
console.log(`swept ${OUT.frames} frames: 30s of the opening, ${OUT.acts.join(', ')}`);
console.log(`gradient call sites: ${declared.length} written in the file, ${madeLines.size} built by the sweep, ${reachedLines.size} PAINTED by it`);
if (missed.length) console.log(`  ${missed.length} never painted, so this run says nothing about them: index.html lines ${missed.join(', ')}` +
                               (builtNotPainted.length ? `  (of those, ${builtNotPainted.join(', ')} were built but never used as a style)` : ''));
console.log('');

const ORDER = { THROWS: 0, DEAD: 1, FLAT: 2, SMEAR: 3, HARDEDGE: 4 };
const rows = [...BAD.values()].sort((a, b) => (ORDER[a.kind] - ORDER[b.kind]) || (b.n - a.n));
if (rows.length) {
  console.log('findings, by call site:\n');
  for (const r of rows) {
    console.log(`  ${r.kind}  ${String(r.n).padStart(7)}x  ${r.key.split(' | ').slice(1).join('  <- ')}`);
    if (r.detail.axis) console.log(`      gradient  ${r.detail.axis}`);
    console.log(`      ${r.detail.why}`);
    console.log('');
  }
}

if (SPACES.size) {
  console.log('');
  console.log('NOT A FINDING, but worth knowing: these gradients are built under one transform and');
  console.log('painted under another. Canvas resolves a gradient in the PAINT space, so the numbers');
  console.log('written at the call site are not the place the ramp lands. Checked normally above.');
  for (const [k, n] of [...SPACES].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(7)}x  ${k}`);
  console.log('');
}
console.log('WHAT THIS RUN DID NOT JUDGE:');
console.log(`  ${SKIP.text} gradient-painted fillText/strokeText calls  (a glyph run has no extent this can measure)`);
console.log(`  ${SKIP.eccentric} eccentric or conic gradients  (their parameter is not a function of distance from a centre)`);
console.log(`  ${SKIP.offCanvas} paints falling wholly outside the canvas or the live clip  (the player cannot see them)`);
console.log('  a fill running off the side of the canvas is not called a HARD EDGE: the cut the player');
console.log('  sees there is the window, not the paint. A SMEAR is only reported when the held band');
console.log('  itself reaches the screen.');
console.log('  what is painted OVER a fill afterwards: a held band under the waterline or behind a');
console.log('  building is reported here exactly like one in open view, because nothing in a recording');
console.log('  context knows the draw order of the things that come next.');
console.log('  colour, composition and whether the ramp is the RIGHT ramp: that is the art pass, not this.');
console.log('  the flat core inside a radial gradient\'s inner radius: that is how an inner radius');
console.log('  works, so a radial whose r0 is simply too big is a reading this tool will not make.');
console.log('  whether a disagreement is a MISTAKE. A shadow deliberately held at full dark under the');
console.log('  object that casts it reads here exactly like a ramp that has slipped. This tool names');
console.log('  the two numbers and what they do to the pixels; which of them is wrong is a reading.');
console.log('  a clip is taken as the bounding box of its path, so a fill inside a round clip is');
console.log('  judged on the square around it -- which can only make this tool quieter, never louder,');
console.log('  about a HARD EDGE, and louder, never quieter, about a SMEAR.');

if (!rows.length) { console.log('\nall clear'); process.exit(0); }
console.log(`\n${rows.length} FAILED`);
process.exit(1);
