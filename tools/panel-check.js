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
// Character widths come from the FONT SIZES read out of panelStep and panelGauges, at
// monospace's 0.6em advance -- not from the harness mock's flat 6px, which would report
// every string the same width and pass everything. And not written down here either: this
// file carried 11px for both halves of the footer and a 22-character readout, so when the
// readout went to 12px and 29 characters it went on reporting "no collisions" about a row
// with 77px of overlap in it. Anything below that is a fact about index.html is parsed
// from index.html.
const fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(root+'/index.html','utf8').split('<script>')[1].split('</script>')[0].replace("'use strict';",'');
const h=fs.readFileSync(root+'/tools/freeze-check.js','utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src')).replace("path.join(__dirname, 'audio-mock.js')","'"+root+"/tools/audio-mock.js'"));
global.location={search:''}; global.URLSearchParams=class{has(){return false}get(){return null}};
const raw = fs.readFileSync(root+'/index.html','utf8');
const fontIn = (fn, dflt) => {
  const body = raw.slice(raw.indexOf('function ' + fn + '('));
  const m = body.slice(0, body.indexOf('\n}')).match(/ctx\.font = 'bold (\d+)px monospace'/);
  return m ? +m[1] : dflt;
};
// Every string panelGauges can put in the readout slot, from the fillText that puts it
// there -- found by the coordinates it is drawn at, so renaming the strings cannot lose
// them. Each ${...} stands for at most three characters (100 runners, 9.9 seconds).
const gaugeBody = raw.slice(raw.indexOf('function panelGauges('));
const gaugeLine = gaugeBody.slice(0, gaugeBody.indexOf('\n}')).split('\n').find(l => l.includes('by - 5')) || '';
const READOUTS = [...gaugeLine.matchAll(/'([^']*)'/g)].map(m => m[1])
  .concat([...gaugeLine.matchAll(/`([^`]*)`/g)].map(m => m[1].replace(/\$\{[^}]*\}/g, 'XXX')))
  .filter(t => t.length > 5);
if (!READOUTS.length) { console.log('could not find panelGauges\u2019 readout strings -- fix this file before believing it'); process.exit(1); }
const STEP_PX = fontIn('panelStep', 11), GAUGE_PX = fontIn('panelGauges', 12);
const READOUT = READOUTS.reduce((a, b) => (b.length > a.length ? b : a), '');
console.log('panelStep at ' + STEP_PX + 'px, panelGauges at ' + GAUGE_PX + 'px, longest readout "' + READOUT + '" (' + READOUT.length + ' chars)\n');
eval(src + `
;(function(){
  const TITLE_CH = 7.8, NOW_CH = ${STEP_PX} * 0.6, GAUGE_CH = ${GAUGE_PX} * 0.6;
  const READOUT_LEN = ${READOUT.length};
  let bad = 0;
  for (const [type, t] of Object.entries(CFG.types)) {
    const v = VERBS[t.verb];
    if (!v || !v.now) continue;
    // the width the room will really be drawn at, including a verb that asks for one
    const pw = Math.max(420, v.pw || 0, 80);
    const title = 'ROOM 1   ' + t.title;
    // worst-case \`now\` over a few plausible states
    const states = [];
    for (let d = 1; d <= 5; d++) { try { states.push(v.start(d)); } catch(e){} }
    let longest = '';
    for (const m of states) {
      // THE PROBES HAVE TO NAME FIELDS THE VERBS STILL HAVE. "strain" was lift's, and when
      // that room was rewritten around a needle and a band the two strain probes went on
      // passing while exercising nothing: they set a key no verb reads, so both collapsed
      // onto the same branch of now() as the bare state and the longest string went unfound.
      // A probe list is a claim about what states exist, and it goes stale silently.
      for (const probe of [m,
        Object.assign({}, m, {holding:true, gauge:0.40}),            // lift, needle climbing
        Object.assign({}, m, {holding:true, gauge:m.zone}),          // lift, needle in the band
        Object.assign({}, m, {holding:true, gauge:0.97}),            // lift, past the band
        Object.assign({}, m, {recoil:0.2}),                          // lift, the spring bit
        Object.assign({}, m, {verdict:0.4, hit:1}),                  // lift, a clean pull
        Object.assign({}, m, {verdict:0.4, hit:0, late:1}),          // lift, too far
        Object.assign({}, m, {stage:1}), Object.assign({}, m, {stage:2, arm:0}),
        Object.assign({}, m, {watch:false}), Object.assign({}, m, {pulling:true}),
        Object.assign({}, m, {failed:true})]) {
        let txt=''; try { txt = v.now(probe) || ''; } catch(e){}
        if (txt.length > longest.length) longest = txt;
      }
    }
    // now sits on the bottom row, left at px+22; the arrival readout is right-aligned at
    // px+pw-22, in its OWN font and at its own longest string, both read from the source.
    const nowRight = 22 + longest.length * NOW_CH;
    const readoutLeft = pw - 22 - READOUT_LEN * GAUGE_CH;
    const gap = readoutLeft - nowRight;
    const verdict = gap < 6 ? 'COLLIDES' : 'ok';
    if (gap < 6) bad++;
    console.log((t.verb+'/'+type).padEnd(18), 'pw', String(pw).padEnd(4), 'now "'+longest+'"', ' gap', gap.toFixed(0).padStart(5), ' ', verdict);
  }
  console.log(bad ? '\\n'+bad+' verb(s) run their status into the arrival readout.' : '\\nno footer collisions.');
})();
`);
