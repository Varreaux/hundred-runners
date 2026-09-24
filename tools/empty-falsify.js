// Can each of empty-check's assertions actually FAIL?
//
//   node tools/empty-falsify.js
//
// Same argument as finale-falsify. empty-check came back green on its first complete run,
// and this one has a particular reason to be suspicious of that: it is driven by a THINNED
// crowd, and the two earlier attempts at measuring the same thing both returned a confident
// 0 for reasons that had nothing to do with the game. One counted the FRAMES a room sat
// unreachable, when the expiry fires in the same frame reachability goes false -- so the
// duration is zero and the event still happens. The other watched for the state transition
// and reported 0 while four rooms had plainly closed. A green here is cheap to disbelieve
// and cheap to check.
//
// Three faults, one per assertion, injected into a COPY:
//   - the coverage gate, because an assertion about rooms that expire is worth nothing in a
//     sweep where no room expires, and that is the failure mode this whole file grew out of
//   - the bug Morgan reported, restored exactly
//   - the OPPOSITE bug: a latch that never fires, which passes the second assertion
//     perfectly while silently deleting every CLEAN in the game
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'emptyfals-'));

// fragment of the assertion's name -> [what the fault is, how to inject it]
const FAULTS = [
  ['the runs exercised the branch',
   'no room can ever go out of reach, so nothing expires and there is nothing to judge',
   s => s.replace('function canReach(r, room) {\n  if (r.x >= room.x + killTo(room)) return false;',
                  'function canReach(r, room) {\n  return true;\n  if (r.x >= room.x + killTo(room)) return false;')],

  ['no room that closed itself unreached awarded a CLEAN',
   "Morgan's bug, restored: every room that closes with no deaths cheers, reached or not",
   s => s.replace('      else if (room.met) cleanRoom(room);', '      else cleanRoom(room);')],

  ['every room that killed somebody was latched as met',
   'the latch never fires -- which passes the assertion above by deleting every CLEAN instead',
   s => s.replace('&& r.lane === room.lane && r.x >= holdLine(room) - 40)) room.met = true;',
                  '&& r.lane === -1 && r.x >= holdLine(room) - 40)) room.met = true;')],
];

let proved = 0, unproven = 0;
console.log('empty-falsify -- breaking the room-closing branch on purpose, one assertion at a time');
console.log('');
for (const [name, how, mangle] of FAULTS) {
  const bad = mangle(SRC);
  if (bad === SRC) {
    console.log('  ??  ' + name);
    console.log('       could not inject: the anchor this fault edits is gone, so the fault');
    console.log('       cannot be reproduced and the assertion is UNPROVEN either way.');
    unproven++;
    console.log('');
    continue;
  }
  const dir = fs.mkdtempSync(path.join(tmp, 'c-'));
  fs.writeFileSync(path.join(dir, 'index.html'), bad);
  let out = '';
  try {
    out = execFileSync('node', [path.join(root, 'tools', 'empty-check.js'), dir], { encoding: 'utf8' });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const line = out.split('\n').find(l => l.includes(name)) || '';
  const fired = line.startsWith('FAIL');
  console.log('  ' + (fired ? 'ok  ' : 'DEAD') + '  ' + name);
  console.log('       fault: ' + how);
  if (fired) { console.log('       caught: ' + line.trim().replace(/^FAIL\s+/, '')); proved++; }
  else {
    console.log('       DID NOT FIRE. This assertion is green on a build it exists to reject,');
    console.log('       so its green says nothing. Fix the assertion, not the game.');
    if (!line) console.log('       (the assertion did not appear in the output at all)');
    unproven++;
  }
  console.log('');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(proved + ' of ' + (proved + unproven) + ' assertions proved able to fail.');
if (unproven) { console.log('UNPROVEN ASSERTIONS ABOVE -- do not quote empty-check as covering them.'); process.exitCode = 1; }
else console.log('Every injected fault was caught. empty-check is connected to the game.');
