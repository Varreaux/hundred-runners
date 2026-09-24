// Does the music fire where Morgan asked it to, and does the bed take over exactly when the
// intro ends?
//
//   node tools/music-check.js
//
// The game guards every music call on `typeof Audio`, so the other headless tools see no
// music at all -- which is correct for them and means none of them cover this. This one
// stubs Audio, plays a run through the drill and the doors, and asserts the sequence:
//
//   1. the tutorial loop starts with the opening, and nothing else plays before the run
//   2. the intro starts when the run does, once, not once per frame, ending the tutorial loop
//   3. the bed starts on the intro's `ended` event, and only then
//   4. the bed loops
//   5. M mutes every track
//   6. the last room: the run's music stops the moment it begins and the ALARM loops under
//      the proprietor's speech and the whole of the lesson; the boss loop takes over on the
//      frame the lesson hands over to the real room, once, loops, survives an M without the
//      bed starting under it, and hands back to the bed when the room ends (Morgan,
//      2026-09-24: "kill the music when we enter the final boss room and play this alarm
//      sound until the boss music starts playing at the end of the final tutorial")
//   7. R puts everything back to the start, and nothing from the last room follows it home
//
// IT HAD BEEN FAILING FOR A WEEK, and failing in a way that read as a broken game: "the run
// started" FAIL, then a TypeError. Three things had moved under it. The doors wait for the 1
// key since BUILD 152, so the run never began; it entered the opening by writing S.mode
// rather than through beginIntro, so the tutorial loop -- which plays during the drill BY
// DESIGN since 2026-09-17 -- was never cued, and "nothing plays during the drill" passed
// about a track that could not start; and /Loop/ matched the tutorial loop and the bed alike.
// Tracks are now named by their MUSIC.SRC entry, never by a word in a filename.
//
// The point of stubbing rather than timing: the handover is an event, so a test that waited
// 16 seconds would be asserting the file's length rather than the wiring.
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

const log = [];
// A real browser REFUSES play() until the page has been interacted with. BLOCKED makes the mock
// do the same -- rejects, and stays paused -- for the one scenario about it at the end.
let BLOCKED = false;
global.Audio = class {
  constructor(src) {
    this.src = src; this.paused = true; this.currentTime = 0; this.ended = false;
    this.loop = false; this.muted = false; this.volume = 1; this._on = {};
    log.push(['new', src]);
  }
  addEventListener(ev, fn) { (this._on[ev] = this._on[ev] || []).push(fn); }
  play() {
    if (BLOCKED) { log.push(['refused', this.src]); return Promise.reject(new Error('NotAllowedError')); }
    this.paused = false; log.push(['play', this.src]); return Promise.resolve();
  }
  pause() { this.paused = true; log.push(['pause', this.src]); }
  fire(ev) { this.ended = ev === 'ended'; for (const f of this._on[ev] || []) f(); }
};

let bad = 0;
const ok = (name, pass, detail) => { if (!pass) bad++; console.log((pass ? 'ok  ' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : '')); };

