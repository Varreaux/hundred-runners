// The closing reel, checked as arithmetic rather than by looking at it.
//
//   node tools/reel-check.js
//
// Three things it answers that a screenshot cannot:
//
//  1. Does every trap draw, over its whole 0..1 and for both wet and dry, without throwing?
//     A card is drawn from draw(), so an exception in one of them freezes the game on the
//     end screen -- and there are fifteen of them, only a handful of which any one run
//     reaches. The freeze harness barely helps here: it plays to an ending and sits on it,
//     so it only ever draws whichever cards THAT run happened to produce.
//
//  2. Is the body actually on the card, and actually big? Morgan asked for the character
//     big. That is a number -- the drawn height of the figure in canvas pixels -- and it is
//     checkable, unlike "looks big". It also catches the opposite fault: a body that falls
//     off the bottom of its own card, which in a still reads exactly like a body that is
//     merely low.
//
//  3. Does the apparatus stay out of the name, and does the art reach both edges? A trap
//     whose floor stops short leaves a hole at the edge of its own frame, and a gantry drawn
//     up into the top scrim puts ironwork through a 50px name. Neither is visible in the
//     source unless you compare two numbers in different functions.
//
// It measures through a recording context that HONOURS THE TRANSFORM STACK. A vignette is
// drawn under translate(W/2, gy) then scale(3.6), so a tool that ignored the stack would not
// merely under-report -- it would invent a number, read a 153px body as a 43px one, and then
// accuse the card of being too small.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');

