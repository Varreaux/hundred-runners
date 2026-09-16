// Can a human actually finish this room before the crowd walks into it?
//
// A clean bot result does not answer that. Both bots press keys as fast as the loop runs,
// so neither can tell a room that wants fourteen keys in two seconds from one that wants
// fourteen in eight. This is the arithmetic that sees what they cannot: the keys an
// optimal player needs, against the road they have at CFG.scroll.
//
// Two verdicts, and they mean different things:
//   - above the ceiling for that KIND of pressing the room is not solvable by a person:
//     that is a bug.
//   - just under it the room is hard: that is a difficulty judgement and Morgan's call,
//     so it is reported and NOT quietly padded.
//
// THE BLIND SPOT, and it is the same one both bots have. This asks each verb what an
// optimal player would press, via solveKey -- and solveKey knows the answer. So it measures
// the cost of a player who ALREADY HAS the information, and any room whose difficulty is
// working the information out reads as free.
//
// The keypad is the worked example: it reports 3 keys at 1.38/s, verdict ok, while a player
// who knew the three keys but not their order needed 10.5 presses on average and 18 at
// worst -- 4.8 keys a second typical, 8.3 at worst, against 2.18s of road. It was a
// 1-in-6 guess and this tool called it comfortable.
//
// So: the arithmetic below is sound for a room whose challenge is DEXTERITY, and blind to
// one whose challenge is INFORMATION. Before trusting a verdict, ask whether solveKey
// consults state the player cannot see. If it does, the number here is a floor, not a cost.
//
// The distinction is sharper than "does solveKey read hidden state", because two verbs read
// state and only one is cheating. The keypad's solveKey read an order the player was never
// shown -- a free lunch. lights' solveKey reads a sequence the player has just been made to
// WATCH, so it prices someone who paid attention rather than someone who cheated. Ask
// whether the information is public BY THE TIME INPUT OPENS. If it is, the model is fair.
//
// Rooms whose win lands outside key() (a held key, a timed demo) are marked. For those the
// cost is a DURATION, not a key count, and the number below is that duration.
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const num = (re, d) => { const m = src.match(re); return m ? +m[1] : d; };
const scroll = num(/scroll:\s*([\d.]+)/, 110);
const armDist = num(/armDist:\s*([\d.]+)/, 240);

// the room table, read out of CFG rather than restated here
const roomsBlock = src.slice(src.indexOf('  rooms: ['), src.indexOf('  finale: {'));
const rooms = [...roomsBlock.matchAll(/\{\s*x:\s*(\d+),\s*lane:\s*(\d+),\s*type:\s*'(\w+)',\s*diff:\s*(\d+)(?:,\s*warn:\s*(\d+))?\s*\}/g)]
  .map(m => ({ x: +m[1], lane: +m[2], type: m[3], diff: +m[4], warn: m[5] ? +m[5] : null }));

// A room on a lane that does not exist where it stands is drawn as a hazard hanging in
// open sky with no track under it, and nobody can ever reach it. Four shipped that way.
// \s+ between every field, not a single space: the older fork entries are column-aligned
// with two spaces and a one-space regex silently skipped them, which reported four of
// Linh's shipped rooms as standing on lanes that do not exist. They do exist.
const forks = [...src.matchAll(/\{\s*x:\s*(\d+),\s*from:\s*(\d+),\s*to:\s*(\d+),\s*merge:\s*(\d+),\s*split:\s*[\d.]+\s*\}/g)]
  .map(m => ({ x: +m[1], to: +m[3], merge: +m[4] }));
