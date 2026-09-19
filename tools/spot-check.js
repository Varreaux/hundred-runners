// The last room's spot-the-difference, as pixels.  node tools/spot-check.js [root]
//
// Every other check here runs against the freeze harness's mocked canvas. This one cannot:
// the question is what a translucent shape looks like over the colour that was already
// underneath it, and a mock context has no colours. So it serves the checkout on a private
// port, drives tools/spot-check.html through headless Chrome, and reads the numbers back.
//
// What it is written against, in one line each -- the long version is in the HTML:
//   FAINT      a difference that changes nothing. contract/inkblot moved no channel by more
//              than about 5 of 255; four more changed under a dozen pixels each.
//   OFFSET     ink that is not where the hit test scores. The three removed bodies were
//              anchored at the feet, 17-24px below the gap you can see.
//   TOLERANCE  a scoring radius that grew with the crew until three quarters of the painting
//              scored. Measured by pressing, because reading the expression is what missed it.
//   SPACING    two differences inside one press.
//   STRAY      the paintings differing anywhere the puzzle did not say they would.
//
// Morgan found all of this by playing: marks were counting in places that looked identical
// to him. They were. Half of that was a radius that accepted anything and half was
// differences nobody could see, and only measuring separates the two -- they produce the
// same complaint.
//
// It takes about fifteen seconds and it is safe to run before a push. The port discipline is
// tools/shoot.sh's, for its reasons: a 200 proves a server, not YOUR server, and a bench
// pointed at another worktree reports somebody else's art.
const fs = require('fs'), path = require('path'), cp = require('child_process'), net = require('net');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const crypto = require('crypto');