// ---------------------------------------------------------------- the recording context
function makeRec() {
  const grad = { addColorStop() {} };
  let m = [1, 0, 0, 1, 0, 0];                  // a b c d e f, as canvas orders them
  const stack = [];
  let box = null, font = 16, align = 'left';
  let fbox = null;
  const EMPTYBOX = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n: 0 });
  const reset = () => { box = EMPTYBOX(); };
  const resetAll = () => { box = EMPTYBOX(); fbox = EMPTYBOX(); };
  resetAll();
  const add = (x, y) => {
    const px = m[0] * x + m[2] * y + m[4], py = m[1] * x + m[3] * y + m[5];
    if (!isFinite(px) || !isFinite(py)) throw new Error('non-finite point ' + px + ',' + py);
    if (px < box.x0) box.x0 = px;
    if (py < box.y0) box.y0 = py;
    if (px > box.x1) box.x1 = px;
    if (py > box.y1) box.y1 = py;
    box.n++;
  };
  const quad = (x0, y0, x1, y1) => { add(x0, y0); add(x1, y0); add(x0, y1); add(x1, y1); };
  // Filled RECTANGLES only, and unrotated ones at that -- every floor, deck, slab and bank
  // in the reel is one, and nothing that merely decorates a floor is.
  const filled = (x, y, w, h) => {
    if (m[1] || m[2]) return;
    const a = m[0] * x + m[4], b = m[0] * (x + w) + m[4];
    const c0 = m[3] * y + m[5], c1 = m[3] * (y + h) + m[5];
    fbox.x0 = Math.min(fbox.x0, a, b); fbox.x1 = Math.max(fbox.x1, a, b);
    fbox.y0 = Math.min(fbox.y0, c0, c1); fbox.y1 = Math.max(fbox.y1, c0, c1);
    fbox.n++;
  };
  const mul = a => {
    m = [m[0] * a[0] + m[2] * a[1], m[1] * a[0] + m[3] * a[1],
         m[0] * a[2] + m[2] * a[3], m[1] * a[2] + m[3] * a[3],
         m[0] * a[4] + m[2] * a[5] + m[4], m[1] * a[4] + m[3] * a[5] + m[5]];
  };
  const c = {
    canvas: { width: 960, height: 540 },
    save() { stack.push(m.slice()); }, restore() { if (stack.length) m = stack.pop(); },
    translate(x, y) { mul([1, 0, 0, 1, x, y]); },
    scale(x, y) { mul([x, 0, 0, y, 0, 0]); },
    rotate(a) { const s = Math.sin(a), k = Math.cos(a); mul([k, s, -s, k, 0, 0]); },
    setTransform(a, b, cc, d, e, f) { m = [a, b, cc, d, e, f]; },
    clip() {}, beginPath() {}, closePath() {},
    moveTo(x, y) { add(x, y); }, lineTo(x, y) { add(x, y); },
    // A control point is not ON the curve, so counting it over-reports; but a quadratic
    // never leaves the hull of its three points, so counting it cannot UNDER-report, and
    // under-reporting is the direction that would let a fault through.
    quadraticCurveTo(cx, cy, x, y) { add(cx, cy); add(x, y); },
    bezierCurveTo(a, b2, cx, cy, x, y) { add(a, b2); add(cx, cy); add(x, y); },
    fill() {}, stroke() {},
    fillRect(x, y, w, h) { quad(x, y, x + w, y + h); filled(x, y, w, h); },
    strokeRect(x, y, w, h) { quad(x, y, x + w, y + h); },
    rect(x, y, w, h) { quad(x, y, x + w, y + h); },
    clearRect() {},
    arc(x, y, r) {
      if (!isFinite(r) || r < 0) throw new Error('IndexSizeError: bad radius ' + r);
      quad(x - r, y - r, x + r, y + r);
    },
    arcTo() {},
    ellipse(x, y, rx, ry) {
      if (!isFinite(rx) || rx < 0 || !isFinite(ry) || ry < 0) throw new Error('bad radii ' + rx + ',' + ry);
      quad(x - rx, y - ry, x + rx, y + ry);
    },
    setLineDash() {}, drawImage() {},
    fillText(t, x, y) {
      const w = String(t).length * font * 0.6;
      const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      quad(x0, y - font * 0.78, x0 + w, y + font * 0.24);
    },
    strokeText(t, x, y) { c.fillText(t, x, y); },
    measureText(t) { return { width: String(t).length * font * 0.6 }; },
    createLinearGradient() { return grad; }, createRadialGradient() { return grad; },
    createPattern() { return grad; },
    getImageData() { return { data: new Uint8ClampedArray(4 * 8 * 8) }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(4 * (w || 8) * (h || 8)), width: w || 8, height: h || 8 }; },
    putImageData() {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    globalAlpha: 1, globalCompositeOperation: '', shadowBlur: 0, shadowColor: '', filter: '',
  };
  Object.defineProperty(c, 'font', {
    get() { return font + 'px monospace'; },
    set(v) { const n = /(\d+(?:\.\d+)?)px/.exec(String(v)); font = n ? +n[1] : 16; },
  });
  Object.defineProperty(c, 'textAlign', { get() { return align; }, set(v) { align = v; } });
  c.__box = () => box;
  c.__fill = () => fbox;
  c.__resetAll = resetAll;
  c.__reset = reset;
  return c;
}
const REC = makeRec();
global.document = { getElementById: () => ({ getContext: () => REC, width: 960, height: 540 }),
                    createElement: () => ({ getContext: () => makeRec(), width: 8, height: 8 }) };
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

