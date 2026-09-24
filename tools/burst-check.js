// The crusher and the mantrap: what fraction of the people who walk under one actually die?
//
//   node tools/burst-check.js [path/to/checkout]
//
// These are the two rooms that do not stop anybody. Everyone walks through, and the trap
// slams on its own clock and takes whoever is under it. Morgan, 2026-09-24: make them "kill
// roughly half of the people on average" -- "more deadly than it is now, but i dont want a
// ludicrously fast animation for a trap".
//
// Roughly half, ON AVERAGE, AND AT ANY CROWD SIZE. So this measures the fraction killed of
// the people who reached the trap, for a full crowd down to a handful, over enough trials
// that a few people's luck averages out. The driver is death-shape-check's: every room
// solved but one, the crowd PLACED in front of it in its own lane, the cave door marked done.
//
// Measured twice, because Build 174's speed-up puts a lone lane at 1.5x and a body walking
// faster spends less time under the ram: once at the normal pace (the speed-up held off),
// once at 1.5x. Only the normal pace is asserted -- the band it has to land in is 35-65% --
// and the sped-up number is printed, because what it should be is a design question.
const fs = require('fs'), path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(__dirname, 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", "path.join(" + JSON.stringify(__dirname) + ",'audio-mock.js')"));
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

const out = [];
eval(src + `
;(function(){
  const dt = 1 / 60;
  const burstTypes = [...new Set(CFG.rooms.filter(r => CFG.types[r.type].hazard === 'burst').map(r => r.type))];
  // one run past one trap: returns [reached, killed]
  function pass(type, crew, sped) {
    reset(); startRun();
    const target = S.rooms.filter(r => r.type === type).sort((a, b) => a.x - b.x)[0];
    for (const r of S.rooms) { r.state = 'solved'; r.bridge = 1; }
    target.state = 'dormant'; target.bridge = 0;
    target.slamT = Math.random() * CFG.crusherPeriod;     // a fresh phase every trial
    S.cam = target.x - CFG.packFront - 60; updateView(1);
    S.seam.phase = 'done'; if (S.boss) S.boss.gone = true;
    const keep = S.runners.slice(0, crew);
    for (const r of S.runners) {
      if (keep.indexOf(r) < 0) { r.state = 'dead'; continue; }
      r.lane = target.lane; r.y = laneY(target.lane); r.route = []; r.ramp = null;
      r.x = S.cam + r.slot; r.atRoom = null; r.doom = null; r.held = false;
      // PLACED PEOPLE STILL REMEMBER WHERE THEY WERE. updateLane takes every fork between
      // r.lastForkX and r.x, so a body dropped at 4100 from the yard met the forks at 2700 and
      // 3800 on its first frame and half of them climbed to lanes 1 and 2 -- never walking
      // under the trap and still counted as having reached it. That halved every figure this
      // printed, before and after, and read as a trap half as deadly as the arithmetic says.
      r.lastForkX = target.x;
    }
    // the speed-up is held OFF for the normal-pace figure and pinned ON for the other, so
    // neither depends on whether this lane happens to satisfy the rule where the trap stands
    S.pace = sped ? SPEEDUP.pace : 1;
    const end = target.x + 140;
    // WHO WALKED UNDER IT is counted by seeing them under it -- in its lane, off any ramp,
    // inside the fifty units the slam takes -- not by where they ended up. The denominator is
    // the claim, so it is observed rather than assumed.
    const under = new Set();
    const look = () => { for (const r of keep) if ((r.state === 'run' && !r.ramp && r.lane === target.lane
      && r.x >= target.x + 35 && r.x < target.x + 85) || r.doom === target) under.add(r); };
    for (let f = 0; f < 60 * 30; f++) {
      S.pace = sped ? SPEEDUP.pace : 1; S.paceSaid = true;
      update(dt);
      S.pace = sped ? SPEEDUP.pace : 1;
      look();
      if (keep.every(r => r.state !== 'run' || r.x > end)) break;
    }
    const killed = keep.filter(r => r.doom === target && r.state !== 'run').length;
    return [under.size, killed];
  }
  for (const type of burstTypes) for (const crew of [100, 30, 10, 3]) for (const sped of [false, true]) {
    // enough trials that about 300 people walk under it, whatever the crew
    const trials = Math.max(3, Math.ceil(300 / crew));
    let reached = 0, killed = 0;
    for (let i = 0; i < trials; i++) { const [a, b] = pass(type, crew, sped); reached += a; killed += b; }
    out.push({ type, crew, sped, trials, reached, killed });
  }
  out.period = CFG.crusherPeriod;
})();
`);

let bad = 0;
console.log('the crusher and the mantrap, unsolved: the share of the people who walk under one that die');
console.log('cycle ' + out.period + 's, about 300 people per row\n');
console.log('  trap       crew   pace    walked under   killed    share');
for (const r of out) {
  const share = r.reached ? r.killed / r.reached : 0;
  const pass = r.sped || (share >= 0.35 && share <= 0.65);
  if (!pass) bad++;
  if (r.reached < 200) { bad++; console.log('  (only ' + r.reached + ' reached the trap -- the driver did not put people under it)'); }
  console.log('  ' + r.type.padEnd(9) + String(r.crew).padStart(5) + '   ' + (r.sped ? '1.5x' : '1x  ') +
    String(r.reached).padStart(12) + String(r.killed).padStart(10) + '    ' + (share * 100).toFixed(0).padStart(3) + '%' +
    (r.sped ? '   (sped up, printed only)' : pass ? '   ok' : '   OUT OF 35-65%'));
}
console.log('');
console.log(bad ? bad + ' row(s) outside "roughly half".' : 'roughly half, at every crew size.');
process.exit(bad ? 1 : 0);
