// The mantrap: what the room COSTS a hand, against the road it gives.
//
//   node tools/lift-check.js
//
// Why this room needs its own tool. tools/room-check.js scores a room by counting the keys
// an optimal player must press against the road at CFG.scroll, and CLAUDE.md already records
// that it is blind to any puzzle that wins outside key(): `lift` banks m.won in update(), so
// room-check does not measure it -- it reports its own guard limit as the cost, which comes
// out as a large and entirely plausible number.
//
// And this room is not a rate puzzle either, so counting presses would measure the wrong
// thing even if room-check could see it. It takes SIX presses at any difficulty. What it
// costs is TIME: the needle has to climb to the band three times, and how long that takes is
// set by the needle's speed, by where the band sits, and by how close to the band a hand can
// stop. Six presses in 2.5s and six presses in 6s are the same number and different rooms.
//
// So this measures seconds to open the jaws, under three hands, and puts them beside the
// road -- both read out of the game rather than written down here.
const fs = require('fs'), path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(__dirname, 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", "path.join(" + JSON.stringify(__dirname) + ",'audio-mock.js')"));
global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
let __kh = null;
global.window.addEventListener = (ev, fn) => { if (ev === 'keydown') __kh = fn; };
global.window.dispatchEvent = e => { if (__kh) __kh({ key: e.key, repeat: false, preventDefault() {} }); };
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

eval(src + `
;(function(){
  const dt = 1/60, fails = [], V_ = VERBS.lift;

  // ---------------------------------------------------------------- half one: the cost
  // Three hands, and the gap between them is the point. Driven through key() and release()
  // -- the real handlers -- rather than by poking m, so a change to either shows up here.
  //
  //   entry   releases the first frame the needle is inside the band. The ceiling of play,
  //           and not reachable by a person: it is the band's leading edge to the frame.
  //   centre  aims at the middle of the band and stops within a quarter of it, which is
  //           what a player who has the room's measure is doing.
  //   late    the same aim, arriving LATE_BY seconds after it, every time.
  //
  // A NOTE ON WHAT "late" MODELS, because the first version of it modelled the wrong thing
  // and condemned a playable band. It used a reaction time -- the hand sees the needle enter
  // the band and then takes 0.12s to respond -- which is the right model for a stimulus that
  // ARRIVES UNANNOUNCED. This needle does not: it climbs at a constant speed from a standing
  // start, in full view, toward a target drawn on the bar. A player anticipates it, the way
  // you catch a ball rather than react to one, and what they are left with is timing ERROR
  // around the moment they meant to hit, not latency after a moment they had to notice.
  // Modelling the latency made the room look impossible at any band under 240ms.
  //
  // 0.10s is the bias used here: a hand consistently a tenth of a second late, which is a bad
  // hand rather than a floor. If the band forgives that, it forgives most people.
  //
  // IT NO LONGER HAS TO. Morgan, 2026-09-24, asked for the needle twice as fast and the band
  // narrowing after each clean release, which puts even the first band at +/-55-74ms -- inside
  // this hand's error by design, not by accident. So the late hand is still PLAYED and still
  // PRINTED, because it is the number to quote him, and it is no longer a verdict. What still
  // fails the run is what no difficulty setting excuses: a room perfect play cannot open, a
  // room a hand that aims well cannot open, a room either of those cannot open in the road it
  // is given, and a band the needle can step over between two frames.
  const LATE_BY = 0.10;
  function play(diff, hand) {
    const m = V_.start(diff);
    let t = 0, aimed = -1, presses = 0, misses = 0;
    for (let i = 0; i < 60 * 40; i++) {
      if (!m.holding && m.recoil <= 0) { V_.key(m, ' '); presses++; aimed = -1; }
      else if (m.holding) {
        let go = false;
        if (hand === 'entry') go = Math.abs(m.gauge - m.zone) <= m.half;
        else {
          // the moment the hand MEANT to release: the middle of the band, to a quarter of it.
          // The first frame AT OR PAST that point, not the first frame inside a +/-quarter
          // window: at the doubled speed the needle moves 0.028-0.034 of the bar a frame, the
          // last pull's quarter window is narrower than that, and the needle stepped clean
          // over it -- a hand that never let go, printed as "never", a verdict on the ruler.
          if (aimed < 0 && m.gauge >= m.zone - m.half * 0.25) aimed = t;
          go = aimed >= 0 && t - aimed >= (hand === 'late' ? LATE_BY : 0);
        }
        if (go) { const was = m.got; V_.release(m, ' '); presses++; if (m.got === was) misses++; }
      }
      V_.update(m, dt); t += dt;
      if (m.won) return { secs: t, presses, misses };
    }
    return { secs: Infinity, presses, misses };
  }

  // every difficulty the game actually gives this verb, read off CFG.rooms
  const LIFT = CFG.rooms.filter(r => CFG.types[r.type].verb === 'lift');
  const diffs = [...new Set(LIFT.map(r => r.diff))].sort();
  const cost = {};
  console.log('what the jaws cost, seconds to open, driven through key() and release():');
  console.log('');
  // The headline is "forgives", not the band width: the half-band IS the timing error the
  // room tolerates either side of the moment you aimed at, and that is the number a person
  // can be asked to judge. A band is a bar width; a tolerance is a hand.
  // The band narrows after every clean release, so "forgives" is a RANGE: the first pull's
  // tolerance, then the last's. Both read off the game -- the last band is the one start()
  // hands the live grip after pulls-1 successes, taken through key() rather than recomputed.
  console.log('  diff   climb  forgives, first..last pull    entry   centre     late   (misses at late)');
  for (const d of diffs) {
    const m0 = V_.start(d), climb = m0.zone / m0.rate;
    const mL = V_.start(d); mL.got = mL.pulls - 1; V_.key(mL, ' ');
    const tolMs = (m0.half / m0.rate) * 1000, lastMs = (mL.half / mL.rate) * 1000;
    // how many frames the needle spends inside the last band: under 2 and a release that
    // lands in it depends on where the frame boundaries happen to fall
    const frames = (2 * mL.half) / (mL.rate * dt);
    const e = play(d, 'entry'), c = play(d, 'centre'), s = play(d, 'late');
    cost[d] = { entry: e.secs, centre: c.secs, late: s.secs };
    const f = v => (v === Infinity ? '  never' : v.toFixed(2) + 's');
    console.log('  ' + String(d).padStart(4) + '  ' + climb.toFixed(2) + 's  ' +
      ('+/-' + tolMs.toFixed(0) + '..' + lastMs.toFixed(0) + 'ms (' + frames.toFixed(1) + ' frames)').padStart(28) + '  ' +
      f(e.secs).padStart(7) + '  ' + f(c.secs).padStart(7) + '  ' + f(s.secs).padStart(7) +
      '   ' + s.misses);
    if (e.secs === Infinity) fails.push('difficulty ' + d + ' cannot be solved even by a hand that releases on the first frame inside the band');
    if (c.secs === Infinity) fails.push('difficulty ' + d + ' is never solved by a hand that aims at the middle of the band');
    if (!(mL.half < m0.half)) fails.push('difficulty ' + d + ': the band does not narrow after a clean release (' + m0.half.toFixed(3) + ' first, ' + mL.half.toFixed(3) + ' last)');
    if (frames < 2) fails.push('difficulty ' + d + ': the needle crosses the last band in ' + frames.toFixed(1) + ' frames, so hitting it is down to where the frames fall');
  }

  // ---------------------------------------------------------------- half two: the road
  // Measured, not computed. The window is not warn/CFG.scroll: a room arms at
  // reach = floor + max(0, sight - floor) * (1 - CFG.armReach), sight is 0.36 * V.vw and vw
  // depends on the zoom in force where the room STANDS -- 346 units in act one, up to 768 on
  // the five-lane hillside, which is where both mantraps are. Reproducing that arithmetic
  // here is how a tool goes stale by lying instead of by failing, so armRoom is hooked and
  // the crowd's own position supplies the other end.
  const ARMED = {}, CROSS = {};
  let T = 0;
  const _arm = armRoom;
  armRoom = function (room) { if (ARMED[room.x] === undefined) ARMED[room.x] = T; return _arm(room); };
  S.mode = 'play'; S.introT = 0;
  // nothing reaches act three without a bot, and both mantraps are in act three
  const solve = typeof devSolve === 'function';
  let threw = null;
  try {
    const FRAMES = 60 * (S.camMax / CFG.scroll + 40);
    for (let i = 0; i < FRAMES; i++) {
      if (solve) devSolve();
      update(dt); T += dt;
      let lead = 0;
      for (const r of S.runners) if (r.state === 'run' && r.x > lead) lead = r.x;
      for (const r of LIFT) {
        const room = S.rooms.find(q => q.x === r.x && q.lane === r.lane);
        if (room && CROSS[r.x] === undefined && lead >= holdLine(room)) CROSS[r.x] = T;
      }
      if (S.mode !== 'play') break;
    }
  } catch (e) { threw = e; }
  if (threw) { console.log(''); console.log('THREW during the road run: ' + threw.message); fails.push('the road run threw'); }

  console.log('');
  console.log('and the road each mantrap gives, measured from the run (armed -> the crowd arrives):');
  console.log('');
  console.log('   room x  lane  diff   warn   road    verdict');
  for (const r of LIFT) {
    const a = ARMED[r.x], c = CROSS[r.x];
    if (a === undefined || c === undefined) {
      console.log('  ' + String(r.x).padStart(7) + '  ' + String(r.lane).padStart(4) +
        '  ' + String(r.diff).padStart(4) + '  ' + String(r.warn).padStart(5) + '     --    NOT REACHED');
      fails.push('the room at ' + r.x + ' never ' + (a === undefined ? 'armed' : 'was reached by the crowd') + ', so its road was not measured');
      continue;
    }
    const road = c - a, k = cost[r.diff];
    // The line to hold is the one CLAUDE.md draws for the wiring room: a room a good hand
    // CANNOT clear in the road available is a bug. A room a good hand can only just clear is
    // hard, which is a difficulty judgement and Morgan's to make -- quote him the number.
    // TIGHT is judged on the hand that aims at the middle since 2026-09-24 (see LATE_BY); a
    // late hand that does not fit is printed, as "hard", and does not fail the run.
    const why = k.entry > road ? 'IMPOSSIBLE -- perfect play does not fit'
              : k.centre > road ? 'TIGHT -- a hand that aims at the middle does not fit'
              : k.late > road ? 'hard -- a hand 100ms late does not fit'
              : k.centre > road * 0.75 ? 'hard' : 'ok';
    // TIGHT FAILS THE RUN TOO, and that is not fussiness -- it was a reporting bug here,
    // caught by injecting a 200-unit warn: the table printed TIGHT against that room and the
    // tool still exited GOOD, which is a green over a red row and worse than no check. Only
    // "hard" and "ok" pass. Whether a hard room should be made easier is Morgan's call and
    // this tool does not take it; whether a hand can finish at all is not a judgement.
    if (why.indexOf('IMPOSSIBLE') === 0 || why.indexOf('TIGHT') === 0)
      fails.push('the room at ' + r.x + ' gives ' + road.toFixed(2) + 's of road, and ' +
                 (why.indexOf('TIGHT') === 0 ? 'a hand that aims at the middle needs ' + k.centre.toFixed(2) + 's'
                                             : 'perfect play needs ' + k.entry.toFixed(2) + 's'));
    console.log('  ' + String(r.x).padStart(7) + '  ' + String(r.lane).padStart(4) +
      '  ' + String(r.diff).padStart(4) + '  ' + String(r.warn).padStart(5) +
      '  ' + road.toFixed(2) + 's   ' + why);
  }
  console.log('');
  if (fails.length) fails.forEach(f => console.log('  VERDICT: BAD -- ' + f));
  else console.log('  VERDICT: GOOD -- the jaws open inside the road, for a hand that aims at the band');
  console.log('');
  console.log('These are ONE hand each, not a distribution, and every one of them already knows');
  console.log('where the band is. A person meeting this room for the first time is slower.');
  process.exitCode = fails.length ? 1 : 0;
})();
`);
