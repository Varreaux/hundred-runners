// Can each of enc-check's invariants actually FAIL?
//
//   node tools/enc-falsify.js
//
// A check that has only ever been seen to pass tells you nothing about the check, only
// about the build. This repo already says that; act three then proved why. enc-check's
// first invariant asserted `encSurfaceY(wx) - laneY(encTopLane(wx)) <= 0`, and the moment
// encSurfaceY ended with `Math.min(..., laneY(top) - 20) - relief` that became identically
// true. It could not fail however wrong the hill got, and "all act-three invariants hold"
// was reported to Morgan after every push for hours with one of them meaning nothing.
//
// So: for each invariant, break the game in the specific way it exists to catch, in a COPY,
// and confirm that exact line goes red. Any invariant that stays green under its own
// injected fault is decoration and is reported as such.
//
// The faults are deliberately crude. The point is not to model a realistic regression, it
// is to establish that the assertion is connected to anything at all.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'encfals-'));

// name fragment of the invariant -> [description, how to break it]
const FAULTS = [
  ['no terrace floats above its own hillside',
   'drop the hill 400 units below the track it carries',
   s => s.replace('return Math.max(laneY(CFG.laneCount - 1), Math.min(base - roll, laneY(encTopLane(wx)) - 20) - relief);',
                  'return Math.max(laneY(CFG.laneCount - 1), Math.min(base - roll, laneY(encTopLane(wx)) - 20) - relief) + 400;')],
  ['the crest is not pinned flat against its own ceiling',
   'lift the crest 400 units so it pins flat against its own ceiling',
   s => s.replace('const relief = Math.min(120,', 'const relief = 400 + Math.min(120,')],
  ['merge ramps do not overrun the next merge',
   'move two act-three merges to within 40 units of each other',
   s => s.replace('{ x: 13240, from: 3, to: 4, merge: 14200, split: 0.5 },',
                  '{ x: 13240, from: 3, to: 4, merge: 14380, split: 0.5 },')],
  ['no two rooms overlap on their drawn extents',
   'throw the ditch spoil 400 units past its gap',
   s => s.replace('const DITCH_SPOIL = 140;', 'const DITCH_SPOIL = 400;')],
  ['the breach spans the wall at ground level',
   'narrow the breach so solid masonry stands where the crowd walks',
   s => s.replace('const bL = wx0 + 4, bR = wx0 + ww - 4;', 'const bL = wx0 + 70, bR = wx0 + ww - 70;')],
  ['no lamp pools out in the open',
   'delete lampPools\' guard so it lights the open hillside in daylight',
   s => s.replace('    if (lx >= CFG.exit) continue;\n', '')],
];

let broken = 0, unfalsifiable = 0;
console.log('enc-falsify -- breaking act three on purpose, one invariant at a time');
console.log('');
for (const [name, how, mangle] of FAULTS) {
  const bad = mangle(SRC);
  if (bad === SRC) {
    console.log('  ?? ' + name);
    console.log('       could not inject: the anchor this fault edits is gone, so the fault');
    console.log('       cannot be reproduced and the invariant is UNPROVEN either way.');
    unfalsifiable++;
    continue;
  }
  const dir = fs.mkdtempSync(path.join(tmp, 'c-'));
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), bad);
  for (const f of ['freeze-check.js', 'audio-mock.js']) fs.copyFileSync(path.join(root, 'tools', f), path.join(dir, 'tools', f));
  let out = '';
  try {
    out = execFileSync('node', [path.join(root, 'tools', 'enc-check.js'), dir], { encoding: 'utf8' });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const line = out.split('\n').find(l => l.includes(name)) || '';
  const fired = line.startsWith('FAIL');
  console.log('  ' + (fired ? 'ok  ' : 'DEAD') + '  ' + name);
  console.log('       fault: ' + how);
  if (fired) { console.log('       caught: ' + line.trim().replace(/^FAIL\s+/, '')); broken++; }
  else {
    console.log('       DID NOT FIRE. This invariant is green on a build it exists to reject,');
    console.log('       so its green says nothing. Fix the assertion, not the game.');
    unfalsifiable++;
  }
  console.log('');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(broken + ' of ' + (broken + unfalsifiable) + ' invariants proved able to fail.');
if (unfalsifiable) { console.log('UNPROVEN INVARIANTS ABOVE -- do not quote enc-check as covering them.'); process.exitCode = 1; }
else console.log('Every injected fault was caught. enc-check is connected to the game.');
