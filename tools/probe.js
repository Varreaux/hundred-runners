// A single game, headless, reporting the FIRST exception out of update() or draw().
//
// The freeze harness answers "does any of thirty games break"; this answers "is the frame
// I am looking at right now broken", in about a second instead of ten minutes. That gap
// matters while iterating on art: an exception in draw() stops requestAnimationFrame from
// being rescheduled, so the page renders a HALF-DRAWN frame and then freezes -- which in a
// screenshot looks like a composition problem, not a crash. It found `off is not defined`
// in millYard after a loop variable was renamed, from a shot that merely looked empty.
//
//   node tools/probe.js [intro|play|finale] [seconds] [solve]
//
// It is not a replacement for tools/freeze-check.js: one game, one style, no key input.
// Run the harness before pushing.
const fs = require('fs'), path = require('path');
const root=path.join(__dirname,'..');
const raw=fs.readFileSync(path.join(root,'index.html'),'utf8');
const src=raw.split('<script>')[1].split('</script>')[0].replace("'use strict';",'');
const h=fs.readFileSync(path.join(root,'tools','freeze-check.js'),'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src')).replace("path.join(__dirname, 'audio-mock.js')", "path.join(__dirname,'audio-mock.js')"));
const MODE=process.argv[2]||'intro', SECS=+(process.argv[3]||3), SOLVE=process.argv[4]==='solve';
// devSolve dispatches real KeyboardEvents, so the stub window needs both halves
global.KeyboardEvent = class { constructor(t,o){ Object.assign(this,o); this.type=t; } };
let __kh=null;
global.window.addEventListener=(ev,fn)=>{ if(ev==='keydown') __kh=fn; };
global.window.dispatchEvent=e=>{ if(__kh) __kh({ key:e.key, repeat:false, preventDefault(){} }); };
global.location={search:''};
global.URLSearchParams=class{has(){return false}get(){return null}};
eval(src + `
;(function(){
  try {
    // 'finale' needs its state built, exactly as the ?finale dev shortcut builds it.
    // Setting the mode alone leaves S.finale null and update() dies on it -- which is the
    // probe being wrong, not the game, and is worth not re-learning at 3am.
    if ('${MODE}' === 'finale') {
      S.runners.slice(0, 12).forEach(r => { r.state = 'arrived'; });
      S.stats.arrived = 12; S.cam = S.camMax; updateView(1);
      S.finale = { len: 6, seq: makeSeq(6), idx: 2, attempts: 12, timer: 0.9,
                   line: S.runners.slice(0, 12), leaving: [] };
    }
    S.mode='${MODE}'; S.introT=0;
    // With no input everyone dies in the first act and the mode flips to 'lose', so the
    // camera never advances and the later acts are never drawn. A probe that reports
    // "no exception" having never executed act three is worse than no probe: pass 'solve'
    // to drive the bot and actually get there.
    for(let i=0;i<${SECS}*60 && S.mode!=='win' && S.mode!=='lose';i++){ update(1/60); if(${SOLVE}) devSolve(); }
    draw();
    console.log('no exception; mode', S.mode, '| cam', S.cam.toFixed(0), 'of', S.camMax, '| running', S.runners.filter(r=>r.state==='run').length);
  } catch(e) { console.log('THREW:', e.message); console.log(e.stack.split('\\n').slice(0,6).join('\\n')); }
})();
`);
