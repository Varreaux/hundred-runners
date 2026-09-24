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
const EDITS = {
  // Every in-point below was READ OFF A FRAME, not guessed: the footage was contact-sheeted
  // first and two clips were re-filmed because they showed the wrong thing. `losing` at
  // skip=95 had already reached the end screen, because without &solve the crowd is wiped out
  // at the first crossing inside twelve seconds; `wall` at its midpoint had not reached the
  // wall. A clip that shows the wrong thing poisons every cut that uses it, silently.

  // 1. THE ROLL CALL -- built on the number. The HUD counter is the kinetic text and the
  // closing reel is already a sequence of title cards with a name on each, so it is left to
  // play at length rather than cut against.
  rollcall: [
    { card: 'title', text: 'ONE HUNDRED PEOPLE', sub: 'GO TO WORK', for: 3.0 },
    { clip: 'doors', at: 1.5, for: 4.0 },
    { clip: 'mill', at: 1.0, for: 4.0 },
    { clip: 'cave', at: 1.5, for: 4.0 },
    { clip: 'enclosure', at: 1.0, for: 4.0 },
    { card: 'count', text: 'EVERY ONE OF THEM', sub: 'HAS A NAME', for: 2.6 },
    { clip: 'losing', at: 0.3, for: 4.0 },
    { clip: 'lastroom', at: 5.0, for: 5.5 },
    { clip: 'reel', at: 0.5, for: 12.0 },
    { clip: 'podium', at: 0.8, for: 4.5 },
    { card: 'end', text: 'HUNDRED RUNNERS', sub: 'HOW MANY GET OUT IS UP TO YOU', for: 4.0 },
  ],

  // 2. THE COMPANY NOTICE -- the proprietor's voice. Instructional cards in the panel's own
  // type, using the rooms' REAL titles, describing horrible things flatly; then the device is
  // dropped for the last stretch and the reel plays with no commentary at all.
  notice: [
    { card: 'title', text: 'NOTICE TO ALL HANDS', sub: 'THE WORK WILL CONTINUE', for: 3.2 },
    { clip: 'doors', at: 1.5, for: 4.0 },
    { card: 'room', kicker: 'ROOM 1', text: 'lower the drawbridge', for: 2.3 },
    { clip: 'millpanel', at: 0.5, for: 4.2 },
    { card: 'room', kicker: 'ROOM 2', text: 'force the jaws open', for: 2.3 },
    { clip: 'cavepanel', at: 0.8, for: 4.2 },
    { clip: 'boss', at: 1.5, for: 5.0 },
    { card: 'room', kicker: 'ROOM 3', text: 'blow the wall open', for: 2.3 },
    { clip: 'blast2', at: 4.2, for: 5.0 },
    { card: 'title', text: 'THE LAND IS BEING FENCED', sub: 'KEEP THEM MOVING', for: 2.6 },
    { clip: 'fence', at: 1.0, for: 4.0 },
    { clip: 'reel', at: 0.5, for: 10.0 },
    { card: 'end', text: 'HUNDRED RUNNERS', sub: 'A GAME ABOUT TRIAGE', for: 4.0 },
  ],

  // 3. THREE DESCENTS -- the three acts as three movements, each with its own palette. The
  // slowest of the four and the one that shows the art best. Ends on the word the wall spells.
  descents: [
    { card: 'end', text: 'HUNDRED RUNNERS', for: 3.0 },
    { card: 'title', text: 'I.  THE MILL', for: 2.3 },
    { clip: 'mill', at: 0.8, for: 5.5 },
    { clip: 'millpanel', at: 1.0, for: 3.5 },
    { card: 'title', text: 'II.  THE WORKINGS', for: 2.3 },
    { clip: 'cave', at: 1.0, for: 5.5 },
    { clip: 'cavepanel', at: 1.0, for: 3.5 },
    { card: 'title', text: 'III.  THE ENCLOSURE', for: 2.3 },
    { clip: 'enclosure', at: 0.8, for: 5.0 },
    { clip: 'fence', at: 1.0, for: 3.5 },
    { clip: 'blast2', at: 4.2, for: 5.5 },
    { clip: 'reel', at: 1.0, for: 5.5 },
    { card: 'end', text: 'UNBOUND', sub: 'HUNDRED RUNNERS', for: 4.0 },
  ],

  // 4. YOU CANNOT SAVE THEM ALL -- sells the mechanic rather than the art. Fast, two lines of
  // text in the whole thing, and the only cut that puts a room being solved straight against
  // the people dying somewhere else, which is what the game actually is. `wall` here is the
  // UNSOLVED wall taking twenty-four of them, which is the other half of the same argument.
  triage: [
    { clip: 'millpanel', at: 1.0, for: 2.0 },
    { clip: 'cavepanel', at: 1.2, for: 2.0 },
    { clip: 'drill', at: 2.0, for: 2.0 },
    { card: 'title', text: 'SAVE THEM.', for: 1.8 },
    { clip: 'losing', at: 0.3, for: 4.5 },
    { clip: 'mill', at: 2.0, for: 2.4 },
    { clip: 'cave', at: 2.0, for: 2.4 },
    { clip: 'wall', at: 9.0, for: 4.0 },
    { clip: 'lastroom', at: 6.0, for: 5.0 },
    { card: 'count', text: 'YOU CANNOT', sub: 'SAVE THEM ALL', for: 3.0 },
    { clip: 'reel', at: 1.0, for: 7.0 },
    { clip: 'podium', at: 1.0, for: 4.0 },
    { card: 'end', text: 'HUNDRED RUNNERS', sub: 'EVERY LEVER COSTS SOMEBODY', for: 4.0 },
  ],
};

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
