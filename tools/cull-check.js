// Did a viewport cull remove ONLY what was off the screen?
//
//   node tools/cull-check.js <baseline index.html> [current index.html]
//
// A cull is the one optimisation that is trivially safe in principle and easy to get
// subtly wrong in practice: the geometry is procedural, and several of these loops carry
// state from one iteration to the next (`placed`, the skeleton boxes), so SKIPPING an
// iteration can move what the next one draws. That fault is invisible in a screenshot of
// the frame you were looking at and shows up two hundred units down the course.
//
// So this does not compare pictures. It records every drawing op both builds issue, with
// the bounding box each one covers ON SCREEN -- honouring the transform stack, because
// all of this is drawn under translate+scale and a tool that ignored that would invent
// its numbers (CLAUDE.md, "Measuring the canvas") -- and then asserts:
//
//   the sequence of ops that are ON SCREEN is IDENTICAL in the two builds.
//
// Ops that are wholly off screen may be removed freely; that is the whole point. Anything
// else -- an on-screen op that moved, changed colour, or disappeared -- fails.
//
// Math.random is seeded identically in both runs, so the two drives are the same drive.
// Without that the crowd diverges within a second and every op differs for a reason that
// has nothing to do with the cull.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const BASE = process.argv[2], CUR = process.argv[3] || path.join(root, 'index.html');
if (!BASE) { console.error('usage: node tools/cull-check.js <baseline.html> [current.html]'); process.exit(2); }

const W = 960, H = 540;
const SECS = +(process.env.CULL_SECS || 150);
const SAMPLES = +(process.env.CULL_SAMPLES || 40);

