// Prove tools/spot-check.js can fail.  node tools/spot-falsify.js
//
// A check that has only ever been seen to pass tells you nothing about the check, only about
// the build. This makes a throwaway copy of the tree, puts back three faults that were
// really in it, and asserts the check goes red for each -- by NAME, not just non-zero, so a
// check that fails for the wrong reason does not read as a check that works.
//
// The three are one of each kind the check claims to catch, because they fail differently:
// a difference nobody can see, a tolerance that accepts anything, and two differences inside
// one press. The first two produce the identical complaint from a player -- "it counted and
// I could not see anything" -- and the whole point of the instrument is telling them apart.
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spot-falsify-'));
fs.mkdirSync(path.join(tmp, 'tools'));
for (const f of ['spot-check.html', 'spot-check.js']) fs.copyFileSync(path.join(root, 'tools', f), path.join(tmp, 'tools', f));
const clean = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const FAULTS = [
  { name: 'a difference nobody can see',
    want: /TOO FAINT TO SEE/,
    // the contract's inkblot as it shipped: rgba(18,22,28) painted onto a floor that is
    // already rgba(18,22,28)-ish, at half alpha
    edit: s => s.replace(
      /    const blotC = [\s\S]*?ctx\.beginPath\(\); ctx\.ellipse\(dx \+ 3\.4[^\n]*\n/,
      "    ctx.fillStyle = k === 'bloodSpot' ? 'rgba(60,18,20,0.55)' : 'rgba(18,22,28,0.5)';\n" +
      "    ctx.beginPath(); ctx.ellipse(dx, dy, 7, 3.5, 0.35, 0, 6.28); ctx.fill();\n") },
  { name: 'a tolerance that grows with the crew',
    want: /FAIL\s+the crew does not buy aim/,
    edit: s => s.replace('  const hitR = CFG.finale.hitRadius;',
                         '  const hitR = Math.max(36, Math.min(r * 0.35, 90));') },
  { name: 'a difference you can find without the lamp',
    want: /FAIL\s+no difference in contract\s+can be found unlit/,
    // the contract's marks at full weight: dark ink on parchment at luminance 195 gives far
    // more contrast than the read floor asks for, and 7% of it survives the veil
    // Strip BOTH the card weight and the per-mark weights, so the contract's marks go back to
    // full contrast on the brightest ground in the room. Anchored on the kinds rather than on
    // one number, because the numbers are tuned every round and an anchor that names a value
    // goes stale silently -- which this one already did once, and said so.
    edit: s => s.replace(/markWeight: [\d.]+, markInk: '[^']*',/, '')
                .replace(/(\{ x: \d+, y: \d+), w: [\d.]+(, kind: '(?:stamp|seal|thumb|hourglass|shackle|inkblot|tear)' \})/g, '$1$2') },
  { name: 'a pale mark readable on a dark card',
    want: /FAIL\s+no difference in banquet\s+can be found unlit/,
    // THE ROOM HAS TWO LEAK MODES and the other case only samples one of them. That one is
    // dark ink on the contract's bright parchment; this is a pale stroke on a dark ground,
    // which is what the chandelier's arm was at 0.9 before the damping sweep was found to
    // have skipped it. Scored on the build that really shipped it, it comes out at 13.9
    // against a cut of 10 -- so the bracket is anchored at both ends by builds that were
    // photographed and read, rather than by one failure mode and an assumption about the other.
    edit: s => s.replace("ctx.strokeStyle = 'rgba(40,34,26,0.9)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';",
                         "ctx.strokeStyle = 'rgba(196,164,84,0.9)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';")
                .replace("{ x: 50, y: 38, w: 0.78, kind: 'chandelier' }", "{ x: 50, y: 38, kind: 'chandelier' }") },
  { name: 'two differences inside one press',
    want: /FAIL\s+no two differences in line/,
    edit: s => s.replace("{ x: 173, y: 188, kind: 'bloodSpot' }", "{ x: 116, y: 177, kind: 'bloodSpot' }") },
];

let bad = 0;
for (const f of FAULTS) {
  const broken = f.edit(clean);
  if (broken === clean) { console.log('FAIL  could not inject: ' + f.name + ' (the anchor has moved)'); bad++; continue; }
  fs.writeFileSync(path.join(tmp, 'index.html'), broken);
  let out = '', code = 0;
  try { out = cp.execFileSync('node', [path.join(tmp, 'tools', 'spot-check.js'), tmp],
                              { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { out = (e.stdout || '') + ''; code = e.status; }
  const caught = code !== 0 && f.want.test(out);
  if (!caught) bad++;
  console.log((caught ? 'ok  ' : 'FAIL') + '  the check catches ' + f.name +
              (caught ? '' : '   (exit ' + code + ', and nothing matched ' + f.want + ')'));
}
// and the clean tree still passes, so the check is not simply always red
fs.writeFileSync(path.join(tmp, 'index.html'), clean);
let code = 0;
try { cp.execFileSync('node', [path.join(tmp, 'tools', 'spot-check.js'), tmp], { stdio: 'ignore' }); }
catch (e) { code = e.status; }
if (code !== 0) bad++;
console.log((code === 0 ? 'ok  ' : 'FAIL') + '  and it passes the tree as it stands');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? '\n' + bad + ' failed -- the check is not proved.' : '\nthe check fails when it should.');
process.exit(bad ? 1 : 0);
