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
    // THE THIRD STATEMENT, and the only one written independently of the other two. The
    // closing reel gives every trap a ground line: GY.gap for the crossings, GY.machine or
    // GY.gantry for anything the body comes to rest ON. It is drawn by the art, not derived
    // from SOLID_TYPE, and it is the evidence that settled both the wall and the thorn by
    // hand -- TRAPS.wall stands the body against the brick, TRAPS.thorn sits on GY.machine.
    const card = TRAPS[target.type];
    const rec = { type: target.type, hazard: target.hazard, gap: roomIsGap(target),
                  reelGap: card ? card.gy === GY.gap : null, outcomes: new Set(), deaths: 0 };
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
  out.rows = rows.map(v => ({ type: v.type, hazard: v.hazard, gap: v.gap, reelGap: v.reelGap,
                              deaths: v.deaths, outcomes: [...v.outcomes] }));
})();
`);

console.log(`one room per type, crowd placed in its lane with every other room solved`);
console.log(`${out.opened} types driven\n`);
console.log('room          hazard    deck    reel    died as            verdict');
let bad = 0, silent = 0, split = 0;
for (const r of out.rows) {
  const how = r.outcomes.length ? r.outcomes.join('+') : '(nobody died)';
  const reel = r.reelGap === null ? '-' : r.reelGap ? 'hole' : 'solid';
  let verdict = 'ok';
  if (!r.outcomes.length) { verdict = 'NO DEATH -- unproven'; silent++; }
  else if (!r.gap && r.outcomes.includes('fall')) { verdict = 'FALL AT A SOLID ROOM'; bad++; }
  else if (r.reelGap !== null && r.reelGap !== r.gap) {
    verdict = 'DECK AND REEL DISAGREE'; split++;
  }
  console.log(`${r.type.padEnd(13)} ${r.hazard.padEnd(9)} ${(r.gap ? 'hole' : 'solid').padEnd(7)} ${reel.padEnd(7)} ${how.padEnd(18)} ${verdict}`);
}
console.log('');
if (bad) console.log(`${bad} room(s) drop a body down something solid.`);
if (split) console.log(`${split} room(s) are classified one way by SOLID_TYPE and the other by the reel's ground line.`);
if (silent) console.log(`${silent} room(s) killed nobody, so this says NOTHING about them -- fix the driver, not the room.`);
if (!bad && !silent && !split) console.log('deck, reel and death agree for every room type.');
process.exitCode = bad || silent || split ? 1 : 0;

// WHAT "ok" DEPENDS ON, because the next person to change the bot or the seam will not
// otherwise know. Every row here is a verdict only because the driver put a crowd in front
// of that room, and two things make that true rather than obvious:
//
//   * `S.seam.phase = 'done'` after placing. Without it, six types past the cave door report
//     "nobody died" -- the door fires when the crowd is placed beyond it and holds them for
//     a sequence far longer than this budget.
//   * the crowd is moved into the room's OWN lane. Without it, anything outside lane 0 never
//     queues and reports the same reassuring silence.
//
// Break either and this file prints rows about rooms nobody stood at. It counts a room that
// killed nobody as a FAILURE of the check rather than a pass for the room, and exits 1, so
// the silence cannot be read as a green -- but only the count is automatic, not the cause.
//
// PROVED ABLE TO FAIL, three ways, and the third closed a hole the first two left.
//
//   put the old `room.type === 'wall'` branch back      thorn: FALL AT A SOLID ROOM, exit 1
//   add `bridge` to SOLID_TYPE (a real gap, misclassed) bridge: DECK AND REEL DISAGREE, exit 1
//   remove the seam line above                          six types: NO DEATH, exit 1
//
// The middle one used to PASS, and that was this check's boundary: with the kill branch
// reading roomIsGap, the deck and the death are one statement and cannot contradict each
// other, so a misclassified room moved both together and nothing objected. The third opinion
// fixes it. TRAPS[type].gy is drawn by the art -- GY.gap for a crossing, GY.machine or
// GY.gantry for anything a body comes to rest ON -- and owes nothing to SOLID_TYPE. It is
// also the evidence that settled the wall and the thorn by hand, so making it automatic was
// only ever writing down what two people had already done twice with their eyes.
//
// What is still NOT covered: all three could be wrong together. Nothing here looks at the
// drawn world and asks whether the deck really has ground where the room's art stands on it.
// That is an enc-check-shaped assertion and it remains unbuilt.