function run(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
  let REC = null;
  function makeCtx() {
    let M = [1, 0, 0, 1, 0, 0]; const stack = [];
    const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3],
                           m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
    const pt = (x, y) => [M[0]*x+M[2]*y+M[4], M[1]*x+M[3]*y+M[5]];
    // SUBPATHS ARE TRACKED SEPARATELY, and that is not tidiness.
    //
    // A union bounding box cannot identify a stroke that is built of many independent
    // subpaths -- the truss zigzag is one beginPath, ninety moveTo/lineTo runs and a single
    // stroke() -- because removing an off-screen run legitimately shrinks the union. Scored
    // on the union, culling the invisible half of that path reads as changing the visible
    // half, and the check fails for a reason that has nothing to do with the pixels.
    //
    // So: `subs` holds one box per subpath (a moveTo opens a new one), and `bb` stays as the
    // union for the callers that still need it.
    let bb = null, subs = [], cur = null;
    const grow = (b, sx, sy) => { b[0]=Math.min(b[0],sx); b[1]=Math.min(b[1],sy);
                                  b[2]=Math.max(b[2],sx); b[3]=Math.max(b[3],sy); };
    const add = (x, y) => { if (!isFinite(x) || !isFinite(y)) return; const [sx, sy] = pt(x, y);
      if (!bb) bb = [sx, sy, sx, sy]; else grow(bb, sx, sy);
      if (!cur) { cur = [sx, sy, sx, sy]; subs.push(cur); } else grow(cur, sx, sy); };
    const newSub = () => { cur = null; };
    // PAD the viewport test. A stroke is drawn about its path, a shadow spreads, and a
    // gradient fill can reach past the box we measured; a hairline of something just off
    // the edge is still a hairline the player sees. 24px of slack costs a handful of ops
    // and removes the whole class of "it was one pixel outside my box".
    const PAD = 24;
    const vis = b => !b || (b[2] >= -PAD && b[0] <= W+PAD && b[3] >= -PAD && b[1] <= H+PAD);
    const n = v => typeof v === 'number' ? (Math.abs(v) < 1e-9 ? '0' : v.toFixed(2)) : String(v);
    const put = (op, extra) => { if (!REC) return;
      // an op is recorded WITH its visibility, so the filter below can drop the invisible
      REC.push({ vis: vis(bb), s: op + ' ' + extra }); };
    const grad = { addColorStop(o, c) { if (REC) REC.push({ vis: true, s: 'stop ' + n(o) + ' ' + c, soft: true }); } };
    const c = { canvas: { width: W, height: H },
      save() { stack.push(M.slice()); }, restore() { M = stack.pop() || M; },
      translate(x, y) { M = mul(M, [1,0,0,1,x,y]); }, scale(x, y) { M = mul(M, [x,0,0,y,0,0]); },
      rotate(a) { const s=Math.sin(a), k=Math.cos(a); M = mul(M, [k,s,-s,k,0,0]); },
      transform(...a) { M = mul(M, a); }, setTransform(...a) { M = a.slice(); },
      beginPath() { bb = null; subs = []; cur = null; }, closePath() {},
      moveTo(x,y){ newSub(); add(x,y); }, lineTo(x,y){ add(x,y); },
      quadraticCurveTo(a,b2,x,y){ add(a,b2); add(x,y); },
      bezierCurveTo(a,b2,c2,d,x,y){ add(a,b2); add(c2,d); add(x,y); },
      rect(x,y,w,h){ newSub(); add(x,y); add(x+w,y+h); },
      arc(x,y,r){ if(!isFinite(r)||r<0) throw new Error('bad radius '+r); newSub(); add(x-r,y-r); add(x+r,y+r); },
      arcTo(a,b2,x,y){ add(a,b2); add(x,y); },
      ellipse(x,y,rx,ry){ add(x-rx,y-ry); add(x+rx,y+ry); },
      // fill() keeps the UNION. A fill's subpaths are not independent -- under nonzero
      // winding one can be a hole in another -- so dropping one can change the shape of
      // what is left, and scoring them separately would hide exactly that. stroke() is
      // per subpath, because stroked runs genuinely are independent ink.
      fill() { put('fill', bb ? bb.map(n).join(',') : '-'); },
      stroke() { if (!REC) return;
        if (!subs.length) { put('stroke', '-'); return; }
        for (const b of subs) REC.push({ vis: vis(b), s: 'stroke ' + b.map(n).join(',') }); },
      clip() { bb = null; },
      fillRect(x,y,w,h){ bb=null; add(x,y); add(x+w,y+h); put('fillRect', bb.map(n).join(',')); bb=null; },
      strokeRect(x,y,w,h){ bb=null; add(x,y); add(x+w,y+h); put('strokeRect', bb.map(n).join(',')); bb=null; },
      clearRect(){}, setLineDash(){},
      drawImage(img,x,y,w,h){ bb=null; add(x,y); add(x+(w||8),y+(h||8)); put('drawImage', bb.map(n).join(',')); bb=null; },
      fillText(t,x,y){ bb=null; add(x-40,y-14); add(x+40,y+6); put('fillText', n(x)+','+n(y)+' '+t); bb=null; },
      strokeText(t,x,y){ bb=null; add(x-40,y-14); add(x+40,y+6); put('strokeText', n(x)+','+n(y)+' '+t); bb=null; },
      measureText(t){ return { width: String(t).length*6 }; },
      createLinearGradient(){ return grad; }, createRadialGradient(){ return grad; },
      createPattern(){ return grad; },
      getImageData(){ return { data: new Uint8ClampedArray(256) }; },
      createImageData(w,h){ return { data: new Uint8ClampedArray(4*(w||8)*(h||8)), width:w||8, height:h||8 }; },
      putImageData(){} };
    for (const p of ['fillStyle','strokeStyle','font','globalCompositeOperation','lineWidth',
                     'lineCap','lineJoin','textAlign','globalAlpha','shadowBlur','shadowColor','filter']) {
      let v = ''; Object.defineProperty(c, p, { get: () => v,
        // A style write is recorded as `soft`: it is not ink, so it survives the filter
        // only when the op that USES it does. Dropping them outright would hide a cull
        // that changed a colour; keeping them unconditionally would fail every run,
        // because skipping an invisible shape legitimately skips its fillStyle too.
        set: x => { if (REC) REC.push({ vis: true, soft: true, s: p+'='+(typeof x==='number'?n(x):String(x)) }); v = x; } });
    }
    return c;
  }
  global.document = { getElementById: () => ({ getContext: makeCtx, width: W, height: H }),
                      createElement: () => ({ getContext: makeCtx, width: 8, height: 8 }) };
  let kh = null;
  global.KeyboardEvent = class { constructor(t,o){ Object.assign(this,o); this.type=t; } };
  global.window = { addEventListener:(e,f)=>{ if(e==='keydown') kh=f; },
                    dispatchEvent:e=>{ if(kh) kh({key:e.key,repeat:false,preventDefault(){}}); } };
  global.performance = { now: () => 0 }; global.requestAnimationFrame = () => {};
  global.location = { search:'' }; global.URLSearchParams = class { has(){return false} get(){return null} };
  global.localStorage = { getItem:()=>null, setItem:()=>{} };
  const { makeAudioMock } = require(path.join(root,'tools','audio-mock.js'));
  global.__audio = { nodes:0, live:0 }; global.window.AudioContext = makeAudioMock(global.__audio);
  // one seeded stream, identical in both builds, so the two drives are the same drive
  let seed = 987654321;
  Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  global.__rec = { start(){ REC = []; }, stop(){ const r = REC; REC = null; return r; } };
  const out = { frames: [] };
  global.__out = out;
  eval(src + `
;(function(){
  S.mode='play'; S.introT=0;
  const TOTAL=${SECS}*60, EVERY=Math.max(1,Math.floor(TOTAL/${SAMPLES}));
  // warm the sprite caches before recording: the FIRST call that needs a puff sprite
  // builds it inline and every later one blits it, so frame 1 legitimately differs from
  // frame 2 in both builds and would read as a cull fault.
  draw(); draw();
  for(let i=0;i<TOTAL && S.mode!=='win' && S.mode!=='lose';i++){
    update(1/60); devSolve();
    if(i%EVERY===0){ __rec.start(); draw(); __out.frames.push({ cam:S.cam, ops:__rec.stop() }); }
  }
  __out.cam = S.cam; __out.camMax = S.camMax;
})();
`);
  return out;
}

