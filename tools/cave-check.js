// Act two's invariants as arithmetic, the way enc-check does act three's.
//
//   node tools/cave-check.js [path-to-repo]
//
// Why it exists: every one of these was verified once, by hand, in a throwaway script, and a
// check that has been run once by hand will not be run again. Each corresponds to a fault that
// actually shipped in the cave this week.
//
// It CALLS the game's own helpers -- tunnelSag, laneAt, roomIsGap, floorSpans, placeSkeletons
// -- rather than restating them. A tool that copies the arithmetic it is checking drifts the
// moment the game moves and then accuses the game of the tool's staleness; only a call says
// the two agree. Where something animates, the whole clock is swept, because measuring one
// phase of a moving thing is a coin toss reported as a verdict.
'use strict';
const fs = require('fs'), path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(__dirname, 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", JSON.stringify(path.join(__dirname, 'audio-mock.js'))));
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

const fails = [];
// NOT `say`: the game has its own say() for speech bubbles, and a direct eval shares this
// scope, so a const here is replaced by the game's function declaration and every call lands
// in the chatter system. enc-check calls its helper `ok` for the same reason.
const verdict = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

eval(src + `
;(function(){
  const LO = FAC.seam, HI = CFG.exit;

  // 1 and 2. A pit prop's CAP and a ladder's HEAD have to meet the roof, which moves by plus
  //    or minus 19 units of sag. Two ways to get this check wrong and both were made here
  //    first: writing the height formula out again in the tool, which passes happily while
  //    the game is broken because the tool is checking itself; and comparing a height to a
  //    height computed the same way, which subtracts a number from itself and can never fail.
  //    So this DRAWS the real function through a recording context and measures where the
  //    paint actually lands. The context honours save/restore/translate/rotate, because one
  //    that ignores the transform stack does not under-report, it invents.
  const measure = (fn) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    let m = [1, 0, 0, 1, 0, 0], stack = [];
    const pt = (x, y) => {
      const px = m[0] * x + m[2] * y + m[4], py = m[1] * x + m[3] * y + m[5];
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    };
    const box = (x, y, w, hh) => { pt(x, y); pt(x + w, y); pt(x, y + hh); pt(x + w, y + hh); };
    const mul = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3],
                           a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
    // ctx is a const in the game, so the methods are swapped ON the same object and put back,
    // rather than the reference being replaced.
    const spy = {
      save: () => { stack.push(m.slice()); },
      restore: () => { m = stack.pop() || [1,0,0,1,0,0]; },
      translate: (x, y) => { m = mul(m, [1,0,0,1,x,y]); },
      rotate: (a) => { m = mul(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
      scale: (x, y) => { m = mul(m, [x,0,0,y,0,0]); },
      fillRect: box, strokeRect: box,
      beginPath: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {}, clip: () => {},
      moveTo: pt, lineTo: pt,
      quadraticCurveTo: (cx, cy, x, y) => { pt(cx, cy); pt(x, y); },
      arc: (x, y, r) => { pt(x - r, y - r); pt(x + r, y + r); },
      ellipse: (x, y, rx, ry) => { pt(x - rx, y - ry); pt(x + rx, y + ry); },
    };
    const keep = {};
    for (const k in spy) { keep[k] = ctx[k]; ctx[k] = spy[k]; }
    try { fn(); } finally { for (const k in spy) ctx[k] = keep[k]; }
    return { x0, y0, x1, y1 };
  };
  const meets = (label, fn, lo, hi) => {
    let min = 1e9, max = -1e9, at = null;
    for (let wx = LO + 60; wx < HI; wx += 53) {
      for (let lane = 0; lane < CFG.laneCount; lane++) {
        const y = laneY(lane), roof = y - CFG.tunnelH + tunnelSag(wx, lane);
        const b = measure(() => fn(wx - V.left, y, wx * 0.013 + lane, lane, wx));
        const into = roof - b.y0;                    // + is driven into the rock, - is holding air
        if (into < min) { min = into; at = { wx, lane }; }
        if (into > max) max = into;
      }
    }
    verdict(min >= lo && max <= hi,
      label + '  measured ' + min.toFixed(1) + ' to ' + max.toFixed(1) + ' units into the rock' +
      (min >= lo && max <= hi ? '' : '  (worst at x ' + (at.wx | 0) + ' lane ' + at.lane + ')'));
  };
  meets('the pit prop cap is driven into the roof', (sx, y, seed, lane, wx) => drawPitProp(sx, y, seed, lane, wx), 1, 26);
  meets('the ladder head reaches its manway   ', (sx, y, seed, lane, wx) => drawLadder(sx, y, seed, lane, wx), 1, 26);

  // 3. Nothing laid on the floor may cross a hole in the floor. floorSpans is what the track
  //    and the drain both cut themselves on; if it ever returns a span containing a gapped
  //    room's interior, both of them are bridging open air over a river.
  {
    let bad = 0, worstRoom = null;
    for (let lane = 0; lane < CFG.laneCount; lane++) {
      for (const [a, b] of LANE_SPANS[lane]) {
        const lo = Math.max(a, LO + 40), hi = Math.min(b, HI - 40);
        if (hi <= lo) continue;
        for (const [sa, sb] of floorSpans(lo, hi, lane)) {
          for (const r of S.rooms) {
            if (r.lane !== lane || !roomIsGap(r)) continue;
            const mid = r.x + CFG.gapWidth / 2;
            if (mid > sa + 1 && mid < sb - 1) { bad++; worstRoom = r; }
          }
        }
      }
    }
    verdict(bad === 0, bad ? bad + ' floor spans bridge a hole, e.g. ' + worstRoom.type + ' at ' + worstRoom.x
                       : 'no rail or drain crosses a hole in its own floor');
  }

  // 4. A skeleton lies in rock, never through a gallery. Checked at many camera positions
  //    because placement is world-anchored and must not depend on where the camera is.
  {
    let overlaps = 0, placed = 0, worst = null;
    for (let cam = 5800; cam < 12600; cam += 137) {
      S.cam = cam; updateView(1);
      for (const sk of placeSkeletons(null)) {
        placed++;
        const top = sk.cy - sk.L * 0.42, bot = sk.cy + sk.L * 0.44;
        for (let k = 0; k < CFG.laneCount; k++) {
          // Sampled ALONG the body, not at its two ends: placement samples five points, and a
          // lane that exists only under the middle of a skeleton is exactly the one a
          // two-point test cannot see. The check has to look where the placement looked.
          let here = false;
          for (let i = 0; i <= 4 && !here; i++) here = laneAt(k, sk.cx - sk.L / 2 + (sk.L * i) / 4);
          if (!here) continue;
          const fy = laneY(k), cy2 = fy - CFG.tunnelH;
          if (bot > cy2 && top < fy) { overlaps++; if (!worst) worst = { sk, k }; }
        }
      }
    }
    verdict(overlaps === 0, overlaps ? overlaps + ' skeleton/gallery overlaps out of ' + placed + ' placements'
      : 'no skeleton lies through a gallery  ' + placed + ' placements checked across the cave');
  }

  // 5. The workings stay in the rock. Outside it there is grass, and a pit prop in a field is
  //    the first thing a logic pass finds.
  {
    let out = 0;
    for (let cam = 200; cam < 15200; cam += 211) {
      S.cam = cam; updateView(1);
      for (const sk of placeSkeletons(null)) if (sk.cx - sk.L/2 < LO || sk.cx + sk.L/2 > HI) out++;
    }
    verdict(out === 0, out ? out + ' skeletons placed outside the rock' : 'nothing in the workings is placed outside the rock');
  }

  // 6. THE WHOLE CLOCK, not one phase of it. The fabric contains a drip that falls on its own
  //    cycle, so measuring it at a single S.t is a coin toss reported as a verdict. This
  //    MEASURES what mineFabric paints -- it does not restate the drip's arithmetic, which is
  //    the mistake the first three versions of the checks above all made -- and sweeps S.t
  //    across a full cycle. The allowance is stated rather than hidden: the timber cap and its
  //    lagging are meant to be driven up into the rock, and contact shadows sit just below the
  //    floor, so the band is roof minus 46 to floor plus 10.
  {
    let worstUp = 0, worstDown = 0, at = null;
    const keepT = S.t;
    for (let lane = 0; lane < CFG.laneCount; lane++) {
      for (const [a0, b0] of LANE_SPANS[lane]) {
        const lo = Math.max(a0, LO + 200), hi = Math.min(b0, HI - 200);
        if (hi - lo < 600) continue;
        S.cam = lo + 300; updateView(1);
        const y = laneY(lane), roof = y - CFG.tunnelH;
        for (let p = 0; p < 1; p += 0.05) {
          S.t = keepT + p * 1.82;                       // a whole drip cycle at 0.55 per second
          const box = measure(() => mineFabric(lo, hi, y, lane));
          const up = roof - box.y0, down = box.y1 - y;
          if (up > worstUp) { worstUp = up; at = { lane, wx: lo | 0 }; }
          if (down > worstDown) worstDown = down;
        }
      }
    }
    S.t = keepT;
    verdict(worstUp <= 46 && worstDown <= 10,
      'nothing the fabric paints leaves its gallery, over a whole drip cycle  ' +
      worstUp.toFixed(1) + ' above the roof (46 allowed for timber), ' +
      worstDown.toFixed(1) + ' below the floor (10 allowed for shadows)' +
      (worstUp <= 46 && worstDown <= 10 ? '' : '  worst lane ' + at.lane));
  }
})();
`);

console.log(fails.length ? '\n' + fails.length + ' act-two invariant(s) broken.' : '\nall act-two invariants hold.');
process.exit(fails.length ? 1 : 0);
