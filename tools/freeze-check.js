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
  // 30 runs, not 60. Measured cost per game on a quiet machine, by style:
  // style 0 (bot, plays the whole course to the finale and hammers keys) 45.6s,
  // style 1 (no input) 3.1s, style 2 (random keys) 10.1s, style 3 (masher) 3.0s.
  // So the bot alone is two thirds of the total and the end screen is 11%.
  // Note the coupling: style = g % 4, so RUNS moves all four counts together
  // when they are worth very different amounts. A bot run costs 45.6s and is the
  // ONLY style that reaches the finale. One of each of the other three costs
  // 16.2s combined, and the random-key and masher styles are where the freezes
  // this harness exists for actually get caught -- that coverage is nearly free.
  // So RUNS trades expensive finale coverage and cheap crash coverage as if they
  // were the same thing. Going 60 -> 30 for runtime also took the bot runs from
  // 15 to 8, which was not the intent.
  //
  // If you need more speed, style 0 is the only lever with real time in it, and
  // it is the coverage you least want to lose. If you want more COVERAGE, the
  // cheap styles are almost free: taking the masher from 7 runs to 20 costs
  // about 39s. Splitting these into separate counts would let you hold one and
  // move the other; it has not been done because 30 is what Morgan asked for.
  const errs = {}, unfinished = {}; let froze = 0; const RUNS = 30;
  let maxParticles=0, maxBubbles=0, maxFloaters=0, maxRipples=0, reachedEnd=0;
  // deterministic pseudo-random so runs differ but are reproducible
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let g = 0; g < RUNS; g++) {
    reset(); S.mode = 'play';
    const style = g % 4; // 0 bot, 1 no input, 2 random keys, 3 gate masher
    try {
      // 'intro' belongs here. R from the pause screen now restarts into the opening
      // rather than straight into play, and the random-key style presses both P and R,
      // so without 'intro' the loop exits the instant a fuzz run restarts itself -- which
      // silently ended roughly a quarter of every run set for several builds. Any key
      // skips the opening, and the fuzzer presses one on the next frame, so including it
      // restores the old restart-and-keep-hammering behaviour.
      // The cap is DERIVED from the course, not written down. At 140s hardcoded it was
      // comfortably longer than the course until act three made the world 15600 units
      // instead of 12300, and then eight runs in thirty stopped mid-play with people still
      // walking -- reported as "reachedEnd 22", which reads exactly like a bug in the game
      // and was a bug in the ruler. camMax/scroll is the drive to the last gate; the rest
      // is the opening, the finale and a wide margin for held gates.
      const LIMIT = Math.ceil(60 * (S.camMax / CFG.scroll + 90));
      for (let i = 0; i < LIMIT && (S.mode === 'play' || S.mode === 'finale' || S.mode === 'intro'); i++) {
        update(1/60); draw();
        maxParticles=Math.max(maxParticles,S.particles.length); maxBubbles=Math.max(maxBubbles,S.bubbles.length);
        maxFloaters=Math.max(maxFloaters,S.floaters.length); maxRipples=Math.max(maxRipples,S.ripples.length);
        if (style === 0) {
          // Work ONE room at a time, and work the one about to kill someone.
          // Two traps here, both measured. Round-robinning every frame holds a
          // timed demo paused all run, because closing a panel pauses it, and then
          // reports the room unsolvable. But committing to the FIRST armed room
          // instead just moves the deaths: measured over six runs, round-robin left
          // 49 dead at the sweeper, commit-by-position left 43 at the bridge, and
          // commit-by-urgency left none. Rank by how soon a room kills, and hold on
          // to the current one unless something is meaningfully more urgent, or the
          // bot re-decides every frame and pauses its own demo again.
          const armed = S.rooms.filter(r => r.state === 'armed');
          const urgency = room => {
            let best = Infinity;
            for (const q of S.runners) {
              if (q.state !== 'run' && q.state !== 'fall') continue;
              if (!canReach(q, room)) continue;
              best = Math.min(best, room.x + killFrom(room) - q.x);
            }
            return best;
          };
          let target = armed.length ? armed.reduce((a, b) => (urgency(b) < urgency(a) ? b : a)) : null;
          if (target && armed.includes(S.active) && urgency(S.active) <= urgency(target) + 40) target = S.active;
          for (const r of (target ? [target] : [])) {
            if (S.active && S.active !== r) press('ESCAPE');
            if (S.active !== r) press(String(r.hot));
            let guard = 0;
            while (S.active === r && guard++ < 200) {
              const m = r.mg, V = VERBS[r.verb];
              if (r.verb === 'bar') { m.pos = m.zone + m.zoneW/2; press(' '); continue; }
              if (!V.solveKey) break;
              const k = V.solveKey(m);
              // null means "not yet": the puzzle is waiting on time, not on a key.
              // Break so the OUTER frame loop advances the clock, and pick it up
              // next frame. Spinning here instead just burns the guard and leaves
              // the room unsolved, which reads as the puzzle being broken.
              if (k === null || k === undefined) break;
              press(k);
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
      // 'intro' is explicitly NOT an ending: counting it would hide the same failure again
      if (S.mode === 'win' || S.mode === 'lose' || S.mode === 'finale') reachedEnd++;
      else {
        const why = S.mode + ' @ ' + S.t.toFixed(0) + 's, ' + S.runners.filter(r => r.state === 'run').length + ' still walking';
        unfinished[why] = (unfinished[why] || 0) + 1;
      }
      // Sit on the end screen: it is animated (endT, embers, staggered cards, typing)
      // and has broken before. 6s, not the 20s this used to be. Measured by
      // stepping endT and hashing the canvas until the frame stops changing:
      // the lose report settles at 2.75s, and a win screen carrying a full
      // hundred-death report -- rank stamp and typed line included, the longest
      // layout there is -- settles at 4.0s. 6s is that worst case plus half
      // again. Pin S.shake to 0 before hashing or the title slam's jitter makes
      // every frame differ and the measurement reads as "never settles".
      for (let i = 0; i < 60*6; i++) { update(1/60); draw(); maxParticles=Math.max(maxParticles,S.particles.length); }
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
  console.log(JSON.stringify({ frozenRuns: froze + '/' + RUNS, reachedEnd, unfinished, errors: errs,
    audio: { contextCreated: !!AU.ctx, nodesCreated: global.__audio.nodes, stillLive: global.__audio.live },
    peaks: { particles: maxParticles, bubbles: maxBubbles, floaters: maxFloaters, ripples: maxRipples } }, null, 1));
})();`);
