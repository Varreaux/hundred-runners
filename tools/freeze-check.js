const fs = require('fs'), path = require('path');
const target = process.argv[2] || path.join(__dirname, '..', 'index.html');
const raw = fs.readFileSync(target, 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';",'');

function makeCtx() {
  const grad = { addColorStop(){} };
  const c = {
    canvas: { width: 960, height: 540 },
    save(){}, restore(){}, translate(){}, scale(){}, rotate(){}, clip(){},
    beginPath(){}, closePath(){}, moveTo(){}, lineTo(){}, quadraticCurveTo(){}, bezierCurveTo(){},
    fill(){}, stroke(){}, fillRect(){}, strokeRect(){}, clearRect(){}, rect(){},
    arc(a,b,r){ if(!isFinite(r)||r<0) throw new Error('IndexSizeError: bad radius '+r); },
    arcTo(){}, ellipse(){}, setLineDash(){}, drawImage(){},
    fillText(){}, strokeText(){},
    measureText(t){ return { width: String(t).length * 6 }; },
    createLinearGradient(){ return grad; }, createRadialGradient(){ return grad; },
    createPattern(){ return grad; },
    getImageData(w,h){ return { data: new Uint8ClampedArray(4*8*8) }; },
    createImageData(w,h){ return { data: new Uint8ClampedArray(4*(w||8)*(h||8)), width:w||8, height:h||8 }; },
    putImageData(){},
    fillStyle:'', strokeStyle:'', lineWidth:1, lineCap:'', lineJoin:'', font:'', textAlign:'',
    globalAlpha:1, globalCompositeOperation:'', shadowBlur:0, shadowColor:'', filter:'',
  };
  return c;
}
global.document = { getElementById: () => ({ getContext: makeCtx, width:960, height:540 }),
                    createElement: () => ({ getContext: makeCtx, width:8, height:8 }) };
let keyHandler=null;
global.window = { addEventListener:(ev,fn)=>{ if(ev==='keydown') keyHandler=fn; } };
global.performance = { now: () => 0 }; global.requestAnimationFrame = () => {};
global.location = { search: '' }; global.URLSearchParams = class { has(){return false} get(){return null} };
global.localStorage = { getItem:()=>null, setItem:()=>{} };
// Real Web Audio mock. Without it AU.init throws into its own catch, AU.ctx stays
// null and every sound method early-returns, so the whole module goes untested.
const { makeAudioMock } = require(path.join(__dirname, 'audio-mock.js'));
global.__audio = { nodes: 0, live: 0 };
global.window.AudioContext = makeAudioMock(global.__audio);

eval(src + `
;(function(){
  const press = k => keyHandler({ key: k, repeat: false, preventDefault(){} });
  const KEYS = 'QWERASDFZXCVBNMPRTYUIOGHJKL'.split('').concat(['1','2','3','4','5','6','7','8','9',' ','Enter','Escape']);
  const errs = {}; let froze = 0; const RUNS = 60;
  let maxParticles=0, maxBubbles=0, maxFloaters=0, maxRipples=0, reachedEnd=0;
  // deterministic pseudo-random so runs differ but are reproducible
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let g = 0; g < RUNS; g++) {
    reset(); S.mode = 'play';
    const style = g % 4; // 0 bot, 1 no input, 2 random keys, 3 gate masher
    try {
      for (let i = 0; i < 60*140 && (S.mode === 'play' || S.mode === 'finale'); i++) {
        update(1/60); draw();
        maxParticles=Math.max(maxParticles,S.particles.length); maxBubbles=Math.max(maxBubbles,S.bubbles.length);
        maxFloaters=Math.max(maxFloaters,S.floaters.length); maxRipples=Math.max(maxRipples,S.ripples.length);
        if (style === 0) {
          for (const r of S.rooms.filter(r => r.state === 'armed')) {
            press(String(r.hot));
            let guard = 0;
            while (S.active === r && guard++ < 200) {
              const m = r.mg;
              if (r.verb === 'keys') press(m.seq[m.idx]);
              else if (r.verb === 'word') press(m.word[m.idx]);
              else { m.pos = m.zone + m.zoneW/2; press(' '); }
            }
          }
          if (S.mode === 'finale' && S.finale) press(S.finale.seq[S.finale.idx]);
        } else if (style === 2) {
          if (rnd() < 0.25) press(KEYS[Math.floor(rnd()*KEYS.length)]);
        } else if (style === 3) {
          if (rnd() < 0.05) press('Enter');
          if (rnd() < 0.1) press(String(1 + Math.floor(rnd()*3)));
          if (rnd() < 0.2) press('QWERASDF'[Math.floor(rnd()*8)]);
        }
      }
      if (S.mode === 'win' || S.mode === 'lose' || S.mode === 'finale') reachedEnd++;
      // sit on the end screen for 20s of frames: it is animated now (endT, embers, staggered cards, typing)
      for (let i = 0; i < 60*20; i++) { update(1/60); draw(); maxParticles=Math.max(maxParticles,S.particles.length); }
      // and restart from it
      press('R'); for (let i = 0; i < 120; i++) { update(1/60); draw(); }
    } catch (e) {
      froze++;
      const top = (e.stack||'').split('\\n')[1].trim().replace(/ \\(eval.*/,'');
      // Group on the SHAPE of the fault, not its value: one defect whose offending
      // number varies would otherwise fragment into an entry per value and bury a
      // rarer second error underneath. Keep a sample so the real value is not lost.
      const shape = e.message.replace(/-?\\d+(\\.\\d+)?(e[+-]?\\d+)?/gi, 'N');
      const key = shape + ' | ' + top;
      if (!errs[key]) errs[key] = { count: 0, sample: e.message, styles: [], firstAt: S.t.toFixed(1), zoom: V.zoom.toFixed(2), mode: S.mode };
      errs[key].count++;
      if (!errs[key].styles.includes(style)) errs[key].styles.push(style);
    }
  }
  console.log(JSON.stringify({ frozenRuns: froze + '/' + RUNS, reachedEnd, errors: errs,
    audio: { contextCreated: !!AU.ctx, nodesCreated: global.__audio.nodes, stillLive: global.__audio.live },
    peaks: { particles: maxParticles, bubbles: maxBubbles, floaters: maxFloaters, ripples: maxRipples } }, null, 1));
})();`);