// The checks run INSIDE the eval, appended to the game's own source, because that is the
// only scope that can see TRAPS, REEL, drawFigure and S -- and the only one that can stand
// in front of drawFigure to tell a body's ink apart from the apparatus around it.
const OUT = eval(src + `
;(function(){
  const out = { errs: [], traps: [] };
  const err = (where, e) => out.errs.push(where + ': ' + (e && e.message || e));
  const box = () => ctx.__box();
  const snap = () => ({ x0: box().x0, y0: box().y0, x1: box().x1, y1: box().y1 });
  const fsnap = () => ({ x0: ctx.__fill().x0, y0: ctx.__fill().y0, x1: ctx.__fill().x1, y1: ctx.__fill().y1 });
  const grow = (a, b) => { a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1); };
  const EMPTY = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const realFig = drawFigure, realDancer = drawDancer;

  // A real run, so the dooms and distances are the game's own rather than invented. No
  // input, which is the case with the most cards in it: everybody dies.
  startRun();
  for (let i = 0; i < 60 * 400 && S.mode === 'play'; i++) update(1/60);
  for (let i = 0; i < 60 * 400 && S.mode === 'finale'; i++) update(1/60);
  out.mode = S.mode;
  const subject = S.runners.find(r => r.name === 'Morgan') || S.runners.find(r => r.name);
  const shortest = S.runners.filter(r => r.name).sort((a,b) => (a.height||1) - (b.height||1))[0];

  // ---- 1. every trap, both wet and dry, across its whole clock, with the body's ink
  //         fenced off from the apparatus so each can be judged against its own rule
  for (const kind of Object.keys(TRAPS)) {
    const trap = TRAPS[kind];
    for (const wet of [true, false]) {
      const who = wet ? subject : shortest;
      const card = { r: who, wet: wet, kind: kind };
      const fig = EMPTY(), all = EMPTY(), ground = EMPTY();
      let apTop = Infinity, tall = 0, threw = null;
      // S.t IS SWEPT, not left wherever the run before happened to stop. Several vignettes
      // carry rotating parts -- the gears' wheels, the sweeper's drum, the press flywheel --
      // whose bounding box changes with their phase, so a single sample measures whichever
      // rotation the previous test happened to leave behind. That made this check flap: the
      // gears passed at 155 and failed at 114 on builds whose reel code was byte-identical,
      // because a change elsewhere altered how many frames ran before it. A verdict that
      // depends on what ran before it is not a verdict.
      for (let s = 0; s <= 24 && !threw; s++) {
        const t = s / 24;
        S.t = 3.1 + s * 0.37;
        const seen = [];
        drawFigure = function(r2, x, y, ph, sc, al) {
          const held = snap();
          ctx.__reset();
          realFig(r2, x, y, ph, sc, al);
          seen.push(snap());
          const b = box(); b.x0 = held.x0; b.y0 = held.y0; b.x1 = held.x1; b.y1 = held.y1;
        };
        try {
          ctx.__resetAll();
          ctx.save();
          ctx.translate(480, trap.gy); ctx.scale(REEL.fig, REEL.fig);
          trap.draw(who, t, card);
          ctx.restore();
        } catch (e) { threw = t.toFixed(2) + ' ' + (e && e.message || e); }
        drawFigure = realFig;
        if (threw) break;
        const ap = snap();
        if (isFinite(ap.y0)) { apTop = Math.min(apTop, ap.y0); grow(all, ap); }
        const fb = fsnap(); if (isFinite(fb.x0)) grow(ground, fb);
        for (const f of seen) {
          grow(fig, f); grow(all, f);
          if (t < 0.12) tall = Math.max(tall, f.y1 - f.y0);
        }
      }
      out.traps.push({ kind: kind, wet: wet, threw: threw, fig: fig, all: all, ground: ground, apTop: apTop, tall: tall });
    }
  }

  // ---- 2. the whole screen, frame by frame, from the headline to the end of the podium
  S.endT = 0; S.endRoll = null;
  try {
    const roll = buildRoll();
    out.realCards = roll.n; out.step = roll.step; out.end = roll.end;
    S.endRoll = roll;
    for (let i = 0; i < Math.ceil((roll.end + 4) * 60); i++) {
      S.endT = i / 60; S.t += 1/60;
      ctx.__reset(); drawEnd();
    }
  } catch (e) { err('drawEnd timeline', e); }

  // ---- 3. and again with a roll forced to hold EVERY kind, because one run does not
  try {
    const kinds = Object.keys(TRAPS), pool = S.runners.filter(r => r.name);
    const forced = buildRoll();
    forced.cards = kinds.map(function(k, i) {
      const r = pool[i % pool.length];
      return { r: r, at: (i + 1) / (kinds.length + 1) * CFG.finale.x, doom: doomOf(r), kind: k, wet: i % 2 === 0 };
    });
    forced.n = forced.cards.length;
    forced.end = REEL.at + forced.n * forced.step;
    S.endRoll = forced; S.endT = 0;
    for (let i = 0; i < Math.ceil((forced.end + 4) * 60); i++) {
      S.endT = i / 60; S.t += 1/60;
      ctx.__reset(); drawEnd();
    }
    out.forcedCards = forced.n;
  } catch (e) { err('forced-kind timeline', e); }

  // ---- 3b. SPACE actually skips, and R actually restarts. Claimed in a footer the player
  //      reads, so worth more than a comment: the skip is a wind of one clock and it is easy
  //      to leave it winding to the wrong place.
  try {
    S.endT = 0; S.endRoll = null; S.mode = 'lose';
    const roll = buildRoll(); S.endRoll = roll; S.endT = REEL.at + 0.4;
    keyHandler({ key: ' ', repeat: false, preventDefault(){} });
    out.skipTo = S.endT; out.skipWant = roll.end;
    // and a second press must not wind it past the end
    keyHandler({ key: ' ', repeat: false, preventDefault(){} });
    out.skipTwice = S.endT;
    S.endT = roll.end + 3;
    keyHandler({ key: 'R', repeat: false, preventDefault(){} });
    out.afterR = { mode: S.mode, roll: S.endRoll, endT: S.endT };
  } catch (e) { err('skip and restart', e); }

  // ---- 4. the podium, measured: three bodies, none off the card and none under its title
  try {
    S.endRoll = buildRoll();
    const bodies = [], names = [];
    drawFigure = function(r2, x, y, ph, sc, al) { const h = snap(); ctx.__reset(); realFig(r2, x, y, ph, sc, al); bodies.push(snap()); const b = box(); b.x0=h.x0; b.y0=h.y0; b.x1=h.x1; b.y1=h.y1; };
    drawDancer = function(r2, x, y, t2, sc, al) { const h = snap(); ctx.__reset(); realDancer(r2, x, y, t2, sc, al); bodies.push(snap()); const b = box(); b.x0=h.x0; b.y0=h.y0; b.x1=h.x1; b.y1=h.y1; };
    ctx.__reset();
    drawPodiumCard(0, 3.0);
    drawFigure = realFig; drawDancer = realDancer;
    out.podium = bodies;
    // the name is drawn from the same scale expression as the body, so it should sit just
    // above every head regardless of how short that runner is
    const PH = [104, 74, 54], BASE = 458;
    out.podiumNames = S.endRoll.podium.map(function(r, k) {
      const sc = 3.0 * 1.1 * (r.height || 1), bh = 36.5 * sc;   // mirrors drawPodiumCard.
      // If the two drift apart the name/head assertions below fail rather than lying,
      // which is the point: this expression is not allowed to be quietly wrong.
      return { name: r.name, h: r.height, bh: bh, top: BASE - PH[k], nameY: BASE - PH[k] - bh - 14 };
    });
  } catch (e) { drawFigure = realFig; drawDancer = realDancer; err('podium', e); }

  return out;
})()
`);

