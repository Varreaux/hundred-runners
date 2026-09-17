// Can each of finale-check's assertions actually FAIL?
//
//   node tools/finale-falsify.js
//
// Same argument as enc-falsify, applied to the last room. finale-check came back green on
// its first complete run, and a green first run is exactly the situation where you learn
// nothing: it is equally consistent with "the room is correct" and with "the assertions are
// wired to nothing". Act three already produced three assertions of the second kind in one
// file in one day, so the cost of finding out is one deliberately broken copy each.
//
// For each assertion, break the game in the specific way that assertion exists to catch, in
// a COPY, and require that exact line to go red. Anything that stays green under its own
// injected fault is decoration and is reported as unproven.
//
// The faults are crude on purpose. This is not a model of a realistic regression; it is a
// wire test. Two of them are the real bugs this transplant actually shipped with, kept as
// faults so they can never come back unnoticed: the generator's light running ahead of the
// phase it gates, and the belt admitting one runner per frame however short the charge.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'finfals-'));

// fragment of the assertion's name -> [what the fault is, how to inject it]
const FAULTS = [
  ['the intro hands over to the generator',
   'let the boss talk for ever, so the generator never starts',
   s => s.replace('if (f.introT >= FINALE_INTRO_WALL + FINALE_INTRO_SPEECH) beginFinaleCharge(f);',
                  'if (f.introT >= 1e9) beginFinaleCharge(f);')],

  ['the room is still dark while the generator has barely begun',
   'wire the room lights straight to the generator switch, so they are full the moment it starts',
   s => s.replace('  const progress = finaleChargeProgress(f);', '  const progress = 1;')],

  ['the room never stands fully lit while the generator is still charging',
   'let the charge light run past the level the room reaches once it is searching',
   s => s.replace('  return 0.07 + progress * 0.62 + flicker * (0.35 + progress);',
                  '  return 0.07 + progress * 1.6 + flicker * (0.35 + progress);')],

  ['a crew of   1 winds the flywheel',
   'let the flywheel start winding before the crew is aboard, so the charge is the walk',
   s => s.replace('  return boarded * 0.25 + (boarded >= 1 ? wound * 0.75 : 0);',
                  '  return Math.max(boarded, wound);')],

  // Re-aimed. The original fault turned the spawn WHILE into an IF, capping boarding at one
  // person per frame -- but once the belt was capped at 35 slots the cadence became about one
  // per frame anyway, so the fault stopped changing anything and the assertion went green for
  // a reason that had nothing to do with it. It now removes the belt-capacity guard, which is
  // the fault that actually shipped in this work: slot 99 got a target of x -1234, reached it
  // on its first frame, and counted as aboard.
  ['a crew of 100 all stands ON the belt',
   'remove the belt-capacity guard so the overflow is given slots off the end of the deck',
   s => s.replace('f.spawnI < shown && f.spawnT >= cadence', 'f.spawnT >= cadence')],

  ['every survivor is standing on the belt when the search begins',
   'start the search while the crew is still walking, at a tenth of the charge',
   // 0.5 was not low enough and that is worth writing down: boarding is only the first
   // QUARTER of the progress number, so any threshold at or above 0.25 is still reached
   // after the last person is aboard. A fault has to land inside the range the assertion
   // covers, not merely below the value it tests.
   s => s.replace('    if (finaleChargeProgress(f) >= 1) {', '    if (finaleChargeProgress(f) >= 0.1) {')],

  ['they STAY standing',
   'let arrived runners drift, as if the wheel were still drawing them in',
   s => s.replace('    } else {\n      d.x = targetX;\n    }', '    } else {\n      d.x = targetX + Math.sin(S.t * 3) * 30;\n    }')],

  ['SPACE marks the difference under the lamp',
   'drop SPACE from the finale keydown branch',
   s => s.replace("if (S.mode === 'finale') { HELD[k] = true; if (k === ' ') finaleConfirm(); return; }",
                  "if (S.mode === 'finale') { HELD[k] = true; return; }")],

  ['a click on the right-hand painting marks too',
   'make the pointer move the lamp but never mark',
   s => s.replace('  if (click) finaleConfirm(u, v);', '  if (false) finaleConfirm(u, v);')],

  ['a click off the paintings is not a wrong answer',
   'let a click anywhere on the canvas count as an answer',
   s => s.replace('  if (!side) return;', '  if (!side) { if (click) finaleConfirm(0.02, 0.02); return; }')],

  ['a wrong mark costs exactly one body',
   'stop a wrong mark taking anybody off the belt',
   s => s.replace('f.line.splice(f.line.indexOf(near.r), 1)[0]', 'f.line[f.line.indexOf(near.r)]')],

  ['a wrong mark does NOT send the room back to charging',
   'send the room back to the generator on a wrong mark, the thing her notes say not to do',
   s => s.replace('  f.flashWrong = 0.45;\n  f.wrongT = 0.9;', '  f.flashWrong = 0.75;\n  f.wrongT = 0.9;\n  f.phase = \'charge\'; f.chargeT = 0; f.packDone = 0;')],

  ['a wrong mark locks the input while it flashes',
   'accept marks during the wrong-answer flash',
   s => s.replace('  if (f.wrongT > 0) return false;\n', '  if (false) return false;\n')],

  ['and the lock lets go when the flash ends',
   'never clear the lock, so the room is dead after one wrong answer',
   s => s.replace('  f.wrongT = Math.max(0, (f.wrongT || 0) - dt);', '  f.wrongT = Math.max(0.1, (f.wrongT || 0));')],

  ['nine of ten does not win',
   'win two marks early',
   s => s.replace('    if (f.found.size >= CFG.finale.findCount) { f.winT = 0.85;',
                  '    if (f.found.size >= CFG.finale.findCount - 2) { f.winT = 0.85;')],

  ['the tenth mark holds a beat so the last tick can land',
   'win in the same call that makes the mark, so the winning tick is never drawn',
   s => s.replace("{ f.winT = 0.85; saveBest(f.line.length); }", '{ S.mode = \'win\'; saveBest(f.line.length); }')],

  ['and the search clock stops during that beat',
   'let the search clock keep running through the winning animation',
   s => s.replace('    if (f.winT > 0) {', '    if (false) {')],

  ['the tenth mark beats the wall',
   'require one more difference than the room ever paints, so the wall can never be beaten',
   s => s.replace('    if (f.found.size >= CFG.finale.findCount) { f.winT = 0.85;',
                  '    if (f.found.size >= CFG.finale.findCount + 1) { f.winT = 0.85;')],

  ['losing the last body loses the room',
   'let the room carry on after the last survivor has gone',
   s => s.replace('  if (f.line.length <= 0) S.mode = \'lose\';', '  if (f.line.length <= -1) S.mode = \'lose\';')],

  ['the search clock runs out on its own',
   'stop the search clock ending the room',
   s => s.replace('    if (f.searchT <= 0) S.mode = \'lose\';', '    if (f.searchT <= -1e9) S.mode = \'lose\';')],

  ['the search clock is ticking down',
   'freeze the search clock',
   s => s.replace('    f.searchT -= dt;', '    f.searchT -= 0;')],

  ['a steered lamp can reach and mark all ten',
   'slow the lamp to a hundredth of its speed, so the search cannot be finished inside the clock',
   // A twentieth was not enough and that was worth learning rather than assuming: only the
   // top speed is capped, the acceleration is untouched, and ten hops of about 0.2 in UV
   // still came in around 35s of the 90. A fault has to be big enough to actually break the
   // thing, or a green means the fault was weak and not that the check is strong.
   s => s.replace('cursorSpeed: 1.15,', 'cursorSpeed: 0.0115,')],

  ['no two differences sit inside one lamp mark',
   'stack two differences on the same spot so pointing cannot tell them apart',
   s => s.replace('function makeFinaleDiffs(', 'function makeFinaleDiffs__real(')
         .replace('function pickFinaleScene(',
                  'function makeFinaleDiffs(sc) { const d = makeFinaleDiffs__real(sc); if (d.length > 1) { d[1].x = d[0].x; d[1].y = d[0].y; } return d; }\nfunction pickFinaleScene(')],

  ['no difference is painted off the edge of its canvas',
   'paint one difference past the right edge of the card',
   s => s.replace('function makeFinaleDiffs(', 'function makeFinaleDiffs__real(')
         .replace('function pickFinaleScene(',
                  'function makeFinaleDiffs(sc) { const d = makeFinaleDiffs__real(sc); if (d.length) d[0].x = FINALE_ART.w * 1.4; return d; }\nfunction pickFinaleScene(')],

  ['the win banks the crew that is still standing',
   'bank nothing when the wall is beaten',
   s => s.replace('{ f.winT = 0.85; saveBest(f.line.length); }', '{ f.winT = 0.85; }')],
];

let proved = 0, unproven = 0;
console.log('finale-falsify -- breaking the last room on purpose, one assertion at a time');
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
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), bad);
  for (const f of ['freeze-check.js', 'audio-mock.js']) fs.copyFileSync(path.join(root, 'tools', f), path.join(dir, 'tools', f));
  let out = '';
  try {
    out = execFileSync('node', [path.join(root, 'tools', 'finale-check.js'), dir], { encoding: 'utf8' });
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
if (unproven) { console.log('UNPROVEN ASSERTIONS ABOVE -- do not quote finale-check as covering them.'); process.exitCode = 1; }
else console.log('Every injected fault was caught. finale-check is connected to the game.');
