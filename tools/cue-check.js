// WHEN does the music actually start? -- node tools/cue-check.js [path-to-checkout]
//
// The music module is invisible to every other instrument we have. The headless tools stub
// `window` and `document` and have no `Audio` at all, so MUSIC.make() returns null, every
// method early-returns, and the whole module runs ZERO LINES while reporting green. That is
// exactly how the intro came to fire under the proprietor's first line and stayed that way
// through a build: probe was green, the harness was green, and neither had executed a single
// line of the thing that was wrong. Same shape as the audio mock's reason for existing --
// a stub that cannot fail is not evidence.
//
// So this installs a RECORDING Audio stub, walks the whole opening (delivery, the
// proprietor's speech, the drill, the doors, the run) and prints the state of the world at
// the moment each file is first asked to play. It answers one question the others cannot:
// not "does it play" but "what was on screen when it started".
//
// The cue belongs in startRun(). It used to sit in updateIntro's door block guarded on
// `S.introT >= gather`, which is true from the frame the proprietor STARTS speaking --
// he is started on that same frame and only then freezes the clock. doorOpen stayed 0, so
// nothing looked wrong in the source or in a still, and the comment above it said "the
// doors beginning to move is the cue" while the doors had not moved.
//
// Proved able to fail: run it against a checkout from before that fix and it reports
// `proprietor=SPEAKING` with doors at 0.014 and a BAD verdict.
const fs = require('fs'), path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(root, 'tools', 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", "path.join(root,'tools','audio-mock.js')"));

const PLAYS = [];
let describe = () => ({});

global.Audio = class {
  constructor(src) {
    this.src = src; this.preload = ''; this.volume = 1; this.loop = false;
    this.muted = false; this.paused = true; this.ended = false; this.currentTime = 0;
    this._on = {};
  }
  addEventListener(ev, fn) { (this._on[ev] = this._on[ev] || []).push(fn); }
  play() { this.paused = false; PLAYS.push({ src: this.src, at: describe() }); return Promise.resolve(); }
  pause() { this.paused = true; }
};
global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
let __kh = null;
global.window.addEventListener = (ev, fn) => { if (ev === 'keydown') __kh = fn; };
global.window.dispatchEvent = e => { if (__kh) __kh({ key: e.key, repeat: false, preventDefault() {} }); };
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

eval(src + `
;(function(){
  describe = () => ({
    mode: S.mode,
    introT: +S.introT.toFixed(2),
    doorOpen: +S.doorOpen.toFixed(3),
    boss: S.boss ? (S.boss.gone ? 'gone' : 'SPEAKING') : 'none',
    drill: S.drill ? (S.drill.done ? 'done' : 'RUNNING') : 'none',
    walkers: S.runners.filter(r => !r.onBelt).length,
  });

  reset(); S.mode = 'intro'; S.introT = 0;

  const log = [];
  let sawBoss = false, sawDrill = false, playsAtBoss = null, playsAtDrill = null;

  // The length is DERIVED from the opening's own clock, not written down: a longer
  // delivery or settle must not silently shorten this walk. 90s of headroom over it.
  const frames = 60 * (CFG.intro.deliver + CFG.intro.settle + CFG.intro.open + CFG.intro.hold + 90);
  for (let i = 0; i < frames && S.mode === 'intro'; i++) {
    update(1/60);
    if (S.boss && !S.boss.gone) {
      if (!sawBoss) { sawBoss = true; log.push('proprietor starts speaking at introT ' + S.introT.toFixed(2)); }
      if (i % 30 === 0) { if (playsAtBoss === null) playsAtBoss = PLAYS.length; bossAdvance(); }
    }
    if (S.drill && !S.drill.done) {
      if (!sawDrill) { sawDrill = true; playsAtDrill = PLAYS.length; log.push('drill starts at introT ' + S.introT.toFixed(2)); }
      if (i % 20 === 0) drillSolved();
    }
  }
  log.push('opening ended with mode=' + S.mode);

  console.log(log.map(l => '  ' + l).join('\\n'));
  console.log('');
  console.log('  plays while the proprietor was still speaking: ' + (playsAtBoss === null ? 'n/a' : playsAtBoss));
  console.log('  plays by the time the drill began:             ' + (playsAtDrill === null ? 'n/a' : playsAtDrill));
  console.log('');
  if (!PLAYS.length) console.log('  NOTHING EVER PLAYED -- the stub was not reached, which is a bug in this tool');
  PLAYS.forEach((p, i) => {
    const a = p.at;
    console.log('  play #' + (i+1) + '  ' + decodeURIComponent(p.src));
    console.log('        mode=' + a.mode + '  introT=' + a.introT + '  doors=' + a.doorOpen
      + '  proprietor=' + a.boss + '  drill=' + a.drill + '  walking=' + a.walkers);
  });
  const first = PLAYS[0];
  console.log('');
  let bad = true;
  if (!first) console.log('  VERDICT: no cue fired at all');
  else if (first.at.boss === 'SPEAKING') console.log('  VERDICT: BAD -- music starts under the proprietor');
  else if (first.at.drill === 'RUNNING') console.log('  VERDICT: BAD -- music starts during the drill');
  else if (first.at.mode === 'play') { console.log('  VERDICT: GOOD -- music starts as the crowd moves forward'); bad = false; }
  else console.log('  VERDICT: music starts in mode ' + first.at.mode + ', doors ' + first.at.doorOpen);
  process.exitCode = bad ? 1 : 0;
})();
`);
