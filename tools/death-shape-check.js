// Does the way a body DIES at a room agree with whether that room is a hole?
//
//   node tools/death-shape-check.js [path/to/index.html]
//
// Two independently written statements about one room, and nothing makes them agree:
//
//   roomIsGap(r)   = !SOLID_HAZ[r.hazard] && !SOLID_TYPE[r.type]     -- is there a hole
//   the kill block = hazard 'machine' -> crush, type 'wall' -> crush, ELSE -> fall
//
// The `else` is the whole problem. It is reached by anything that is neither a machine nor
// the wall, including rooms that are SOLID, and it sets `state = 'fall'` -- so a body drops
// down the face of something standing on the ground. That is exactly the fault the wall had:
// a 70-unit fall down 244 units of masonry, dying "somewhere in the dark". The deck hole was
// the quieter symptom; this is the disease.
//
// WHY THIS NEEDED A DRIVER RATHER THAN AN ASSERTION. The session that found it could not
// demonstrate it: to see a death at room type T the bot must solve everything EXCEPT T, and
// the dev hold releases a room the moment the crowd is queued at it, so most types recorded
// no death at all. A check that reports on rooms where nobody died is the failure this
// project keeps writing down -- it prints reassuring rows about code it never reached.
//
// The driver here does not fight the bot at all. For each room TYPE it solves every room in
// the course, un-solves one, and PLACES the camera and the whole crowd in front of that one,
// in its lane. Nobody has to be good at the game and nothing has to be walked to.
//
// Both of those matter and the first version had neither. Walking the pack down the course
// spent the whole frame budget on 12 of 44 rooms, because an unsolved room holds the crowd
// and the camera waits with it. And a room in lane 3 never gets a queue when the pack is in
// lane 0, so it reported "nobody died" about rooms the driver had never put anyone in front
// of -- the reassuring-rows-about-unreached-code failure this file exists to avoid.
//
// A room that kills NOBODY is reported as such and counted as a failure of the CHECK rather
// than a pass for the room, because that is the state this tool exists to avoid.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const raw = fs.readFileSync(process.argv[2] || path.join(root, 'index.html'), 'utf8');
const src = raw.split('<script>')[1].split('</script>')[0].replace("'use strict';", '');
const h = fs.readFileSync(path.join(root, 'tools', 'freeze-check.js'), 'utf8');
eval(h.slice(h.indexOf('function makeCtx()'), h.indexOf('eval(src'))
  .replace("path.join(__dirname, 'audio-mock.js')", "path.join(" + JSON.stringify(path.join(root, 'tools')) + ", 'audio-mock.js')"));
global.location = { search: '' };
global.URLSearchParams = class { has() { return false; } get() { return null; } };

