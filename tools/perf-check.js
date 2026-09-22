// Where the frame goes. Counts CANVAS CALLS per drawing function, not milliseconds.
//
// A ms number off this box is a number about this box; a call count is the same on
// every machine a friend opens the file on, and the browser's cost is very nearly a
// function of how many calls it is handed and what KIND they are. So the verdict here
// is: which function issues the calls, and how many of them are the expensive kinds
// (a gradient allocated inside the loop, a full-screen composite, a shadow).
//
//   node tools/perf-check.js [seconds] [samples]
//
// It drives a solved run so the camera actually travels, and samples frames across the
// whole course rather than sitting in act one.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');

const SECS = +(process.argv[2] || 150), SAMPLES = +(process.argv[3] || 60);

// ---- counting context. Every method bumps a total; the expensive kinds are also
// counted on their own, because 100 fillRects and 100 createLinearGradients are not
// the same frame at all.
const COST = { createLinearGradient:1, createRadialGradient:1, createPattern:1,
               getImageData:1, putImageData:1, drawImage:1 };
let calls = 0; const kinds = {};
function bump(name) { calls++; kinds[name] = (kinds[name] || 0) + 1; }
function makeCtx() {
  const grad = { addColorStop() {} };
  const base = {
    canvas: { width: 960, height: 540 },
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, clip() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, clearRect() {}, rect() {},
    arc(a, b, r) { if (!isFinite(r) || r < 0) throw new Error('bad radius ' + r); },
    arcTo() {}, ellipse() {}, setLineDash() {}, drawImage() {},
    fillText() {}, strokeText() {},
    measureText(t) { return { width: String(t).length * 6 }; },
    createLinearGradient() { return grad; }, createRadialGradient() { return grad; },
    createPattern() { return grad; },
    getImageData() { return { data: new Uint8ClampedArray(4 * 8 * 8) }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(4 * (w || 8) * (h || 8)), width: w || 8, height: h || 8 }; },
    putImageData() {},
  };
  const c = {};
  for (const k of Object.keys(base)) {
    if (typeof base[k] === 'function') c[k] = function (...a) { bump(k); return base[k].apply(base, a); };
    else c[k] = base[k];
  }
  // property writes count too: a fillStyle assignment is a parse of a colour string
  let _fs = '', _ss = '', _gco = '', _sb = 0, _font = '';
  Object.defineProperties(c, {
    fillStyle:   { get: () => _fs,  set: v => { bump('set fillStyle'); _fs = v; } },
    strokeStyle: { get: () => _ss,  set: v => { bump('set strokeStyle'); _ss = v; } },
    font:        { get: () => _font, set: v => { bump('set font'); _font = v; } },
    globalCompositeOperation: { get: () => _gco, set: v => { if (v && v !== 'source-over') bump('set composite:' + v); _gco = v; } },
    shadowBlur:  { get: () => _sb,  set: v => { if (v) bump('set shadowBlur'); _sb = v; } },
  });
  c.lineWidth = 1; c.lineCap = ''; c.lineJoin = ''; c.textAlign = '';
  c.globalAlpha = 1; c.shadowColor = ''; c.filter = '';
  return c;
}
global.document = { getElementById: () => ({ getContext: makeCtx, width: 960, height: 540 }),
                    createElement: () => ({ getContext: makeCtx, width: 8, height: 8 }) };
let keyHandler = null;
global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
global.window = { addEventListener: (ev, fn) => { if (ev === 'keydown') keyHandler = fn; },
                  dispatchEvent: e => { if (keyHandler) keyHandler({ key: e.key, repeat: false, preventDefault() {} }); } };
global.performance = { now: () => 0 }; global.requestAnimationFrame = () => {};
global.location = { search: '' }; global.URLSearchParams = class { has() { return false } get() { return null } };
global.localStorage = { getItem: () => null, setItem: () => {} };
const { makeAudioMock } = require(path.join(__dirname, 'audio-mock.js'));
global.__audio = { nodes: 0, live: 0 };
global.window.AudioContext = makeAudioMock(global.__audio);
global.__prof = { calls: () => calls, kinds };

