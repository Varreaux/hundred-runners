// Cut trailers from footage filmed by tools/film.js.
//
//   node tools/film.js --segments=tools/trailer-shots.json --split=DIR --size=960,740 --dsf=2
//   node tools/trailer.js DIR [outdir] [--only=name,name]
//
// WHY THIS IS SEPARATE FROM film.js. Filming is slow and the cut is not: four trailers from
// one shoot is four ffmpeg runs over footage already on disk, where filming four times is
// four passes of Chrome driving the real game. It also means every edit below is looking at
// the SAME take, so a difference between two trailers is a difference in the cut and not in
// the run that happened to be recorded.
//
// WHY 960x740 AND dsf 2. The canvas is 960x540 and body is flex-centred, so at a 960-wide
// viewport it fills the frame with no letterbox to crop off -- but headless Chrome reserves
// 200px of the window height, so the WINDOW has to be 740 to give a 540 viewport. At scale
// factor 2 that is a 1920x1080 capture of a 960x540 canvas, which is what lets a punch-in
// stay sharp. Both numbers were measured, not assumed: 1280x720 came back 2560x1040.
//
// The cards are rendered as HTML through the same Chrome, not drawn with ffmpeg's drawtext,
// so they carry the game's own typography -- ui-monospace at the game's ink and panel
// colours. A trailer whose titles are in a different typeface reads as a different product.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const IN = process.argv[2] || path.join(ROOT, 'footage');
const OUT = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : path.join(ROOT, 'trailers');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

const W = 1920, H = 1080, FPS = 30;

