// Can each of hall-check's invariants actually FAIL?
//
//   node tools/hall-falsify.js
//
// Same argument as tools/enc-falsify.js, and hall-check has earned it twice over. It has
// not merely been green about nothing — it has been confidently WRONG twice in one day:
//
//   - it measured three ANIMATED machines at a single instant and reported the answer as a
//     bound. The hammer's blow throws sparks 19 units past its quiet silhouette for 9% of
//     its cycle, so it read the true extent of about one machine in eight.
//   - it recorded EVERY canvas, so when a cupola was sampled mid-tap it swallowed the smoke
//     sprite's own offscreen frame, measured the machine at 576x398, and failed the game.
//
// Neither was silent. Both produced a number that looked like a measurement. So: for each
// invariant, break the hall in the specific way that invariant exists to catch, in a COPY,
// and confirm that exact line goes red. Anything that stays green under its own injected
// fault is decoration, and is reported as such rather than counted.
//
// Of hall-check's five, three have been seen to fail on real regressions — the neighbour
// overlap, the floor rule, and the ceiling rule. "every belt lands on the machine it
// drives" and "power sources match" never have, which by this repo's own rule means
// nothing is known about them.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hallfals-'));

// name fragment of the invariant -> [what the fault is, how to inject it]
const FAULTS = [
  ['no two machines overlap on their SOLID extents',
   'widen the cupola\'s bed plate to 306 units so it reaches into its neighbours',
   s => s.replace('  ctx.fillStyle = DARK; ctx.fillRect(sx - 46, y - 10, 92, 10);',
                  '  ctx.fillStyle = DARK; ctx.fillRect(sx - 260, y - 10, 306, 10);')],

  ['no paint escapes the room',
   'run the cupola\'s flue 144 units further up, out through the roof of the mill',
   s => s.replace('  ctx.fillStyle = DARK; ctx.fillRect(sx - 16, y - 116, 32, 23);',
                  '  ctx.fillStyle = DARK; ctx.fillRect(sx - 16, y - 260, 32, 167);')],

  ['no paint escapes below the deck',
   'run the engine\'s warm wash 200 units under the floor it stands on',
   s => s.replace('  ctx.fillStyle = wg; ctx.fillRect(sx - 104, y - 24, 122, 44);',
                  '  ctx.fillStyle = wg; ctx.fillRect(sx - 104, y - 24, 122, 224);')],

  // the two that have never been red
  ['every belt lands on the machine it drives',
   'send the blower\'s belt to a point 420 units to the right of the blower',
   s => s.replace('  if (bay.feat === 2) return [sx + 72, y - 62];',
                  '  if (bay.feat === 2) return [sx + 420, y - 62];')],

  ['power sources match',
   'hang the steam hammer off a leather belt, which is not how a steam hammer works',
   s => s.replace('  if (bay.feat === 1) return null;                 // the steam hammer takes steam, not a belt',
                  '  if (bay.feat === 1) return [sx + 20, y - 60];')],
];

let proved = 0, unproven = 0;
console.log('hall-falsify -- breaking the mill on purpose, one invariant at a time');
console.log('');
for (const [name, how, mangle] of FAULTS) {
  const bad = mangle(SRC);
  if (bad === SRC) {
    console.log('  ??  ' + name);
    console.log('        could not inject: the anchor this fault edits is gone, so the fault');
    console.log('        cannot be reproduced and the invariant is UNPROVEN either way.');
    unproven++;
    console.log('');
    continue;
  }
  const file = path.join(tmp, 'bad-' + (proved + unproven) + '.html');
  fs.writeFileSync(file, bad);
  let out = '';
  try {
    out = execFileSync('node', [path.join(root, 'tools', 'hall-check.js'), file], { encoding: 'utf8' });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const line = out.split('\n').find(l => l.includes(name)) || '';
  const fired = line.trim().startsWith('FAIL');
  console.log('  ' + (fired ? 'ok  ' : 'DEAD') + '  ' + name);
  console.log('        fault: ' + how);
  if (fired) { console.log('        caught: ' + line.trim().replace(/^FAIL\s+/, '')); proved++; }
  else {
    console.log('        DID NOT FIRE. This invariant is green on a build it exists to reject,');
    console.log('        so its green says nothing. Fix the assertion, not the game.');
    if (line) console.log('        it said: ' + line.trim());
    unproven++;
  }
  console.log('');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(proved + ' of ' + (proved + unproven) + ' invariants proved able to fail.');
if (unproven) {
  console.log('UNPROVEN INVARIANTS ABOVE -- do not quote hall-check as covering them.');
  process.exitCode = 1;
} else {
  console.log('Every injected fault was caught. hall-check is connected to the hall.');
}
