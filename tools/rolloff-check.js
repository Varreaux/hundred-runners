// The last room's clock, which is now a line of people.  node tools/rolloff-check.js [root]
//
// There is no timer drawn in the finale any more. The search still lasts CFG.finale
// searchTime, and it is spent one survivor at a time off the end of the conveyor, with the
// lamp closing as the belt empties. Everything a player can see about how long is left is
// therefore a CONSEQUENCE of that schedule, and none of it is checkable by eye: a lamp that
// closes slightly too fast and a lamp that closes correctly look identical in a still, and
// a run that ends eight seconds early looks exactly like a run that ended.
//
// What it checks, at four crew sizes:
//   the run lasts searchTime and not a second more or less, ending as the last body goes
//   the lamp opens at FULL and closes to its SET MINIMUM, the same two ends every game
//   and the SPEED between them is the one thing the crew changes: two survivors are at the
//     candle by the halfway mark, a hundred are still losing light in the final second
//   bodies leave one at a time, evenly, over the LEFT end -- the end the belt carries them
//     toward -- and into the water
//   the queue behind steps up, so a hundred survivors keep the belt full to about two thirds
//   a wrong mark spends a body OUT OF TURN and so brings the end forward by exactly one gap
//   the scoreboard moves with every body, whichever of the two took them
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
const STORE = new Map();
global.localStorage = { getItem: k => (STORE.has(k) ? STORE.get(k) : null),
                        setItem: (k, v) => STORE.set(k, String(v)), removeItem: k => STORE.delete(k) };
let bad = 0;
const ok = (name, pass, detail) => { if (!pass) bad++; console.log((pass ? 'ok  ' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : '')); };