eval(src + `
;(function(){
  // Every function draw() calls at the top level, in the order it calls them.
  const NAMES = ['drawSky','drawOutside','drawEncLand','encFlora','drawMountain','drawEncBounds',
    'drawRiver','carveTunnels','drawIntro','drawLane','drawRunners','drawDoorSpill','drawFeeder',
    'drawStairRail','drawRoomProps','drawGate','blastLight','drawSeamDoor','drawSeamHammers',
    'drawFinish','drawFx','encGrade','drawForeground','millForeground','drawVignette',
    'drawOverlays','drawHud','drawPanel','drawBoss','drawDrill','drawFinalePanel','drawBubbles'];
  const tally = {};
  const scope = { drawSky, drawOutside, drawEncLand, encFlora, drawMountain, drawEncBounds,
    drawRiver, carveTunnels, drawIntro, drawLane, drawRunners, drawDoorSpill, drawFeeder,
    drawStairRail, drawRoomProps, drawGate, blastLight, drawSeamDoor, drawSeamHammers,
    drawFinish, drawFx, encGrade, drawForeground, millForeground, drawVignette,
    drawOverlays, drawHud, drawPanel, drawBoss, drawDrill, drawFinalePanel, drawBubbles };
  let depth = 0;
  const wrap = (fn, name) => function (...a) {
    if (depth) return fn.apply(this, a);           // only attribute the OUTERMOST call
    depth = 1; const c0 = __prof.calls();
    try { return fn.apply(this, a); }
    finally { depth = 0; const d = __prof.calls() - c0;
      const t = tally[name] || (tally[name] = { calls: 0, hits: 0 }); t.calls += d; t.hits++; }
  };
  drawSky = wrap(scope.drawSky,'drawSky'); drawOutside = wrap(scope.drawOutside,'drawOutside');
  drawEncLand = wrap(scope.drawEncLand,'drawEncLand'); encFlora = wrap(scope.encFlora,'encFlora');
  drawMountain = wrap(scope.drawMountain,'drawMountain'); drawEncBounds = wrap(scope.drawEncBounds,'drawEncBounds');
  drawRiver = wrap(scope.drawRiver,'drawRiver'); carveTunnels = wrap(scope.carveTunnels,'carveTunnels');
  drawIntro = wrap(scope.drawIntro,'drawIntro'); drawLane = wrap(scope.drawLane,'drawLane');
  drawRunners = wrap(scope.drawRunners,'drawRunners'); drawDoorSpill = wrap(scope.drawDoorSpill,'drawDoorSpill');
  drawFeeder = wrap(scope.drawFeeder,'drawFeeder'); drawStairRail = wrap(scope.drawStairRail,'drawStairRail');
  drawRoomProps = wrap(scope.drawRoomProps,'drawRoomProps'); drawGate = wrap(scope.drawGate,'drawGate');
  blastLight = wrap(scope.blastLight,'blastLight'); drawSeamDoor = wrap(scope.drawSeamDoor,'drawSeamDoor');
  drawSeamHammers = wrap(scope.drawSeamHammers,'drawSeamHammers'); drawFinish = wrap(scope.drawFinish,'drawFinish');
  drawFx = wrap(scope.drawFx,'drawFx'); encGrade = wrap(scope.encGrade,'encGrade');
  drawForeground = wrap(scope.drawForeground,'drawForeground'); millForeground = wrap(scope.millForeground,'millForeground');
  drawVignette = wrap(scope.drawVignette,'drawVignette'); drawOverlays = wrap(scope.drawOverlays,'drawOverlays');
  drawHud = wrap(scope.drawHud,'drawHud'); drawPanel = wrap(scope.drawPanel,'drawPanel');
  drawBoss = wrap(scope.drawBoss,'drawBoss'); drawDrill = wrap(scope.drawDrill,'drawDrill');
  drawFinalePanel = wrap(scope.drawFinalePanel,'drawFinalePanel'); drawBubbles = wrap(scope.drawBubbles,'drawBubbles');

  S.mode = 'play'; S.introT = 0;
  const frames = [];
  const TOTAL = ${SECS} * 60, EVERY = Math.max(1, Math.floor(TOTAL / ${SAMPLES}));
  for (let i = 0; i < TOTAL && S.mode !== 'win' && S.mode !== 'lose'; i++) {
    update(1/60); devSolve();
    if (i % EVERY === 0) {
      const before = __prof.calls();
      draw();
      frames.push({ cam: S.cam, calls: __prof.calls() - before });
    }
  }
  frames.sort((a,b) => a.calls - b.calls);
  const at = p => frames[Math.min(frames.length-1, Math.floor(p*frames.length))];
  console.log('frames sampled: ' + frames.length + '  cam reached ' + S.cam.toFixed(0) + ' of ' + S.camMax);
  console.log('CANVAS CALLS PER FRAME   median ' + at(0.5).calls +
              '   p90 ' + at(0.9).calls + '   worst ' + frames[frames.length-1].calls +
              ' (cam ' + frames[frames.length-1].cam.toFixed(0) + ')');
  console.log('');
  console.log('per function, TOTAL calls over the run and mean per frame drawn:');
  const rows = Object.entries(tally).sort((a,b) => b[1].calls - a[1].calls);
  for (const [n, t] of rows) {
    if (!t.calls) continue;
    console.log('  ' + n.padEnd(18) + String(t.calls).padStart(9) + '   ' +
                (t.calls / Math.max(1, t.hits)).toFixed(0).padStart(6) + ' /call  x' + t.hits + ' calls');
  }
  console.log('');
  console.log('the expensive KINDS, total over the run:');
  const want = ['createLinearGradient','createRadialGradient','createPattern','getImageData',
                'putImageData','drawImage','set shadowBlur','set fillStyle','set strokeStyle','set font'];
  for (const k of Object.keys(__prof.kinds)) if (k.startsWith('set composite')) want.push(k);
  for (const k of want) if (__prof.kinds[k]) console.log('  ' + k.padEnd(26) + String(__prof.kinds[k]).padStart(10));
})();
`);
