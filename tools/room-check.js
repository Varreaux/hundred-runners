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
// Rooms whose win lands outside key() (a held key, a timed demo) are marked. For those the
// cost is a DURATION, not a key count, and the number below is that duration.
'use strict';
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');

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
const cost = {
  gears:  d => ({ keys: 6, kind: 'same' }),               // up to 6 steps round a 12-tooth circle
  levers: d => ({ keys: 6, kind: 'distinct' }),           // n = 5..6, one arrow each
  keys:   d => ({ keys: WORDLEN[Math.max(1, Math.min(5, d)) - 1], kind: 'distinct' }),
  word:   d => ({ keys: WORDLEN[Math.max(1, Math.min(5, d)) - 1], kind: 'distinct' }),
  bar:    d => ({ keys: [1, 2, 2, 2, 3][d - 1], kind: 'same', note: 'plus waiting for the marker' }),
  code:   d => ({ keys: 3, kind: 'distinct' }),
  wires:  d => ({ keys: 14, kind: 'distinct' }),
  lights: d => ({ secs: 5.6, defer: true, note: 'two demos must be watched' }),
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
console.log('room        diff  road      time    needs              rate      verdict');
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
  const road = r.warn || armDist;
  const secs = road / scroll;
  let verdict, rate = null;
  if (c.secs && c.defer) {
    // the cost is a duration you cannot hurry
    verdict = c.secs <= secs ? 'ok' : 'IMPOSSIBLE';
    if (verdict !== 'ok') bugs++;
    console.log(`${r.type.padEnd(11)} ${r.diff}     ${String(road).padEnd(6)} ${secs.toFixed(2)}s   ${(c.secs.toFixed(1) + 's fixed').padEnd(18)} ${''.padEnd(9)} ${verdict}   ${c.note || ''}`);
    continue;
  }
  const need = c.keys;
  const usable = secs - (c.secs || 0);
  const lim = CEIL[c.kind] || CEIL.distinct;
  rate = need / usable;
  verdict = usable <= 0 || !isFinite(need) || rate > lim.bug ? 'IMPOSSIBLE' : rate > lim.hard ? 'hard' : 'ok';
  if (verdict === 'IMPOSSIBLE') bugs++; else if (verdict === 'hard') hard++;
  console.log(`${r.type.padEnd(11)} ${r.diff}     ${String(road).padEnd(6)} ${secs.toFixed(2)}s   ${(need + ' ' + c.kind).padEnd(18)} ${(rate.toFixed(2) + '/s').padEnd(9)} ${verdict}   ${c.note || ''}`);
}
console.log(`\n${bugs} impossible, ${hard} hard, ${offLane} off-lane.`);
console.log('Impossible is a bug and must be fixed. Hard is a judgement: quote it to Morgan,');
console.log('do not pad the room to make the number go away.');
process.exit(bugs || offLane ? 1 : 0);
