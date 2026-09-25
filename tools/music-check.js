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
    this.paused = false; this.ended = false; log.push(['play', this.src]); return Promise.resolve();
  }
  pause() { this.paused = true; log.push(['pause', this.src]); }
  // An element that ENDS stops and sits at its end, as a real one does; the mock used to leave
  // it "playing" at 0, which no browser does and which the victory's hand-back reads.
  fire(ev) { this.ended = ev === 'ended'; if (this.ended) { this.paused = true; this.currentTime = 9.9; } for (const f of this._on[ev] || []) f(); }
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
  ok('all the files were created', !!tutEl && !!introEl && !!bedEl && !!bossEl && !!alarmEl && !!MUSIC.victory,
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
  // THE ALARM FADES UNDER IT, it does not cut (Morgan, 2026-09-24): still sounding, quieter
  // each moment, and after MUSIC.FADE paused, rewound and BACK AT FULL VOLUME for next time
  const v0 = alarmEl.volume;
  ok('...and the alarm fades under it rather than cutting', !alarmEl.paused && v0 < MUSIC.VOL,
     'volume ' + v0.toFixed(3) + ' of ' + MUSIC.VOL);
  for (let i = 0; i < 30; i++) update(1/60);
  ok('...quieter each moment', !alarmEl.paused && alarmEl.volume < v0, v0.toFixed(3) + ' -> ' + alarmEl.volume.toFixed(3));
  for (let i = 0; i < 60 * MUSIC.FADE; i++) update(1/60);
  ok('...then stops, rewinds, and its volume is put back', alarmEl.paused && alarmEl.currentTime === 0 && alarmEl.volume === MUSIC.VOL && !MUSIC.fade,
     'volume ' + alarmEl.volume + ', ' + (alarmEl.paused ? 'paused' : 'playing'));
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

  // ---------------------------------------------------------------- R in the middle of the fade
  // The one way out of a fade that is not its own end. If it left the alarm at the volume it
  // had reached, the next run's alarm would play silent.
  // taught IN the lesson, as a player does -- finaleTeach during the speech sets a lesson the
  // charge never reads, and the room sat in 'charge' for the whole budget
  for (let i = 0; i < 60 * 60 && S.finale.phase === 'intro'; i++) update(1/60);
  update(1/60);
  finaleTeach(S.finale);
  for (let i = 0; i < 60 * 40 && S.finale.phase !== 'search'; i++) update(1/60);
  for (let i = 0; i < 20; i++) update(1/60);
  ok('mid-fade: the alarm is part way down', !!MUSIC.fade && alarmEl.volume < MUSIC.VOL && alarmEl.volume > 0,
     'volume ' + alarmEl.volume.toFixed(3) + ', phase ' + S.finale.phase + ', room ' + MUSIC.room + ', mode ' + S.mode + ', alarm ' + (alarmEl.paused ? 'paused' : 'playing'));
  press('P'); press('R');
  ok('R mid-fade puts the alarm back at full volume, stopped', !MUSIC.fade && alarmEl.paused && alarmEl.volume === MUSIC.VOL,
     'volume ' + alarmEl.volume + ', ' + (alarmEl.paused ? 'paused' : 'playing'));

  // ---------------------------------------------------------------- the tenth mark
  // Morgan, 2026-09-24: "a victory sound that you should play as soon as the player finds the
  // 10th difference and make the boss music fade out at the same time". Marked through
  // finaleConfirm, the function the lamp calls, at each difference's own position.
  const vicEl = MUSIC.victory;
  ok('the victory file was created, and plays once rather than looping', !!vicEl && !vicEl.loop);
  S.runners.slice(0, 20).forEach(r => { r.state = 'arrived'; });
  S.stats.arrived = 20; S.cam = S.camMax; updateView(1);
  startFinale();
  const g = S.finale;
  for (let i = 0; i < 60 * 60 && g.phase === 'intro'; i++) update(1/60);
  update(1/60); finaleTeach(g);
  for (let i = 0; i < 60 * 40 && g.phase !== 'search'; i++) update(1/60);
  for (let i = 0; i < 60 * 2; i++) update(1/60);   // past the alarm's own fade
  const bedV = played('bed'), vicV = played('victory');
  g.diffs.slice(0, CFG.finale.findCount - 1).forEach(d => finaleConfirm(d.x / FINALE_ART.w, d.y / FINALE_ART.h));
  update(1/60);
  ok('nine marks: still the boss loop, no victory', !bossEl.paused && played('victory') === vicV);
  const last = g.diffs[CFG.finale.findCount - 1];
  finaleConfirm(last.x / FINALE_ART.w, last.y / FINALE_ART.h);
  update(1/60);
  ok('the tenth mark: the victory plays, once', played('victory') === vicV + 1 && !vicEl.paused, played('victory') - vicV + ' play calls');
  ok('...and the boss loop fades under it rather than cutting', !bossEl.paused && bossEl.volume < MUSIC.VOL && MUSIC.fade && MUSIC.fade.a === bossEl,
     'boss volume ' + bossEl.volume.toFixed(3));
  for (let i = 0; i < 60 * (MUSIC.FADE + 0.2); i++) update(1/60);
  ok('...then stops, rewinds, and its volume is put back', bossEl.paused && bossEl.currentTime === 0 && bossEl.volume === MUSIC.VOL);
  // DRIVEN TO THE WIN, not assumed to be there. This used to run MUSIC.FADE + 0.2 = 1.7s past
  // the tenth mark and test for mode 'win'; the escape now puts 4.35s of leaving between the
  // two, so the assertion failed on a build where the music was fine. A length written down is
  // a fact about the thing being tested, and it goes stale the first time somebody changes it.
  for (let i = 0; i < 60 * 12 && S.mode !== 'win'; i++) update(1/60);
  ok('the win screen comes up under the victory, still playing', S.mode === 'win' && !vicEl.paused && played('bed') === bedV,
     'mode ' + S.mode + ', bed plays ' + bedV + ' -> ' + played('bed'));
  // THE BED IS CUED BY THE PICTURE, NOT BY THE FILE. It used to wait for the victory's ended
  // event -- but that file is 9.816s long and goes silent at 6.13s, so the wait was 3.69s of
  // trailing silence that no event reports, landing squarely over the start of the death
  // recap. Morgan asked for the music "as soon as they start showing the death vignettes",
  // which is REEL.at.
  ok('...and the bed is still held while the headline is up', S.endT < REEL.at && bedEl.paused,
     'endT ' + S.endT.toFixed(2) + ' of REEL.at ' + REEL.at);
  for (let i = 0; i < 60 * 3 && S.endT < REEL.at; i++) update(1/60);
  update(1/60);
  ok('the death recap takes the screen and the bed comes in with it',
     played('bed') === bedV + 1 && !bedEl.paused && bedEl.currentTime === 0,
     'at endT ' + S.endT.toFixed(2) + ', bed plays ' + bedV + ' -> ' + played('bed'));
  ok('...and the victory fades under it rather than cutting',
     MUSIC.fade && MUSIC.fade.a === vicEl && !vicEl.paused,
     MUSIC.fade ? 'fading, volume ' + vicEl.volume.toFixed(3) : 'no fade');
  for (let i = 0; i < 60 * (MUSIC.FADE + 0.2); i++) update(1/60);
  ok('...then the victory stops, rewinds, and its volume is put back',
     vicEl.paused && vicEl.currentTime === 0 && vicEl.volume === MUSIC.VOL);
  press('ARROWLEFT');
  ok('a key after it does not play the victory again', played('victory') === vicV + 1 && !bedEl.paused);
  press('R');
  ok('R after a win stops it all', vicEl.paused && bedEl.paused && bossEl.paused && MUSIC.room === null);
})();
`);
console.log('');
console.log(bad ? bad + ' check(s) failed.' : 'the music is wired where it was asked for.');
process.exit(bad ? 1 : 0);
