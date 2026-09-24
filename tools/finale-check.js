// The last room, as arithmetic.  node tools/finale-check.js [root]
//
// The finale is Linh's, transplanted whole from her LastRoom branch -- 836 lines that
// nobody here wrote and that no other tool touches. The freeze harness never reaches it
// without input, probe.js only proves it does not throw, and a screenshot cannot tell a
// generator that charges from one that only looks like it does. So this drives the real
// functions and checks her own merge checklist plus the one thing a checklist cannot state:
// that the room is winnable by a human hand.
//
// What it covers, in her words and then in numbers:
//   intro -> charge -> search       the phases advance on their own clocks
//   Space + click mark              both input paths reach finaleConfirm and both score
//   wrong != recharge               a wrong mark must not send the room back to charging
//   10 checks                       findCount marks wins, and nothing short of it does
//   standing pack                   survivors arrive and STAY; they do not vanish into the wheel
//
// and beyond the checklist:
//   the light, the gate and the bar read ONE number (they used to be three)
//   the charge takes about what genTime says, at 1, 12 and 100 survivors
//   a wrong mark costs exactly one body, and the room is lost when the last one goes
//   every diff can be reached and marked inside searchTime, steering at cursorSpeed
//
// That last one is the room-check lesson applied here: a bot presses as fast as the loop
// runs, so "the bot won" says nothing about whether a person could. The lamp has
// acceleration and friction, so the real cost of a search is TRAVEL, and travel is
// measurable. It is still a ceiling, not a difficulty report -- this driver knows where
// every difference is and a player does not. Do not quote it to Morgan as how the room
// plays; quote it as proof the room is not impossible.
const fs = require('fs'), path = require('path');
const root = process.argv[2] || path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(__dirname, 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", JSON.stringify(path.join(__dirname, 'audio-mock.js'))));
let KD = null, KU = null;
global.window.addEventListener = (ev, fn) => { if (ev === 'keydown') KD = fn; if (ev === 'keyup') KU = fn; };
global.window.dispatchEvent = () => {};
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

// The harness's localStorage is a no-op stub, so loadBest() always answers 0 and an
// assertion about the saved best measures the stub rather than the game. A real in-memory
// one makes the round trip actually happen.
const STORE = new Map();
global.localStorage = {
  getItem: k => (STORE.has(k) ? STORE.get(k) : null),
  setItem: (k, v) => STORE.set(k, String(v)),
  removeItem: k => STORE.delete(k),
};

let bad = 0;
const ok = (name, pass, detail) => { if (!pass) bad++; console.log((pass ? 'ok  ' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : '')); };

eval(src + `
;(function(){
  const press = k => KD({ key: k, repeat: false, preventDefault(){} });
  const release = k => KU({ key: k, preventDefault(){} });
  const F = () => S.finale;

  // Stand a chamber up with a chosen crew, exactly as the game does when the wall falls.
  function chamber(crew) {
    startRun();
    S.runners.forEach(r => { r.state = 'run'; });
    S.runners.slice(0, crew).forEach(r => { r.state = 'arrived'; });
    S.stats.arrived = crew;
    S.cam = S.camMax; updateView(1);
    startFinale();
    return F();
  }
  // Run the room forward. It DRAWS as well as updating, because an exception in draw() is
  // as fatal as one in update() and several of these phases are only ever exercised by
  // being drawn -- but it draws every sixth frame, not every frame. Drawing all of them
  // cost four minutes for a check whose whole value is being runnable before a push, and
  // ten frames a second still touches every branch a sixty-frame second would.
  function run(secs, each) {
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) {
      if (each && each(i / 60) === 'stop') return;
      update(1/60);
      if (i % 6 === 0) draw();
    }
  }
  // Stand a chamber straight into its charge. The intro is a fixed ten-odd seconds of scare
  // wall and boss speech; it is tested once, properly, above, and every later test would
  // otherwise pay for it again.
  function charging(crew) {
    const g = chamber(crew);
    beginFinaleCharge(g);
    return g;
  }

  // ------------------------------------------------------------ phases
  let f = chamber(12);
  ok('the room opens on the intro, not the search', f.phase === 'intro', 'phase ' + f.phase);
  // DERIVED FROM THE SPEECH, not from FINALE_INTRO_SPEECH. The beat used to be a fixed
  // length with a stick figure standing in it; it is now as long as the proprietor takes,
  // and FINALE_INTRO_SPEECH survives only as the backstop for a run where he never arrives.
  // Scored against that constant this failed on a room that was working -- the intro really
  // does hold at 11.1s, because he is still talking -- which is a stale ruler accusing the
  // game, the fault this file's own notes warn about.
  const introNeed = FINALE_INTRO_WALL + bossSpeechLength(BOSS_FINALE);
  run(FINALE_INTRO_WALL + 0.5);
  ok('the intro holds while the proprietor is still speaking', F().phase === 'intro' && !!S.boss && !S.boss.gone,
     'phase ' + F().phase + ', on line ' + ((S.boss && S.boss.line + 1) || 0) + ' of ' + BOSS_FINALE.length);
  run(introNeed);
  ok('the intro hands over to the generator once he has gone', F().phase === 'charge' && !!S.boss && S.boss.gone,
     'phase ' + F().phase + ' after ' + introNeed.toFixed(1) + 's, he is ' + (S.boss && S.boss.gone ? 'gone' : 'STILL THERE'));

  // ------------------------------------------------------------ the charge, at three crew sizes
  // genTime is the design: one worker 10.9s, a hundred 1.0s. The belt used to ignore it.
  // The charge is two stages: the crew board, THEN the flywheel winds. genTime describes the
  // second stage only, so this measures the second stage. It used to measure the total and
  // pass, which was luck -- the flywheel was already part-wound by the time the belt filled,
  // and the logic pass found the room's light stepping 2.25x in the single frame that
  // finished. Fixing that made the total boarding + genTime and this assertion went red for
  // the right reason.
  for (const crew of [1, 12, 100]) {
    charging(crew);
    const want = CFG.finale.genTime(crew);
    // STOPPED ON THE FLYWHEEL, not on the phase. genTime describes how long the wheel takes
    // to wind, and since 2026-09-24 the phase also waits for the lesson to have been read --
    // so at a hundred aboard, where the wheel is done in a second and the lesson holds for
    // five, this measured the lesson and reported the generator as four times slow. The
    // ruler has to stop at the thing it is a ruler for.
    let t = 0;
    run(60, () => { if (finaleChargeProgress(F()) >= 1) return 'stop'; t += 1/60; });
    const board = F().boardT || 0;
    // ...and then let the lesson run out, so the phase half of the assertion below is still
    // about the room OPENING. Stopping at the wheel leaves it in 'charge' at a hundred aboard,
    // where the wheel finishes four seconds before the window does.
    run(FINALE_LEARN + 2, () => { if (F().phase === 'search') return 'stop'; finaleTeach(F()); });
    ok('a crew of ' + String(crew).padStart(3) + ' winds the flywheel in the ' + want.toFixed(1) + 's genTime says',
       F().phase === 'search' && Math.abs((t - board) - want) <= Math.max(0.35, want * 0.12),
       'boarded in ' + board.toFixed(2) + 's, then wound for ' + (t - board).toFixed(2) + 's');
    // The bound is 2.2s, not 1.0. Boarding is the spawn cadence (BOARD, 0.55s) PLUS the walk,
    // and the walk used to be 1848 px/s -- 16.8 times the speed these same bodies run at for
    // the whole game, two body-widths a frame, a blur rather than a gait. Slowing it to about
    // 520 buys a readable walk and costs a second. What the assertion is really for is that
    // boarding stays bounded and does not scale with the crew: it is the same at 1 and at 100.
    ok('a crew of ' + String(crew).padStart(3) + ' gets aboard inside the boarding beat',
       board > 0 && board <= 2.2, board.toFixed(2) + 's to get ' + crew + ' aboard');
  }

  function searching(crew) {
    charging(crew);
    // THE LESSON IS A GATE NOW. The last room opens when somebody has found the handbag, not
    // when a clock says so, and no driver can steer a lamp with four keys -- so without the
    // game's own finaleTeach hook this spends its whole budget in the charge and every
    // assertion past it becomes a report on a room that was never entered. The assertions
    // ABOUT the lesson drive it the long way round, with keys, which is what proves the hook
    // is not hiding anything.
    run(40, () => { if (F().phase === 'search') return 'stop'; finaleTeach(F()); });
    return F();
  }

  // ------------------------------------------------------------ one number, not three
  {
    // A big crew, where boarding is quick and the flywheel is the whole wait: the stretch
    // where a light wired to the wrong clock would show.
    //
    // What this asks changed after the falsifier. It used to ask whether the charge light
    // ever reached the SEARCH light, and it never can -- the charge formula tops out around
    // 0.78 against a flat 1.0 -- so the assertion was true by construction and a light
    // pinned bright for the whole charge still passed it. What actually matters is that the
    // light TRACKS the gate, so it is asked at the start: when the generator has barely
    // begun, the room must still be dark.
    charging(100);
    let worst = 0, litEarly = 0, litLate = 0;
    run(20, () => {
      const g = F();
      if (g.phase !== 'charge') return 'stop';
      const p = finaleChargeProgress(g);
      worst = Math.max(worst, p);
      if (p < 0.1) litEarly = Math.max(litEarly, finaleLightLevel(g));
      litLate = Math.max(litLate, finaleLightLevel(g));
    });
    const searchLit = (function(){ const k = searching(4); return finaleLightLevel(k); })();
    ok('the room is still dark while the generator has barely begun',
       litEarly > 0 && litEarly < 0.2,
       'light ' + litEarly.toFixed(3) + ' at under a tenth of charge');
    ok('the room never stands fully lit while the generator is still charging',
       worst < 1.0001 && litLate < searchLit * 0.85,
       'peak progress ' + worst.toFixed(3) + ', peak light ' + litLate.toFixed(3) +
       ' against ' + searchLit.toFixed(2) + ' once it is searching');
  }

  // ------------------------------------------------------------ the lesson
  {
    // Morgan, 2026-09-24: "can we actually make it playable? So that ... as soon as they
    // successfully spot the difference, then the actual game starts."
    //
    // DRIVEN WITH THE KEYS, not with finaleTeach. Everything else in this file uses that hook
    // to get past the window, so if the window were also ASSERTED through the hook nothing
    // would ever test the thing a player actually touches -- the four arrows, the press, and
    // the gate. This is the one place that steers the lamp.
    const steerTo = (g, u, v, secs) => {
      const n = Math.round(secs * 60);
      for (let i = 0; i < n; i++) {
        const le = g.lesson;
        if (!le) { update(1/60); continue; }
        HELD.ARROWRIGHT = le.u < u - 0.004; HELD.ARROWLEFT = le.u > u + 0.004;
        HELD.ARROWDOWN  = le.v < v - 0.004; HELD.ARROWUP   = le.v > v + 0.004;
        update(1/60);
        if (Math.abs(le.u - u) < 0.02 && Math.abs(le.v - v) < 0.02) break;
      }
      HELD.ARROWRIGHT = HELD.ARROWLEFT = HELD.ARROWUP = HELD.ARROWDOWN = false;
    };

    // It is a GATE, not a timer. This is the assertion the whole change is about: left alone,
    // the room never opens, however long the generator has been finished.
    {
      const g = charging(100);
      run(30);
      ok('the room does not open until the difference has been found',
         g.phase === 'charge' && !g.lesson.done,
         'after 30s untouched: phase ' + g.phase + ', solved ' + (g.lesson && g.lesson.done));
    }
    // A wrong mark is free. The room on the other side of this window charges a body for the
    // same press, and a tutorial that did would be a test.
    {
      const g = charging(100);
      run(2);
      const crew = g.line.length;
      KD({ key: ' ', preventDefault() {}, repeat: false });
      run(1);
      ok('a wrong mark in the lesson costs nothing and opens nothing',
         g.phase === 'charge' && !g.lesson.done && g.line.length === crew,
         'phase ' + g.phase + ', crew ' + crew + ' -> ' + g.line.length + ', solved ' + g.lesson.done);
    }
    // ...and steering onto the bag and pressing SPACE starts the game.
    {
      const g = charging(100);
      run(1);
      steerTo(g, LESSON_BAG.u, LESSON_BAG.v, 12);
      KD({ key: ' ', preventDefault() {}, repeat: false });
      const solved = g.lesson.done;
      let after = 0;
      run(8, () => { if (F().phase === 'search') return 'stop'; after += 1/60; });
      ok('finding the difference with the arrows and SPACE starts the room',
         solved && g.phase === 'search' && after >= LESSON.hold - 0.1 && after <= LESSON.hold + 0.4,
         'solved ' + solved + ', opened ' + after.toFixed(2) + 's later (the held beat is ' + LESSON.hold + 's)');
    }
    // The generator is still the generator: a thin crew waits for it even once taught.
    {
      const g = charging(1);
      run(1);
      finaleTeach(g);
      let held = 0;
      run(40, () => { if (F().phase === 'search') return 'stop'; held += 1/60; });
      ok('a crew of 1 still waits for its flywheel after the lesson is solved',
         g.phase === 'search' && held > CFG.finale.genTime(1) * 0.7,
         'held ' + held.toFixed(1) + 's against a genTime of ' + CFG.finale.genTime(1).toFixed(1) + 's');
    }
  }

  // ------------------------------------------------------------ the room's lamp is locked
  {
    // Morgan, 2026-09-24: "moving the light in the tutorial is also moving the light in the
    // real game that's right behind it ... Can we lock that light ... until the tutorial is
    // done?" It was one condition, and it is the kind of fault only a player sees: the lesson
    // HAS its own lamp, so nothing in the window looked wrong -- the damage was on the cards
    // behind it, and it arrived with you when the room opened.
    const g = charging(100);
    const at0 = { u: g.spot.u, v: g.spot.v };
    for (let i = 0; i < 60 * 8; i++) {
      HELD.ARROWRIGHT = (i % 180) < 90; HELD.ARROWLEFT = (i % 180) >= 90;
      HELD.ARROWDOWN = (i % 120) < 60; HELD.ARROWUP = (i % 120) >= 60;
      update(1/60);
    }
    HELD.ARROWRIGHT = HELD.ARROWLEFT = HELD.ARROWUP = HELD.ARROWDOWN = false;
    const swept = Math.hypot(g.lesson.u - LESSON_START.u, g.lesson.v - LESSON_START.v);
    const bled = Math.hypot(g.spot.u - at0.u, g.spot.v - at0.v);
    ok('the lesson steers its own lamp and never the room behind it',
       swept > 0.2 && bled < 1e-9,
       'the lesson lamp travelled ' + swept.toFixed(2) + ' and the room lamp ' + bled.toFixed(4));
    // ...and it is the player's again the moment the room is.
    finaleTeach(g);
    run(6, () => { if (F().phase === 'search') return 'stop'; });
    const atOpen = g.spot.u;
    HELD.ARROWRIGHT = true; run(1); HELD.ARROWRIGHT = false;
    ok('and the room takes its lamp back as soon as it opens',
       F().phase === 'search' && g.spot.u > atOpen + 0.2,
       'opened at ' + atOpen.toFixed(2) + ', a second of ARROWRIGHT took it to ' + g.spot.u.toFixed(2));
  }

  // ------------------------------------------------------------ the standing pack
  {
    charging(24);
    run(30, () => { if (F().phase === 'search') return 'stop'; finaleTeach(F()); });
    const arrived = F().deck.filter(d => d.arrived).length;
    ok('every survivor is standing on the belt when the search begins',
       arrived === 24 && F().line.length === 24, arrived + ' standing of ' + F().line.length);
    // Nobody may stand off the belt. This is here because capping the drawn PITCH without
    // capping the queue gave slot 99 a target of x -1234, which it reached on its first
    // frame and counted as arrived -- the belt filled instantly with people standing far off
    // the canvas, and every timing assertion stayed green because the phase still flipped.
    for (const crew of [1, 2, 60, 100]) {
      charging(crew);
      run(30, () => { if (F().phase === 'search') return 'stop'; finaleTeach(F()); });
      const L = finaleLayout();
      // The one the clock is spending is allowed past the left end, because that is what
      // going over the end IS -- the slip carries them off the crown of the tail drum and the
      // fall starts from there. Everybody else has to be ON the belt. Written as an exemption
      // for that ONE body rather than as a looser bound for all of them: a loose bound would
      // let a second body drift out over the water and still pass.
      const going = finaleNextOff(F());
      const lip = L.deck.x - L.deck.drumR - 8;
      const off = F().deck.filter(d => d.x > L.deck.x + L.deck.w + 1 || d.x < (d === going ? lip : L.deck.x - 1));
      const pitch = F().deck.length > 1
        ? Math.min(...F().deck.slice(1).map((d, i) => Math.abs(d.x - F().deck[i].x)).filter(v => v > 0))
        : 99;
      ok('a crew of ' + String(crew).padStart(3) + ' all stands ON the belt, no closer than a body apart',
         off.length === 0 && pitch >= 18,
         F().deck.length + ' drawn' + (F().packWaiting ? ' (+' + F().packWaiting + ' waiting)' : '') +
         ', tightest gap ' + (pitch === 99 ? 'n/a' : pitch.toFixed(1)) +
         (off.length ? ', ' + off.length + ' OFF THE BELT' : ''));
    }

    charging(24);
    run(30, () => { if (F().phase === 'search') return 'stop'; finaleTeach(F()); });
    // The belt's own slot pitch, read off the game rather than written down: the two nearest
    // bodies in a full line are exactly one pitch apart, and the assertion below is entirely
    // about that distance.
    const PITCH_HERE = Math.min(...F().deck.slice(1).map((d, i) => Math.abs(d.x - F().deck[i].x)).filter(v => v > 0));
    // WHO MAY MOVE, AND HOW FAR. This was "nobody": every x had to be within half a unit of
    // where it had been three seconds earlier, which is what catches a pack being dragged
    // toward the wheel. Two things happen now that contradict that, and neither is a fault, so
    // the assertion states them rather than being relaxed around them:
    //
    //   the one the clock is about to spend loses ground down the belt and goes over the end
    //   (Morgan, 2026-09-23: "it should coincide with their slow demise towards the end of the
    //   conveyor belt"), and
    //   the line behind closes into the slot being vacated WHILE that is happening, instead of
    //   shuffling up all at once afterwards -- which is at most one pitch, ever.
    //
    // So: nobody moves toward the generator at all; nobody in the line moves further than one
    // pitch; the one who is going has moved a good deal further than that, and no further than
    // the point it is launched from. A pack dragged at the wheel still fails. So does a second
    // body leaving the line, a queue that closes by more than the gap it is filling, and a slip
    // that overshoots its own edge.
    const held = new Map(F().deck.map(d => [d.r, d.x]));
    const going2 = finaleNextOff(F());
    run(3);
    const L3 = finaleLayout();
    const moved = F().deck.filter(d => d !== going2 && held.has(d.r)).map(d => held.get(d.r) - d.x);
    const backwards = moved.filter(m => m < -0.5);
    const tooFar = moved.filter(m => m > PITCH_HERE + 0.5);
    const slipped = going2 ? held.get(going2.r) - going2.x : 0;
    ok('only the one the clock is spending leaves the line, and the line closes by at most one pitch',
       backwards.length === 0 && tooFar.length === 0 && F().deck.length === 24 && !!going2 &&
       slipped > PITCH_HERE * 1.5 && going2.x >= L3.deck.x - L3.deck.drumR - 8,
       F().deck.length + ' on the belt after 3s: ' + backwards.length + ' moved toward the wheel, ' +
       tooFar.length + ' closed by more than the ' + PITCH_HERE.toFixed(0) + '-unit pitch (worst ' +
       Math.max(0, ...moved).toFixed(1) + '), the one who is going moved ' + slipped.toFixed(1));
  }

  // ------------------------------------------------------------ the line as it thins
  {
    // Morgan, 2026-09-23: below about thirty the crew should SPREAD along the belt instead of
    // staying packed at the drop end. That is a behaviour the assertion above cannot see -- it
    // watches three seconds at crew 24, in which nobody dies and so nothing respaces -- so the
    // claim is made here over whole runs, at three crew sizes.
    //
    // Four things, and the first is the one the spreading could break: the front of the line
    // is ANCHORED at the drop, because that is the body the drum runs out from under. The
    // others are that nobody but the one going ever gets left of it, that spreading never
    // crowds anyone, and that it never walks the far end off the machine.
    // DRIVEN DOWN FROM A HUNDRED, not started small. This is the whole point: a run that
    // ARRIVES with eight spreads whatever the code does, because packNeed is stamped at eight.
    // The case Morgan described is a hundred THINNING to eight, and the first version of this
    // assertion started fresh finales at 8 and 24 and went green on a build where the spacing
    // never opened at all -- 8 survivors still standing 20.9 apart with 520 units of empty
    // belt behind them. A check that samples the easy case is a check about the easy case.
    {
      const g = searching(100);
      const L = finaleLayout(), drop = L.deck.x + L.deck.slot0;
      const seen = {};
      run(CFG.finale.searchTime + 2, () => {
        if (S.mode !== 'finale') return 'stop';
        const n = g.line.length;
        const xs = g.deck.filter(d => d.arrived && !d.slip).map(d => d.x).sort((a, b) => a - b);
        if (xs.length > 1 && seen[n] == null) seen[n] = xs[1] - xs[0];
      });
      // It must OPEN as the line thins, and reach most of the belt by the end. Written as the
      // property rather than as a table of numbers, so retuning SPREAD_MAX moves the check
      // with it instead of failing at it.
      const at = k => seen[k] == null ? 0 : seen[k];
      ok('a hundred THINNING down spreads along the belt instead of staying packed at the drop',
         at(20) > at(60) + 5 && at(8) > at(20) + 10 && at(4) > at(8) + 10,
         'spacing at 60 alive ' + at(60).toFixed(0) + ', at 20 ' + at(20).toFixed(0) +
         ', at 8 ' + at(8).toFixed(0) + ', at 4 ' + at(4).toFixed(0) + ' units');
    }
    for (const crew of [100, 24, 8]) {
      const g = searching(crew);
      const L = finaleLayout(), drop = L.deck.x + L.deck.slot0;
      // TWO readings of the front, not one. It is NOT pinned to the drop at every instant --
      // when the body on it goes over, the next one glides up from a slot back at CARRY, which
      // at a thin belt is 95 units to cover. Asserting |front - drop| < 1 therefore fails on
      // the room working correctly. What is actually true, and what the drop end needs, is
      // that the line never runs PAST it and always comes back to it.
      let frontPast = 0, frontBest = Infinity, strayLeft = 0, tightest = Infinity, offBelt = 0, widest = 0;
      run(CFG.finale.searchTime + 2, () => {
        if (S.mode !== 'finale') return 'stop';
        const arrived = g.deck.filter(d => d.arrived);
        const standing = arrived.filter(d => !d.slip).map(d => d.x).sort((a, b) => a - b);
        if (standing.length) {
          if (standing[0] < drop - 0.6) frontPast++;
          frontBest = Math.min(frontBest, Math.abs(standing[0] - drop));
        }
        for (const d of arrived) {
          if (!d.slip && d.x < drop - 0.6) strayLeft++;
          if (d.x > L.deck.x + L.deck.w + 1 || d.x < L.deck.x - L.deck.drumR - 8) offBelt++;
          widest = Math.max(widest, d.x);
        }
        const xs = arrived.map(d => d.x).sort((a, b) => a - b);
        for (let k = 1; k < xs.length; k++) tightest = Math.min(tightest, xs[k] - xs[k - 1]);
      });
      ok('a crew of ' + String(crew).padStart(3) + ' spreads along the belt and still fronts ON the drop',
         frontPast === 0 && frontBest < 1 && strayLeft === 0 && offBelt === 0 && tightest >= 18,
         'the front reached the drop to ' + frontBest.toFixed(2) + ' and never ran past it (' +
         frontPast + ' frames), tightest gap ' + (tightest === Infinity ? 'n/a' : tightest.toFixed(0)) +
         ', furthest right ' + widest.toFixed(0) + ' of ' + (L.deck.x + L.deck.w));
    }
  }

  // ------------------------------------------------------------ nobody ever walks forward
  {
    // Morgan, 2026-09-23: "no player should ever walk forward if you know what i mean. As
    // people are falling and there is more space on the conveyor belt, the players will be
    // spacing out more and thus moving backward but they should not bounce forward."
    //
    // This is the whole rule, and it is one inequality: a standing body's x may go down and
    // may stay, and may never go up. It caught what looking could not -- the bounce was 0.73
    // units on the worst single frame, too small to see in any one of them, and 3169 units of
    // travel across a run, which is what the eye actually reads.
    //
    // The one drawn at 100 is the case that matters: the spacing only opens once the queue
    // behind is exhausted, so a run that starts small never exercises the re-spacing at all.
    for (const crew of [100, 40, 12]) {
      const g = searching(crew);
      const seen = new Map();
      let frames = 0, travel = 0, worst = 0;
      run(CFG.finale.searchTime + 2, () => {
        if (S.mode !== 'finale') return 'stop';
        for (const d of g.deck) {
          // The one going over is exempt: it is SUPPOSED to move, and only ever toward the
          // drop, which the assertions above already cover.
          if (!d.arrived || d.slip) { seen.set(d.r, d.x); continue; }
          const was = seen.get(d.r);
          if (was != null && d.x > was + 0.01) { frames++; travel += d.x - was; worst = Math.max(worst, d.x - was); }
          seen.set(d.r, d.x);
        }
      });
      ok('a crew of ' + String(crew).padStart(3) + ' never walks anybody forward, up the belt',
         frames === 0 && travel < 0.5,
         frames + ' body-frames forward, ' + travel.toFixed(1) + ' units of travel, worst frame ' + worst.toFixed(2));
    }
  }

  // ------------------------------------------------------------ the line never stops
  {
    // Morgan, 2026-09-23: "right now we have a kind of stop and go motion. people are sliding
    // back until the last one falls in the water but then everyone stops, and the the sliding
    // resumes like one or two seconds later... maybe you can slow down the sliding back
    // animation enough that there is no stopping and the players are always slidding back,
    // falling one at the time on time as usual."
    //
    // The fault was that the close-up ran on the SLIP's clock and a slip was shorter than the
    // gap it sat in, so the line hurried its move and then waited. Measured then: the whole
    // line completely motionless on 32% of frames at crew 24 and 74% at crew 8, in unbroken
    // pauses of 1.27s and 7.33s.
    //
    // What is asserted is the PAUSE, not the percentage. A single frame in which nothing
    // rounds to a moving pixel is not a stop; a second of it is, and that is what he saw.
    for (const crew of [100, 24, 8]) {
      const g = searching(crew);
      const seen = new Map();
      let pause = 0, longest = 0;
      run(CFG.finale.searchTime + 2, () => {
        if (S.mode !== 'finale') return 'stop';
        let moved = false, any = false;
        for (const d of g.deck) {
          if (!d.arrived) { seen.set(d.r, d.x); continue; }
          any = true;
          const was = seen.get(d.r);
          if (was != null && Math.abs(d.x - was) > 0.004) moved = true;
          seen.set(d.r, d.x);
        }
        if (!any) return;
        // The last survivor alone on the belt is exempt: there is no line to close, and one
        // body easing into a slide of its own is not the room stopping.
        if (moved || g.line.length <= 1) { longest = Math.max(longest, pause); pause = 0; } else pause++;
      });
      longest = Math.max(longest, pause);
      ok('a crew of ' + String(crew).padStart(3) + ' keeps sliding back -- it never stops and restarts',
         longest / 60 < 0.35,
         'longest unbroken pause ' + (longest / 60).toFixed(2) + 's');
    }
  }

  // ------------------------------------------------------------ the belt itself
  {
    // "i dont want the conveyor to change, it should maintain the same direction and pace",
    // and "when there is only 2 or 3 people left the conveyor belt just stops automatically".
    // Both were one expression: the belt's speed was the crew fraction, so it fell on every
    // death -- and because the slats were drawn at speed x clock, a fall in speed jumped the
    // pattern BACKWARDS. The phase is integrated now and the speed is a constant, so the only
    // thing worth asserting is that the distance travelled goes up by the same amount every
    // frame, whatever is happening to the crew.
    for (const crew of [100, 8, 2]) {
      const g = searching(crew);
      // run() calls its callback BEFORE each update, so the first sample is a zero step that
      // says nothing about the belt. Skipping it is not a weakened claim; counting it was an
      // instrument reporting its own first frame as the belt standing still.
      let back = 0, still = 0, lo = Infinity, hi = 0, prev = g.beltT || 0, first = true;
      run(CFG.finale.searchTime + 2, () => {
        if (S.mode !== 'finale') return 'stop';
        const step = (g.beltT || 0) - prev; prev = g.beltT || 0;
        if (first) { first = false; return; }
        if (step < -1e-9) back++;
        if (step < 1e-9) still++;
        lo = Math.min(lo, step); hi = Math.max(hi, step);
      });
      ok('a crew of ' + String(crew).padStart(3) + ' never reverses the belt and never stops it',
         back === 0 && still === 0 && hi - lo < 1e-6,
         back + ' frames backwards, ' + still + ' stopped, step ' + lo.toFixed(3) + '..' + hi.toFixed(3));
    }
  }

  // ------------------------------------------------------------ marking, by key and by click
  {
    const g = searching(30);
    const L = finaleLayout();
    const d = g.diffs[0];
    // put the lamp on a real difference and press SPACE, through the real key handler
    g.spot.u = d.x / FINALE_ART.w; g.spot.v = d.y / FINALE_ART.h; g.spotVel = { u: 0, v: 0 };
    press(' ');
    ok('SPACE marks the difference under the lamp', g.found.size === 1, g.found.size + ' found');

    // and a click, in CANVAS pixels, through the same path the pointer listener uses
    const d2 = g.diffs.find(x => !g.found.has(x.id));
    const sx = L.right.x + (d2.x / FINALE_ART.w) * L.right.w;
    const sy = L.right.y + (d2.y / FINALE_ART.h) * L.right.h;
    finalePointerAt(sx, sy, true);
    ok('a click on the right-hand painting marks too', g.found.size === 2, g.found.size + ' found');

    // clicking outside both paintings must do nothing at all -- not a mark, not a miss
    const lost = g.line.length;
    finalePointerAt(4, 4, true);
    ok('a click off the paintings is not a wrong answer', g.found.size === 2 && g.line.length === lost,
       g.line.length + ' still standing');
  }

  // ------------------------------------------------------------ a wrong mark
  {
    const g = searching(30);
    const before = g.line.length, phase = g.phase;
    const beforeLight = finaleLightLevel(g);
    // the corner furthest from any painted difference
    let worstU = 0, worstV = 0, worstD = -1;
    for (const u of [0.02, 0.5, 0.98]) for (const v of [0.02, 0.5, 0.98]) {
      let near = 9e9;
      for (const d of g.diffs) near = Math.min(near, Math.hypot(u - d.x / FINALE_ART.w, v - d.y / FINALE_ART.h));
      if (near > worstD) { worstD = near; worstU = u; worstV = v; }
    }
    g.spot.u = worstU; g.spot.v = worstV;
    finaleConfirm(worstU, worstV);
    ok('a wrong mark costs exactly one body', g.line.length === before - 1,
       before + ' -> ' + g.line.length);
    ok('a wrong mark does NOT send the room back to charging', g.phase === phase && g.phase === 'search',
       'phase ' + g.phase);
    ok('a wrong mark does not put the lights out', finaleLightLevel(g) >= beforeLight - 0.001,
       'light ' + finaleLightLevel(g).toFixed(2));
    // A second WRONG mark returns false whether or not the lock exists, so asking that
    // proved nothing. What the lock is for is that the flash cannot be played through:
    // aim at a real difference during it and it must not score, then wait it out and the
    // same mark must score. Both halves, or "it never scores" would pass too.
    const real = g.diffs.find(d => !g.found.has(d.id));
    const wasFound = g.found.size;
    g.spot.u = real.x / FINALE_ART.w; g.spot.v = real.y / FINALE_ART.h;
    finaleConfirm();
    ok('a wrong mark locks the input while it flashes', g.wrongT > 0 && g.found.size === wasFound,
       'wrongT ' + g.wrongT.toFixed(2) + ', ' + g.found.size + ' found during the flash');
    run(g.wrongT + 0.2);
    g.spot.u = real.x / FINALE_ART.w; g.spot.v = real.y / FINALE_ART.h;
    finaleConfirm();
    ok('and the lock lets go when the flash ends', g.found.size === wasFound + 1,
       g.found.size + ' found once it had cleared');
  }

  // ------------------------------------------------------------ what the room SAYS
  {
    const g = searching(30);
    S.floaters.length = 0;
    const d = g.diffs[0];
    g.spot.u = d.x / FINALE_ART.w; g.spot.v = d.y / FINALE_ART.h;
    finaleConfirm();
    // Every floater this room pushed used the key text: while every reader in the file uses
    // txt:, so a death would have announced itself as the literal word "undefined" -- and it
    // was painted over anyway, because the panel fills the whole canvas after drawOverlays has
    // run. Nobody had ever seen one. A floater with no text is not a floater.
    ok('a mark says something the player can actually read',
       S.floaters.length > 0 && S.floaters.every(fl => typeof fl.txt === 'string' && fl.txt.length),
       S.floaters.length + ' pushed: ' + S.floaters.map(fl => JSON.stringify(fl.txt)).join(', '));

    S.floaters.length = 0;
    g.wrongT = 0;
    const who = g.line[g.line.length - 1];
    finaleWrong();
    // Most of the hundred are unnamed -- CFG.names holds 26 -- so the room says ONE IS LOST
    // for them, which is correct. What must never happen is silence, or the word undefined.
    const named = S.floaters.some(fl => typeof fl.txt === 'string' &&
      (fl.txt.indexOf('FALLS') >= 0 || fl.txt.indexOf('ONE IS LOST') >= 0));
    ok('a death says who, or says that someone, was lost', named,
       S.floaters.map(fl => JSON.stringify(fl.txt)).join(', ') || 'nothing was pushed');
  }

  // ------------------------------------------------------------ the crew IS the machine
  // The room's whole argument is that the crowd you saved is the power source. Both ends have
  // been wrong in turn: reading the capped slot count made 36 survivors and 100 identical,
  // and reading survivors-over-starting-crew made ONE survivor read as a machine at 100%.
  {
    const pows = {};
    for (const crew of [1, 100]) {
      charging(crew);
      run(40, () => { if (F().phase === 'search') return 'stop'; finaleTeach(F()); });
      pows[crew] = F().beltPow;
    }
    ok('one survivor does not drive the wheel as hard as a hundred',
       pows[1] < pows[100] * 0.5 || pows[1] < 0.5,
       'beltPow ' + pows[1].toFixed(2) + ' at crew 1 against ' + pows[100].toFixed(2) + ' at crew 100');
  }
  {
    const g = searching(40);
    const before = g.beltPow;
    for (let i = 0; i < 8; i++) { g.wrongT = 0; finaleWrong(); run(0.2); }
    run(2);
    ok('throwing bodies off the belt slows the wheel', g.beltPow < before - 0.05,
       'beltPow ' + before.toFixed(2) + ' -> ' + g.beltPow.toFixed(2) + ' after 8 deaths');
  }

  // ------------------------------------------------------------ winning and losing
  {
    const g = searching(30);
    const list = g.diffs.slice();
    for (let i = 0; i < CFG.finale.findCount - 1; i++) {
      g.spot.u = list[i].x / FINALE_ART.w; g.spot.v = list[i].y / FINALE_ART.h;
      finaleConfirm();
    }
    // NO BACKTICKS in this block -- it lives inside a template literal and a stray pair
    // closes it, with the error pointing at the eval and not at the line. Testing the mode
    // alone stopped being enough once the win was held for a beat: an
    // early win sets winT and leaves the mode alone, so the assertion passed under a build
    // that wins at eight. It has to say the win has not been TRIGGERED, not merely that it
    // has not landed.
    ok('nine of ten does not win', S.mode === 'finale' && !g.winT && g.found.size === CFG.finale.findCount - 1,
       g.found.size + ' found, mode ' + S.mode + ', winT ' + (g.winT || 0));
    const last = list[CFG.finale.findCount - 1];
    g.spot.u = last.x / FINALE_ART.w; g.spot.v = last.y / FINALE_ART.h;
    finaleConfirm();
    // The win is deliberately held for a beat so the tenth tick can land and be read -- it
    // used to be set in the same call that made the mark, so the one animation the player
    // most wants to see was the one that never drew. Both halves are asserted: it must NOT
    // have won yet, and it must win shortly after.
    ok('the tenth mark holds a beat so the last tick can land',
       S.mode === 'finale' && g.winT > 0 && g.found.size === CFG.finale.findCount,
       'winT ' + (g.winT || 0).toFixed(2) + 's, mode ' + S.mode);
    const clockBefore = g.searchT;
    run(0.5);
    ok('and the search clock stops during that beat', Math.abs(g.searchT - clockBefore) < 0.001,
       'clock held at ' + g.searchT.toFixed(2));
    run(1.0);
    ok('the tenth mark beats the wall', S.mode === 'win', 'mode ' + S.mode + ', ' + g.found.size + ' found');
    ok('the win banks the crew that is still standing', loadBest() >= g.line.length,
       'best ' + loadBest() + ', standing ' + g.line.length);
  }
  {
    const g = searching(3);
    let guard = 0;
    while (S.mode === 'finale' && guard++ < 20) {
      g.wrongT = 0;
      finaleConfirm(0.02, 0.02);
    }
    ok('losing the last body loses the room', S.mode === 'lose' && g.line.length === 0,
       'mode ' + S.mode + ', ' + g.line.length + ' left');
  }
  {
    const g = searching(30);
    run(2);
    ok('the search clock is ticking down', g.searchT < CFG.finale.searchTime - 1.5,
       g.searchT.toFixed(1) + 's left of ' + CFG.finale.searchTime + ' after two seconds');
    g.searchT = 0.5;
    run(1.0, () => { if (S.mode !== 'finale') return 'stop'; });
    ok('the search clock runs out on its own', S.mode === 'lose', 'mode ' + S.mode);
  }

  // ------------------------------------------------------------ can a HAND do it?
  // The lamp accelerates and is slowed by friction, so the real cost of the search is
  // travel. Steer it to every difference in turn in the nearest-first order a player
  // would use, pressing the arrows through the real key handler, and time the tour.
  {
    const g = searching(30);
    const L = finaleLayout();
    let secs = 0, marked = 0, stuck = 0;
    const held = {};
    const hold = (k, on) => { if (!!held[k] === on) return; held[k] = on; (on ? press : release)(k); };
    for (let step = 0; step < CFG.finale.findCount; step++) {
      let tgt = null, bestD = 9e9;
      for (const d of g.diffs) {
        if (g.found.has(d.id)) continue;
        const dd = Math.hypot(g.spot.u - d.x / FINALE_ART.w, g.spot.v - d.y / FINALE_ART.h);
        if (dd < bestD) { bestD = dd; tgt = d; }
      }
      if (!tgt) break;
      const tu = tgt.x / FINALE_ART.w, tv = tgt.y / FINALE_ART.h;
      // Guarded by the SEARCH CLOCK, not by a flat thirty seconds per target. With a flat
      // guard a lamp slowed to a twentieth still reached all ten, just far too late, and
      // this line stayed green while only its sibling went red. The player's limit is the
      // clock, so that is the limit here.
      let guard = 0;
      while (guard++ < 60 * CFG.finale.searchTime && secs < CFG.finale.searchTime) {
        const du = tu - g.spot.u, dv = tv - g.spot.v;
        // brake into the target rather than sailing past it, the way a hand does
        const brakeU = g.spotVel.u * 0.22, brakeV = g.spotVel.v * 0.22;
        hold('ArrowLeft',  du - brakeU < -0.004);
        hold('ArrowRight', du - brakeU > 0.004);
        hold('ArrowUp',    dv - brakeV < -0.004);
        hold('ArrowDown',  dv - brakeV > 0.004);
        update(1/60); draw(); secs += 1/60;
        if (S.mode !== 'finale') break;
        const near = Math.hypot((g.spot.u - tu) * L.right.w, (g.spot.v - tv) * L.right.h);
        if (near < 14 && Math.hypot(g.spotVel.u, g.spotVel.v) < 0.25) break;
      }
      if (secs >= CFG.finale.searchTime) { stuck++; for (const k of Object.keys(held)) hold(k, false); break; }
      for (const k of Object.keys(held)) hold(k, false);
      const was = g.found.size;
      finaleConfirm();
      if (g.found.size > was) marked++;
      if (S.mode !== 'finale') break;
    }
    ok('a steered lamp can reach and mark all ten',
       marked === CFG.finale.findCount && stuck === 0,
       marked + ' of ' + CFG.finale.findCount + ' marked in ' + secs.toFixed(1) + 's, no stalls');
    ok('and does it inside the search clock with room to think',
       secs <= CFG.finale.searchTime * 0.6,
       secs.toFixed(1) + 's of travel against ' + CFG.finale.searchTime + 's, ' +
       (100 * secs / CFG.finale.searchTime).toFixed(0) + '% spent steering');
  }

  // ------------------------------------------------------------ the differences themselves
  {
    const g = searching(30);
    ok('there are exactly findCount differences to find', g.diffs.length === CFG.finale.findCount,
       g.diffs.length + ' painted');
    const ids = new Set(g.diffs.map(d => d.id));
    ok('every difference has its own id', ids.size === g.diffs.length, ids.size + ' distinct');
    const L = finaleLayout();
    let offCard = 0, tooClose = 0;
    for (const d of g.diffs) {
      const u = d.x / FINALE_ART.w, v = d.y / FINALE_ART.h;
      if (u < 0.02 || u > 0.98 || v < 0.02 || v > 0.98) offCard++;
      for (const e of g.diffs) {
        if (e === d) continue;
        const px = Math.hypot((u - e.x / FINALE_ART.w) * L.right.w, (v - e.y / FINALE_ART.h) * L.right.h);
        if (px < 26) tooClose++;
      }
    }
    ok('no difference is painted off the edge of its canvas', offCard === 0, offCard + ' outside');
    // Two differences closer than one mark cannot be told apart by pointing at them.
    ok('no two differences sit inside one lamp mark', tooClose === 0, (tooClose / 2) + ' pairs too close');
  }

  // every scene, not just the one that happened to be picked
  {
    const seen = new Set();
    const short = [];
    for (let i = 0; i < 30; i++) {
      const g = chamber(12);
      seen.add(g.scene && (g.scene.name || g.scene.title || i));
      if (g.diffs.length !== CFG.finale.findCount) short.push(g.scene && (g.scene.name || g.scene.title));
    }
    ok('every scene that comes up can paint its full set of differences', short.length === 0,
       seen.size + ' distinct scenes over 60 chambers' + (short.length ? ', short: ' + short.join(', ') : ''));
  }

  console.log('');
  console.log(bad ? (bad + ' FAILED') : 'the last room holds together.');
  if (bad) process.exitCode = 1;
})();
`);
