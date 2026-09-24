// A room nobody ever reached must not award a CLEAN.
//
// Morgan, 2026-09-24: "In act 3 some times there is no survivors in a particular lane and
// the mini games in those lanes will trigger the CLEAR UI which I think might be a bug."
//
// It was. A room closes itself when nobody can reach it any more, and that branch read
//
//     if (room.deaths) ... 'TOO LATE' ... ; else cleanRoom(room);
//
// so a room on a lane the survivors never entered -- deaths 0, because nobody was ever near
// it -- took the else and got a streak++, a big green CLEAN floater and AU.cheer. Act three
// arms every room on sight, nine at a time across a hillside that fans into six lanes, so a
// thin run collects a fistful of free CLEANs exactly where the lanes are emptiest.
//
// WHY A FULL CROWD SHOWS NOTHING, which is the whole reason this needs a tool. With a
// hundred people alive somebody is on every lane, canReach stays true everywhere, and no
// room ever expires: 0 in five solved runs. The bot never loses anybody, so the bot never
// reproduces it. The crowd has to be THINNED to see it -- 9 events at 9 survivors, 25 at 4.
// A green from this check with THIN unset would be a verdict about nothing at all, which is
// why it exits 1 if the runs produce no expiries to judge.
//
// It asserts BOTH halves, because a latch that never sets passes the first one trivially and
// silently deletes every CLEAN in the game:
//   1. no cleanRoom for a room that expired without anybody standing in front of it
//   2. the latch does fire -- rooms the crowd walked through end met
//
// Falsified by tools/empty-falsify.js against a copy with the old `else cleanRoom(room)`.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
// Takes a directory or a file, so the falsifier can point it at a broken copy. Without an
// argument a broken copy is ignored and the REAL game is swept, and the run comes back clean
// looking like proof -- which is how path-check's falsifier passed for the wrong reason.
const arg = process.argv[2];
const file = !arg ? path.join(root, 'index.html')
           : fs.statSync(arg).isDirectory() ? path.join(arg, 'index.html') : arg;
const src = fs.readFileSync(file, 'utf8').split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(__dirname, 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src')).replace("path.join(__dirname, 'audio-mock.js')", JSON.stringify(path.join(__dirname, 'audio-mock.js'))));
global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
let __kh = null;
global.window.addEventListener = (ev, fn) => { if (ev === 'keydown') __kh = fn; };
global.window.dispatchEvent = e => { if (__kh) __kh({ key: e.key, repeat: false, preventDefault() {} }); };
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };
const M = new Map();
global.localStorage = { getItem: k => M.has(k) ? M.get(k) : null, setItem: (k, v) => M.set(k, String(v)), removeItem: k => M.delete(k) };

let fails = 0;
const ok = (msg, extra) => console.log('ok    ' + msg + (extra ? '   ' + extra : ''));
const bad = (msg, extra) => { fails++; console.log('FAIL  ' + msg + (extra ? '\n        ' + extra : '')); };

