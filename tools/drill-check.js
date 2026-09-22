// The drill: does it complete, and how long does it take?
//
//   node tools/drill-check.js [presses-per-second]      (default 4)
//
// The drill is the run-through of one of every kind of room that happens between the
// shift assembling at the doors and the doors opening. It is the answer to a measured
// problem: a room's usable window is 0.36 * V.vw ahead of the crowd -- 3.13s at zoom 1 --
// and every one of those budgets is an EXPERT's, with no allowance for meeting the puzzle
// for the first time. The drill is where that reading happens, with nobody on the road.
//
// Why this needs its own tool. tools/probe.js presses no keys, so it reaches the drill's
// FIRST panel and stops there for ever -- "no exception" from it is a verdict on one of
// eleven panels and on none of the state machine. This drives every type through the real
// keydown/keyup handlers, draws every frame, and then checks the run actually starts.
//
// What it reports:
//   - an exception out of update() or draw(), with which type was on screen
//   - per-type time to solve, and the total: the FLOOR, since the driver already knows
//     the answer. A player meeting these for the first time is two to four times slower,
//     which is the entire point of the drill and must not be read as its real length.
//   - whether every type was reached, and whether the doors opened afterwards
const fs = require('fs'), path = require('path');
// argv: [rate] [skip] [root] in any order after the script; `skip` is a flag, not a path.
// Passing a root is how the midline assertion below was PROVED to fail rather than merely
// seen to pass: run it against a copy whose drawDrill scales about dTop instead of
// DRILL_MID and all eleven panels report MIDLINE OFF BY 25.5 to 37.1.
const root = process.argv.slice(2).find(a => a !== 'skip' && isNaN(+a)) || path.join(__dirname, '..');
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
// the NUMERIC argument, wherever it sits. argv[2] blindly made the documented "in any
// order" contract a lie the moment a root was passed first: the path parsed as NaN, the
// driver pressed nothing, and the run reported "reached 0 of 11 types" -- which reads as a
// broken game rather than as a broken argument.
const RATE = +(process.argv.slice(2).find(a => a !== '' && !isNaN(+a)) || 4);
// `skip` presses ESC on every panel instead of playing it, to prove the escape hatch
const SKIP = process.argv.includes('skip');

