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
const root = path.join(__dirname, '..');
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
  let worst = -1e9, worstAt = 0;
  for (let wx = ENC.x0; wx < CFG.finale.x; wx += 7) {
    const f = encSurfaceY(wx) - laneY(encTopLane(wx));
    if (f > worst) { worst = f; worstAt = wx; }
  }
  ok('no terrace floats above its own hillside', worst <= 0,
     'worst ' + worst.toFixed(1) + ' at wx ' + worstAt + ' (want <= 0)');

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
  //    ditch also throws a spoil bank 54 further, and the wall's masonry reaches 62 either
  //    side of its gap. The wall was founded inside the ditch in front of it.
  const extent = r => {
    if (r.type === 'ditch') return [r.x, r.x + CFG.gapWidth + 54];
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
  const wall = CFG.rooms.find(r => r.type === 'wall');
  if (wall) {
    const masonry = [wall.x - 62, wall.x + CFG.gapWidth + 62];
    const breach  = [masonry[0] + 4, masonry[1] - 4];
    const buried  = (breach[0] - masonry[0]) + (masonry[1] - breach[1]);
    // A few units of jamb either side is masonry, not an obstruction: a runner is about
    // 14 wide and walks down the middle. The fault this catches is 56 units a side, which
    // is four bodies' worth of stone with people drawn on top of it.
    ok('the breach spans the wall at ground level', buried <= 12,
       buried > 12 ? buried + ' units of solid wall are walked through' : buried + ' units of jamb, fine');
  }

  // 5. Lamplight belongs under a ceiling. Nothing in act three may be lit by a lamp.
  let litOutdoors = 0;
  for (let wx = Math.ceil(CFG.exit / 240) * 240; wx < CFG.finale.x; wx += 240)
    for (let k = 0; k < CFG.laneCount; k++) {
      const lx = wx + k * 40;
      if (lx > CFG.exit && laneAt(k, lx)) litOutdoors++;
    }
  ok('no lamp pools out in the open', typeof ENC_LAMP_GUARDED === 'undefined' || ENC_LAMP_GUARDED,
     litOutdoors + ' lamp positions fall in act three; lampPools must skip them');

})();
`);
console.log(bad ? `\n${bad} invariant(s) broken.` : '\nall act-three invariants hold.');
process.exit(bad ? 1 : 0);