function findChrome() {
  if (process.env.CHROME && fs.existsSync(process.env.CHROME)) return process.env.CHROME;
  for (const g of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                   '/Applications/Chromium.app/Contents/MacOS/Chromium']) if (fs.existsSync(g)) return g;
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (fs.existsSync(cache)) {
    for (const d of fs.readdirSync(cache).filter(n => n.startsWith('chromium-')).sort().reverse()) {
      const mac = path.join(cache, d, 'chrome-mac-arm64');
      if (!fs.existsSync(mac)) continue;
      for (const app of fs.readdirSync(mac).filter(n => n.endsWith('.app'))) {
        const bin = path.join(mac, app, 'Contents/MacOS', app.replace(/\.app$/, ''));
        if (fs.existsSync(bin)) return bin;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- the cards
// Three kinds, each borrowed from something the game already draws, so the trailer cannot
// invent a look: `room` is the mini-game panel's header rule and cyan; `title` is the HUD's
// plain white monospace; `end` is the title screen.
const CARD_CSS = `
  html,body{margin:0;width:1920px;height:1080px;background:#0d0f16;color:#eee;
    font-family:ui-monospace,Menlo,monospace;display:flex;align-items:center;justify-content:center;}
  .wrap{text-align:center;line-height:1.5;}
  .room .kicker{color:#7fe3ff;font-size:34px;letter-spacing:.34em;margin-bottom:34px;}
  .room .line{font-size:66px;color:#fff;}
  .room .rule{width:520px;height:3px;background:#7fe3ff;opacity:.55;margin:44px auto 0;}
  .title .line{font-size:76px;color:#fff;letter-spacing:.04em;}
  .title .sub{font-size:34px;color:#8a93a6;margin-top:34px;letter-spacing:.3em;}
  .end .line{font-size:104px;color:#fff;letter-spacing:.10em;}
  .end .sub{font-size:32px;color:#8a93a6;margin-top:40px;letter-spacing:.34em;}
  .beat .kicker{color:#8a93a6;font-size:36px;letter-spacing:.30em;margin-bottom:30px;}
  .beat .line{font-size:98px;color:#fff;letter-spacing:.06em;}
  .count .line{font-size:150px;color:#fff;}
  .count .sub{font-size:38px;color:#ff6b6b;margin-top:30px;letter-spacing:.24em;}
`;
function cardHTML(kind, text, sub, kicker) {
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
  return `<!doctype html><meta charset="utf-8"><style>${CARD_CSS}</style>` +
    `<div class="wrap ${kind}">` +
    (kicker ? `<div class="kicker">${esc(kicker)}</div>` : '') +
    `<div class="line">${esc(text)}</div>` +
    (sub ? `<div class="sub">${esc(sub)}</div>` : '') +
    (kind === 'room' ? '<div class="rule"></div>' : '') +
    `</div>`;
}

// ---------------------------------------------------------------- the four cuts
// `clip` names a file in the footage dir; `at` is seconds into it; `for` is seconds taken.
// `punch` crops to 1/n of the frame about the centre and scales back up -- used sparingly,
// because the footage is 2x of a 960x540 canvas and a punch past about 1.4 starts to soften.
// ---------------------------------------------------------------- the cuts
// ONE SPINE, FOUR MIDDLES. Morgan kept two of the first four and named the beats he wanted
// out of each: the opening from `rollcall` (the card, "Welcome, workers.", one clip in the
// mill, one in the mine) and two from `triage` (a line of text, then the crowd drowning at
// the first crossing; and "you cannot save them all" into the deaths). Those are reproduced
// here at the same in-points. What he asked to see alternatives for is the stretch BETWEEN
// them, so that is the only thing that differs between these four -- same open, same close,
// same music, same length either side. A difference you can see is a difference in the middle.
const OPEN = [
  { card: 'title', text: 'ONE HUNDRED PEOPLE', sub: 'GO TO WORK', for: 3.0 },
  { clip: 'doors', at: 1.5, for: 4.0 },
  { clip: 'mill', at: 1.0, for: 4.0 },
  { clip: 'cave', at: 1.5, for: 4.0 },
  // His line, near enough: "maybe more like 'but work can be .... grinding'". Split across the
  // kicker and the line so the pause he wrote as an ellipsis is carried by the typography.
  { card: 'beat', kicker: 'BUT THE WORK CAN BE', text: 'GRINDING', for: 2.6 },
  { clip: 'losing', at: 0.3, for: 4.5 },
];

const CLOSE = [
  { card: 'count', text: 'YOU CANNOT', sub: 'SAVE THEM ALL', for: 3.0 },
  { clip: 'reel', at: 1.0, for: 7.0 },
  { clip: 'podium', at: 1.0, for: 4.0 },
  { card: 'end', text: 'HUNDRED RUNNERS', sub: 'EVERY LEVER COSTS SOMEBODY', for: 4.0 },
];

const MIDDLES = {
  // A. THE WORK ITSELF -- what the player actually does, six rooms in eighteen seconds so it
  // reads as a shift rather than as one puzzle. The only middle that shows the game being
  // played, and the only one you could cut a store page out of.
  rooms: [
    { clip: 'panel_gears', at: 1.2, for: 2.8 },
    { clip: 'panel_conveyor', at: 1.2, for: 2.8 },
    { clip: 'millpanel', at: 1.0, for: 2.8 },
    { clip: 'panel_wiring', at: 0.8, for: 2.8 },
    { clip: 'panel_sweeper', at: 0.8, for: 2.8 },
    { clip: 'cavepanel', at: 0.8, for: 3.0 },
  ],

  // B. THE DESCENT -- the world closing in. Out of the mill, through a door shut behind them,
  // into country being fenced, up against a wall they have to blow open. No text at all; the
  // places carry it.
  descent: [
    // NO DIALOGUE AT ALL, which is the whole point of this one -- so the cave-door boss is out
    // (he belongs to `proprietor`) and the enclosure starts at 4.2, because he is still on
    // screen at 1s shouting "FINE! Run! Run into the hills" and gone by 4. Cutting him in here
    // made this middle and the proprietor's look like the same trailer for their first nine
    // seconds. Contact sheet caught it; the source could not have.
    { clip: 'enclosure', at: 4.2, for: 4.0 },
    { clip: 'fence', at: 1.0, for: 4.0 },
    { clip: 'wall', at: 9.0, for: 4.0 },
    { clip: 'blast2', at: 4.2, for: 5.0 },
  ],

  // C. THE PROPRIETOR -- his three appearances, escalating, which is the only middle with a
  // story in it. He stops them at the cave door ("you guys can't leave the factory"), turns up
  // red-faced on the hillside ("FINE! Run! Run into the hills"), and is waiting in the last
  // room typing "There is no out." That last one is the imprisonment image.
  proprietor: [
    { clip: 'boss', at: 1.5, for: 4.5 },
    { clip: 'boss_land', at: 6.8, for: 4.5 },
    { clip: 'chamber', at: 3.5, for: 5.5 },
    { clip: 'lastroom', at: 6.0, for: 3.5 },
  ],

  // D. THE CROWD -- who they are, which is what makes the closing reel land. Punched in 1.5x
  // so the name tags and the chatter are legible; every other shot in these trailers is wide,
  // so this is the only one that looks at a person. The footage is 1920 native off a 960
  // canvas, so a 1.5 punch is still above 1:1 on the way back out.
  crowd: [
    { clip: 'boss_land', at: 0.8, punch: 1.5, for: 4.0 },
    { clip: 'mill', at: 5.5, punch: 1.6, for: 3.5 },
    { clip: 'cave', at: 6.0, punch: 1.6, for: 3.5 },
    { clip: 'enclosure', at: 5.0, punch: 1.5, for: 4.0 },
  ],
};

// Named alt-* so they cannot collide with trailer-rollcall.mp4 or trailer-triage.mp4, which
// Morgan asked to keep and which this tool must not overwrite.
const EDITS = Object.fromEntries(
  Object.entries(MIDDLES).map(([k, mid]) => [`alt-${k}`, [...OPEN, ...mid, ...CLOSE]]));

// ---------------------------------------------------------------- build
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });

function buildPiece(item, tmp, i, chrome) {
  const out = path.join(tmp, `p${String(i).padStart(3, '0')}.mp4`);
  // Fades are on every piece rather than on the whole reel: a hard cut between two moving
  // shots is what a trailer wants, but a card arriving without one reads as a dropped frame.
  const fade = item.card ? `,fade=t=in:st=0:d=0.3,fade=t=out:st=${(item.for - 0.35).toFixed(2)}:d=0.35` : '';
  if (item.card) {
    const html = cardHTML(item.card, item.text, item.sub, item.kicker);
    const hf = path.join(tmp, `c${i}.html`), pf = path.join(tmp, `c${i}.png`);
    fs.writeFileSync(hf, html);
    run(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      `--screenshot=${pf}`, `--window-size=${W},${H}`, '--force-device-scale-factor=1',
      '--virtual-time-budget=1200', `file://${hf}`]);
    run('ffmpeg', ['-y', '-loop', '1', '-t', String(item.for), '-i', pf,
      '-vf', `scale=${W}:${H},fps=${FPS}${fade}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-crf', '18', '-preset', 'fast', out]);
    return out;
  }
  const src = path.join(IN, item.clip + '.mp4');
  if (!fs.existsSync(src)) throw new Error(`missing clip: ${src}`);
  const p = item.punch || 1;
  const vf = p > 1
    ? `crop=iw/${p}:ih/${p},scale=${W}:${H}:flags=lanczos,fps=${FPS}`
    : `scale=${W}:${H}:flags=lanczos,fps=${FPS}`;
  run('ffmpeg', ['-y', '-ss', String(item.at || 0), '-t', String(item.for), '-i', src,
    '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'fast',
    '-an', out]);
  return out;
}

function build(name, items, chrome) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trailer-'));
  try {
    const pieces = items.map((it, i) => buildPiece(it, tmp, i, chrome));
    const listFile = path.join(tmp, 'list.txt');
    fs.writeFileSync(listFile, pieces.map(f => `file '${f}'`).join('\n') + '\n');
    const silent = path.join(tmp, 'silent.mp4');
    run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);

    const dur = items.reduce((a, it) => a + it.for, 0);
    const out = path.join(OUT, `trailer-${name}.mp4`);
    // The game's own two cues, in the order the game plays them: the intro arrives, the bed
    // takes over. Looped to cover the cut and faded under the last card.
    const intro = path.join(ROOT, 'Hundred Intro New.wav');
    const loop = path.join(ROOT, 'Hundred Loop New.wav');
    const haveMusic = fs.existsSync(intro) && fs.existsSync(loop);
    if (haveMusic) {
      // CONCAT, not amix: mixing the two halves the level wherever they overlap, and these are
      // meant to follow each other the way the game plays them, not to sound together. The bed
      // is stream-looped so a cut longer than 16 + 32 still has music under it.
      run('ffmpeg', ['-y', '-i', silent, '-i', intro, '-stream_loop', '-1', '-i', loop,
        '-filter_complex',
        `[1:a][2:a]concat=n=2:v=0:a=1,atrim=0:${dur.toFixed(2)},asetpts=N/SR/TB,` +
        `afade=t=in:st=0:d=1.2,afade=t=out:st=${Math.max(0, dur - 3).toFixed(2)}:d=3,volume=0.9[a]`,
        '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart', '-shortest', out]);
    } else {
      run('ffmpeg', ['-y', '-i', silent, '-c', 'copy', '-movflags', '+faststart', out]);
    }
    const mb = (fs.statSync(out).size / 1e6).toFixed(1);
    console.log(`  ${path.basename(out).padEnd(26)} ${dur.toFixed(1)}s  ${mb} MB  ${items.length} pieces`);
    return out;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const chrome = findChrome();
if (!chrome) { console.error('trailer: no Chromium found. Set CHROME=/path/to/binary.'); process.exit(1); }
if (!fs.existsSync(IN)) { console.error(`trailer: no footage at ${IN}. Film it first.`); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

console.log(`cutting from ${IN}`);
let made = 0;
for (const [name, items] of Object.entries(EDITS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  try { build(name, items, chrome); made++; }
  catch (e) { console.error(`  ${name}: FAILED -- ${e.message.split('\n')[0]}`); }
}
console.log(`\n${made} trailer${made === 1 ? '' : 's'} in ${OUT}`);