eval(src + `
;(function(){
  const rate = ${RATE}, dt = 1/60, SKIP = ${SKIP};
  let doorHeld = null, doorOpenedOnIts = null;
  const press = k => KD({ key: k, repeat: false, preventDefault(){} });
  const lift  = k => KU({ key: k, repeat: false, preventDefault(){} });
  let held = null;
  const log = [];
  let err = null, at = null;

  // Capture what drawDrill ACTUALLY passes: the pivot atPanelScale is given, and the top
  // and height panelFrame is given, for each panel as it is drawn. Read rather than
  // restated, so a change to either call shows up here instead of being reproduced by the
  // check and pronounced correct. Both are plain function declarations in the evalled
  // scope, so reassigning the names is enough -- drawDrill calls them by name.
  const PIVOTS = {};
  const _aps = atPanelScale, _pf = panelFrame;
  let _pivot = null;
  atPanelScale = function (py0, body) {
    const prev = _pivot; _pivot = py0;
    try { return _aps(py0, body); } finally { _pivot = prev; }
  };
  panelFrame = function (pw, title, color, ph, py0) {
    if (_pivot !== null && S.drill && S.drill.room && ph !== undefined && py0 !== undefined)
      PIVOTS[S.drill.room.verb] = { pivot: _pivot, top: py0, ph, pw };
    return _pf(pw, title, color, ph, py0);
  };

  S.mode = 'intro'; S.introT = 0;
  let t = 0, nextPress = 0, seen = null, startedAt = 0;
  try {
    for (let i = 0; i < 60 * 400; i++) {
      // The proprietor speaks before the drill and CANNOT be skipped: SPACE fills the
      // line being typed, SPACE again moves past a filled one, and the drill starts after
      // the last. Pressing every frame walks him at his own dwell, so this waits exactly
      // as long as he makes a player wait and no longer.
      if (S.boss && !S.boss.gone) press(' ');
      const d = S.drill;
      if (d && !d.done && d.room) {
        at = d.room.verb;
        if (d.room.verb !== seen) { seen = d.room.verb; startedAt = t; nextPress = t; }
        // ESC has to move past a kind without stranding anyone: the ditch cannot be cut
        // below about 2.5 presses a second at all, so a player who cannot drum needs a way
        // out that is not "abandon the whole drill". Proving it here means proving the
        // doors still open at the end of it.
        if (SKIP && d.phase === 'play') press('Escape');
        else if (d.phase === 'play' && t >= nextPress) {
          const v = VERBS[d.room.verb], m = d.room.mg;
          // bar declares no solveKey -- it is a timing bar, so it is played by watching
          const k = v.solveKey ? v.solveKey(m)
                  : (m.pos >= m.zone && m.pos <= m.zone + m.zoneW ? ' ' : null);
          if (k != null) {
            nextPress = t + 1/rate;
            // A HOLD VERB HAS TWO ANSWERS AND solveKey GIVES THE SAME KEY FOR BOTH: SPACE
            // means take hold when you are not holding and let go when you are. This used to
            // lift the key and then press it in the same breath, and since a press TOGGLES
            // the grip, the release was undone by the press on the same frame -- the bot
            // never once let go. It got away with it only because the spring biting used to
            // drop the grip for it, so the tool was relying on the very dead-end that made
            // the room unplayable for a person. With that gone it held the key for ever and
            // reported the drill stalled, which is a tool accusing a game of the tool's bug.
            const hold = VERBS[d.room.verb].takesHold && k === ' ';
            if (hold && d.room.mg.holding) {
              if (held) { lift(held); held = null; } else { press(k); }   // let go
            } else {
              if (held) { lift(held); held = null; }
              press(k);
              if (hold && d.room.mg.holding) held = k;                    // took hold
            }
          }
        }
      } else if (d && d.done && !log.closed) {
        log.closed = true;
      }
      // THE DOORS NOW WANT THEIR OWN DIGIT. The drill used to hand straight over to the run,
      // so this driver pressed nothing after the last panel and the tool simply asserted
      // "mode after the drill: play". They wait for DOOR_HOTKEY now -- the last beat of the
      // tutorial, and the one that teaches the road's core input.
      //
      // The half second of NO INPUT before pressing is the actual assertion. Without it a
      // pass would mean only "the run started", which was true before this change and would
      // go on being true if the wait were accidentally removed. doorOpenedOnIts records
      // whether the leaves had begun to move while nobody was touching the keyboard.
      if (d && d.done && doorWaiting()) {
        if (doorHeld === null) doorHeld = t;
        else if (t - doorHeld > 0.5) { doorOpenedOnIts = (S.doorOpen > 0.02); press(DOOR_HOTKEY); }
      }
      if (S.drill && S.drill.room && S.drill.phase === 'out' && S.drill.room.verb === seen && seen !== null) {
        if (!log.find(e => e.verb === seen)) log.push({ verb: seen, secs: t - startedAt });
      }
      update(dt); draw(); t += dt;
      if (S.mode === 'play') break;
    }
  } catch (e) { err = e; }

  console.log('drill-check -- driven at ' + rate + ' presses/sec, every frame drawn');
  console.log('');
  if (err) {
    console.log('THREW while ' + at + ' was on screen: ' + err.message);
    console.log(err.stack.split('\\n').slice(1,5).join('\\n'));
    process.exitCode = 1;
  }
  // The OPENING drill teaches act one only. It used to teach every verb on the course, which
  // gave away all ten games before the player had met five of them and left act two's drill
  // repeating two they had already seen. So "reached N of N types" is no longer the question;
  // the question is whether act one's own set was taught, and separately whether any verb is
  // ever met untaught.
  const firstAt = {};
  for (const r of CFG.rooms.slice().sort((a, b) => a.x - b.x)) {
    const v = CFG.types[r.type].verb;
    if (!(v in firstAt)) firstAt[v] = r.x;
  }
  // ...MINUS THE ONES THE OPENING DRILL DELIBERATELY SKIPS. Morgan, 2026-09-22: the drill
  // ran keys, gears, word, levers, bar, wires, so the player typed a word, did one unrelated
  // puzzle, and went straight back to typing another -- and keys and word are the same verb
  // wearing two paintings (both themeWord, both advance on the right letter, both reset on a
  // wrong one). One of them is enough to teach it.
  //
  // NO BACKTICKS IN HERE. This whole block lives inside a template literal that is eval'd
  // against index.html, so one in a comment ends the string and the tool dies at load with a
  // syntax error pointing at a line forty above, which reads as the tool being broken.
  //
  // READ OUT OF index.html, not restated here, so putting word back in the drill makes
  // this tool expect it again with nobody editing the tool. That is the same reason the room
  // list and the families are parsed rather than copied.
  //
  // This is a DECISION and not a derivation, so it is printed rather than hidden: a skipped
  // verb genuinely is never drilled, and the line below says which, so a green here states
  // what it is choosing to ignore instead of quietly covering less than it used to.
  const skip = (typeof DRILL_ONE_SKIP !== 'undefined') ? DRILL_ONE_SKIP : new Set();
  const types = new Set();
  for (const v of Object.keys(firstAt)) if (CFG.actAt(firstAt[v]) === 1 && !skip.has(v)) types.add(v);
  let total = 0;
  for (const e of log) { total += e.secs; console.log('  ' + e.verb.padEnd(8) + e.secs.toFixed(2).padStart(7) + 's'); }
  console.log('');
  console.log('  reached ' + log.length + ' of ' + types.size + ' act-one types the drill owes');
  const skipped = [...skip].filter(v => CFG.actAt(firstAt[v]) === 1);
  if (skipped.length)
    console.log('  deliberately NOT drilled: ' + skipped.join(', ') +
                '  (same verb as one that is -- see DRILL_ONE_SKIP in index.html)');
  // Every verb must be taught by SOME drill before its first room. The opening drill covers
  // act one; the seam drill covers everything act one did not. A verb in neither is one the
  // player meets cold, which is the whole thing the drill exists to prevent.
  const seam = [];
  for (const v of Object.keys(firstAt)) if (CFG.actAt(firstAt[v]) !== 1) seam.push(v);
  console.log('  taught at the seam: ' + (seam.join(', ') || 'none'));
  const untaught = Object.keys(firstAt).filter(v => !types.has(v) && !seam.includes(v) && !skip.has(v));
  console.log('  never taught: ' + (untaught.join(', ') || 'none'));
  // Which one it died on matters more than the count. A stall here is usually the DRIVER,
  // not the room: bar and lift are not rate puzzles -- bar wants SPACE when the marker is
  // in the green and lift wants a key held down -- so metronoming them at a fixed rate
  // measures the metronome. Check which kind the verb is before believing a red run.
  if (S.mode !== 'play' && S.drill && S.drill.room) console.log('  stalled on: ' + S.drill.room.verb);
  // WHICH OF THESE NUMBERS ARE A VERDICT AND WHICH ARE SPREAD. The per-type times and the
  // total are NOT reproducible: measured six times on byte-identical code they came back
  // 7.2, 7.7, 8.2, 8.5, 8.6 and 8.9 seconds -- a 23% spread, because the driver presses at a
  // fixed rate against a frame loop and the verbs seed their own puzzles. A change worth less
  // than about 1.5s cannot be seen here at all, and will appear to move in either direction:
  // a fix that lengthened the drill by 1.7s was measured as SHORTENING it by 0.5.
  //
  // Deterministic, and safe to reproduce on: the reached/never-taught lists, the mode after
  // the drill, and the panel geometry rows below, which are pure arithmetic off the captured
  // atPanelScale/panelFrame arguments.
  //
  // If you need to measure a duration inside one panel, drive that panel and count frames --
  // see tools/blast-check.js, which resolves 1.15s against 0.02s where this could not.
  console.log('  total ' + total.toFixed(1) + 's of puzzle, ' + t.toFixed(1) + 's of drill including the slides  (SPREADS ~23%, see note in source)');
  console.log('  mode after the drill: ' + S.mode + (S.mode === 'play' ? '  (the doors opened)' : '  (the run never started)'));
  const heldShut = doorOpenedOnIts === false;
  console.log('  the doors waited for ' + DOOR_HOTKEY + ': ' +
    (doorOpenedOnIts === null ? 'NEVER OBSERVED -- either the drill did not finish, or there is no wait'
     : heldShut ? 'yes, still shut after half a second with no key pressed'
     : 'NO -- they opened on their own, which is the lesson gone'));
  // ---- every drill panel on the same midline, and clear of the HUD ----
  // DRILL_MID exists so panels of four different heights read as one object being exchanged
  // rather than a box that keeps resizing. atPanelScale(py0, body) holds py0 still and grows
  // everything away from it, so the scaled midline is py0 + (mid - py0) * PANEL_SCALE, which
  // equals DRILL_MID only when py0 IS DRILL_MID. Scaling about each panel's own top -- the
  // obvious thing, and what shipped -- sends the whole 34% downward and gives every height a
  // different midline. Nothing else in this file can see that: the other assertions are that
  // the drill reaches every type and opens the doors, and both stayed true through it.
  //
  // The numbers come from the ARGUMENTS the game actually passed, captured in PIVOTS above,
  // not from this file redoing the arithmetic. A first version recomputed the pivot as
  // DRILL_MID and duly reported every panel centred on a build where drawDrill was scaling
  // about dTop -- an assertion that could not fail, which is worse than none.
  let offMid = 0;
  const HUD_BOTTOM = 42;                       // drawHud fills 0..40 and shadows to 42
  const seenPanels = Object.keys(PIVOTS);
  if (!seenPanels.length) { console.log('  NO PANEL FRAMES CAPTURED -- the hook did not fire'); offMid++; }
  for (const v of seenPanels) {
    const p = PIVOTS[v];
    const top = p.pivot + (p.top - p.pivot) * PANEL_SCALE;
    const bot = p.pivot + (p.top + p.ph - p.pivot) * PANEL_SCALE;
    const mid = (top + bot) / 2, off = Math.abs(mid - DRILL_MID);
    const why = off > 1 ? 'MIDLINE OFF BY ' + off.toFixed(1) : top < HUD_BOTTOM ? 'TOP BEHIND THE HUD' : '';
    if (why) offMid++;
    console.log('  ' + v.padEnd(8) + ' ph ' + String(p.ph).padStart(3) + '  pivot ' + String(p.pivot).padStart(4) +
                '  top ' + top.toFixed(1).padStart(6) + '  mid ' + mid.toFixed(1).padStart(6) + '  ' + (why || 'ok'));
  }
  console.log(offMid ? '  ' + offMid + ' panel(s) off the midline or behind the HUD'
                     : '  all ' + seenPanels.length + ' panels centred on DRILL_MID ' + DRILL_MID + ', tops clear of the HUD');
  console.log('');
  const ok = !err && log.length === types.size && untaught.length === 0 && S.mode === 'play' && offMid === 0 && heldShut;
  console.log(ok ? 'PASS' : 'FAIL');
  if (!ok) process.exitCode = 1;
  console.log('');
  console.log('This total is the FLOOR: the driver already knows every answer. Do not quote');
  console.log('it to Morgan as how long the drill takes to play the first time.');
})();
`);