// ---------------------------------------------------------------- the verdict
const problems = [];
const ordinalOf = k => ['1st','2nd','3rd'][k] || (k+1)+'th';
const verdict = (ok, msg) => { if (!ok) { console.log('  FAIL ' + msg); problems.push(msg); } };
console.log(`run ended in mode ${OUT.mode}; the real roll had ${OUT.realCards} cards at ${OUT.step.toFixed(2)}s each, ${OUT.end.toFixed(1)}s of reel`);
console.log(`forced roll drew all ${OUT.forcedCards} kinds\n`);
for (const e of OUT.errs) { console.log('  FAIL ' + e); problems.push(e); }

console.log('trap                 arrival  body box                      apparatus  filled ground');
for (const t of OUT.traps) {
  const f = t.fig, tag = (t.kind + (t.wet ? ' wet' : ' dry')).padEnd(20);
  if (t.threw) { verdict(false, `${tag} threw at t=${t.threw}`); continue; }
  console.log(`  ${tag} ${String(Math.round(t.tall)).padStart(4)}px  ` +
    `x ${Math.round(f.x0)}..${Math.round(f.x1)} y ${Math.round(f.y0)}..${Math.round(f.y1)}`.padEnd(30) +
    `  top ${String(Math.round(t.apTop)).padStart(4)}  ${Math.round(t.ground.x0)}..${Math.round(t.ground.x1)}`);
  verdict(f.x0 > -8 && f.x1 < 968, `${tag} body leaves the card sideways (x ${Math.round(f.x0)}..${Math.round(f.x1)})`);
  verdict(f.y1 < 536, `${tag} body falls off the bottom of the card (y1 ${Math.round(f.y1)})`);
  verdict(f.y0 > 116, `${tag} body reaches into the name block (y0 ${Math.round(f.y0)})`);
  // Morgan asked for the character big, which is a number and not an opinion
  verdict(t.tall >= 118, `${tag} body is only ${Math.round(t.tall)}px tall on arrival, floor is 118`);
  verdict(t.apTop > 116, `${tag} apparatus reaches into the name block (top ${Math.round(t.apTop)})`);
  verdict(t.ground.x0 <= 2 && t.ground.x1 >= 958, `${tag} filled ground does not span the card (x ${Math.round(t.ground.x0)}..${Math.round(t.ground.x1)})`);
}