const rampLen = num(/rampLen:\s*(\d+)/, 200), gapWidth = num(/gapWidth:\s*(\d+)/, 120);
const finaleX = num(/finale:\s*\{\s*x:\s*(\d+)/, 15600), entrance = num(/entrance:\s*(\d+)/, 760);
const spans = { 0: [[entrance - 20, finaleX + 20]] };
for (const f of forks) (spans[f.to] = spans[f.to] || []).push([f.x + rampLen, f.merge]);

// THE ROAD IS NOT THE WARN. This is the correction that matters most in this file, and it
// came from Morgan playing rather than from any measurement either session took.
//
// `warn` decides when a room ARMS. It does not decide when the player can see it, and you
// cannot read a puzzle for a room that is off the right-hand edge of the screen. The view's
// right edge sits at V.left + V.vw = cam + packFront + 0.36 * V.vw, and the front runner is
// at cam + packFront, so a room becomes usable exactly 0.36 * V.vw ahead of the crowd --
// 345.6px at zoom 1, whatever `warn` says. At CFG.scroll that is 3.14s.
//
// Measured across a real run: 3.13s for the zoom-1 rooms in the mill, 4.32s for the sweeper
// at zoom 0.73, 8.15s deep in the cave at zoom 0.39. Not the 8.18s that warn 900 implied,
// and not the 12.27s that warn 1350 implied. Raising a warn past the visible window buys a
// number in a config file and nothing a player can use.
//
// So the denominator below is the VISIBLE window, taken by driving a real game, and `warn`
// is reported beside it as what it is: when the room arms, which only helps a player who
// notices the hint line naming a hotkey for a room they cannot yet see.
//
// The lever for a room that is too slow is therefore NOT warn. It is a shorter puzzle, or
// one readable without a demo, or a wider view -- and only the last is a global change.
// Driving a real game is the only honest way to get this: the zoom at a given room depends
// on which lanes are alive in view there, which depends on the forks, which change.
function visibleWindows() {
  const out = {};
  // this file only READ the source until now, so there is no browser environment in it.
  // Borrow the harness's stubs rather than keeping a second copy that can drift.
  const hsrc = fs.readFileSync(path.join(__dirname, 'freeze-check.js'), 'utf8');
  eval(hsrc.slice(hsrc.indexOf('function makeCtx()'), hsrc.indexOf('eval(src'))
    .replace("path.join(__dirname, 'audio-mock.js')", JSON.stringify(path.join(__dirname, 'audio-mock.js'))));
  global.KeyboardEvent = class { constructor(t, o) { Object.assign(this, o); this.type = t; } };
  let kh = null;
  global.window.addEventListener = (ev, fn) => { if (ev === 'keydown') kh = fn; };
  global.window.dispatchEvent = e => { if (kh) kh({ key: e.key, repeat: false, preventDefault() {} }); };
  global.location = { search: '' };
  global.URLSearchParams = class { has() { return false; } get() { return null; } };
  global.__out = out;
  // `src` here is the whole HTML file -- this tool reads it with regexes -- so pull the
  // script out of it before evaluating, and drop the strict-mode line the harness drops.
  const gsrc = src.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
  eval(gsrc + `
;(function(){
  const seen = {}, zoom = {}, armed = {}, flagged = {};
  // Whether the off-screen tab exists is DERIVED, not asserted. Instrument fillText and
  // ask the only question that matters: while a room is armed and off the right of the
  // view, does its hotkey get drawn on screen anyway? If it does, the player can act on
  // the warn distance and the warn window counts; if it does not, only the visible window
  // does. Encoding that as a constant -- or as a comment telling the next person to
  // remember -- is how the harness's hardcoded course length went stale.
  const realFillText = ctx.fillText.bind(ctx);
  let probe = null;
  ctx.fillText = function (txt, x, y) { if (probe) probe.push([String(txt), x]); return realFillText(txt, x, y); };
  S.mode = 'play';
  for (let f = 0; f < 60 * 220 && S.mode === 'play'; f++) {
    const t = f / 60;
    update(1/60); devSolve();
    const right = V.left + V.vw;
    for (const r of S.rooms) {
      const k = r.type + '@' + r.x;
      if (seen[k] === undefined && r.x <= right) { seen[k] = t; zoom[k] = V.zoom; }
      if (armed[k] === undefined && r.state === 'armed') armed[k] = t;
      if (seen[k] !== undefined && !__out[k] && S.cam + CFG.packFront >= r.x)
        __out[k] = { road: t - seen[k], zoom: zoom[k], armed: armed[k] !== undefined ? t - armed[k] : 0, tab: !!flagged[k] };
    }
    // sample the drawn frame rather than every one: the answer does not change per frame
    if (f % 15 === 0) {
      const off = S.rooms.filter(r => r.state === 'armed' && r.x > right);
      if (off.length) {
        probe = [];
        try { draw(); } catch (e) {}
        for (const r of off) {
          const k = r.type + '@' + r.x;
          // x must be ON the canvas, not merely large. Without the upper bound this matched
          // the ORDINARY badge, which is drawn at the room's own screen position -- off the
          // right of the canvas, at x well past W. The detector then reported a tab
          // precisely when there was none, and the falsification run came out inverted.
          if (probe.some(([txt, x]) => txt === String(r.hot) && x > W - 80 && x < W)) flagged[k] = true;
        }
        probe = null;
      }
    }
  }
})();
`);
  return out;
}
let WIN = {};
try { WIN = visibleWindows(); } catch (e) { console.log('could not drive a game: ' + e.message); }

const typesBlock = src.slice(src.indexOf('  types: {'), src.indexOf('  crusherPeriod'));
const verbOf = {};
for (const m of typesBlock.matchAll(/^\s*(\w+):\s*\{\s*verb:\s*'(\w+)'/gm)) verbOf[m[1]] = m[2];

// What an optimal player must do, per verb, read off each verb's own start()/key() rather
// than guessed. Where a verb has a range the WORST case is used, because the worst case is
// the one that loses people.
//
// `kind` matters as much as the count. Six presses of ONE arrow key is a different act from
// six distinct letters, and alternating two keys is faster than either -- people can drum a
// left-right alternation at five or six a second and cannot type six distinct letters at
// that rate. Scoring them all against one ceiling made four shipped rooms look impossible
// and one of mine look fine, both wrong.
const WORDLEN = [3, 4, 5, 6, 6];
// The sweeper's demo clock, read out of index.html rather than written down here. Throws
// rather than falling back to a default: a cost model that cannot find the numbers it
// prices should stop, not quietly price the room off a guess.
const SWEEP = (() => {
  const m = src.match(/const SWEEP = (\{[^}]*\})/);
  if (!m) throw new Error('room-check: no `const SWEEP = {...}` in index.html -- the sweeper was retimed or renamed, and this tool cannot price it until it is pointed at the new numbers.');
  return eval('(' + m[1] + ')');
})();
const cost = {
  gears:  d => ({ keys: 6, kind: 'same' }),               // up to 6 steps round a 12-tooth circle
  levers: d => ({ keys: 6, kind: 'distinct' }),           // n = 5..6, one arrow each
  keys:   d => ({ keys: WORDLEN[Math.max(1, Math.min(5, d)) - 1], kind: 'distinct' }),
  word:   d => ({ keys: WORDLEN[Math.max(1, Math.min(5, d)) - 1], kind: 'distinct' }),
  bar:    d => ({ keys: [1, 2, 2, 2, 3][d - 1], kind: 'same', note: 'plus waiting for the marker' }),
  code:   d => ({ keys: 3, kind: 'distinct' }),
  wires:  d => ({ keys: 14, kind: 'distinct' }),
  // Forced watching is a duration you cannot hurry; the keys on top are a rate. lights has
  // BOTH, so it needs both, and it used to declare only the first -- at the MINIMUM, which
  // priced a third of the room.
  //
  // It is now DERIVED, not restated. The old line said 8.4s and 10 keys, measured off a
  // two-round sweeper; when Morgan cut it to one round of three it went on reporting the
  // old cost against the new room and called it IMPOSSIBLE. That is the failure mode this
  // file's header warns about -- a constant encoding a fact about the thing under test
  // goes stale by ACCUSING the game. Reading SWEEP means a retime cannot do that again.
  lights: d => ({ secs: SWEEP.lead + SWEEP.len * SWEEP.flash, keys: SWEEP.len, kind: 'distinct',
                  note: `one round of ${SWEEP.len} watched, then typed` }),
  // --- act three ---
  dig:    d => { const rate = 0.19 + 0.005 * d, decay = 0.40 + 0.03 * d;
                 // presses to cut through, assuming the player alternates at 5/s
                 const per = rate - decay / 5;
                 return per <= 0 ? { keys: Infinity, kind: 'alt', note: 'slumps faster than it cuts' }
                                 : { keys: Math.ceil(1 / per), kind: 'alt', note: 'alternating; it slumps back if you stop' }; },
  lift:   d => { const gain = 0.46 - 0.01 * d, build = 0.56 + 0.03 * d, ease = 1.6;
                 const hold = 0.72 / build, per = gain * hold, cool = 0.72 / ease;
                 const cycles = Math.ceil(1 / per);
                 return { secs: cycles * (hold + cool), defer: true,
                          note: `${cycles} holds of ${hold.toFixed(2)}s, ${cool.toFixed(2)}s between` }; },
  blast:  d => ({ keys: (3 + Math.min(2, Math.floor(d / 2))) + 5 + 1, kind: 'distinct',
                  secs: 0.45, note: 'charge, pay out the fuse, fire' }),
};
// keys per second a person can actually manage, by what kind of pressing it is
const CEIL = { distinct: { bug: 3.2, hard: 2.4 }, same: { bug: 6.5, hard: 5.0 }, alt: { bug: 6.5, hard: 5.0 } };
let bugs = 0, hard = 0;
console.log(`scroll ${scroll} px/s, default warning ${armDist} px = ${(armDist / scroll).toFixed(2)}s\n`);
console.log('room        diff  zoom   usable   needs              rate      verdict   (warn)');
let offLane = 0;
for (const r of rooms) {
  const sp = (spans[r.lane] || []).find(([a, b]) => r.x >= a && r.x <= b);
  if (!sp || r.x + gapWidth > sp[1]) {
    offLane++;
    console.log(`${r.type.padEnd(11)} ${r.diff}     x ${r.x} lane ${r.lane}  OFF-LANE  ` +
      (sp ? `span ${sp[0]}..${sp[1]} ends before the room does` : 'lane does not exist here'));
  }
  const verb = verbOf[r.type];
  const f = cost[verb];
  if (!f) { console.log(`${r.type.padEnd(11)} ${r.diff}     -- no cost model for verb '${verb}'`); continue; }
  const c = f(r.diff);
  // The road is what the player can ACT on. That is the visible window, OR the warn
  // window where the room announces itself at the screen edge before it arrives -- an
  // armed room off the right of the view now draws a tab with its hotkey, count and
  // countdown, which is what makes `warn` mean anything at all. Measured over a run the
  // tab fires for eight rooms and gives up to 12.32s of lead.
  //
  // Whether that tab exists is detected by watching the frame, not asserted here, so if it
  // is ever removed this tool notices on the next run instead of waiting for someone to
  // read a comment.
  const w = WIN[r.type + '@' + r.x];
  const road = r.warn || armDist;
  // the warn window only counts for a room that was OBSERVED announcing itself off screen
  const secs = w ? (w.tab ? Math.max(w.road, w.armed) : w.road) : road / scroll;
  let verdict, rate = null;
  if (c.secs && c.defer) {
    // the cost is a duration you cannot hurry
    verdict = c.secs <= secs ? 'ok' : 'IMPOSSIBLE';
    if (verdict !== 'ok') bugs++;
    console.log(`${r.type.padEnd(11)} ${r.diff}     ${(w ? w.zoom.toFixed(2) : ' -  ').padEnd(6)} ${secs.toFixed(2)}s   ${(c.secs.toFixed(1) + 's fixed').padEnd(18)} ${''.padEnd(9)} ${verdict}   ${String(road).padEnd(5)} ${c.note || ''}`);
    continue;
  }
  const need = c.keys;
  const usable = secs - (c.secs || 0);
  const lim = CEIL[c.kind] || CEIL.distinct;
  rate = need / usable;
  verdict = usable <= 0 || !isFinite(need) || rate > lim.bug ? 'IMPOSSIBLE' : rate > lim.hard ? 'hard' : 'ok';
  if (verdict === 'IMPOSSIBLE') bugs++; else if (verdict === 'hard') hard++;
  console.log(`${r.type.padEnd(11)} ${r.diff}     ${(w ? w.zoom.toFixed(2) : ' -  ').padEnd(6)} ${secs.toFixed(2)}s   ${(need + ' ' + c.kind).padEnd(18)} ${(rate.toFixed(2) + '/s').padEnd(9)} ${verdict}   ${String(road).padEnd(5)} ${c.note || ''}`);
}
console.log(`\n${bugs} impossible, ${hard} hard, ${offLane} off-lane.`);
console.log('Impossible is a bug and must be fixed. Hard is a judgement: quote it to Morgan,');
console.log('do not pad the room to make the number go away.');
process.exit(bugs || offLane ? 1 : 0);
