// Does SPACE move the proprietor on, wherever he speaks?
//
//   node tools/boss-skip-check.js [path/to/checkout]
//
// Morgan, 2026-09-24: "the boss dialogue is not skipable with space like all the other times
// the boss talks". The yard and the cave door always waited for SPACE; the three speeches on
// his own clock -- the hills, the speed-up line, and the last room -- ignored it. Now SPACE
// moves every one of them on, and the clock ones still run by themselves if nobody presses.
//
// Each clock speech is timed twice through the REAL keydown handler: left alone, and with
// SPACE pressed every 0.3s the way a player taps through. Pressed must end it in well under
// the time it takes alone. And the one case where SPACE is NOT his: on the road with a room
// panel open, it belongs to the room, so he must not move.
const fs = require('fs'), path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(__dirname, 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", JSON.stringify(path.join(__dirname, 'audio-mock.js'))));
global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
let KD = null;
global.window.addEventListener = (ev, fn) => { if (ev === 'keydown') KD = fn; };
global.window.dispatchEvent = () => {};
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

let bad = 0;
const ok = (name, pass, detail) => { if (!pass) bad++; console.log((pass ? 'ok  ' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : '')); };

eval(src + `
;(function(){
  const dt = 1 / 60;
  const press = k => KD({ key: k, repeat: false, preventDefault() {} });
  // run until done() is true, tapping SPACE every 0.3s if tap; returns seconds taken
  const time = (done, tap) => {
    let t = 0, next = 0.3;
    for (let i = 0; i < 60 * 90 && !done(); i++) {
      if (tap && t >= next) { press(' '); next += 0.3; }
      update(dt); t += dt;
    }
    return done() ? t : Infinity;
  };
  const verdict = (name, alone, tapped) =>
    ok(name, tapped < alone * 0.6, 'alone ' + alone.toFixed(1) + 's, tapping ' + tapped.toFixed(1) + 's');

  // ---- the last room: from the first line to the lesson
  const toFinale = () => {
    reset(); startRun();
    S.runners.slice(0, 20).forEach(r => { r.state = 'arrived'; });
    S.stats.arrived = 20; S.cam = S.camMax; updateView(1);
    startFinale();
    for (let i = 0; i < 60 * 10 && !(S.boss && !S.boss.gone && S.boss.script === BOSS_FINALE); i++) update(dt);
  };
  toFinale();
  const lessonAlone = time(() => S.finale.phase !== 'intro', false);
  toFinale();
  const said = S.boss && S.boss.script === BOSS_FINALE;
  const lessonTapped = time(() => S.finale.phase !== 'intro', true);
  ok('the last room: he was speaking when the taps began', said);
  verdict('the last room: SPACE moves him on', lessonAlone, lessonTapped);
  update(dt);
  ok('...and the taps during his speech marked nothing in the lesson', !S.finale.lesson || !S.finale.lesson.done);

  // ---- the road: the hills and the speed-up, both on his own clock
  for (const [name, script] of [['the hills', BOSS_OPEN], ['the speed-up line', BOSS_SPEED]]) {
    const start = () => { reset(); startRun(); S.active = null; startBoss(script, true, null); };
    start(); const alone = time(() => S.boss.gone, false);
    start(); const tapped = time(() => S.boss.gone, true);
    verdict(name + ': SPACE moves him on', alone, tapped);
  }

  // ---- but not while a room is open: SPACE is the room's then
  reset(); startRun();
  const room = S.rooms.slice().sort((a, b) => a.x - b.x)[0];
  armRoom(room); S.active = room;
  startBoss(BOSS_OPEN, true, null);
  for (let i = 0; i < 30; i++) update(dt);
  const b = S.boss, before = b.line + ':' + b.ch.toFixed(2);
  for (let i = 0; i < 8; i++) press(' ');
  ok('with a room open, SPACE goes to the room and he does not move', S.active === room && b.line + ':' + b.ch.toFixed(2) === before,
     'line:char ' + before + ' -> ' + b.line + ':' + b.ch.toFixed(2));
})();
`);
console.log('');
console.log(bad ? bad + ' check(s) failed.' : 'SPACE moves him on wherever he speaks, and never takes it from an open room.');
process.exit(bad ? 1 : 0);