console.log('');
verdict(OUT.skipTo === OUT.skipWant, `SPACE mid-reel should wind the clock to ${OUT.skipWant}, got ${OUT.skipTo}`);
verdict(OUT.skipTwice === OUT.skipWant, `a second SPACE moved the clock again, to ${OUT.skipTwice}`);
verdict(OUT.afterR && OUT.afterR.mode === 'intro' && OUT.afterR.roll === null && OUT.afterR.endT === 0,
  `R on the end screen should reset to intro with a cleared roll, got ${JSON.stringify(OUT.afterR && { mode: OUT.afterR.mode, roll: OUT.afterR.roll, endT: OUT.afterR.endT })}`);
if (!problems.length) console.log('  SPACE skips to the podium, a second press holds, R resets to the opening');

if (OUT.podium) {
  console.log('\npodium');
  // bodies come back in DRAW order, which runs 3rd, 2nd, 1st so the tallest block is in
  // front; podium[] is 1st, 2nd, 3rd. Pairing them by index reads every name against the
  // wrong body, which is exactly the class of fault this tool is for.
  OUT.podiumNames.forEach((nm, k) => {
    const b = OUT.podium[2 - k];
    if (!b) { problems.push('podium body ' + k + ' missing'); return; }
    const head = nm.top - b.y0;
    console.log(`  ${ordinalOf(k)} ${String(nm.name || '?').padEnd(13)} h ${nm.h}  drawn ${Math.round(b.y1 - b.y0)}px, head ${Math.round(head)} above its plinth  ` +
      `x ${Math.round(b.x0)}..${Math.round(b.x1)}  name baseline ${Math.round(nm.nameY)}`);
    verdict(b.x0 > -8 && b.x1 < 968 && b.y0 > 96 && b.y1 < 540, `podium ${nm.name} is outside the card`);
    verdict(b.y1 - b.y0 >= 76, `podium ${nm.name} is only ${Math.round(b.y1 - b.y0)}px tall, floor is 76`);
    // the name is placed off the same scale expression as the body, so it must clear the head
    verdict(nm.nameY < b.y0 - 2, `podium ${nm.name}: name baseline ${Math.round(nm.nameY)} is inside the head (top ${Math.round(b.y0)})`);
    verdict(nm.nameY > b.y0 - 46, `podium ${nm.name}: name floats ${Math.round(b.y0 - nm.nameY)}px clear of the head`);
  });
  verdict(OUT.podium.length === 3, `three bodies on the podium, got ${OUT.podium.length}`);
} else problems.push('podium never measured');

console.log(problems.length ? `\n${problems.length} FAILED` : '\nall clear');
process.exit(problems.length ? 1 : 0);
