// Act three's geometric invariants, checked as arithmetic rather than by looking.
//
// These are the faults a picture hides. A terrace floating above its own hillside looks
// like a terrace until you find the strip of sky under its left end; a fence seeded off
// the camera looks like a fence until you compare two frames three seconds apart. Each
// check below corresponds to a defect that actually shipped.
//
//   node tools/enc-check.js
'use strict';
const fs = require('fs'), path = require('path');
// Optional root, so the checks can be pointed at a deliberately broken COPY. Without it
// the only way to prove an invariant can fail is to damage the real index.html and hope to
// remember to undo it -- which is how a check ends up trusted on the strength of never
// having been seen to do anything. See tools/enc-falsify.js.
const root = process.argv[2] || path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(root, 'tools', 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", JSON.stringify(path.join(__dirname, 'audio-mock.js'))));
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

let bad = 0;
const ok = (name, pass, detail) => {
  if (!pass) bad++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

eval(src + `
;(function(){

  // 1. The hill must never sit below the track it carries. Smaller y is higher, so the
  //    surface must be at or above (<=) the highest lane at that x. Violated by up to
  //    +142.9 units when signed sinusoids were added to a smoothed average.
  //    A BAND, not a ceiling. "worst <= 0" became a TAUTOLOGY the moment encSurfaceY ended
  //    with Math.min(..., laneY(top) - 20) minus relief: the expression is then identically
  //    <= -20, so the check could not fail however wrong the hill got, and it sat green
  //    through a change that pushed the crest clean out of the top of the viewport. A
  //    check that cannot fail is not evidence about the build, it is decoration.
  //
  //    (NO BACKTICKS anywhere in this file below line 26. The whole body is a template
  //    literal handed to eval, so one closes it and the file dies with "missing ) after
  //    argument list" pointing at the eval, nowhere near the character. Twice in one day.)
  //
  //    So it asserts both ends. The floor is the lane table's own top (laneY(laneCount-1)),
  //    which is the number the cap in encSurfaceY is trying to respect, read rather than
  //    restated; above that the hill is off the top of the play viewport and the crest has
  //    no silhouette at all.
  let worst = -1e9, worstAt = 0, high = 1e9, highAt = 0;
  for (let wx = ENC.x0; wx < CFG.finale.x; wx += 7) {
    const s = encSurfaceY(wx);
    const f = s - laneY(encTopLane(wx));
    if (f > worst) { worst = f; worstAt = wx; }
    if (s < high) { high = s; highAt = wx; }
  }
  ok('no terrace floats above its own hillside', worst <= -20,
     'worst ' + worst.toFixed(1) + ' at wx ' + worstAt + ' (want <= -20)');
  //    The first version of this asserted high >= ceiling, and tools/enc-falsify.js caught
  //    it DEAD on its own injected fault within the hour: encSurfaceY ends with
  //    Math.max(ceiling, ...), so the assertion tested the output of the clamp that
  //    guarantees it. Written, ironically, in the same edit that fixed the tautology above.
  //
  //    What is falsifiable is the SYMPTOM the clamp produces when it is doing real work.
  //    If relief grows, the crest does not leave the frame -- it gets pinned flat against
  //    the ceiling over long runs, which is a dead straight skyline and its own fault. So
  //    assert the hill is not resting on its own safety net.
  const ceiling = laneY(CFG.laneCount - 1);
  let run = 0, worstRun = 0, runAt = 0;
  for (let wx = ENC.x0; wx < CFG.finale.x; wx += 7) {
    if (encSurfaceY(wx) <= ceiling + 0.01) { run += 7; if (run > worstRun) { worstRun = run; runAt = wx; } }
    else run = 0;
  }
  ok('the crest is not pinned flat against its own ceiling', worstRun <= 300,
     worstRun ? 'longest flat run ' + worstRun + ' units ending at wx ' + runAt + ' (want <= 300)'
              : 'never reaches the ceiling');

  // 2. A fork's ramp must not run past the end of the lane it lands on, and consecutive
  //    merges must be at least CFG.rampLen apart -- otherwise updateLane overwrites r.ramp
  //    mid-descent and the runner pops to the new lane's height in one frame.
  const encForks = CFG.forks.filter(f => f.x > CFG.exit).sort((a,b) => a.merge - b.merge);
  let overlap = null, popped = 0;
  for (let i = 0; i < encForks.length; i++) {
    const f = encForks[i], next = encForks[i + 1];
    if (next && next.merge - f.merge < CFG.rampLen) {
      popped++;
      const jump = Math.abs(laneY(f.to) - laneY(f.from)) * (1 - (next.merge - f.merge) / CFG.rampLen);
      if (!overlap || jump > overlap.jump) overlap = { at: next.merge, jump, gap: next.merge - f.merge };
    }
  }
  ok('merge ramps do not overrun the next merge', popped === 0,
     overlap ? popped + ' overlap; worst pops ' + overlap.jump.toFixed(0) +
               ' units at wx ' + overlap.at + ' (merges ' + overlap.gap + ' apart, rampLen ' + CFG.rampLen + ')'
             : 'all >= ' + CFG.rampLen + ' apart');

  // 3. No room's DRAWN extent may overlap another's. room-check tests x..x+gapWidth; a
  //    ditch also throws a spoil bank past that, and the wall's masonry reaches 62 either
  //    side of its gap. The wall was founded inside the ditch in front of it.
  //
  //    The ditch's reach is READ OUT of index.html, not written down here. It was 54, which
  //    was true until the bank was widened to a body's height -- and a room-overlap check
  //    carrying a stale extent does not fail loudly, it passes a real overlap in silence.
  //    That is the same fault room-check had about the sweeper's cost, found the same day.
  //    Throws rather than defaulting: a check that cannot find the number it needs should
  //    stop, not quietly measure the wrong thing.
  // \\d, not \d: this line is inside a template literal, which eats the backslash and
  // leaves /const DITCH_SPOIL = (d+)/ -- a regex that matches nothing and throws the
  // "cannot find the constant" error against a file that plainly contains it.
  const spoilM = src.match(/const DITCH_SPOIL = (\\d+)/);
  // NOTE: no backticks in this string. The whole check body lives inside a template
  // literal passed to eval(), so a backtick here closes it and the file stops parsing.
  if (!spoilM) throw new Error('enc-check: no DITCH_SPOIL constant in index.html -- the ditch bank was renamed or removed, and room extents cannot be priced until this is pointed at the new one.');
  const DITCH_SPOIL = +spoilM[1];
  const extent = r => {
    if (r.type === 'ditch') return [r.x, r.x + CFG.gapWidth + DITCH_SPOIL];
    if (r.type === 'wall')  return [r.x - 62, r.x + CFG.gapWidth + 62];
    return [r.x, r.x + CFG.gapWidth];
  };
  const enc = CFG.rooms.filter(r => r.x > CFG.exit).sort((a,b) => a.x - b.x);
  let clash = null;
  for (let i = 0; i < enc.length; i++) for (let j = i + 1; j < enc.length; j++) {
    if (enc[i].lane !== enc[j].lane) continue;
    const [a0,a1] = extent(enc[i]), [b0,b1] = extent(enc[j]);
    if (a1 > b0 && b1 > a0) clash = enc[i].type + '@' + enc[i].x + ' (' + a0 + '..' + a1 + ') meets ' +
                                   enc[j].type + '@' + enc[j].x + ' (' + b0 + '..' + b1 + ')';
  }
  ok('no two rooms overlap on their drawn extents', !clash, clash || '');

  // 4. The breach must be as wide as the wall's footprint at ground level, or the crowd
  //    walks through solid masonry either side of it.
  //    READ from drawEncWall, not restated. This check was DEAD: it computed the breach as
  //    masonry + 4 either side, which is a copy of drawEncWall's own numbers, so narrowing
  //    the real breach to 70 units a side left the check computing 4 and reporting fine.
  //    enc-falsify caught it. Same shape as the 54 that sat in the ditch extent: a check
  //    that restates the thing it is testing is testing itself.
  const wall = CFG.rooms.find(r => r.type === 'wall');
  if (wall) {
    // bL/bR are now the ANIMATED edges -- the breach opens on a clock -- so what this check
    // wants is the fully-open extent, which is bL0/bR0. Measuring the animated pair would
    // price the hole at whatever width the blast clock happened to be at, i.e. at nothing.
    const jambM = src.match(/const bL0 = wx0 \\+ (\\d+), bR0 = wx0 \\+ ww - (\\d+), aMid/);
    // The over-hang is one named constant now -- read by drawEncWall, holdLine, the fence
    // exclusion and the kill line -- so read the CONSTANT and derive both offsets from it,
    // rather than matching the two literals it used to be spelled as.
    const overM = src.match(/const WALL_OVER = (\\d+);/);
    const formOK = /const wx0 = sx - WALL_OVER, ww = gw \\+ WALL_OVER \\* 2;/.test(src);
    const wallM = overM && formOK ? [null, overM[1], String(+overM[1] * 2)] : null;
    if (!jambM || !wallM) throw new Error('enc-check: drawEncWall no longer declares bL/bR or wx0/ww in the expected form, so the breach cannot be measured. Point this at the new expressions rather than leaving it green.');
    const off = +wallM[1];
    const masonry = [wall.x - off, wall.x + CFG.gapWidth + (+wallM[2] - off)];
    const breach  = [masonry[0] + (+jambM[1]), masonry[1] - (+jambM[2])];
    const buried  = (breach[0] - masonry[0]) + (masonry[1] - breach[1]);
    // A few units of jamb either side is masonry, not an obstruction: a runner is about
    // 14 wide and walks down the middle. The fault this catches is 56 units a side, which
    // is four bodies' worth of stone with people drawn on top of it.
    ok('the breach spans the wall at ground level', buried <= 12,
       buried > 12 ? buried + ' units of solid wall are walked through' : buried + ' units of jamb, fine');
  }

  // 5. Lamplight belongs under a ceiling. Nothing in act three may be lit by a lamp.
  //
  //    This assertion was "typeof ENC_LAMP_GUARDED === 'undefined' || ENC_LAMP_GUARDED",
  //    and ENC_LAMP_GUARDED HAS NEVER EXISTED in index.html. So it read
  //    typeof undefined === 'undefined', which is true, always, forever. The check has
  //    never tested anything, while printing a detail line about 37 lamp positions that
  //    made it look like it had. Third dead invariant in this file, and the only one that
  //    was born dead rather than made dead by a later change.
  //
  //    It EXERCISES lampPools now rather than asking the source a question: park the view
  //    in act three, count what the function actually draws, and require it to be nothing.
  //    A guard that is deleted, inverted or moved then shows up here.
  //
  //    It counts the pool's own RADIAL GRADIENT. It used to count ctx.save(), which was one per
  //    pool while every pool clipped itself -- and when the clip went (it contained the whole
  //    fill, so it removed no pixel and cost a GPU clip per lamp) the one save left around each
  //    lane's loop read as six pools drawn in daylight, with nothing drawn at all.
  let pools = 0;
  {
    const keep = { left: V.left, vw: V.vw, zoom: V.zoom }, realGrad = ctx.createRadialGradient;
    // ENC_POOLS_AT=8000 parks it inside the cave instead, which must FAIL (38 pools): the falsifier
    V.left = (process.env.ENC_POOLS_AT ? +process.env.ENC_POOLS_AT : CFG.exit + 600); V.vw = 2119; V.zoom = 0.453;
    ctx.createRadialGradient = function () { pools++; return realGrad.apply(this, arguments); };
    try { for (let k = 0; k < CFG.laneCount; k++) lampPools(k); }
    finally { ctx.createRadialGradient = realGrad; V.left = keep.left; V.vw = keep.vw; V.zoom = keep.zoom; }
  }
  // 6. The near plane must never rise over the crowd. Morgan's one constraint on it was
  //    "not something that would hide the view", and the first version broke it by its own
  //    arithmetic while a comment asserted it did not: the crest was drawn at BASE + 26 - a
  //    with a running to 42, so it reached 16px ABOVE the soles and buried their legs in a
  //    third of nodes. A measured number written into a comment instead of into the code.
  //
  //    So it is measured HERE. Park the view in act three, run encForeground against a
  //    recording context, take the highest y anything reached, and compare it with where
  //    lane 0's soles land on the canvas. Nothing in the near plane may be above that.
  let fgTop = 1e9;
  {
    const keep = { left: V.left, vw: V.vw, zoom: V.zoom, cam: S.cam };
    const realLine = ctx.lineTo, realQuad = ctx.quadraticCurveTo, realMove = ctx.moveTo;
    // PARKED IN THE MILL, because that is where the near plane lives now. It was built
    // against act three by mistake and moved; a check left pointing at act three would
    // have called a function that draws nothing there and passed on an empty measurement,
    // which is the third way this file has found to be green about nothing.
    S.cam = 2400; V.left = S.cam - 75; V.vw = 960; V.zoom = 1;
    // The BANK only. The machines are deliberately allowed to rise past the crowd: they
    // are open structure -- two legs, a beam, a rod -- and a thin line crossing is what
    // Morgan asked for. It is the solid ground that must not, because that is what can
    // actually bury anyone. Stubbing them is how the check says which of the two it means.
    const realBeam = beamEngine, realHouse = engineHouse;
    beamEngine = () => {}; engineHouse = () => {};
    const note = y => { if (y < fgTop) fgTop = y; };
    ctx.lineTo = function (x, y) { note(y); return realLine.apply(this, arguments); };
    ctx.moveTo = function (x, y) { note(y); return realMove.apply(this, arguments); };
    ctx.quadraticCurveTo = function (cx2, cy2, x, y) { note(cy2); note(y); return realQuad.apply(this, arguments); };
    try { millForeground(); }
    finally {
      ctx.lineTo = realLine; ctx.moveTo = realMove; ctx.quadraticCurveTo = realQuad;
      beamEngine = realBeam; engineHouse = realHouse;
      V.left = keep.left; V.vw = keep.vw; V.zoom = keep.zoom; S.cam = keep.cam;
    }
  }
  // where a runner's soles land on the canvas, by the same transform draw() uses, at the
  // zoom the mill is actually seen at
  const soleY = 540 + (laneY(0) - CFG.worldBottom) * 1;
  ok('the near BANK never rises over the crowd', fgTop >= soleY,
     'highest foreground point canvas y ' + fgTop.toFixed(1) + ' against soles at ' + soleY.toFixed(1) +
     ' (bigger y is lower; want >= soles)');

  ok('no lamp pools out in the open', pools === 0,
     pools === 0 ? 'lampPools drew nothing with the view parked past the mouth'
                 : pools + ' lamp pools drawn in daylight past CFG.exit');

})();
`);
console.log(bad ? `\n${bad} invariant(s) broken.` : '\nall act-three invariants hold.');
process.exit(bad ? 1 : 0);