const out = {};
eval(src + `
;(function(){
  startRun();
  // ONE ROOM PER TYPE, and the crowd PLACED at it rather than walked to it. Walking the
  // whole course spent the entire frame budget on 12 of 44 rooms, because an unsolved room
  // holds the crowd and the camera waits with it -- and a room in lane 3 never gets a queue
  // at all when the pack is in lane 0, so it reports "nobody died" about a room the driver
  // simply never put anyone in front of. The branch under test keys off type and hazard, not
  // off which copy of a room it is, so one of each answers the question.
  const byType = new Map();
  for (const r of S.rooms.slice().sort((a, b) => a.x - b.x)) if (!byType.has(r.type)) byType.set(r.type, r);
  const rows = [];
  for (const room of byType.values()) {
    reset(); startRun();
    const target = S.rooms.find(r => r.x === room.x && r.lane === room.lane);
    for (const r of S.rooms) { r.state = 'solved'; r.bridge = 1; }
    target.state = 'dormant'; target.bridge = 0; target.killT = 0;
    // put the camera and the whole crowd in front of it, IN ITS LANE
    S.cam = target.x - CFG.packFront - 40;
    updateView(1);
    // THE CAVE DOOR HOLDS THE CROWD, and placing them past it fires its whole sequence --
    // gather, the proprietor, a second drill, the burst -- which is far longer than this
    // budget. Six types recorded "nobody died" for exactly this reason and every one of them
    // sat past the seam: the driver had put the crowd somewhere they could not walk from.
    // seamHolding() is false at 'done'.
    S.seam.phase = 'done';
    if (S.boss) S.boss.gone = true;
    for (const r of S.runners) {
      if (r.state !== 'run') continue;
      r.lane = target.lane; r.y = laneY(target.lane);
      r.x = S.cam + r.slot; r.atRoom = null; r.doom = null; r.held = false;
    }
    const rec = { type: target.type, hazard: target.hazard, gap: roomIsGap(target), outcomes: new Set(), deaths: 0 };
    for (let f = 0; f < 60 * 25; f++) {
      update(1 / 60);
      for (const r of S.runners) {
        if (r.doom !== target) continue;
        // the generic branch does not kill on the spot -- it sets state 'fall' and the body
        // dies later, so watching only killRunner's \`how\` would miss the thing under test
        if (r.state === 'fall') rec.outcomes.add('fall');
        else if (r.state === 'dead') rec.outcomes.add(r.how || 'dead');
      }
      rec.deaths = target.deaths || 0;
      if (rec.deaths >= 2) break;
      if (S.mode !== 'play') break;
    }
    rows.push(rec);
  }
  out.opened = rows.length;
  out.mode = S.mode; out.cam = S.cam; out.camMax = S.camMax;
  out.running = S.runners.filter(r => r.state === 'run').length;
  out.rows = rows.map(v => ({ type: v.type, hazard: v.hazard, gap: v.gap,
                              deaths: v.deaths, outcomes: [...v.outcomes] }));
})();
`);

console.log(`one room per type, crowd placed in its lane with every other room solved`);
console.log(`${out.opened} types driven\n`);
console.log('room          hazard    deck    died as            verdict');
let bad = 0, silent = 0;
for (const r of out.rows) {
  const how = r.outcomes.length ? r.outcomes.join('+') : '(nobody died)';
  let verdict = 'ok';
  if (!r.outcomes.length) { verdict = 'NO DEATH -- unproven'; silent++; }
  else if (!r.gap && r.outcomes.includes('fall')) { verdict = 'FALL AT A SOLID ROOM'; bad++; }
  console.log(`${r.type.padEnd(13)} ${r.hazard.padEnd(9)} ${(r.gap ? 'hole' : 'solid').padEnd(7)} ${how.padEnd(18)} ${verdict}`);
}
console.log('');
if (bad) console.log(`${bad} room(s) drop a body down something solid.`);
if (silent) console.log(`${silent} room(s) killed nobody, so this says NOTHING about them -- fix the driver, not the room.`);
if (!bad && !silent) console.log('every room kills in a shape that matches its ground.');
process.exitCode = bad || silent ? 1 : 0;

// PROVED ABLE TO FAIL, and the second falsifier found this check's own boundary.
//
//   put the old `room.type === 'wall'` branch back      thorn: FALL AT A SOLID ROOM, exit 1
//   add `bridge` to SOLID_TYPE (a real gap, misclassed) bridge: crush, "ok"  <-- PASSES
//
// The second one matters. This compares the deck against the death and reports DISAGREEMENT,
// which is exactly what the wall and thorn were. It cannot tell you the classification itself
// is wrong: misclassify a gap as solid and both statements move together, so a body is
// crushed on the lip of a hole and nothing here objects.
//
// That boundary got wider with the fix it was written for. The kill branch used to name
// `wall` by hand, so deck and death were two independent statements and this tool sat
// between them; keying it off roomIsGap makes them ONE statement, which is why the next
// solid room cannot repeat the fault -- and also why this can no longer cross-check the
// classification. A bug that cannot happen is worth more than a bug that is merely
// detectable, so the trade is right, but the remaining risk has MOVED rather than gone.
// What would cover it is a different assertion entirely -- does this room's art stand on
// ground the lane actually has -- which belongs beside enc-check's terraces test.
//
// What this still guards, and it is not nothing: anyone re-introducing a type-named branch
// here, and any new room type whose death shape does not match its ground.