const a = run(BASE), b = run(CUR);
if (a.frames.length !== b.frames.length) {
  console.log('FAIL: different frame counts (' + a.frames.length + ' vs ' + b.frames.length +
              ') -- the two drives diverged, so nothing below means anything.');
  process.exit(1);
}
let removed = 0, kept = 0, fails = 0;
for (let f = 0; f < a.frames.length; f++) {
  const A = a.frames[f].ops, B = b.frames[f].ops;
  // the claim: the ON-SCREEN ink is identical. Style writes (`soft`) are not ink.
  const ink = o => o.filter(x => !x.soft);
  const onA = ink(A).filter(x => x.vis), onB = ink(B).filter(x => x.vis);
  removed += ink(A).length - ink(B).length;
  kept += onB.length;
  if (onA.length !== onB.length || onA.some((x, i) => x.s !== onB[i].s)) {
    fails++;
    if (fails <= 3) {
      let i = 0; while (i < Math.min(onA.length, onB.length) && onA[i].s === onB[i].s) i++;
      console.log('FAIL at frame ' + f + ' (cam ' + a.frames[f].cam.toFixed(0) + '): ' +
                  onA.length + ' on-screen ink ops before, ' + onB.length + ' after');
      console.log('  first difference at on-screen op ' + i + ':');
      console.log('    baseline: ' + (onA[i] ? onA[i].s : '(end)'));
      console.log('    current:  ' + (onB[i] ? onB[i].s : '(end)'));
    }
  }
}
console.log('');
console.log('frames compared ' + a.frames.length + ', cam reached ' + a.cam.toFixed(0) + ' of ' + a.camMax);
console.log('on-screen ink ops per frame, after the cull: ' + Math.round(kept / a.frames.length));
console.log('off-screen ink ops removed per frame:        ' + Math.round(removed / a.frames.length));
if (fails) { console.log('\nCULL CHANGED WHAT IS ON SCREEN in ' + fails + ' of ' + a.frames.length + ' frames.'); process.exit(1); }
console.log('\nALL CLEAR: every on-screen drawing op is identical; only off-screen ops were removed.');
