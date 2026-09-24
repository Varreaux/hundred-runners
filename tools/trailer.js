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
// Rendered cards are cached here BETWEEN RUNS as well as within one: re-cutting after a timing
// tweak should not re-screenshot four hundred frames that have not changed.
const CARD_DIR = path.join(os.tmpdir(), 'hundred-runners-cards');

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
const ALTS = Object.fromEntries(
  Object.entries(MIDDLES).map(([k, mid]) => [`alt-${k}`, [...OPEN, ...mid, ...CLOSE]]));

// ---------------------------------------------------------------- the cut he wrote
// Morgan's own structure, third pass: keep the skeleton, shorten the drowning by a second,
// then very quick cuts of the ways people die; "you cannot save them all" over FIVE DIFFERENT
// cinematic deaths rather than five of the same gate; a turn -- "but if you know how to play
// their game..." -- into the mini-games; "...you might just escape." into the podium; and a
// last card asking the question the game is actually about.
//
// The two death runs are deliberately DIFFERENT vignettes and different speeds. Fast and
// unnamed first, so it reads as "there are many ways"; then slowed, so the name on the card
// can be read, which is the only reason those cards exist. Reusing the same five twice would
// have made the second run feel like a repeat of the first.
const ESCAPE = [
  { card: 'title', text: 'ONE HUNDRED PEOPLE', sub: 'GO TO WORK', for: 3.0 },
  { clip: 'doors', at: 1.5, for: 3.8 },
  { clip: 'mill', at: 1.0, for: 3.8 },
  { clip: 'cave', at: 1.5, for: 3.8 },
  { card: 'beat', kicker: 'BUT THE WORK CAN BE', text: 'GRINDING', for: 2.6 },
  { clip: 'losing', at: 0.3, for: 3.5 },

  // THE WAYS IT KILLS YOU, IN THE GAME. Not the closing reel's vignettes -- those are the next
  // section. Filmed by running the bot up to a point and then stopping: devSolve() is only
  // called inside the skip loop, never live, so `&solve` to a skip and then recording gives a
  // crowd that walks into the next unsolved room with nobody playing for them.
  //
  // Punched 1.7x because at play zoom this reads as a crowd, a red-striped room and a counter
  // rather than as a body: that IS what dying looks like here, and the punch is what makes it
  // legible. Under a second each, five different rooms across all three acts.
  { clip: 'k_gears', at: 4.0, for: 0.85, punch: 1.7 },
  { clip: 'c_wires', at: 5.0, for: 0.85, punch: 1.7 },
  { clip: 'k_crusher', at: 4.8, for: 0.85, punch: 1.7 },
  { clip: 'k_mantrap', at: 8.5, for: 0.85, punch: 1.7 },
  { clip: 'c_bar', at: 6.4, for: 0.85, punch: 1.7 },

  { card: 'count', text: 'YOU CANNOT', sub: 'SAVE THEM ALL', for: 3.0 },
  // ALL TEN cinematic deaths now live here, slowed so each name reads. The electric one leads
  // because he named it. 0.06..0.52 is the whole usable window of any of these clips -- every
  // one holds its card to 0.55 and has flipped to the podium by 0.70, two of them by 0.60 --
  // so 0.43s of source becomes a 0.9s beat.
  { clip: 'v_wiring', at: 0.06, for: 0.9, slow: 2.1 },
  { clip: 'v_crusher', at: 0.06, for: 0.9, slow: 2.1 },
  { clip: 'v_mantrap', at: 0.06, for: 0.9, slow: 2.1 },
  { clip: 'v_gears', at: 0.06, for: 0.9, slow: 2.1 },
  { clip: 'v_conveyor', at: 0.06, for: 0.9, slow: 2.1 },
  { clip: 'v_presses', at: 0.06, for: 0.9, slow: 2.1 },
  { clip: 'v_sweeper', at: 0.06, for: 0.9, slow: 2.1 },
  { clip: 'v_thorn', at: 0.06, for: 0.9, slow: 2.1 },
  { clip: 'v_bridge', at: 0.06, for: 0.9, slow: 2.1 },
  { clip: 'v_winch', at: 0.06, for: 0.9, slow: 2.1 },

  { card: 'turn', text: 'BUT IF YOU KNOW HOW TO PLAY THEIR GAME...', cps: 26, for: 3.2 },
  // ROOMS BEING PLAYED AND CLEARED, driven by hand. The bot cannot do this on camera -- it
  // only runs inside the skip loop -- and a held room is never taken by it, so these are real
  // keypresses through the real handlers: arrows spun into the drive train, SPACE tapped for
  // the winch marker, right-and-down through the cable splice, left-right-left through the
  // bank, and four real 0.82s HOLDS on the mantrap (a tap does not move that needle). Each cut
  // ends on the room clearing, which is the green CLEAN counter stepping up.
  { clip: 'c_gears', at: 2.6, for: 1.6 },
  { clip: 'c_bar', at: 3.0, for: 1.6 },
  { clip: 'c_wires', at: 2.8, for: 1.6 },
  { clip: 'c_dig', at: 1.5, for: 1.6 },
  { clip: 'c_lift', at: 3.4, for: 1.9 },
  { clip: 'blast2', at: 4.3, for: 2.2 },

  { card: 'hope', text: '...YOU MIGHT JUST ESCAPE.', for: 3.0 },
  { clip: 'podium', at: 0.8, for: 5.0 },
  { card: 'end', text: 'HUNDRED RUNNERS', cps: 24, for: 6.0,
    sub: ['ARE YOU ANOTHER COG IN THE SYSTEM,', 'OR ARE YOU YOUR OWN PERSON?'] },
];

