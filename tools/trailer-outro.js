// The trailer's last beat, drawn INSIDE the game page so it uses the game's own proprietor.
//
// film.js loads index.html with ?shot (which stops the rAF loop), evaluates this file once,
// and then calls outroFrame(u) with u running 0..1, one call per output frame. Nothing here
// is recorded in real time, so every frame is a real render and the timing is exact.
//
// It draws Mr Capitalism at R = 0.40 * H instead of the band's 33, which is the whole trick:
// drawBossGlobe/Face/Hat take a radius, so the head the player has only ever seen two inches
// tall can fill the screen without a single new asset. `b` is a hand-made boss object -- the
// face reads laugh, t, blink and the current script line's mood, so laugh > 0 with t advancing
// gives the mouth its 0.62 + sin(t*30) * 0.22 oscillation, which is the laugh the game already
// owns. No new art, no new state in index.html.
(function () {
  const T1 = document.createElement('canvas'), T2 = document.createElement('canvas');
  T1.width = T2.width = W; T1.height = T2.height = H;
  const t1 = T1.getContext('2d'), t2 = T2.getContext('2d');
  const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const ease = k => 1 - Math.pow(1 - k, 3);
  const clamp01 = v => Math.max(0, Math.min(1, v));

  // ---- one colour channel of the frame, for the split
  function channel(colour) {
    t2.globalCompositeOperation = 'source-over';
    t2.clearRect(0, 0, W, H);
    t2.drawImage(T1, 0, 0);
    t2.globalCompositeOperation = 'multiply';
    t2.fillStyle = colour; t2.fillRect(0, 0, W, H);
    t2.globalCompositeOperation = 'source-over';
    return T2;
  }

  // `rage` is the game's own mood and it turns the GLOBE red -- "the head is the world, so when
  // he loses it the world goes red". The face checks `laughing` before it checks rage for both
  // the mouth and the lids, so setting both gives the laugh over a red planet, which is the
  // horror-film version of him and needs no new art at all. It comes on part way, so the tube
  // switches on to the man they know and he turns while they watch.
  function drawHead(t, sx, sy, rage) {
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 30, W / 2, H * 0.42, H * 1.0);
    g.addColorStop(0, '#2b0b0b'); g.addColorStop(0.6, '#120509'); g.addColorStop(1, '#040308');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const R = H * 0.40, cx = W / 2 + sx, cy = H * 0.58 + sy;
    const b = { script: [{ t: '', mood: rage ? 'rage' : null }], line: 0, ch: 0,
                laugh: t, t: t, blink: 0, inK: 1, outK: 0, duck: 0, gone: false };
    drawBossBody(cx, cy, R);
    drawBossGlobe(cx, cy, R, b);
    drawBossFace(cx, cy, R, b);
    drawBossHat(cx, cy, R, 0, 0, 0);
  }

  window.outroFrame = function (u) {
    const t = u * 4.6;                       // seconds, for anything that wants a clock
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (u < 0.045) return;                   // the black he asked for, before anything happens

    // a hard shake on the switch-on, settling into a small tremor
    const punch = clamp01((u - 0.045) / 0.09);
    const sh = (1 - punch) * 26 + 2.2;
    const sx = (rnd(u * 997) - 0.5) * sh, sy = (rnd(u * 997 + 11) - 0.5) * sh;
    drawHead(t, sx, sy, u > 0.38);

    // take a copy and rebuild the frame from it, so the CRT geometry and the split both
    // operate on a finished picture rather than on half-drawn state
    t1.clearRect(0, 0, W, H); t1.drawImage(cv, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

    // THE TUBE'S GEOMETRY. Switching on opens a bright slit vertically; switching off is the
    // same thing backwards and then a horizontal pinch to a dot, which is the shape everyone
    // recognises as a television dying.
    let vs = 1, hs = 1, bloom = 0;
    if (u < 0.135) { vs = 0.02 + 0.98 * ease(clamp01((u - 0.045) / 0.09)); bloom = 1 - clamp01((u - 0.045) / 0.09); }
    else if (u > 0.93) { vs = 0.014; hs = 1 - ease(clamp01((u - 0.93) / 0.055)); bloom = 0.85; }
    else if (u > 0.80) { vs = 1 - (1 - 0.014) * ease(clamp01((u - 0.80) / 0.13)); bloom = ease(clamp01((u - 0.80) / 0.13)) * 0.9; }

    const dh = Math.max(1, H * vs), dw = Math.max(1, W * hs);
    const dy = (H - dh) / 2, dx0 = (W - dw) / 2;

    // horizontal tear bands, harder during the collapse and in two bursts on the way
    const burst = (u > 0.30 && u < 0.345) || (u > 0.58 && u < 0.615) ? 1 : 0;
    const tear = burst ? 16 : (u > 0.80 ? 22 : 3);
    const split = 3 + burst * 7 + (u > 0.80 ? 9 : 0);
    const bands = 16;
    for (const [col, off] of [['#ff2a2a', -split], ['#22ffff', split]]) {
      const src = channel(col);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < bands; i++) {
        const sy0 = i * H / bands, hgt = H / bands;
        const j = (rnd(Math.floor(u * 90) * 31 + i) - 0.5) * tear;
        ctx.drawImage(src, 0, sy0, W, hgt,
          dx0 + off + j, dy + (sy0 / H) * dh, dw, dh / bands + 1);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // ---- the tube's own dirt, all of it clipped to the live picture
    ctx.save();
    ctx.beginPath(); ctx.rect(dx0, dy, dw, dh); ctx.clip();

    // static
    const n = burst ? 900 : 380;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(u * 90) * 7919 + i;
      ctx.globalAlpha = 0.05 + rnd(k + 3) * 0.20;
      ctx.fillStyle = rnd(k + 5) > 0.5 ? '#fff' : '#9fb0c8';
      ctx.fillRect(rnd(k) * W, rnd(k + 1) * H, 1 + rnd(k + 2) * 3, 1 + rnd(k + 7) * 2);
    }
    ctx.globalAlpha = 1;

    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1.4);

    // the roll bar, drifting up the way an untuned set does
    const ry = H - ((t * 210) % (H + 160));
    const rb = ctx.createLinearGradient(0, ry, 0, ry + 120);
    rb.addColorStop(0, 'rgba(255,255,255,0)');
    rb.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    rb.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rb; ctx.fillRect(0, ry, W, 120);
    ctx.restore();

    // the bloom on the glass as the tube opens and as it dies
    if (bloom > 0.01) {
      const bg = ctx.createLinearGradient(0, dy - 6, 0, dy + dh + 6);
      bg.addColorStop(0, `rgba(255,255,255,0)`);
      bg.addColorStop(0.5, `rgba(255,248,230,${0.85 * bloom})`);
      bg.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.fillStyle = bg; ctx.fillRect(dx0, dy - 6, dw, dh + 12);
    }

    // and the last dot, after the picture has gone
    if (u > 0.955) {
      const d = 1 - clamp01((u - 0.955) / 0.045);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = d;
      ctx.fillStyle = '#fff8e6';
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 1.2 + 5 * d, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // a vignette over the whole tube, always
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.24, W / 2, H / 2, H * 0.92);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  };
})();
