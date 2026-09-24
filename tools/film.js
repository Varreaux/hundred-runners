// Record the game playing, as video.  node tools/film.js [outfile.mp4]
//
// Headless Chrome's --screenshot takes ONE still, so every visual check in this repo is a
// frozen frame. Half of what the game does is motion -- a belt scrolling against the crew,
// a lamp breathing, a body going over an edge, the crowd thinning as rooms take people --
// and none of it can be shown to Morgan in a png. This drives Chrome over the DevTools
// protocol instead, runs the real game in real time, and captures its screencast.
//
// It records SEGMENTS, each its own page load with its own dev flags, and concatenates
// them: the opening and the drill, the mill, the cave, the enclosure, the last room and
// the closing reel. A single continuous run would be two and a half minutes of mostly
// walking; this is the same game, cut.
//
// Two things it does NOT do, deliberately. It does not fake input timing to make the game
// look better than it plays -- keys go through Input.dispatchKeyEvent into the real
// handlers, at human intervals. And it does not re-time the frames: every frame carries the
// timestamp Chrome gave it and ffmpeg is handed the real durations, so the video runs at
// the speed the game actually ran. If it stutters, the game stuttered.
//
// Requires ffmpeg and a Chromium. No npm packages: the CDP client is Node's built-in
// WebSocket, which is why this is 200 lines and not a dependency.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// The first NON-FLAG argument. Taking argv[2] raw meant `film.js --only=mill out.mp4` set the
// output filename to "--only=mill" and the run died forty seconds later inside ffmpeg with
// "Unrecognized option", which reads as a broken encoder rather than as an argument in the
// wrong place. Order no longer matters.
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(ROOT, 'hundred-runners-gameplay.mp4');
// --only=name,name films a subset. Tuning one segment's key timings otherwise costs a full
// re-film of all six, which is a minute of wall clock per attempt.
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
// --trace prints what the game was actually doing, sampled twice a second. Every key time in
// SEGMENTS below was set from one of these rather than guessed: the first attempt pressed
// SPACE at times that read plausibly and in fact skipped the whole drill, and the still that
// should have shown a panel showed the mill.
const TRACE = process.argv.includes('--trace');
// --segments=FILE reads the shot list from JSON instead of the one below, --split=DIR writes
// one mp4 PER SEGMENT instead of concatenating, and --size / --dsf set the capture. All three
// exist for the trailer, which wants the same footage cut several ways: filming once and
// cutting four edits beats filming four times, and a concatenated reel cannot be recut.
// Defaults are exactly what they were, so every existing call is unchanged.
const argOf = name => {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const SPLIT = argOf('split');
// 960x540 is the canvas's own size, and body is flex-centred, so at that window the canvas
// fills the viewport exactly -- no letterbox to crop off. The scale factor is what keeps a
// punch-in sharp: at 2 the screencast is 1920x1080 of a 960x540 canvas, so cropping to half
// width still lands above 1:1.
// 1280x920, NOT 1280x720. Headless Chrome reserves 200px of the window height, so a 720
// window gives a 520 viewport -- and the canvas is 540 tall, so every recording this tool has
// ever made was clipped by 10px top and bottom, including hundred-runners-gameplay.mp4. The
// number was measured: a 720 window came back 2560x1040 at scale factor 2, not 2560x1440.
const SIZE = argOf('size') || '1280,920';
const DSF = argOf('dsf') || '1';

// ---------------------------------------------------------------- what to film
// `for` is seconds of real gameplay. `keys` is [atSecond, key] pairs, dispatched into the
// real keydown/keyup handlers -- the drill and the last room need a hand, and a recording
// of them idling would be a recording of nothing happening.
const SEGMENTS = argOf('segments') ? JSON.parse(fs.readFileSync(argOf('segments'), 'utf8')) : [
  // `warm` is seconds run BEFORE the camera starts, so a segment can begin somewhere the
  // game takes time to reach. `for` is seconds recorded. `keys` times are measured from
  // navigation and span both.
  //
  // Every number below came from `--trace`, not from reading the source. The first attempt
  // filmed `?start`, which jumps straight into the run, so the segment meant to show the
  // tutorial showed the mill instead and the trace read `play | no-drill` from frame one.
  // On a plain load the title holds until a key, the opening runs about eleven seconds, and
  // the drill begins at 12.0s and then waits -- SPACE does not clear a panel, Escape moves
  // past one.
  { name: 'title', url: '', for: 5, keys: [[0.7, ' ']] },
  {
    name: 'drill',
    url: '',
    warm: 12.2,
    for: 11,
    keys: [[0.6, ' '], [1.6, ' '], [2.7, ' '], [3.8, ' '], [4.8, ' '], [5.8, ' '], [6.9, ' '], [8.0, ' '], [9.0, ' '], [10.1, ' '], [11.1, ' '], 
           [12.6, 'Escape'], [13.8, 'Escape'], [14.9, 'Escape'], [16.1, 'Escape'], [17.2, 'Escape'], [18.4, 'Escape'], [19.5, 'Escape'], [20.6, 'Escape'], [21.8, 'Escape'], [22.9, 'Escape'], ],
  },
  { name: 'mill',      url: 'start&skip=26&solve',  for: 9 },
  { name: 'cave',      url: 'start&skip=72&solve',  for: 9 },
  { name: 'enclosure', url: 'start&skip=120&solve', for: 9 },
  {
    name: 'lastroom',
    url: 'finale&crew=60&phase=charge',
    for: 13,
    // The generator charges on its own, then the differences are MARKED BY POINTER -- real
    // Input.dispatchMouseEvent clicks into the real handler, which is an input the room
    // genuinely supports.
    //
    // Being straight about what is scripted here: a bot cannot SPOT a difference, so the
    // click target is read out of f.diffs. The marking is real, the seeing is not, and that
    // is the one thing in this film that a player does which the recording does not. The
    // wrong mark at 11.4s is deliberate and aimed at bare canvas, because a body going into
    // the water is what the room costs you and a recording of ten clean hits would be a
    // recording of the room at its least honest.
    clicks: [[6.2, 'diff'], [7.4, 'diff'], [8.5, 'diff'], [9.6, 'diff'],
             [10.5, 'diff'], [11.4, 'miss'], [12.4, 'diff']],
  },
  { name: 'reel', url: 'end=1&solve', for: 7 },
];


// ---------------------------------------------------------------- the browser
function findChrome() {
  if (process.env.CHROME && fs.existsSync(process.env.CHROME)) return process.env.CHROME;
  const globs = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const g of globs) if (fs.existsSync(g)) return g;
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

// ---------------------------------------------------------------- the server
// Our own, on a port checked free, serving THIS worktree -- and the served bytes are
// compared against the file on disk before a single frame is taken. The repo has lost hours
// twice to photographing another worktree's server through a port collision; a 200 proves a
// server, not YOUR server.
function freePort(from) {
  for (let p = from; p < from + 200; p++) {
    try { execFileSync('lsof', ['-nP', `-iTCP:${p}`, '-sTCP:LISTEN'], { stdio: 'ignore' }); }
    catch (e) { return p; }               // lsof exits non-zero when nothing is listening
  }
  throw new Error('no free port');
}

const sha = buf => require('crypto').createHash('sha256').update(buf).digest('hex');

// ---------------------------------------------------------------- CDP over the built-in ws
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const handlers = new Map();
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method && handlers.has(m.method)) {
      handlers.get(m.method)(m.params);
    }
  };
  return {
    ready,
    on: (method, fn) => handlers.set(method, fn),
    send: (method, params = {}) => new Promise((res, rej) => {
      const i = ++id; pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    }),
    close: () => ws.close(),
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Click where a difference actually is, or -- for 'miss' -- somewhere it demonstrably is not.
// The page works out the client coordinate itself, from the same finaleLayout() the game
// hit-tests against, so the click cannot drift from the art the way a hard-coded point would.
async function clickIn(client, kind) {
  const expr = kind === 'miss'
    ? `(() => { const L = finaleLayout(), r = cv.getBoundingClientRect();
         const sx = L.right.x + L.right.w * 0.06, sy = L.right.y + L.right.h * 0.94;
         return { x: r.left + sx * (r.width / W), y: r.top + sy * (r.height / H) }; })()`
    : `(() => { const f = S.finale; if (!f || f.phase !== 'search') return null;
         const L = finaleLayout(), d = f.diffs.find(x => !f.found.has(x.id)); if (!d) return null;
         const sx = L.right.x + d.x * (L.right.w / FINALE_ART.w);
         const sy = L.right.y + d.y * (L.right.h / FINALE_ART.h);
         const r = cv.getBoundingClientRect();
         return { x: r.left + sx * (r.width / W), y: r.top + sy * (r.height / H) }; })()`;
  const res = await client.send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const p = res.result && res.result.value;
  if (!p) return;
  for (const type of ['mousePressed', 'mouseReleased']) {
    await client.send('Input.dispatchMouseEvent', {
      type, x: Math.round(p.x), y: Math.round(p.y), button: 'left', clickCount: 1, buttons: 1,
    });
    await sleep(35);
  }
}

// A key with a leading ^ is a RELEASE. Holds matter: the lamp accelerates while a key is
// down, and a tap barely moves it.
function keyEvent(client, key) {
  const up = key.startsWith('^');
  const k = up ? key.slice(1) : key;
  const code = k === ' ' ? 'Space' : k.startsWith('Arrow') ? k : k === 'Escape' ? 'Escape' : `Key${k.toUpperCase()}`;
  return client.send('Input.dispatchKeyEvent', {
    type: up ? 'keyUp' : 'keyDown',
    key: k === ' ' ? ' ' : k,
    code,
    windowsVirtualKeyCode: k === ' ' ? 32 : k === 'Escape' ? 27 : k === 'ArrowLeft' ? 37
      : k === 'ArrowUp' ? 38 : k === 'ArrowRight' ? 39 : k === 'ArrowDown' ? 40 : 0,
  });
}

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error('film: no Chromium found. Set CHROME=/path/to/binary.'); process.exit(1); }

  const port = freePort(8870);
  const dbg = freePort(9330);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT],
    { stdio: 'ignore' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'film-'));
  const shots = [];
  let proc = null;

  const cleanup = () => {
    try { if (proc) proc.kill(); } catch (e) {}
    try { srv.kill(); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  await sleep(900);
  const served = await fetch(`http://127.0.0.1:${port}/index.html`).then(r => r.arrayBuffer());
  const mine = fs.readFileSync(path.join(ROOT, 'index.html'));
  if (sha(Buffer.from(served)) !== sha(mine)) {
    console.error(`film: port ${port} is not serving this worktree.`); cleanup(); process.exit(1);
  }
  const build = (mine.toString().match(/const BUILD = '([^']*)'/) || [, '?'])[1];
  console.log(`filming BUILD ${build} from a private server on ${port}`);

  proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--window-size=${SIZE}`, `--force-device-scale-factor=${DSF}`,
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${dbg}`, `--user-data-dir=${path.join(tmp, 'profile')}`,
    'about:blank',
  ], { stdio: 'ignore' });

  // wait for the debugger
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try {
      const v = await fetch(`http://127.0.0.1:${dbg}/json/list`).then(r => r.json());
      const pageTarget = v.find(t => t.type === 'page');
      if (pageTarget) wsUrl = pageTarget.webSocketDebuggerUrl;
    } catch (e) {}
  }
  if (!wsUrl) { console.error('film: Chrome never opened its debugger.'); cleanup(); process.exit(1); }

  const client = cdp(wsUrl);
  await client.ready;
  await client.send('Page.enable');

  let n = 0;
  let frames = [];
  const cuts = [];                       // [name, firstShotIndex] per segment, for --split
  client.on('Page.screencastFrame', async p => {
    frames.push({ t: p.metadata.timestamp, data: p.data });
    try { await client.send('Page.screencastFrameAck', { sessionId: p.sessionId }); } catch (e) {}
  });

  for (const seg of SEGMENTS.filter(x => !ONLY.length || ONLY.includes(x.name))) {
    frames = [];
    await client.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html?${seg.url}` });
    // `settle` is how long the dev flags get before the camera rolls, and 1400 is only right
    // for flags that set up a STANDING state. A ?trap vignette animates over REEL.anim 0.72s
    // and then its one-card roll ENDS, so at 1400 every trap segment recorded the podium --
    // which looks like a working shot of the wrong thing rather than like a failure.
    await sleep(seg.settle != null ? seg.settle : 1400);

    const t0 = Date.now();
    const trace = [];
    let lastTrace = -1;
    let rolling = false;
    const warm = seg.warm || 0;
    const pending = (seg.keys || []).slice().sort((a, b) => a[0] - b[0]);
    const clicks = (seg.clicks || []).slice().sort((a, b) => a[0] - b[0]);
    while (Date.now() - t0 < (warm + seg.for) * 1000) {
      const el = (Date.now() - t0) / 1000;
      if (!rolling && el >= warm) {
        rolling = true;
        await client.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
      }
      while (clicks.length && clicks[0][0] <= el) {
        const [, kind] = clicks.shift();
        try { await clickIn(client, kind); } catch (e) {}
      }
      while (pending.length && pending[0][0] <= el) {
        const [, k] = pending.shift();
        try { await keyEvent(client, k); } catch (e) {}
        // a press that is never released is a stuck key; tap unless a ^release is scheduled
        if (!k.startsWith('^') && !(seg.keys || []).some(p => p[1] === '^' + k)) {
          await sleep(45);
          try { await keyEvent(client, '^' + k); } catch (e) {}
        }
      }
      if (TRACE && Math.floor(el * 2) !== lastTrace) {
        lastTrace = Math.floor(el * 2);
        try {
          const r = await client.send('Runtime.evaluate', {
            expression: `(() => { const d = S.drill; return [S.mode, !d ? 'no-drill' : d.done ? 'drill-done' : d.phase + ':' + (d.room && d.room.type || '?') + ':' + (d.i || 0),
              S.runners.filter(r => r.state === 'run').length, S.finale ? S.finale.phase + ' ' + S.finale.found.size + '/10' : '-'].join(' | '); })()`,
            returnByValue: true,
          });
          trace.push(el.toFixed(1) + 's  ' + r.result.value);
        } catch (e) {}
      }
      await sleep(20);
    }
    await client.send('Page.stopScreencast');
    await sleep(250);

    // Written with the real inter-frame gaps, so the cut runs at the speed it was played.
    const kept = frames.slice();
    for (let i = 0; i < kept.length; i++) {
      const file = path.join(tmp, `f${String(n).padStart(6, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(kept[i].data, 'base64'));
      const next = kept[i + 1];
      const dur = next ? Math.max(0.008, Math.min(0.2, next.t - kept[i].t)) : 1 / 30;
      shots.push({ file, dur });
      n++;
    }
    cuts.push({ name: seg.name, from: shots.length - kept.length, to: shots.length });
    console.log(`  ${seg.name.padEnd(10)} ${kept.length} frames over ${seg.for}s` + (warm ? ` (after ${warm}s warm-up)` : ''));
    if (TRACE) for (const line of trace) console.log('      ' + line);
  }

  client.close();
  proc.kill(); proc = null;

  if (!shots.length) { console.error('film: captured nothing.'); cleanup(); process.exit(1); }

  // The frames carry the gaps Chrome gave them, so the concat list is what makes the cut run
  // at the speed it was played; that is true per segment as well as for the whole reel.
  const encode = (slice, out) => {
    const list = slice.map(s => `file '${s.file}'\nduration ${s.dur.toFixed(4)}`).join('\n')
      + `\nfile '${slice[slice.length - 1].file}'\n`;
    const listFile = path.join(tmp, 'list-' + path.basename(out) + '.txt');
    fs.writeFileSync(listFile, list);
    execFileSync('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
      // clips are NOT rescaled at all: they are an intermediate, and the edit crops the canvas
      // out of the letterbox at 1:1. Resampling here and again in the edit softens a punch-in
      // twice over. Lower crf for the same reason -- this file gets encoded a second time.
      '-vf', SPLIT ? 'fps=30' : 'fps=30,scale=1280:-2:flags=lanczos',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', SPLIT ? '16' : '20', '-preset', 'medium',
      '-movflags', '+faststart', out,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
  };

  if (SPLIT) {
    fs.mkdirSync(SPLIT, { recursive: true });
    for (const c of cuts) {
      const slice = shots.slice(c.from, c.to);
      if (!slice.length) { console.log(`  ${c.name}: no frames, skipped`); continue; }
      const out = path.join(SPLIT, c.name + '.mp4');
      encode(slice, out);
      console.log(`  ${out}  ${slice.reduce((a, s) => a + s.dur, 0).toFixed(1)}s`);
    }
    console.log(`\n${cuts.length} clips in ${SPLIT}, BUILD ${build}`);
    cleanup();
    return;
  }
  encode(shots, OUT);

  const total = shots.reduce((a, s) => a + s.dur, 0);
  const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
  console.log(`\n${OUT}`);
  console.log(`${shots.length} frames, ${total.toFixed(1)}s, ${mb} MB, BUILD ${build}`);
  cleanup();
})().catch(e => { console.error('film failed:', e.message); process.exit(1); });