const EDITS = { escape: ESCAPE, ...ALTS };

// ---------------------------------------------------------------- build
const run = (bin, args) => execFileSync(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const keyOf = o => require('crypto').createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12);

// A CDP session against one headless Chrome, held open for the whole run. The cards are drawn
// to canvas as a function of t and screenshotted frame by frame, rather than recorded: a
// screencast of a CSS animation drops frames and drifts, and re-running it gives a different
// file. This gives exactly FPS frames per second and a byte-identical re-run.
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };
  return {
    ready,
    send: (method, params = {}) => new Promise((res, rej) => {
      const i = ++id; pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    }),
    close: () => ws.close(),
  };
}

function freePort(from) {
  for (let p = from; p < from + 200; p++) {
    try { execFileSync('lsof', ['-nP', `-iTCP:${p}`, '-sTCP:LISTEN'], { stdio: 'ignore' }); }
    catch (e) { return p; }
  }
  throw new Error('no free port');
}

async function openChrome(chrome, tmp) {
  const dbg = freePort(9400);
  const proc = require('child_process').spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1', `--remote-debugging-port=${dbg}`,
    `--user-data-dir=${path.join(tmp, 'profile')}`, 'about:blank',
  ], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try {
      const v = await fetch(`http://127.0.0.1:${dbg}/json/list`).then(r => r.json());
      const page = v.find(t => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch (e) {}
  }
  if (!wsUrl) { try { proc.kill(); } catch (e) {} throw new Error('Chrome never opened its debugger'); }
  const client = cdp(wsUrl);
  await client.ready;
  await client.send('Page.enable');
  // Forced, not left to the window: headless reserves 200px of window height, so a
  // --window-size of 1920x1080 screenshots 1920x880. This is the same trap film.js's default
  // capture size fell into, one layer along.
  await client.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await client.send('Page.navigate', { url: `file://${path.join(__dirname, 'trailer-card.html')}` });
  await sleep(700);
  return { client, proc };
}

