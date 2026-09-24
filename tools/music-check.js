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
//   6. the last room: its own loop comes in on the frame the lesson window opens and the
//      crew steps onto the belt -- not under the proprietor's speech -- plays once, loops,
//      survives an M without the bed starting under it, and hands back to the bed when the
//      room ends
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
global.Audio = class {
  constructor(src) {
    this.src = src; this.paused = true; this.currentTime = 0; this.ended = false;
    this.loop = false; this.muted = false; this.volume = 1; this._on = {};
    log.push(['new', src]);
  }
  addEventListener(ev, fn) { (this._on[ev] = this._on[ev] || []).push(fn); }
  play() { this.paused = false; log.push(['play', this.src]); return Promise.resolve(); }
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

  const tutEl = MUSIC.tut, introEl = MUSIC.intro, bedEl = MUSIC.bed, bossEl = MUSIC.boss;
  ok('all four files were created', !!tutEl && !!introEl && !!bedEl && !!bossEl,
     Object.keys(MUSIC.SRC).map(k => k + (MUSIC[k] ? '' : ' MISSING')).join(', '));
  if (!tutEl || !introEl || !bedEl || !bossEl) return;
  ok('the intro plays when the run starts, once', played('intro') === 1, played('intro') + ' play calls');
  ok('the tutorial loop stopped when the run started', tutEl.paused);
  ok('the bed has NOT started yet', played('bed') === 0, 'the bed must wait for the intro to end');
  ok('the bed is set to loop', bedEl.loop === true);

  // the handover: the intro's own ended event, which is the only thing that starts the bed
  introEl.fire('ended');
  ok('the bed starts the moment the intro ends', played('bed') === 1 && !bedEl.paused);

  press('M');
  ok('M mutes the music with the rest of the sound', [tutEl, introEl, bedEl, bossEl].every(a => a.muted));
  press('M');
  ok('M unmutes it again', [tutEl, introEl, bedEl, bossEl].every(a => !a.muted));

  // ---------------------------------------------------------------- the last room
  // Reached the way ?finale reaches it: the crew arrives and the room starts.
  S.runners.slice(0, 20).forEach(r => { r.state = 'arrived'; });
  S.stats.arrived = 20; S.cam = S.camMax; updateView(1);
  startFinale();
  const f = S.finale;
  let spokeT = 0;
  for (let i = 0; i < 60 * 60 && f.phase === 'intro'; i++) {
    update(1/60);
    if (S.boss && !S.boss.gone) spokeT += 1/60;
    if (f.phase === 'intro' && played('boss') > 0) { ok('the boss loop waits for the speech to end', false, 'played at introT ' + f.introT.toFixed(2)); return; }
  }
  ok('the proprietor spoke over the run\\'s music, not the boss loop', spokeT > 1 && played('boss') === 0 && !bedEl.paused,
     'spoke ' + spokeT.toFixed(1) + 's, bed ' + (bedEl.paused ? 'paused' : 'playing'));
  ok('the room left its intro', f.phase === 'charge', 'phase ' + f.phase);
  // follow() reads the phase at the top of update(), so it sees the change on the next frame
  update(1/60);
  ok('the boss loop starts as the lesson opens and the crew boards',
     played('boss') === 1 && !bossEl.paused && !!f.lesson && f.deck.length > 0,
     'boss plays ' + played('boss') + ', lesson ' + (f.lesson ? 'up' : 'NOT up') + ', ' + f.deck.length + ' on the belt');
  ok('the bed stopped under it', bedEl.paused);
  ok('the boss loop is set to loop', bossEl.loop === true);
  for (let i = 0; i < 120; i++) update(1/60);
  ok('the boss loop is started once, not once per frame', played('boss') === 1, played('boss') + ' play calls');

  // M in the room: unmuting must bring back the boss loop, and must NOT start the bed -- the
  // intro has ended and the bed is paused, which is exactly what the old unmute branch reads
  // as "start the bed"
  const bedPlays = played('bed');
  press('M'); bossEl.pause();                     // as if it had been muted before its cue
  press('M');
  ok('unmuting in the room brings the boss loop back, and not the bed', !bossEl.paused && played('bed') === bedPlays,
     'boss ' + (bossEl.paused ? 'paused' : 'playing') + ', bed plays ' + bedPlays + ' -> ' + played('bed'));

  // the room ends: teach the lesson, reach the search, and run the clock out
  finaleTeach(f);
  for (let i = 0; i < 60 * 40 && f.phase !== 'search'; i++) update(1/60);
  ok('the room reached its search', f.phase === 'search', 'phase ' + f.phase);
  ok('the boss loop is still the one playing in the search', !bossEl.paused && bedEl.paused);
  f.searchT = 0.01;
  for (let i = 0; i < 60 * 5 && S.mode === 'finale'; i++) update(1/60);
  update(1/60);
  ok('the room ended', S.mode === 'lose' || S.mode === 'win', 'mode ' + S.mode);
  ok('the boss loop stops and rewinds when the room ends', bossEl.paused && bossEl.currentTime === 0);
  ok('the end screen gets the bed back, from the top', played('bed') === bedPlays + 1 && !bedEl.paused && bedEl.currentTime === 0,
     'bed plays ' + played('bed') + ', ' + (bedEl.paused ? 'paused' : 'playing'));

  // ---------------------------------------------------------------- R
  press('R');
  ok('R rewinds the music so the intro plays again', introEl.currentTime === 0 && introEl.paused,
     'currentTime ' + introEl.currentTime + ', paused ' + introEl.paused);
  ok('R stops the bed and the boss loop', bedEl.paused && bossEl.paused && !MUSIC.bossOn);
  const bedAfter = played('bed'), bossAfter = played('boss');
  for (let i = 0; i < 60; i++) update(1/60);
  ok('nothing from the last room follows R home', played('bed') === bedAfter && played('boss') === bossAfter,
     'bed ' + bedAfter + ' -> ' + played('bed') + ', boss ' + bossAfter + ' -> ' + played('boss'));

  // AND R FROM PAUSE, INSIDE THE ROOM, which is the case that needs stop() to clear bossOn.
  // From the end screen the room has already let go of the music, so the assertion above
  // passes with or without it -- a falsifier that removed the line came back green, which is
  // how this second route was found to be missing.
  S.runners.slice(0, 20).forEach(r => { r.state = 'arrived'; });
  S.stats.arrived = 20; S.cam = S.camMax; updateView(1);
  startFinale();
  for (let i = 0; i < 60 * 60 && S.finale.phase === 'intro'; i++) update(1/60);
  update(1/60);
  ok('back in the room, the boss loop is playing', MUSIC.bossOn && !bossEl.paused, 'phase ' + S.finale.phase);
  press('P');
  ok('P pauses in the room', !!S.paused);
  press('R');
  const bedR = played('bed'), bossR = played('boss');
  for (let i = 0; i < 60; i++) update(1/60);
  ok('R from pause in the room leaves no music behind', played('bed') === bedR && played('boss') === bossR && bossEl.paused && bedEl.paused,
     'bed ' + bedR + ' -> ' + played('bed') + ', boss ' + (bossEl.paused ? 'paused' : 'playing') + ', mode ' + S.mode);
})();
`);
console.log('');
console.log(bad ? bad + ' check(s) failed.' : 'the music is wired where it was asked for.');
process.exit(bad ? 1 : 0);
