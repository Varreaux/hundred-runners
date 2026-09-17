// How much road a player ACTUALLY gets at each room. Run `node tools/arm-check.js`.
//
// tools/room-check.js already scores keys against road, and it is not this: it reads the
// road out of `warn`, which is the FLOOR the arming rule may never go below. For most of
// the course the floor was never the binding constraint -- a room armed the moment it came
// on screen, which is further away than any default warn -- so room-check has been
// reporting the number the rule promises rather than the number the rule produces.
//
// That gap is exactly the "know which lines your green covers" trap. Change CFG.armReach
// and room-check does not move at all, because nothing it reads has changed. This drives a
// real run and records, for every room, where the lead runner was at the instant it armed.
//
// The seconds are road at CFG.scroll, and they are an UPPER bound on thinking time: the
// player also has to see the room, choose it and type it, and the pack is moving while
// they do. Do not quote them as difficulty.
const fs = require('fs'), path = require('path');
const target = process.argv[2] || path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(target, 'utf8').split('<script>')[1].split('</script>')[0].replace("'use strict';", '');

function makeCtx() {
  const grad = { addColorStop() {} };
  return {
    canvas: { width: 960, height: 540 },
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, setTransform() {}, clip() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    rect() {}, arc() {}, ellipse() {}, arcTo() {}, setLineDash() {}, fill() {}, stroke() {},
    fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, fillText() {}, strokeText() {},
    measureText: t => ({ width: String(t).length * 6 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => grad,
    getImageData: () => ({ data: new Uint8ClampedArray(256) }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(4 * (w || 8) * (h || 8)), width: w || 8, height: h || 8 }),
    putImageData() {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '', font: '', textAlign: '',
    globalAlpha: 1, globalCompositeOperation: '', shadowBlur: 0, shadowColor: '', filter: '',
  };
}
global.document = { getElementById: () => ({ getContext: makeCtx, width: 960, height: 540 }),
                    createElement: () => ({ getContext: makeCtx, width: 8, height: 8 }) };
// devSolve dispatches real KeyboardEvents, so the stub window needs both halves of the key
// path -- without them the bot solves nothing, the crowd dies in act one, and this reports
// on three rooms while looking like a clean run
let __kh = null;
global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
global.window = {
  addEventListener: (ev, fn) => { if (ev === 'keydown') __kh = fn; },
  dispatchEvent: e => { if (__kh) __kh({ key: e.key, repeat: false, preventDefault() {} }); },
};
global.performance = { now: () => 0 }; global.requestAnimationFrame = () => {};
global.location = { search: '' };
global.URLSearchParams = class { has() { return false } get() { return null } };
global.localStorage = { getItem: () => null, setItem() {} };
const { makeAudioMock } = require(path.join(__dirname, 'audio-mock.js'));
global.__audio = { nodes: 0, live: 0 };
global.window.AudioContext = makeAudioMock(global.__audio);

const api = (function () {
  return eval(src + ';({ CFG, S, V, startRun, update, devSolve, armRoom, VERBS })');
})();
const { CFG, VERBS } = api;

// Drive a run with the solving bot so the crowd actually reaches every act, and record the
// lead runner's position at the instant each room arms. Hooked rather than re-derived: the
// rule lives in one place and this reads the rule's own answer.
api.startRun();
const seen = new Map();
const frames = Math.round(60 * (api.S.camMax / CFG.scroll + 90));
for (let i = 0; i < frames; i++) {
  const before = new Set(api.S.rooms.filter(r => r.state === 'armed').map(r => r.x + ':' + r.lane));
  api.update(1 / 60);
  for (const room of api.S.rooms) {
    const key = room.x + ':' + room.lane;
    if (room.state !== 'armed' || before.has(key) || seen.has(key)) continue;
    let lead = -Infinity;
    for (const r of api.S.runners) if (r.state === 'run' && r.lane === room.lane) lead = Math.max(lead, r.x);
    if (lead === -Infinity) for (const r of api.S.runners) if (r.state === 'run') lead = Math.max(lead, r.x);
    seen.set(key, { room, gap: room.x - lead, zoom: api.V.zoom });
  }
  api.devSolve();
}

const rows = [...seen.values()].sort((a, b) => a.room.x - b.room.x);
console.log('arm-check -- road actually given, measured by driving a run\n');
console.log('  room           lane   warn    armed at   road    zoom   floor was binding');
let tightest = null;
for (const { room, gap, zoom } of rows) {
  const floor = room.warn || CFG.armDist;
  const binding = gap <= floor + 1;
  const secs = gap / CFG.scroll;
  if (!tightest || secs < tightest.secs) tightest = { room, secs, gap };
  console.log('  ' + room.type.padEnd(12) + String(room.lane).padStart(4) +
    String(floor).padStart(8) + gap.toFixed(0).padStart(11) +
    (secs.toFixed(2) + 's').padStart(8) + zoom.toFixed(2).padStart(7) +
    '   ' + (binding ? 'yes' : 'no'));
}
const missed = api.S.rooms.length - rows.length;
console.log('\n' + rows.length + ' of ' + api.S.rooms.length + ' rooms armed in this run' +
            (missed ? ' (' + missed + ' never reached: nobody came down that lane)' : ''));
if (tightest) console.log('tightest: ' + tightest.room.type + ' at ' + tightest.gap.toFixed(0) +
  ' units, ' + tightest.secs.toFixed(2) + 's of road');
console.log('\nCFG.armReach is ' + CFG.armReach + ' (0 = armed on sight, 1 = armed at the floor).');
console.log('These are road, not thinking time: the player still has to see it, choose it');
console.log('and type it, and the pack keeps moving while they do.');