async function cardPiece(sess, item, out) {
  const spec = { kind: item.card, text: item.text, sub: item.sub, kicker: item.kicker, for: item.for };
  const frames = Math.round(item.for * FPS);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-'));
  try {
    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      await sess.client.send('Runtime.evaluate', { expression: `renderCard(${JSON.stringify(spec)}, ${t})` });
      const shot = await sess.client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(dir, `f${String(i).padStart(5, '0')}.png`), Buffer.from(shot.data, 'base64'));
    }
    run('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'),
      '-vf', `scale=${W}:${H}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17',
      '-preset', 'fast', out]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function clipPiece(item, out) {
  const src = path.join(IN, item.clip + '.mp4');
  if (!fs.existsSync(src)) throw new Error(`missing clip: ${src}`);
  const p = item.punch || 1;
  // `slow` stretches the source: a death vignette is on screen for REEL.anim 0.72s and then
  // its roll ends, which is too short to read a name off. Taking for/slow seconds and slowing
  // them to `for` gives the beat its length back, and slow motion is what that shot wants.
  const slow = item.slow && item.slow > 1 ? item.slow : 1;
  const take = item.for / slow;
  const parts = [];
  if (p > 1) parts.push(`crop=iw/${p}:ih/${p}`);
  parts.push(`scale=${W}:${H}:flags=lanczos`);
  if (slow > 1) parts.push(`setpts=${slow}*PTS`);
  parts.push(`fps=${FPS}`);
  run('ffmpeg', ['-y', '-ss', String(item.at || 0), '-t', String(take), '-i', src,
    '-vf', parts.join(','), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18',
    '-preset', 'fast', '-an', out]);
}

async function build(name, items, sess, cardCache) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trailer-'));
  try {
    const pieces = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.card) {
        // Cards are identical across these cuts -- same spine -- so each is rendered ONCE and
        // the file reused. Four trailers share four cards; without this that is 1512 frames
        // of Chrome screenshotting to produce 378 distinct ones.
        const k = keyOf({ c: it.card, t: it.text, s: it.sub, kk: it.kicker, f: it.for });
        if (!cardCache.has(k)) {
          const cf = path.join(CARD_DIR, `card-${k}.mp4`);
          if (!fs.existsSync(cf)) await cardPiece(sess, it, cf);
          cardCache.set(k, cf);
        }
        pieces.push(cardCache.get(k));
      } else {
        const out = path.join(tmp, `p${String(i).padStart(3, '0')}.mp4`);
        clipPiece(it, out);
        pieces.push(out);
      }
    }
    const listFile = path.join(tmp, 'list.txt');
    fs.writeFileSync(listFile, pieces.map(f => `file '${f}'`).join('\n') + '\n');
    const silent = path.join(tmp, 'silent.mp4');
    run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);

    const dur = items.reduce((a, it) => a + it.for, 0);
    const out = path.join(OUT, `trailer-${name}.mp4`);
    const intro = path.join(ROOT, 'Hundred Intro New.wav');
    const loop = path.join(ROOT, 'Hundred Loop New.wav');
    if (fs.existsSync(intro) && fs.existsSync(loop)) {
      // CONCAT, not amix: mixing the two halves the level wherever they overlap, and these are
      // meant to follow each other the way the game plays them, not to sound together.
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
    console.log(`  ${path.basename(out).padEnd(28)} ${dur.toFixed(1)}s  ${mb} MB  ${items.length} pieces`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error('trailer: no Chromium found. Set CHROME=/path/to/binary.'); process.exit(1); }
  if (!fs.existsSync(IN)) { console.error(`trailer: no footage at ${IN}. Film it first.`); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(CARD_DIR, { recursive: true });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trailer-chrome-'));
  let sess = null;
  try {
    sess = await openChrome(chrome, tmp);
    console.log(`cutting from ${IN}`);
    const cardCache = new Map();
    let made = 0;
    for (const [name, items] of Object.entries(EDITS)) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      try { await build(name, items, sess, cardCache); made++; }
      catch (e) { console.error(`  ${name}: FAILED -- ${e.message.split('\n')[0]}`); }
    }
    console.log(`\n${made} trailer${made === 1 ? '' : 's'} in ${OUT}`);
  } finally {
    if (sess) { try { sess.client.close(); } catch (e) {} try { sess.proc.kill(); } catch (e) {} }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(e => { console.error('trailer failed:', e.message); process.exit(1); });
