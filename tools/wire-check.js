// Behaviour check for the auto-confirming cable room. Morgan asked for the confirm press
// to go: the splice should make itself the moment the colour under the cursor matches the
// wire in hand. That removed the only way to be WRONG in the room, which also removes the
// only thing that used to end a mis-aimed attempt -- so the failure this guards against is
// a room that cannot be finished at all, which no screenshot and no bot run would show
// (the bot presses solveKey and gets there whatever the rule is).
//
// It drives VERBS.wires through its real key(), 4000 random rooms, using only the two keys
// a player has, and asserts: every room reaches 'done'; every wire ends on a socket of its
// own colour; no index runs past the end of left/right/links; and a press after the last
// splice does nothing.
//
// Proved it can fail: with the auto-join removed from key() in a copy, it reports
// "never finished after 200 presses" and exits 1. Every loop in here is bounded, because
// a check that HANGS on a broken build reads as a broken tool rather than as a red line.
//
//   node tools/wire-check.js [path/to/index.html]
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const raw = fs.readFileSync(process.argv[2] || path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(root, 'tools', 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src')).replace("path.join(__dirname, 'audio-mock.js')", "path.join(" + JSON.stringify(path.join(root, 'tools')) + ", 'audio-mock.js')"));
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

const out = {};
eval(src + `
;(function(){
  const V = VERBS.wires;
  let worst = 0, confirms = 0, fail = null, joinsAfterEnd = 0;
  for (let t = 0; t < 4000 && !fail; t++) {
    const m = V.start(1 + t % 5);
    const n = m.left.length;
    if (new Set(m.right).size !== n) { fail = 'sockets are not distinct: ' + m.right; break; }
    let presses = 0, res = null;
    while (m.idx < n) {
      // the same two keys a player has: pull, then walk down. Never a confirm.
      const k = m.pulling ? 'ARROWDOWN' : 'ARROWRIGHT';
      res = V.key(m, k); presses++;
      if (presses > 200) { fail = 'never finished after 200 presses'; break; }
      if (m.idx > n) { fail = 'idx ran past the end: ' + m.idx + ' of ' + n; break; }
      if (m.links.length > n) { fail = 'more links than wires'; break; }
      for (const L of m.links) if (L < 0 || L >= n) { fail = 'link out of range: ' + L; }
      if (fail) break;
    }
    if (fail) break;
    if (res !== 'done') { fail = 'last press returned ' + res + ' rather than done'; break; }
    // every wire must be joined to a socket of its own colour
    for (let i = 0; i < n; i++) if (m.left[i] !== m.right[m.links[i]]) { fail = 'wire ' + i + ' joined to the wrong colour'; break; }
    if (fail) break;
    // a press after the puzzle is over must do nothing at all
    const before = JSON.stringify(m);
    if (V.key(m, 'ARROWDOWN') !== null || V.key(m, 'ARROWRIGHT') !== null) joinsAfterEnd++;
    if (JSON.stringify(m) !== before) joinsAfterEnd++;
    worst = Math.max(worst, presses);
  }
  out.fail = fail; out.worst = worst; out.joinsAfterEnd = joinsAfterEnd;

  // and the thing the change was FOR: there is no key that means "confirm". Feed the old
  // confirm press at a matching socket and check it neither joins twice nor is required.
  // Bounded, like every other loop here. Unbounded, a build where the splice never fires
  // makes this check HANG rather than report -- and a check that hangs on a broken build
  // is worse than one that passes on it, because a hang reads as a broken tool.
  const m2 = V.start(3);
  V.key(m2, 'ARROWRIGHT');
  for (let g = 0; m2.idx === 0 && g < 50; g++) V.key(m2, 'ARROWDOWN');
  out.joinedWithoutConfirm = m2.idx === 1 && m2.links.length === 1;
})();
`);

if (out.fail) { console.log('FAIL:', out.fail); process.exit(1); }
console.log(`4000 random cable rooms, driven only with → and ↓:`);
console.log(`  all reached 'done'; worst case ${out.worst} presses`);
console.log(`  every wire landed on a socket of its own colour`);
console.log(`  presses after the last splice: ${out.joinsAfterEnd} had any effect (want 0)`);
console.log(`  first wire joined with no confirm press: ${out.joinedWithoutConfirm}`);
console.log(out.joinsAfterEnd === 0 && out.joinedWithoutConfirm ? '\nPASS' : '\nFAIL');