eval(src + `
;(function(){
  const F = () => S.finale;
  function searching(crew) {
    startRun();
    S.runners.forEach(r => { r.state = 'run'; });
    S.runners.slice(0, crew).forEach(r => { r.state = 'arrived'; });
    S.stats.arrived = crew;
    S.cam = S.camMax; updateView(1);
    startFinale();
    beginFinaleCharge(F());
    // Straight to the lamps coming on. The charge is finale-check's business, not this
    // one's, and at crew 1 it is eleven seconds of flywheel before the clock even starts.
    for (let i = 0; i < 60 * 40 && F().phase !== 'search'; i++) update(1/60);
    return F();
  }
  // Every frame, not every sixth: this is a check about WHEN things happen, and a sampled
  // reading of the moment a run ends is a reading of the sampler.
  function play(g, secs, each) {
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) {
      if (S.mode !== 'finale') return i / 60;
      update(1/60);
      // READ FIRST, then stop. The last body over the end and the mode flipping to 'lose'
      // happen in the same update, so a sampler that tests the mode before reading is blind
      // to precisely the event it was written for: it reported 99 of 100 bodies and a lamp
      // that never closed below 1%, both of which looked like faults in the room.
      if (each) each((i + 1) / 60);
      if (i % 12 === 0) draw();
      if (S.mode !== 'finale') return (i + 1) / 60;
    }
    return secs;
  }
  const L0 = () => finaleLayout();

  // ---------------------------------------------------------------- the clock, at four sizes
  const bottoms = {};
  for (const crew of [1, 5, 24, 100]) {
    const g = searching(crew);
    const full = finaleSpotFullR(L0());
    const openFrac = finaleLampFrac(g);
    const openR = finaleSpotRadius(g, L0());
    let minFrac = 1, worstRise = 0, prevFrac = 1, drops = [], prevLine = g.line.length, lastDropT = 0;
    // When the lamp first sits on its minimum, and what it was doing in the last second
    // before the room ended. Those two readings are the whole claim: the SPEED varies and
    // the two ends do not.
    let bottomedAt = null, lastSecondFall = 0, rPrev = finaleSpotRadius(g, L0());
    const minR = CFG.finale.lampMinR;
    const ended = play(g, CFG.finale.searchTime + 6, (t) => {
      const fr = finaleLampFrac(g);
      if (fr > prevFrac + 1e-9) worstRise = Math.max(worstRise, fr - prevFrac);
      prevFrac = fr; minFrac = Math.min(minFrac, fr);
      const r = finaleSpotRadius(g, L0());
      if (bottomedAt == null && r <= minR + 0.5) bottomedAt = t;
      if (t > CFG.finale.searchTime - 1) lastSecondFall += Math.max(0, rPrev - r);
      rPrev = r;
      if (g.line.length < prevLine) { drops.push(+(t - lastDropT).toFixed(3)); lastDropT = t; prevLine = g.line.length; }
    });
    const want = CFG.finale.searchTime;
    ok('a crew of ' + String(crew).padStart(3) + ' lasts the ' + want + 's the clock was, and ends as the last one goes',
       Math.abs(ended - want) < 1.2 && S.mode === 'lose' && g.line.length === 0,
       'ran ' + ended.toFixed(1) + 's, mode ' + S.mode + ', ' + g.line.length + ' left');
    ok('a crew of ' + String(crew).padStart(3) + ' opens the lamp at FULL, whatever it arrived with',
       openFrac > 0.999 && openR >= full - 0.5,
       'lamp ' + openR.toFixed(0) + ' of ' + full.toFixed(0) + ' at the thud');
    ok('a crew of ' + String(crew).padStart(3) + ' closes it all the way, and never reopens it',
       minFrac < 0.001 && worstRise < 1e-6,
       'fell to ' + (minFrac * 100).toFixed(1) + '%' + (worstRise ? ', ROSE by ' + worstRise.toFixed(3) : ''));
    // THE CLAIM. Morgan: two people are at the minimum by the 45s mark and a full crew is
    // still diminishing every second. Scored against dimAt and not against a number written
    // down here, so moving the curve moves the check with it rather than failing at it.
    const wantBottom = CFG.finale.searchTime * CFG.finale.dimAt(crew);
    ok('a crew of ' + String(crew).padStart(3) + ' reaches the candle at ' + wantBottom.toFixed(0) + 's, not before or after',
       bottomedAt != null && Math.abs(bottomedAt - wantBottom) < 1.2,
       bottomedAt == null ? 'NEVER bottomed out' : 'bottomed at ' + bottomedAt.toFixed(1) + 's of ' + CFG.finale.searchTime);
    bottoms[crew] = bottomedAt;
    // A big crew must still be LOSING light at the end; a small one must already be flat.
    // Reading only one of the two lets a fade that is merely slow pass as one that is paced.
    const big = crew >= 90;
    ok('a crew of ' + String(crew).padStart(3) + ' is ' + (big ? 'still losing light in the final second' : 'already flat at the end'),
       big ? lastSecondFall > 0.4 : lastSecondFall < 0.01,
       'the last second moved the lamp ' + lastSecondFall.toFixed(2) + 'px');
    const gaps = drops.slice(1);
    const spread = gaps.length ? Math.max(...gaps) - Math.min(...gaps) : 0;
    ok('a crew of ' + String(crew).padStart(3) + ' goes over the end one at a time, evenly',
       drops.length === crew && spread < 0.05,
       drops.length + ' of ' + crew + ' bodies, every ' + (gaps.length ? gaps[0].toFixed(2) : (want).toFixed(2)) + 's' +
       (spread >= 0.05 ? ', SPREAD ' + spread.toFixed(3) : ''));
  }

  // ---------------------------------------------------------------- the speed itself
  {
    // THE ASSERTION ABOVE CANNOT CATCH THIS ONE, and finding that out is why this exists.
    // "reaches the candle at Ns" scores against CFG.finale.dimAt, so flattening dimAt to a
    // constant -- deleting the entire feature -- moves the check with the fault and passes.
    // The curve cannot be both the thing under test and the ruler it is measured with.
    //
    // So this says the PROPERTY, in Morgan's own numbers rather than the game's: a small
    // crew is at the candle inside the first half, a full crew is not there until the end,
    // and the order never inverts. Written down on purpose -- it is the specification, and
    // a spec parsed out of the implementation is not a spec.
    const half = CFG.finale.searchTime * 0.55;
    ok('the fade is PACED by the crew: a thin line is dark early, a full one only at the end',
       bottoms[1] != null && bottoms[100] != null &&
       bottoms[1] <= half && bottoms[100] >= CFG.finale.searchTime * 0.9 &&
       bottoms[1] < bottoms[5] + 0.1 && bottoms[5] < bottoms[24] && bottoms[24] < bottoms[100],
       'candle at ' + [1, 5, 24, 100].map(c => c + ':' + (bottoms[c] == null ? 'never' : bottoms[c].toFixed(0) + 's')).join('  '));
  }

  // ---------------------------------------------------------------- the two ends are fixed
  {
    // Every game travels the same distance of light. It is the only thing the crew does NOT
    // touch, and it is what "a set max and a set min" means: the check that fails if anyone
    // reintroduces a crew-scaled opening or a floor that varies.
    const opens = [], closes = [];
    for (const crew of [2, 17, 100]) {
      const g = searching(crew);
      opens.push(finaleSpotRadius(g, L0()));
      play(g, CFG.finale.searchTime + 2);
      closes.push(finaleSpotRadius(g, L0()));
    }
    const full = finaleSpotFullR(L0()), minR = CFG.finale.lampMinR;
    ok('every crew opens on the same maximum and ends on the same minimum',
       Math.max(...opens) - Math.min(...opens) < 0.5 && Math.abs(opens[0] - full) < 0.5 &&
       Math.max(...closes) - Math.min(...closes) < 0.5 && Math.abs(closes[0] - minR) < 0.5,
       'opens ' + opens.map(r => r.toFixed(0)).join('/') + ' against ' + full.toFixed(0) +
       ', closes ' + closes.map(r => r.toFixed(0)).join('/') + ' against ' + minR);
  }

  // ---------------------------------------------------------------- the belt stays full behind
  {
    const g = searching(100);
    const deckAt = {}, lineAt = {};
    play(g, CFG.finale.searchTime + 2, (t) => {
      deckAt[Math.floor(t)] = g.deck.length; lineAt[Math.floor(t)] = g.line.length;
    });
    const cap = Math.max(...Object.values(deckAt));
    const at = k => Math.floor(CFG.finale.searchTime * k);
    // THE MECHANISM, not a fraction somebody picked. This asserted late < cap * 0.3 and then
    // failed at 10 drawn of 33 -- a belt that had visibly thinned to under a third, reported
    // as a fault, because the gap at the left took 74 units off the deck and moved cap. The
    // claim worth making has two halves and no arbitrary number in either: while a queue is
    // still waiting the belt runs AT capacity, and once the queue is exhausted the drawn
    // count IS the crew, so the belt thins with the survivors from there on.
    const fullEarly = deckAt[at(1 / 3)] === cap && lineAt[at(1 / 3)] > cap;
    const thinLate = deckAt[at(0.9)] === lineAt[at(0.9)] && lineAt[at(0.9)] < cap;
    ok('the belt runs full while a queue waits, then thins with the crew once it is gone',
       fullEarly && thinLate,
       cap + ' slots: at a third ' + deckAt[at(1 / 3)] + ' drawn of ' + lineAt[at(1 / 3)] +
       ' alive, at nine tenths ' + deckAt[at(0.9)] + ' of ' + lineAt[at(0.9)]);
  }

  // ---------------------------------------------------------------- bodies go in the water
  {
    const g = searching(12);
    const L = L0();
    // DELTAS. S.stats survives startRun in this process, so an absolute reading here carried
    // every body from all four crews above it and reported 232 dead out of a crew of 12.
    const dead0 = S.stats.dead, arrived0 = S.stats.arrived;
    let offEnd = 0, splashed = 0;
    play(g, 20, () => {
      for (const fl of g.falling) {
        // FLAGGED, not timed. A test on the body's own age was true on more than one
        // frame at some dt and double-counted every body: 4 over the end against 2 in the
        // water, which reads as half of them landing somewhere else.
        // THE LEFT end. The belt's top scrolls in -x, so that is the end a body the belt has
        // beaten goes over; this read the right end for as long as the drop was wrongly there.
        if (!fl._seenOff) { fl._seenOff = true; if (fl.x <= L.deck.x) offEnd++; }
        if (fl.splashed && !fl._seen) { fl._seen = true; splashed++; }
      }
    });
    ok('every body the clock spends leaves the LEFT end of the belt and reaches the water',
       offEnd > 0 && splashed === offEnd, offEnd + ' over the end, ' + splashed + ' splashed');
    ok('and the scoreboard moves with each of them',
       S.stats.dead - dead0 === offEnd && arrived0 - S.stats.arrived === offEnd,
       (S.stats.dead - dead0) + ' newly dead, ' + (arrived0 - S.stats.arrived) + ' struck off arrived');
  }

  // ---------------------------------------------------------------- nobody teleports to the end
  {
    // Morgan, 2026-09-23: they should not "just fall off when it's time to fall off". The body
    // the clock is about to spend now slips down the belt over its last couple of seconds and
    // the fall begins where the standing body was, so the drop itself has no jump in it.
    //
    // Measured as the DISTANCE between the last place a body was drawn standing and the first
    // place it is drawn falling, which is the only form of the claim a still could never
    // settle: both frames look right on their own and it is the gap between them that was
    // wrong. It was 59.6 units, three body-widths, on the one body the player is watching.
    //
    // FOUR units. A frame of slip is 1.4 at the very most (a hundred aboard, where the slip is
    // compressed into 0.75s), and the fixed launch this replaced sits 8.5 from the point a
    // body actually topples off the drum -- so four has better than twice the margin on each
    // side. Six was picked before either number was measured and left the falsifier's own
    // injected fault clearing the bar by 41%.
    const g = searching(24);
    const L = L0();
    // MEASURED AT THE SOLE, not at the origin, and that distinction is the whole of it. The two
    // drawings pivot about different points -- a standing body rotates about its sole, a
    // falling one about its origin -- so finaleTakeBody deliberately offsets the launch origin
    // by up to 4.4 units to make the INK line up. Measured at the origin this check reported
    // that offset as a 5.3-unit jump and failed a build in which nothing visible had moved,
    // which is the same fault as measuring a shadow without honouring the transform that drew
    // it. The sole is the one point both transforms agree on when they are right.
    const SOLE = 4.3 * 1.15;
    const soleOf = (x, y, rot, pivoted) => pivoted
      ? { x, y: y + SOLE }                                                  // standing: the pivot IS the sole
      : { x: x - SOLE * Math.sin(rot || 0), y: y + SOLE * Math.cos(rot || 0) };
    const stood = new Map();
    let worst = 0, seen = 0, whoWorst = '';
    play(g, 32, () => {
      for (const d of g.deck) stood.set(d.r, soleOf(d.x, L.deck.y - 2 + (d.bob || 0) + (d.dy || 0), d.rot, true));
      for (const fl of g.falling) {
        if (fl._jump) continue;
        fl._jump = true;
        const was = stood.get(fl.r);
        if (!was) continue;
        seen++;
        const at = soleOf(fl.x, fl.y, fl.rot, false);
        const j = Math.hypot(at.x - was.x, at.y - was.y);
        if (j > worst) { worst = j; whoWorst = fl.r.name || 'one of them'; }
      }
    });
    ok('a body the clock spends goes over from where it was standing, not from across the machine',
       seen > 2 && worst < 4,
       seen + ' bodies, the worst jump ' + worst.toFixed(1) + ' units (' + whoWorst + ')');
  }

  // ---------------------------------------------------------------- belt, edge, water, no pause
  {
    // Morgan, 2026-09-23: "the last one (next one to die) still pauses briefly... I'm looking
    // for a seemless progression from the conveyor, to edge to the water."
    //
    // It was the geometry, not the schedule. Pacing a body evenly along its PATH spends path
    // length on dropping once it reaches the drum, so its sideways speed fell to cos(1.15) =
    // 41% at exactly the moment it should have looked fastest: traced on one body, 6.1 px/s
    // falling away to 3.1 over its last two seconds. The slip is paced by sideways travel now
    // and the drum's angle is read off x, so this asserts the property that fix produces --
    // the leftward speed never falls, from the slot to the water.
    //
    // TRACKED AT THE BODY'S CENTRE, and the hand-over frame is skipped. The first version of
    // this followed the SOLE, on the reasoning that the two drawings pivot about different
    // points -- true, but a body that has let go is TUMBLING, so its sole swings about the
    // centre at up to 8.7 px/s and the reading is mostly rotation. There is no fixed point on
    // a turning body. The centre is the thing that travels, and the one frame where the two
    // drawings swap pivots is asserted separately, at the sole, by the check above.
    let worstDrop = 0, where = '', checked = 0;
    for (const crew of [5, 12, 40]) {
      const g = searching(crew);
      let who = null, prev = null, prevV = null, handover = false;
      play(g, CFG.finale.searchTime + 2, () => {
        const s = g.deck.filter(d => d.arrived).sort((a, b) => a.x - b.x)[0];
        if (!who && s && s.slip) { who = s.r; prev = s.x; prevV = null; handover = false; return; }
        if (!who) return;
        const d = g.deck.find(o => o.r === who), fl = g.falling.find(o => o.r === who);
        const at = d ? d.x : (fl ? fl.x : null);
        if (at == null) { who = null; return; }
        if (!d && !handover) { handover = true; prev = at; return; }   // the frame it lets go
        const v = (prev - at) * 60;
        // Only once it is genuinely under way: the first moments are a standing start.
        if (prevV != null && prevV > 1.2 && v < prevV - 0.6) {
          if (prevV - v > worstDrop) { worstDrop = prevV - v; where = 'crew ' + crew + ', ' + prevV.toFixed(1) + ' -> ' + v.toFixed(1) + ' px/s'; }
        }
        prev = at; if (v > 0.02) { prevV = v; checked++; }
      });
    }
    ok('a body never slows down between the belt, the edge and the water',
       checked > 500 && worstDrop < 0.8,
       checked + ' frames under way, worst loss of speed ' + worstDrop.toFixed(2) + ' px/s' + (where ? ' (' + where + ')' : ''));
  }

  // ---------------------------------------------------------------- a wrong mark costs a turn
  {
    // A wrong mark takes a body OUT OF TURN, so the run has to end one whole gap early --
    // that is the cost of one, in the only currency the room has left. Measured against a
    // clean run of the same crew rather than against searchTime, because the two must differ
    // by exactly one gap and not merely both be "about ninety".
    const crew = 10;
    let clean = play(searching(crew), CFG.finale.searchTime + 6);
    const g = searching(crew);
    play(g, 0.5);
    finaleWrong();
    const hurt = 0.5 + play(g, CFG.finale.searchTime + 6);
    const gap = CFG.finale.searchTime / crew;
    ok('a wrong mark brings the end forward by exactly one body',
       Math.abs((clean - hurt) - gap) < 0.6,
       'clean ' + clean.toFixed(1) + 's against ' + hurt.toFixed(1) + 's, a gap of ' + gap.toFixed(1) + 's');
  }

  // ---------------------------------------------------------------- nothing is drawn saying 90
  {
    const g = searching(30);
    play(g, 3);
    // The whole change is that the player is never told the time. A chip that came back
    // would be invisible to every check above, since they all read state and not pixels.
    const seen = [];
    const realFill = ctx.fillText.bind(ctx);
    ctx.fillText = (txt, x, y) => { seen.push(String(txt)); return realFill(txt, x, y); };
    draw();
    ctx.fillText = realFill;
    const clocky = seen.filter(t => /^\\d?\\d:\\d\\d$/.test(t.trim()));
    ok('the room never tells the player how long is left', clocky.length === 0,
       seen.length + ' strings drawn' + (clocky.length ? ', CLOCK: ' + clocky.join(' ') : ''));
    ok('and the crew is on screen instead', seen.some(t => /^CREW /.test(t.trim())),
       seen.filter(t => /CREW/.test(t)).join(' ') || 'no crew chip');
  }
})();
`);
console.log(bad ? '\n' + bad + ' FAILED' : '\nthe belt is the clock.');
process.exit(bad ? 1 : 0);