function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function findChrome() {
  const fixed = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const c of fixed) if (fs.existsSync(c)) return c;
  const base = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  if (fs.existsSync(base)) for (const d of fs.readdirSync(base)) {
    if (!d.startsWith('chromium')) continue;
    for (const mac of fs.readdirSync(path.join(base, d))) {
      if (!mac.startsWith('chrome-mac')) continue;
      const appdir = path.join(base, d, mac);
      for (const app of fs.readdirSync(appdir)) {
        if (!app.endsWith('.app')) continue;
        const bin = path.join(appdir, app, 'Contents/MacOS');
        for (const f of fs.readdirSync(bin)) {
          const p = path.join(bin, f);
          try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) {}
        }
      }
    }
  }
  return null;
}
function freePort(from) {
  // Ports around 8790-8850 are crowded enough here that collision is likely rather than
  // exotic, so this asks the kernel for one nobody holds instead of picking a favourite.
  return new Promise(res => {
    const srv = net.createServer();
    srv.listen(from, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => res(p)); });
    srv.on('error', () => res(freePort(from + 1)));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(port, p) {
  return new Promise(res => {
    require('http').get({ host: '127.0.0.1', port: port, path: p }, r => {
      const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => res(Buffer.concat(chunks)));
    }).on('error', () => res(null));
  });
}

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.log('FAIL  no Chromium found. Set one up or pass CHROME=.'); process.exit(2); }
  const port = await freePort(8860);
  const srv = cp.spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
                       { cwd: root, stdio: 'ignore' });
  let code = 0;
  try {
    let served = null;
    for (let i = 0; i < 40 && !served; i++) { await sleep(120); served = await get(port, '/index.html'); }
    const mine = fs.readFileSync(path.join(root, 'index.html'));
    // The gate is the HASH, not the BUILD stamp. Two trees sit at the same BUILD for the
    // whole gap between somebody's rebase and their next bump, and while iterating on art
    // the file is uncommitted anyway, which no stamp reflects at all.
    if (!served || sha(served) !== sha(mine)) {
      console.log('FAIL  port ' + port + ' is not serving this checkout; refusing to measure.');
      console.log('      this is its own private port, so this means the server did not start.');
      process.exit(2);
    }
    const dom = cp.execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--dump-dom',
      '--virtual-time-budget=15000', '--window-size=1280,900',
      'http://127.0.0.1:' + port + '/tools/spot-check.html?shot' + (process.env.SPOT_Q ? '&' + process.env.SPOT_Q : '')],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom);
    if (!m) { console.log('FAIL  the bench produced no report.'); process.exit(2); }
    const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    if (text.startsWith('THREW')) { console.log('FAIL  the bench threw:\n' + text.slice(0, 2000)); process.exit(2); }
    const R = JSON.parse(text);

    let bad = 0;
    const ok = (name, pass, detail) => { if (!pass) bad++; console.log((pass ? 'ok  ' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : '')); };
    const F = R.floors;
    console.log('painting ' + R.painting[0] + 'x' + R.painting[1] + 'px, channel step > ' + R.thresh + ' of 255 counts as changed');
    console.log('floors: ' + F.dpx + ' px moved, ' + F.strongN + ' of them by ' + F.strong +
                ' of 255 or more, peak ' + F.peak + ', ink within ' + F.off + 'px, under ' +
                (F.area * 100) + '% of the painting scoring, unlit score under ' + F.score + '\n');

    for (const s of R.scenes) {
      const faint = s.rows.filter(r => r.faint), off = s.rows.filter(r => r.offset);
      console.log('--- ' + s.scene);
      for (const r of s.rows.slice().sort((a, b) => a.dpx - b.dpx)) {
        console.log('    ' + r.kind.padEnd(15) + String(r.at).padStart(10) +
          '  moved ' + String(r.dpx).padStart(4) + 'px  read ' + String(r.strong).padStart(4) +
          '  unlit ' + String(r.leak).padStart(4) + ' sd ' + String(r.sd).padStart(6) + ' score ' + String(r.score).padStart(6) + ' lpk ' + String(r.leakPeak).padStart(3) +
          '  peak ' + String(r.peak).padStart(3) +
          '  ground ' + String(r.bg).padStart(5) + ' -> ' + String(r.alt).padStart(5) +
          '  ink ' + String(r.off).padStart(5) + 'px off' +
          (r.faint ? '   TOO FAINT TO SEE' : '') + (r.offset ? '   NOT WHERE YOU PRESS' : '') +
          (r.leaks ? '   VISIBLE WITH THE LAMP ELSEWHERE' : ''));
      }
      ok('every difference in ' + s.scene.padEnd(9) + ' is visible', faint.length === 0,
         faint.length ? faint.map(r => r.kind).join(', ') : '10 of 10');
      const leak = s.rows.filter(r => r.leaks);
      ok('no difference in ' + s.scene.padEnd(9) + ' can be found unlit', leak.length === 0,
         leak.length ? leak.map(r => r.kind + ' score ' + r.score + ' lpk ' + r.leakPeak).join(', ') : 'the lamp is the only way in');
      ok('every difference in ' + s.scene.padEnd(9) + ' is where you press it', off.length === 0,
         off.length ? off.map(r => r.kind + ' ' + r.off + 'px').join(', ') : 'all within ' + F.off + 'px');
      ok('the paintings in ' + s.scene.padEnd(9) + ' differ ONLY where the puzzle says', s.stray < 120,
         s.stray + 'px unaccounted for');
      ok('no two differences in ' + s.scene.padEnd(9) + ' sit inside one press', s.minGap >= R.hitRadius * 2,
         'closest pair ' + s.minGap + 'px against a ' + (R.hitRadius * 2) + 'px diameter');
      ok('a blind press on ' + s.scene.padEnd(9) + ' mostly misses', s.area <= F.area,
         (s.area * 100).toFixed(0) + '% of the painting scores');
      console.log('');
    }
    // The one the old build failed. Pressing, not reading.
    const radii = R.tolerance.map(t => t.radius);
    console.log('--- tolerance, measured by pressing');
    for (const t of R.tolerance) console.log('    crew ' + String(t.crew).padStart(3) +
      '   lamp ' + String(t.lamp).padStart(6) + 'px   scores out to ' + t.radius + 'px');
    // Within a pixel, not exactly equal. The probe steps in whole pixels and the distance it
    // builds goes out through a 0..1 u and back through the painting's width, so the last
    // step lands either side of the radius on float noise alone -- 23/23/24 on a build whose
    // tolerance is provably one constant. A pixel of wobble is not the crew buying aim; the
    // fault this is written against read 36 / 36 / 65.
    const spread = Math.max.apply(null, radii) - Math.min.apply(null, radii);
    ok('the crew does not buy aim', spread <= 1, radii.join(' / ') + 'px at crew 1 / 12 / 100');
    ok('and the tolerance is the one CFG declares', radii.every(r => Math.abs(r - R.hitRadius) <= 1),
       'measured ' + radii[0] + 'px against hitRadius ' + R.hitRadius);

    console.log('');
    console.log(bad ? bad + ' failed.' : 'the spot-the-difference is a spot-the-difference.');
    code = bad ? 1 : 0;
  } finally {
    // By pid, and it is our own child. Never by pattern: every session runs an identical
    // python on a sibling port and pkill -f cannot tell us apart.
    srv.kill();
  }
  process.exit(code);
})();