eval(src + String.raw`
;(function(){
  const act = x => x < 7000 ? 1 : x < 12300 ? 2 : 3;
  // Hook the celebration itself. cleanRoom IS the streak, the green CLEAN and the cheer, so
  // its call list is exactly what a player sees -- no state transition to watch frame by
  // frame and get wrong, which an earlier version of this measurement did.
  const realClean = cleanRoom;
  const cheered = [];
  cleanRoom = function (room) { cheered.push({ room, state: room.state, met: room.met, x: room.x, lane: room.lane, type: room.type }); return realClean.apply(this, arguments); };

  // Survivors left standing on entering act three. 4 is chosen because it reliably empties
  // lanes; the sweep also runs a full crowd, which must produce no expiries and therefore no
  // verdict, and is here to show the difference rather than to pass.
  const THIN = 4, RUNS = 5;
  let expired = 0, coldCheer = [], walkedThrough = 0, unlatched = [];
  for (let g = 0; g < RUNS; g++) {
    reset(); S.mode = 'play';
    let culled = false;
    for (let i = 0; i < 60 * 420; i++) {
      if (!culled && S.cam > 12000) { culled = true;
        let kept = 0; for (const q of S.runners) if (q.state === 'run' && ++kept > THIN) q.state = 'dead'; }
      update(1/60); devSolve();
      if (S.mode !== 'play' && S.mode !== 'finale') break;
    }
    for (const r of S.rooms) if (r.state === 'passed') expired++;
  }

  // SWEEP B -- THE LATCH FIRES, tested against a signal that knows nothing about the latch:
  // A ROOM THAT KILLED SOMEBODY CERTAINLY HAD SOMEBODY IN FRONT OF IT. room.deaths is counted
  // by the hazard code, so this cannot agree with the latch by sharing its arithmetic.
  //
  // Not "every room the crowd walked past": the latch only runs while a room is ARMED, and a
  // solved room rightly stops latching, so that version accused the game about 100 rooms the
  // player had cleared. And a solved run kills nobody at all, so the bot has to be held OUT
  // of every other room -- botStuck is devSolve's own "leave this one alone" flag -- or this
  // assertion passes on an empty set, which it did: "0 rooms killed somebody".
  //
  // This is the half that matters most. A latch condition that never becomes true would pass
  // assertion 1 perfectly while deleting every CLEAN in the game.
  for (let g = 0; g < RUNS; g++) {
    reset(); S.mode = 'play';
    // Held back from the bot: the presses and the crusher ONLY. Those two kill a body
    // WITHOUT holding the queue, so the crowd still walks the whole course and dies on the
    // way; holding half the rooms regardless of hazard instead jams the pack against the
    // first unsolved gap, which is why that version found 5 killing rooms in five runs.
    // They are also the pair the latch most needs tested: r.atRoom is deliberately not set
    // for press or burst -- "the presses keep their own rota", "the crusher its own slam" --
    // so a latch written on atRoom would miss exactly these and nothing else.
    S.rooms.forEach(r => { if (r.hazard === 'press' || r.hazard === 'burst') r.botStuck = true; });
    for (let i = 0; i < 60 * 420; i++) {
      update(1/60); devSolve();
      if (S.mode !== 'play' && S.mode !== 'finale') break;
    }
    for (const r of S.rooms) {
      if (!r.deaths) continue;
      walkedThrough++;
      if (!r.met) unlatched.push('act ' + act(r.x) + ' x ' + r.x + ' lane ' + r.lane + ' ' + r.type + ' (' + r.state + ', ' + r.deaths + ' dead)');
    }
  }
  for (const c of cheered) if (c.state === 'passed' && !c.met)
    coldCheer.push('act ' + act(c.x) + '  x ' + c.x + '  lane ' + c.lane + '  ' + c.type);

  __out({ expired, coldCheer, walkedThrough, unlatched, cheers: cheered.length, RUNS, THIN });
})()`);

function __out(r) {
  console.log(`  ${r.RUNS} runs, thinned to ${r.THIN} survivors on entering act three`);
  console.log(`  ${r.expired} rooms closed themselves; ${r.cheers} CLEANs awarded in total; ${r.walkedThrough} rooms killed somebody\n`);

  // Each assertion is NAMED ONCE and the name is printed by both branches. The falsifier
  // finds its line by that name, so a pass worded differently from its own failure is
  // invisible to it: all three came back "the assertion did not appear in the output at all",
  // which reads exactly like three assertions wired to nothing.
  const A1 = 'the runs exercised the branch';
  const A2 = 'no room that closed itself unreached awarded a CLEAN';
  const A3 = 'every room that killed somebody was latched as met';

  // COVERAGE GATE. No expiries means the runs never exercised the branch under test, and a
  // pass would be a verdict about nothing. Same reason death-shape-check exits 1 on silence.
  if (r.expired === 0) bad(A1, 'no room closed itself at all, so this check judged nothing -- the thinning is not emptying any lanes, and nothing below means anything');
  else ok(A1, `${r.expired} rooms closed themselves`);

  if (r.coldCheer.length) bad(A2, `a room NOBODY ever reached awarded a CLEAN -- streak, green floater, cheer -- ${r.coldCheer.length} times\n        ` +
                                  r.coldCheer.slice(0, 8).join('\n        ') + (r.coldCheer.length > 8 ? `\n        ... and ${r.coldCheer.length - 8} more` : ''));
  else ok(A2);

  if (r.walkedThrough === 0) bad(A3, 'no room killed anybody, so the latch was never tested -- and the assertion above passes trivially when the latch never fires');
  else if (r.unlatched.length) bad(A3, `the latch missed ${r.unlatched.length} rooms that killed somebody\n        ` + r.unlatched.slice(0, 8).join('\n        '));
  else ok(A3, `${r.walkedThrough} rooms`);

  console.log(fails ? `\n${fails} FAIL` : '\nall clear');
  process.exit(fails ? 1 : 0);
}
