// How much of the crowd each mini-game panel hides while it is open.
//
// A panel is drawn in SCREEN space, from a fixed top of 48, at a height its verb chooses,
// multiplied by PANEL_SCALE. The runners are in WORLD space and reach the screen through
// the camera. So "does the panel cover the people" is a number neither side knows on its
// own -- and it is the number that decides whether making the panels bigger costs
// anything, because the whole game is watching the crowd while you work.
//
// Everything here is DERIVED: PANEL_SCALE, every verb's ph and every room's panelWidth are
// read out of index.html, the screen position of a runner comes from the game's own
// toScreen(), and the crowd is the real crowd of a real solved run. Change a lane, a zoom,
// a panel height, a panel width or the scale and this moves rather than going stale.
//
// IT SCORES WIDTH AS WELL AS HEIGHT, and it did not at first. Binned on ph alone it called
// the press room "the same as the sweeper" on the strength of 218 being near 210 -- while
// the press panel is 620 wide against the sweeper's 420, which at 1.34 is 831 canvas px of
// the 960 against 563. That is 48% more panel, and the tool was structurally unable to see
// any of it. A runner counts as hidden only if it is behind the panel in BOTH axes.
//
// Two things it does deliberately:
//
//  * It drives the SOLVING bot. With no input the crowd dies at the first crossing, the
//    camera stops, and the only lane ever sampled is lane 0 -- which reports comfortably
//    that nothing is covered, about a game it never saw past twenty seconds.
//  * It scores BOTH scales on the same frames, interleaved, rather than running once per
//    scale. The camera's height and zoom move constantly, so two runs differ by two
//    different walks as much as by the panel size.
//
//   node tools/cover-check.js [path/to/index.html]
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const file = process.argv[2] || path.join(root, 'index.html');
const raw = fs.readFileSync(file, 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
// the same stub the freeze harness uses, so this cannot drift from what that measures
const h = fs.readFileSync(path.join(root, 'tools', 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src')).replace("path.join(__dirname, 'audio-mock.js')", "path.join(__dirname,'audio-mock.js')"));
global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
let __kh = null;
global.window.addEventListener = (ev, fn) => { if (ev === 'keydown') __kh = fn; };
global.window.dispatchEvent = e => { if (__kh) __kh({ key: e.key, repeat: false, preventDefault() {} }); };
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

const out = {};
eval(src + `
;(function(){
  S.mode = 'play'; S.introT = 0; startRun();
  const scales = [1, PANEL_SCALE];
  // One bin per distinct panel SHAPE, taken from the rooms that exist. panelWidth wants a
  // room with a live mini-game (keys and word size themselves to their content), so build
  // one the way the road does rather than restating the arithmetic here.
  const shapes = new Map();
  for (const room of CFG.rooms) {
    const t = CFG.types[room.type];
    if (!t) continue;
    const probe = { verb: t.verb, mg: VERBS[t.verb].start(room.diff || 1) };
    const ph = VERBS[t.verb].ph || 150, pw = panelWidth(probe);
    const key = ph + 'x' + pw;
    if (!shapes.has(key)) shapes.set(key, { ph, pw, verbs: [] });
    if (!shapes.get(key).verbs.includes(t.verb)) shapes.get(key).verbs.push(t.verb);
  }
  const bins = [];
  for (const sh of shapes.values()) for (const sc of scales)
    bins.push({ ...sh, sc, y: 48 + sh.ph * sc, x0: W / 2 - sh.pw * sc / 2, x1: W / 2 + sh.pw * sc / 2,
                hid: 0, tot: 0, worst: 0 });
  let frames = 0;
  for (let i = 0; i < 160 * 60 && S.mode !== 'win' && S.mode !== 'lose'; i++) {
    update(1 / 60); devSolve();
    if (i % 6) continue;
    const live = S.runners.filter(r => r.state === 'run');
    if (!live.length) continue;
    frames++;
    // 45 units crown to sole: the RENDERED height of the tallest drawn figure, which is
    // the extent a panel would actually paint over.
    const heads = live.map(r => toScreen(r.x, r.y - 45)).filter(p => isFinite(p[0]) && isFinite(p[1]));
    for (const b of bins) {
      let n = 0;
      for (const p of heads) if (p[1] < b.y && p[0] > b.x0 && p[0] < b.x1) n++;
      b.hid += n; b.tot += heads.length;
      b.worst = Math.max(b.worst, n / heads.length);
    }
  }
  out.bins = bins.map(b => ({ ph: b.ph, pw: b.pw, verbs: b.verbs, sc: b.sc, y: b.y,
                              mean: b.hid / b.tot, worst: b.worst }));
  out.frames = frames;
  out.mode = S.mode; out.cam = S.cam; out.camMax = S.camMax; out.scale = PANEL_SCALE;
})();
`);

if (out.mode === 'lose') {
  console.log('NOTE: the run ended in "lose" -- the bot never got through, so this is a');
  console.log('verdict on the first crossing only. Fix that before believing anything below.');
}
console.log(`a solved run to cam ${out.cam.toFixed(0)} of ${out.camMax}, ending in ${out.mode}`);
console.log(`${out.frames} frames sampled, every one scored at both scales\n`);

const byShape = new Map();
for (const b of out.bins) { const k = b.ph + 'x' + b.pw; const l = byShape.get(k) || []; l.push(b); byShape.set(k, l); }

console.log('   ph    pw   scale   bottom   width on screen   mean hidden   worst frame');
for (const [, list] of [...byShape].sort((a, b) => a[1][0].ph - b[1][0].ph || a[1][0].pw - b[1][0].pw)) {
  for (const b of list.sort((x, y) => x.sc - y.sc))
    console.log(`${String(b.ph).padStart(5)} ${String(b.pw).padStart(5)}    ${b.sc.toFixed(2)}   ${b.y.toFixed(0).padStart(6)}   ${(b.pw * b.sc).toFixed(0).padStart(15)}   ${(b.mean * 100).toFixed(1).padStart(11)}%   ${(b.worst * 100).toFixed(0).padStart(10)}%`);
  console.log(`      ${list[0].verbs.join(' ')}`);
}
console.log('');
console.log("\"Hidden\" is a runner whose head is inside the panel's rectangle in BOTH axes,");
console.log('so the panel would have been drawn over a body. Scale 1.00 is the old size.');

// Proved it can fail, rather than only seen it pass: with PANEL_SCALE forced to 2.2 in a
// copy, every bin's reading jumps and the keypad panels saturate. Run that falsifier again
// if you change how a bin is scored -- and check the width axis separately by forcing one
// verb's pw, since a height-only bug passes a height-only falsifier.
//
// The spread across runs is real and is not a signal: the game calls Math.random() in
// about thirty places, so three runs of one build gave 5.2 / 5.3 / 5.8% for the same bin.
// Reproduce on the shape -- which scale, which panel -- never on the digits.

// The width axis has its own falsifier, because a height-only bug passes a height-only
// one -- which is how this tool shipped blind to width in the first place. Forcing
// code.pw from 620 to 940 in a copy moves its scale-1.00 reading from 6.7% to 9.9% with
// the height untouched, so the horizontal test is live.
//
// What it says about the shape of the press panel, which is what it was built to settle:
// stacked at ph 266 x 420, 18.2% -> 60.0% mean and 100% on the worst frame; beside, at
// ph 218 x 620, 6.7% -> 19.1%. The extra 200 units of WIDTH cost almost nothing (the
// crowd sits near the middle of the screen, so a panel's outer thirds cover few people)
// while the extra 48 units of HEIGHT cost everything. Wide is nearly free; tall is not.
