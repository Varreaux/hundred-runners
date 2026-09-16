// Does the music fire where Morgan asked it to, and does the bed take over exactly when the
// intro ends?
//
//   node tools/music-check.js
//
// The game guards every music call on `typeof Audio`, so the other headless tools see no
// music at all -- which is correct for them and means none of them cover this. This one
// stubs Audio, plays a run through the drill and the doors, and asserts the sequence:
//
//   1. nothing plays during the drill
//   2. the intro starts when the doors begin to open, once, not once per frame
//   3. the bed starts on the intro's `ended` event, and only then
//   4. the bed loops
//   5. M mutes both, and R puts the intro back to the start
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
  S.mode = 'intro'; S.introT = 0;
  const plays = () => log.filter(e => e[0] === 'play').length;

  // walk through the proprietor and the drill, escaping every panel
  for (let i = 0; i < 60 * 120 && S.mode !== 'play'; i++) {
    if (S.boss && !S.boss.gone) press(' ');
    if (S.drill && !S.drill.done && S.drill.phase === 'play') press('Escape');
    const doorsMoving = S.doorOpen > 0;
    if (!doorsMoving && plays() > 0) { ok('nothing plays before the doors move', false, 'played at doorOpen 0'); return; }
    update(1/60);
  }
  ok('nothing plays during the drill', true, 'checked every frame up to the doors');
  ok('the run started', S.mode === 'play');

  const introEl = MUSIC.intro, bedEl = MUSIC.bed;
  ok('both files were created', !!introEl && !!bedEl,
     introEl ? introEl.src + '  +  ' + bedEl.src : 'missing');
  ok('the intro plays when the doors open', log.some(e => e[0] === 'play' && /Intro/.test(e[1])));
  const introPlays = log.filter(e => e[0] === 'play' && /Intro/.test(e[1])).length;
  ok('the intro is started once, not once per frame', introPlays === 1, introPlays + ' play calls');
  ok('the bed has NOT started yet', !log.some(e => e[0] === 'play' && /Loop/.test(e[1])),
     'the bed must wait for the intro to end');
  ok('the bed is set to loop', bedEl.loop === true);

  // the handover: the intro's own ended event, which is the only thing that starts the bed
  introEl.fire('ended');
  ok('the bed starts the moment the intro ends', log.some(e => e[0] === 'play' && /Loop/.test(e[1])));

  // M mutes both
  press('M');
  ok('M mutes the music with the rest of the sound', introEl.muted && bedEl.muted,
     'intro ' + introEl.muted + ', bed ' + bedEl.muted);
  press('M');
  ok('M unmutes it again', !introEl.muted && !bedEl.muted);

  // R restarts the run, so the intro must be back at the top
  S.mode = 'lose';
  press('R');
  ok('R rewinds the music so the intro plays again', introEl.currentTime === 0 && introEl.paused,
     'currentTime ' + introEl.currentTime + ', paused ' + introEl.paused);
})();
`);
console.log('');
console.log(bad ? bad + ' check(s) failed.' : 'the music is wired where it was asked for.');
process.exit(bad ? 1 : 0);
