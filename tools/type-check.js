// How large is everything written inside a mini-game panel, as RENDERED?
//
//   node tools/type-check.js [path/to/index.html]
//
// WHY THIS EXISTS. Morgan's complaint was "whatever is written is too small to read". The
// answer shipped was PANEL_SCALE 1.34 -- everything in a panel got 34% larger -- and the
// verification was looking at screenshots and finding them legible. That is not a
// measurement of what he asked about. It is a measurement of one reader's eyesight on a
// 1280px screenshot of a 960px canvas, which is the same evidence as "the footstep sound
// measured clean on every axis we had".
//
// A uniform scale also cannot fix a ladder: it multiplies the smallest thing by the same
// factor as the largest, so whatever was the least legible item before is still the least
// legible item after, just bigger. The only way to know where that item ended up is to
// order them.
//
// NO FLOOR IS ASSERTED, deliberately. Where legibility starts is a judgement about a human
// eye on Morgan's screen, not a number this file gets to invent -- the same reason
// room-check prints "hard" and leaves it to him. What this gives him instead is the ladder
// and one comparison he can act on: the instruction bar he called too small was 13px, and
// it is now 17. Anything in a panel rendering near 13 is the size of the complaint.
//
// It reads the font sizes and PANEL_SCALE out of index.html rather than restating them, and
// it knows which functions draw INSIDE the scale -- panelFrame, panelStep, panelGauges and
// every verb's draw -- because hintBar and the HUD do not, and multiplying those would
// invent a number.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const raw = fs.readFileSync(process.argv[2] || path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0];

const m = /const PANEL_SCALE = ([\d.]+)/.exec(src);
if (!m) { console.log('could not find PANEL_SCALE -- fix this file before believing it'); process.exit(1); }
const SCALE = +m[1];

const lines = src.split('\n');
let fn = '?', verb = null, depth = 0;
const rows = [];
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  let t = /^function (\w+)/.exec(L);
  if (t) { fn = t[1]; verb = null; }
  t = /^  (\w+): \{$/.exec(L);
  if (t) verb = t[1];
  const f = /ctx\.font = ['`](?:bold )?(\d+)px/.exec(L);
  if (!f) continue;
  const where = verb ? 'VERBS.' + verb + '.draw' : fn;
  const scaled = verb !== null || /^(panelFrame|panelStep|panelGauges)$/.test(where);
  // a font set and never used is not type, it is a leftover. Look ahead for a fillText
  // before the next font change, in the same spirit as checking a call site rather than a
  // value: a size nobody draws with tells you nothing about legibility.
  // starts at THIS line, not the next: `ctx.font = '...'; ctx.fillText(d, x, y)` on one
  // line is ordinary, and looking ahead from i+1 reported the press room's answer digits
  // as a leftover -- the tool accusing working code, which is worse than missing one.
  let used = /ctx\.(fill|stroke)Text\(/.test(L);
  for (let j = i + 1; !used && j < Math.min(i + 40, lines.length); j++) {
    if (/ctx\.font = /.test(lines[j])) break;
    if (/ctx\.(fill|stroke)Text\(/.test(lines[j])) { used = true; break; }
  }
  rows.push({ where, px: +f[1], rendered: +f[1] * (scaled ? SCALE : 1), scaled, used, line: i + 1 });
}

const panel = rows.filter(r => r.scaled && r.used).sort((a, b) => a.rendered - b.rendered);
const dead = rows.filter(r => r.scaled && !r.used);
// hintBar's size is a const, not a literal in the font string, so the scan above cannot see
// it. Read the const instead of guessing, and say nothing if it is not there.
const hintM = /const HINT_FS = (\d+)/.exec(src);

console.log(`PANEL_SCALE ${SCALE} -- type drawn inside a mini-game panel, smallest rendered first\n`);
console.log('rendered  written   where');
for (const r of panel)
  console.log(`${r.rendered.toFixed(1).padStart(8)}  ${String(r.px).padStart(7)}   ${r.where}  (script line ${r.line})`);

if (dead.length) {
  console.log('\nfonts set and never drawn with, which are leftovers rather than type:');
  for (const r of dead) console.log(`          ${String(r.px).padStart(7)}   ${r.where}  (script line ${r.line})`);
}

const barPx = hintM ? +hintM[1] : null;
console.log('');
if (barPx) console.log(`the instruction bar under the panel is unscaled at ${barPx}px; it was 13px when Morgan`);
console.log(`called it too small to read. The smallest type in a panel renders at ${panel[0].rendered.toFixed(1)}px,`);
console.log(`in ${panel[0].where}, and the next smallest at ${panel[1].rendered.toFixed(1)}px.`);
console.log('');
console.log('This prints a ladder and no verdict on purpose. Where legibility begins is a');
console.log("judgement about Morgan's eye on Morgan's screen; quote him the number instead of");
console.log('picking a floor here and then padding whatever fails it.');

// Proved it moves rather than only seen to print: with PANEL_SCALE forced to 1.0 in a copy
// every rendered figure drops to its written size and the smallest reads 10.0 instead of
// 13.4. With a verb's font edited, that row alone moves. The `used` test was added after it
// listed an 11px font in VERBS.wires.draw that nothing draws with -- a leftover reported as
// the second-least-legible thing in the game.
