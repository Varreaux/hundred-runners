// Proves tools/rolloff-check.js can FAIL.  node tools/rolloff-falsify.js
//
// A check that has only ever been seen to pass tells you nothing about the check, only about
// the build. One fault per claim the room makes, each put where the driver has separately been
// confirmed to go -- a green falsifier that injected its fault somewhere the sweep never
// reached is the failure mode this project has already paid for once, in path-check.
//
// The fourth of these is the one that earned the file. Flattening CFG.finale.dimAt to a
// constant deletes the whole crew-paced fade, and the assertion written to catch it PASSED,
// because it scored the lamp against dimAt -- the thing the fault had just changed. A check
// that reads its expectation out of the code under test cannot fail when that code is wrong,
// only when it disagrees with itself. rolloff-check carries a separate assertion now that
// states the property in Morgan's numbers instead.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const CASES = [
  // NO NUMBER IN THE PATTERN. This read /lasts the 90s/ and went stale the moment the search
  // became 75, reporting NOT CAUGHT for a fault it had caught perfectly -- which reads as a
  // hole in the check rather than as a stale ruler, and is the more expensive of the two to
  // believe. A falsifier's pattern has to match the CLAIM and not the value, for the same
  // reason the checks themselves derive their expectations from the game.
  { name: 'the clock spends the crew twice as fast (the run should end halfway)',
    want: /lasts the \d+s the clock was/,
    from: 'f.rollGap = Math.max(0.05, CFG.finale.searchTime / f.crewAtSearch);',
    to:   'f.rollGap = Math.max(0.05, CFG.finale.searchTime / (f.crewAtSearch * 2));' },
  { name: 'the opening is scaled by the crew again (the max should be the same every game)',
    want: /opens the lamp at FULL/,
    from: 'const crewR = minR + (full - minR) * finaleLampFrac(f);',
    to:   'const crewR = minR + (full - minR) * finaleLampFrac(f) * clamp01(f.line.length / 100);' },
  { name: 'the fade stops being paced by the crew (a thin line should bottom out halfway)',
    want: /the fade is PACED by the crew/,
    from: 'dimAt: c => 0.5 + 0.5 * Math.min(1, Math.max(0, c) / 100) },',
    to:   'dimAt: c => 1 },' },
  { name: 'the lamp bottoms out below its set minimum',
    want: /opens on the same maximum and ends on the same minimum/,
    from: '  return Math.max(minR, crewR);',
    to:   '  return Math.max(8, crewR - 20);' },
  { name: 'the timer chip is put back on the panel',
    want: /never tells the player how long is left/,
    from: "  const crewCol = finaleLampFrac(f) < 0.18 ? '#ff6b6b' : '#d4a84b';",
    to:   "  const crewCol = finaleLampFrac(f) < 0.18 ? '#ff6b6b' : '#d4a84b';\n" +
          "  drawChip(W / 2 - 190, '', `${Math.floor(f.searchT / 60)}:${String(Math.floor(f.searchT % 60)).padStart(2, '0')}`, '#f1c40f', 86);" },
];
let bad = 0;
for (const c of CASES) {
  if (src.split(c.from).length - 1 !== 1) { console.log('FAIL  anchor missing: ' + c.name); bad++; continue; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rolloff-'));
  fs.writeFileSync(path.join(dir, 'index.html'), src.replace(c.from, c.to));
  const r = cp.spawnSync('node', [path.join(__dirname, 'rolloff-check.js'), dir], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  // The RIGHT line has to fail, not merely some line: a fault that trips a different
  // assertion proves the suite is noisy, not that the assertion works.
  const caught = out.split('\n').some(l => l.startsWith('FAIL') && c.want.test(l));
  if (!caught) bad++;
  console.log((caught ? 'ok  ' : 'FAIL') + '  caught: ' + c.name);
  if (!caught) console.log(out.split('\n').filter(l => l.startsWith('FAIL')).slice(0, 4).map(l => '        ' + l).join('\n') || '        (nothing failed at all)');
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(bad ? '\n' + bad + ' NOT CAUGHT' : '\nall ' + CASES.length + ' faults are caught.');
process.exit(bad ? 1 : 0);
