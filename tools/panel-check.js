// Does any room's puzzle panel collide with itself?
//
// Two rows in that panel are shared between the verb and the frame, and both have been
// overrun. The title is CENTRED on the header line and the status used to be right-aligned
// on the same line, so a long status ran straight through a long title -- nine of the
// fourteen rooms, by up to 94px, none of it visible unless you happened to open that room
// with that state on screen. The status now sits on the bottom row opposite the
// time-to-arrival readout, and this checks they cannot meet either.
//
//   node tools/panel-check.js
//
// Character widths are the measured ratios for the two fonts the panel uses, not the
// harness mock's flat 6px: the mock would report every string the same width and pass.
const fs=require('fs'), path=require('path');
const root='/Users/morganwaddington/first_game_jam';
const src=fs.readFileSync(root+'/index.html','utf8').split('<script>')[1].split('</script>')[0].replace("'use strict';",'');
const h=fs.readFileSync(root+'/tools/freeze-check.js','utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src')).replace("path.join(__dirname, 'audio-mock.js')","'"+root+"/tools/audio-mock.js'"));
global.location={search:''}; global.URLSearchParams=class{has(){return false}get(){return null}};
eval(src + `
;(function(){
  // panelStep prints \`now\` right-aligned at px + pw - 14 on the title's line; the title is
  // centred at W/2. measureText in the mock is 6px per char, so use real-ish ratios:
  // title is 13px bold monospace (~7.8px/char), now is 11px (~6.6px/char).
  const TITLE_CH = 7.8, NOW_CH = 6.6;
  let bad = 0;
  for (const [type, t] of Object.entries(CFG.types)) {
    const v = VERBS[t.verb];
    if (!v || !v.now) continue;
    const pw = Math.max(420, 80);
    const title = 'ROOM 1   ' + t.title;
    // worst-case \`now\` over a few plausible states
    const states = [];
    for (let d = 1; d <= 5; d++) { try { states.push(v.start(d)); } catch(e){} }
    let longest = '';
    for (const m of states) {
      for (const probe of [m, Object.assign({}, m, {holding:true, strain:0.9}), Object.assign({}, m, {holding:true, strain:0.1}), Object.assign({}, m, {stage:1}), Object.assign({}, m, {stage:2, arm:0}), Object.assign({}, m, {watch:false})]) {
        let txt=''; try { txt = v.now(probe) || ''; } catch(e){}
        if (txt.length > longest.length) longest = txt;
      }
    }
    // now sits on the bottom row, left at px+22; the arrival readout is right-aligned at
    // px+pw-22. Worst realistic readout is "100 reach this in 9.9s" = 22 chars.
    const nowRight = 22 + longest.length * NOW_CH;
    const readoutLeft = pw - 22 - 22 * NOW_CH;
    const gap = readoutLeft - nowRight;
    const verdict = gap < 6 ? 'COLLIDES' : 'ok';
    if (gap < 6) bad++;
    console.log((t.verb+'/'+type).padEnd(18), 'title', String(title.length).padEnd(3), 'now "'+longest+'"', ' gap', gap.toFixed(0), ' ', verdict);
  }
  console.log(bad ? '\\n'+bad+' verb(s) collide with their title.' : '\\nno title collisions.');
})();
`);
