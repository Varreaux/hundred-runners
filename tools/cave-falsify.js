// Prove tools/cave-check.js can fail, the way tools/enc-falsify.js does for act three.
//
//   node tools/cave-falsify.js
//
// For each invariant, inject the specific fault that invariant exists to catch into a COPY of
// index.html, run cave-check against the copy, and require THAT LINE to go red. Anything still
// green under its own fault is reported DEAD and this exits non-zero.
//
// Writing it down is not optional. Four of cave-check's six checks passed their own fault the
// first time they were written: two restated the game's arithmetic in the tool, so the tool was
// checking itself and the game could be broken freely; one compared a height to a height
// computed the same way, which subtracts a number from itself and can never fail; and one
// measured a moving thing at a single instant. All four looked exactly like working checks.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

// [name, what the fault is, exact source to replace, what to replace it with, the line that must go red]
const FAULTS = [
  ['prop',    'the pit prop stops tracking the roof sag',
   'const H = CFG.tunnelH - tunnelSag(wx, lane) - 4;', 'const H = CFG.tunnelH - 4;',
   'pit prop cap'],
  ['ladder',  'the ladder stops tracking the roof sag',
   'const H = CFG.tunnelH - tunnelSag(wx, lane) + 4;', 'const H = CFG.tunnelH + 4;',
   'ladder head'],
  ['drain',   'floor spans stop breaking at a hole',
   '  const out = []; let at = lo;', '  const out = [[lo, hi]]; let at = hi;',
   'bridge a hole'],
  ['drip',    'the seepage drip falls past the drain',
   'ctx.ellipse(sx, top + span * k * k, 1.5, 3.4, 0, 0, 6.28)',
   'ctx.ellipse(sx, top + span * k * k + 40, 1.5, 3.4, 0, 0, 6.28)',
   'leaves its gallery'],
  ['skeleton', 'a skeleton is dropped into a gallery',
   'const cy = loC + (hiC - loC) * (0.35 + hash(g * 11.3) * 0.5);', 'const cy = hiC + 150;',
   'skeleton/gallery overlaps'],
  ['outside', 'the workings stop being bounded by the rock',
   'if (cx - L / 2 < FAC.seam + 120 || cx + L / 2 > CFG.exit - 120) continue;', 'if (false) continue;',
   'outside the rock'],
];

const base = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let dead = 0;
console.log('injecting ' + FAULTS.length + ' faults, each into a copy, and requiring its own check to go red\n');
for (const [name, what, from, to, expect] of FAULTS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cave-falsify-'));
  const n = base.split(from).length - 1;
  if (n !== 1) { console.log('FAIL ' + name.padEnd(9) + 'anchor matched ' + n + ' times, not once -- the fault was never injected'); dead++; continue; }
  fs.writeFileSync(path.join(dir, 'index.html'), base.replace(from, to));
  fs.mkdirSync(path.join(dir, 'tools'));
  for (const f of ['freeze-check.js', 'audio-mock.js']) fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(dir, 'tools', f));
  let out = '';
  try { out = execFileSync('node', [path.join(__dirname, 'cave-check.js'), dir], { encoding: 'utf8' }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const red = out.split('\n').some(l => l.startsWith('FAIL') && l.includes(expect));
  console.log((red ? 'ok   ' : 'DEAD ') + name.padEnd(9) + what +
    (red ? '' : '  -- the check stayed green under its own fault'));
  if (!red) dead++;
}
console.log(dead ? '\n' + dead + ' check(s) cannot fail. They are decoration.'
                 : '\nevery act-two invariant fails under its own fault.');
process.exit(dead ? 1 : 0);