eval(src + `
;(function(){
  const press = k => KD({ key: k, repeat: false, preventDefault(){} });
  const is = (e, k) => e[1] === MUSIC.SRC[k];
  const played = k => log.filter(e => e[0] === 'play' && is(e, k)).length;
  const others = k => Object.keys(MUSIC.SRC).filter(x => x !== k).reduce((n, x) => n + played(x), 0);

  // ---------------------------------------------------------------- the opening
  beginIntro();                                   // the one way in, which is where tut is cued
  ok('the tutorial loop starts with the opening', played('tut') === 1, played('tut') + ' play calls');
  // walk through the proprietor, the drill (escaping every panel) and the doors (their 1)
  for (let i = 0; i < 60 * 120 && S.mode !== 'play'; i++) {
    if (S.boss && !S.boss.gone) press(' ');
    if (S.drill && !S.drill.done && S.drill.phase === 'play') press('Escape');
    if (doorWaiting()) press(DOOR_HOTKEY);
    if (S.mode === 'intro' && others('tut') > 0) { ok('nothing but the tutorial loop plays before the run', false, 'at introT ' + S.introT.toFixed(2)); return; }
    update(1/60);
  }
  ok('nothing but the tutorial loop plays before the run', true, 'checked every frame of the opening');
  ok('the run started', S.mode === 'play', 'mode ' + S.mode);

  const tutEl = MUSIC.tut, introEl = MUSIC.intro, bedEl = MUSIC.bed, bossEl = MUSIC.boss, alarmEl = MUSIC.alarm;
  ok('all five files were created', !!tutEl && !!introEl && !!bedEl && !!bossEl && !!alarmEl,
     Object.keys(MUSIC.SRC).map(k => k + (MUSIC[k] ? '' : ' MISSING')).join(', '));
  if (!tutEl || !introEl || !bedEl || !bossEl || !alarmEl) return;
  ok('the intro plays when the run starts, once', played('intro') === 1, played('intro') + ' play calls');
  ok('the tutorial loop stopped when the run started', tutEl.paused);
  ok('the bed has NOT started yet', played('bed') === 0, 'the bed must wait for the intro to end');
  ok('the bed is set to loop', bedEl.loop === true);

  // the handover: the intro's own ended event, which is the only thing that starts the bed
  introEl.fire('ended');
  ok('the bed starts the moment the intro ends', played('bed') === 1 && !bedEl.paused);

  press('M');
  ok('M mutes the music with the rest of the sound', [tutEl, introEl, bedEl, bossEl, alarmEl].every(a => a.muted));
  press('M');
  ok('M unmutes it again', [tutEl, introEl, bedEl, bossEl, alarmEl].every(a => !a.muted));

  // ---------------------------------------------------------------- the last room
  // Reached the way ?finale reaches it: the crew arrives and the room starts.
  S.runners.slice(0, 20).forEach(r => { r.state = 'arrived'; });
  S.stats.arrived = 20; S.cam = S.camMax; updateView(1);
  const bedBefore = played('bed');
  startFinale();
  const f = S.finale;
  // follow() reads the room at the top of update(), so it sees each change on the next frame
  update(1/60);
  ok('entering the room kills the run\\'s music', bedEl.paused && introEl.paused && tutEl.paused);
  ok('...and starts the alarm, once', played('alarm') === 1 && !alarmEl.paused, played('alarm') + ' play calls');
  ok('the alarm is set to loop', alarmEl.loop === true);
  let spokeT = 0;
  for (let i = 0; i < 60 * 60 && f.phase === 'intro'; i++) {
    update(1/60);
    if (S.boss && !S.boss.gone) spokeT += 1/60;
  }
  ok('the proprietor spoke over the alarm, not the bed or the boss loop',
     spokeT > 1 && !alarmEl.paused && bedEl.paused && played('boss') === 0 && played('bed') === bedBefore,
     'spoke ' + spokeT.toFixed(1) + 's, alarm ' + (alarmEl.paused ? 'paused' : 'playing') + ', boss plays ' + played('boss'));
  update(1/60);                                   // the lesson is built on the charge's first frame
  ok('the room reached its lesson', f.phase === 'charge' && !!f.lesson, 'phase ' + f.phase + ', lesson ' + (f.lesson ? 'up' : 'not up'));
  for (let i = 0; i < 60 * 4; i++) update(1/60);
  ok('the alarm carries on through the lesson, and the boss loop waits', !alarmEl.paused && played('boss') === 0 && played('alarm') === 1,
     'alarm ' + (alarmEl.paused ? 'paused' : 'playing') + ', ' + played('alarm') + ' alarm plays, boss plays ' + played('boss'));

  // M during the alarm: unmuting brings the alarm back and NOT the bed -- the intro has ended
  // and the bed is paused, which is exactly what the old unmute branch reads as "start the bed"
  const bedPlays = played('bed');
  press('M'); alarmEl.pause();                    // as if it had been muted before its cue
  press('M');
  ok('unmuting under the alarm brings the alarm back, not the bed', !alarmEl.paused && played('bed') === bedPlays);

  // solve the lesson: the boss loop comes in on the frame the real room opens, and not before
  finaleTeach(f);
  let early = 0;
  for (let i = 0; i < 60 * 40 && f.phase !== 'search'; i++) { update(1/60); if (f.phase === 'charge' && played('boss') > 0) early++; }
  ok('the boss loop waits for the lesson to END, not merely be solved', early === 0, early + ' frames early');
  ok('the room reached its search', f.phase === 'search', 'phase ' + f.phase);
  update(1/60);
  ok('the boss loop starts as the lesson hands over, once', played('boss') === 1 && !bossEl.paused, played('boss') + ' play calls');
  ok('...and the alarm stops and rewinds', alarmEl.paused && alarmEl.currentTime === 0);
  ok('the boss loop is set to loop', bossEl.loop === true);
  for (let i = 0; i < 120; i++) update(1/60);
  ok('the boss loop is started once, not once per frame', played('boss') === 1, played('boss') + ' play calls');
  press('M'); bossEl.pause(); press('M');
  ok('unmuting in the search brings the boss loop back, and not the bed', !bossEl.paused && played('bed') === bedPlays);

  // the room ends: run the clock out
  f.searchT = 0.01;
  for (let i = 0; i < 60 * 5 && S.mode === 'finale'; i++) update(1/60);
  update(1/60);
  ok('the room ended', S.mode === 'lose' || S.mode === 'win', 'mode ' + S.mode);
  ok('the boss loop stops and rewinds when the room ends', bossEl.paused && bossEl.currentTime === 0 && alarmEl.paused);
  ok('the end screen gets the bed back, from the top', played('bed') === bedPlays + 1 && !bedEl.paused && bedEl.currentTime === 0,
     'bed plays ' + played('bed') + ', ' + (bedEl.paused ? 'paused' : 'playing'));

  // ---------------------------------------------------------------- R
  press('R');
  ok('R rewinds the music so the intro plays again', introEl.currentTime === 0 && introEl.paused,
     'currentTime ' + introEl.currentTime + ', paused ' + introEl.paused);
  ok('R stops the bed, the alarm and the boss loop', bedEl.paused && bossEl.paused && alarmEl.paused && MUSIC.room === null);
  const bedAfter = played('bed'), bossAfter = played('boss');
  for (let i = 0; i < 60; i++) update(1/60);
  ok('nothing from the last room follows R home', played('bed') === bedAfter && played('boss') === bossAfter,
     'bed ' + bedAfter + ' -> ' + played('bed') + ', boss ' + bossAfter + ' -> ' + played('boss'));

  // AND R FROM PAUSE, INSIDE THE ROOM, which is the case that needs stop() to clear the room.
  // From the end screen the room has already let go of the music, so the assertion above
  // passes with or without it -- a falsifier that removed the line came back green, which is
  // how this second route was found to be missing. Taken under the alarm, the longer state.
  S.runners.slice(0, 20).forEach(r => { r.state = 'arrived'; });
  S.stats.arrived = 20; S.cam = S.camMax; updateView(1);
  startFinale();
  for (let i = 0; i < 60 * 3; i++) update(1/60);
  ok('back in the room, the alarm is playing', MUSIC.room === 'alarm' && !alarmEl.paused, 'phase ' + S.finale.phase);
  press('P');
  ok('P pauses in the room', !!S.paused);
  press('R');
  const bedR = played('bed'), bossR = played('boss'), alarmR = played('alarm');
  for (let i = 0; i < 60; i++) update(1/60);
  ok('R from pause in the room leaves no music behind',
     played('bed') === bedR && played('boss') === bossR && played('alarm') === alarmR && alarmEl.paused && bossEl.paused && bedEl.paused,
     'bed ' + bedR + ' -> ' + played('bed') + ', alarm ' + (alarmEl.paused ? 'paused' : 'playing') + ', mode ' + S.mode);

  // ---------------------------------------------------------------- a link straight in
  // Morgan, 2026-09-24: "?finale&crew=30 ... when i try using this to here the alarm it does
  // not work". The browser refused the cue because nothing had been pressed yet, the cue's
  // .catch swallowed the refusal, and nothing ever asked again. Here every play() is refused
  // until a key is pressed, which is what the browser does; the first key must bring it in.
  MUSIC.stop();
  BLOCKED = true;
  S.runners.slice(0, 20).forEach(r => { r.state = 'arrived'; });
  S.stats.arrived = 20; S.cam = S.camMax; updateView(1);
  startFinale();
  for (let i = 0; i < 30; i++) update(1/60);
  ok('a room entered before any key: the browser refuses the alarm', MUSIC.room === 'alarm' && alarmEl.paused,
     log.filter(e => e[0] === 'refused').length + ' refusals');
  BLOCKED = false;
  press('ARROWLEFT');
  ok('the first key asks again, and the alarm plays', !alarmEl.paused && bedEl.paused && bossEl.paused);
})();
`);
console.log('');
console.log(bad ? bad + ' check(s) failed.' : 'the music is wired where it was asked for.');
process.exit(bad ? 1 : 0);
