// Can a held mini-game ever be left holding a key nobody is pressing?
//
//   node tools/hold-check.js
//
// The bug this guards, found by the logic pass on the mantrap and fixed in build 110: keyup
// used to be dispatched to S.active alone. Grip the mantrap, press another room's hotkey, let
// go -- and the keyup arrives while a different room is selected, so nothing clears the flag.
// update() runs only the selected room's verb, so the gauge does not even run on to its own
// bite; it freezes mid-bar. Re-open the room and it reads HOLDING with a needle standing
// where it stopped and no key down, and the next SPACE resolves that stale gauge and scores a
// verdict on an act nobody performed -- a free banked pull if it froze inside the band.
//
// It takes two armed rooms to reach, which is why no bot and no screenshot found it: both
// bots commit to one room at a time.
//
// WHY THIS IS A BEHAVIOUR CHECK AND NOT A GREP. The listener is shared -- build 111 added an
// unconditional HELD clear at the top of it for the last room's lamp, merged above this
// sweep. Both halves being PRESENT in the source and both halves WORKING are two different
// claims, and only one of them can be made by looking. This drives the real keydown and keyup
// handlers and then reads the mini-game state.
const fs = require('fs'), path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(__dirname, 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", "path.join(" + JSON.stringify(__dirname) + ",'audio-mock.js')"));
global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
let KD = null, KU = null;
global.window.addEventListener = (ev, fn) => { if (ev === 'keydown') KD = fn; if (ev === 'keyup') KU = fn; };
global.window.dispatchEvent = () => {};
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

eval(src + `
;(function(){
  const dt = 1/60, fails = [], press = k => KD({ key: k, repeat: false, preventDefault(){} });
  const lift_ = k => KU({ key: k, repeat: false, preventDefault(){} });

  // Every verb that declares takesHold, so a new one cannot be added without being covered.
  const HOLDERS = Object.keys(VERBS).filter(v => VERBS[v].takesHold);
  console.log('hold verbs: ' + HOLDERS.join(', '));
  console.log('');

  for (const verb of HOLDERS) {
    // Two rooms of the right kinds, armed together and given hotkeys, which is the only
    // configuration that reaches this. Built through armRoom so the mg is the real one:
    // setting state by hand gives a room with a null mg and the panel throws on it.
    S.mode = 'play'; S.active = null;
    const mine = S.rooms.find(r => r.verb === verb);
    const other = S.rooms.find(r => r.verb !== verb && r !== mine);
    if (!mine || !other) { fails.push('could not find two rooms to test ' + verb); continue; }
    for (const r of [mine, other]) { r.state = 'dormant'; r.hot = null; r.mg = null; armRoom(r); }
    if (!mine.mg || !other.mg) { fails.push(verb + ': armRoom did not build a mini-game'); continue; }

    // select mine, take hold
    press(String(mine.hot));
    press(' ');
    for (let i = 0; i < 20; i++) update(dt);
    const heldNow = mine.mg.holding || mine.mg.pulling || mine.mg.paying;
    if (!heldNow) { fails.push(verb + ': SPACE did not take hold, so this test proves nothing'); continue; }

    // walk away to the other room, THEN let the key up
    press(String(other.hot));
    lift_(' ');
    for (let i = 0; i < 20; i++) update(dt);

    const stuck = mine.mg.holding || mine.mg.pulling || mine.mg.paying;
    console.log('  ' + verb.padEnd(7) + ' took hold, switched to ' + other.verb.padEnd(11) +
                ' released -> ' + (stuck ? 'STILL HOLDING' : 'let go'));
    if (stuck) fails.push(verb + ' is still holding a key nobody is pressing, after the panel was left');
  }

  console.log('');
  if (fails.length) fails.forEach(f => console.log('  VERDICT: BAD -- ' + f));
  else console.log('  VERDICT: GOOD -- a keyup reaches every room that could be holding');
  process.exitCode = fails.length ? 1 : 0;
})();
`);
