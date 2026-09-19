# Hundred Runners — working agreement

A game jam game. One file, `index.html`: plain HTML5 canvas and JavaScript, no
dependencies, no build step. Several Claude sessions work on it at once for
Morgan (GitHub login `Varreaux`). Read this before editing.

## Branch and server

- Work on the **`Morgan`** branch. Never push to `main` — `main` is the public
  version that GitHub Pages serves at https://varreaux.github.io/hundred-runners/
  and merging into it is Morgan's call, not ours.
- `Morgan` is the single integration point. Merge into it as soon as a change is
  verified, so Morgan only ever has one build to play.
- Working in a git worktree, push with `git push origin HEAD:Morgan` rather than
  pushing the worktree's own branch name. Otherwise a half-finished branch
  appears on GitHub, goes stale the moment you land the real work on `Morgan`,
  and then reads as abandoned to anyone looking at the branch list.
- Morgan plays at **http://localhost:8765**, which serves this checkout with
  no-cache headers. Do not point him at any other port. If you run your own
  server for screenshots, keep it to yourself and say so.

### Check your OWN screenshot port, not just his

We apply the served-BUILD check religiously to 8765 and almost never to the port we are
photographing. **A 200 proves a server, not YOUR server.** A session started python on a
port another worktree already held, the EADDRINUSE went into /dev/null, the curl came back
200, and it photographed somebody else's build for an hour. The cost was not the wasted
frames: it then spent a long stretch hunting for a room it had just moved, through a pixel
sampler and a script deriving the on-screen rect from the game's own transform, and
concluded the room might be invisible at cave zoom. It was not. The build being served
still had that room in act one. Two reviewers read those frames, and every finding that
came from the images was void while every finding that came from the code stood.

`tools/shoot.sh` now refuses to shoot unless the port serves a byte-identical index.html,
so using it is the fix. If you roll your own shot loop, do the same check; the ports around
8790-8850 are crowded enough that collision is not a remote risk.

**Compare by HASH, not by BUILD.** Two worktrees sit at the same BUILD for the whole gap
between one session's rebase and their next bump, so a matching stamp proves very little --
and while iterating on art the file is usually uncommitted, which no stamp reflects at all.

And when the port is not yours, **do not kill it.** Same rule as for processes:
`lsof -nP -iTCP:<port> -sTCP:LISTEN -t | xargs -I% lsof -a -p % -d cwd` says whose it is.
Pick a free port instead.

### Pushing is not delivering. Pull into his checkout yourself.

**8765 serves `/Users/morgan/dev/first_game_jam`. Pushing puts work on origin and
does not touch that folder.** So a push he cannot see is not a delivery, and
"just refresh" is a lie unless somebody has pulled. Morgan asked for this
directly on 2026-09-16, after refreshing at BUILD 57 while 58, 59, 61 and 62 were
all sitting on `Morgan`. He asked three separate times why nothing had changed.
Every one of those answers cost him more than the pull would have.

**A worktree-isolated session cannot do it the obvious way.** `git -C <main>
pull`, `cd <main> && git pull` and `--git-dir` are all REFUSED by the harness —
not by permissions, and no amount of rephrasing gets round it. The route that
works:

1. `ExitWorktree` with `action: "keep"` — your worktree and branch stay on disk
2. from the main checkout: `git status --porcelain`, then `git pull --ff-only`
3. `EnterWorktree` with `path` set back to your worktree

Confirm what he will actually load, rather than assuming the pull did it:

```
curl -s http://127.0.0.1:8765/index.html | grep -m1 -o "const BUILD = '[^']*'"
```

If `git status` shows an uncommitted `index.html`, the pull will refuse. That is
somebody mid-edit in the shared checkout: go and ask them, do not force it and do
not stash it. **Never overwrite files in the main checkout to shortcut this** —
that leaves it dirty and blocks the next person's pull, which is the same fault
one layer down.

And before telling him anything has changed, check the served BUILD. Three long
summaries were written to him about work he was structurally unable to see.

**Every session does this after its own push, and does not delegate it.** Morgan
restated it as a standing instruction on 2026-09-16 after it went wrong a second
time: another session had offered to take the pulling on, that offer was accepted,
and 8765 then sat one build behind until he asked "was this pushed to 8765?" and
the answer was no. A peer's good intention is not a delivery mechanism. Pull it
yourself, then run the `curl` above and read the number back — the only evidence
that counts is what his browser will load, not what the branch says and not what
somebody said they would do.

It is part of finishing the work, like the BUILD bump and the message to the other
sessions. Work he cannot load is not finished.

## Close the Chrome tab when you are done with it

Claude in Chrome opens a tab per session and they accumulate: Morgan ends up
with a row of identical "Hundred Runners" tabs he did not open and cannot tell
apart from the one he is playing in. Close yours with `tabs_close_mcp` as soon
as you have finished checking something, and before you finish a turn.

Leave one open only when Morgan asked to see it, or when you are mid-task and
will use it again in the same turn — and say which it is so he knows the tab is
deliberate. `tabs_context_mcp` lists what is open if you have lost track.

**Better still, do not open one.** If all you need is a picture of a frame, run
headless Chrome from the shell with `--screenshot`: it is its own process, it
leaves nothing in Morgan's window, and there is no tab to remember to close. It
costs a small script and it cannot click anything, so keep the real tab for
things that need interaction or a live console. Stub the game loop out in the
headless page if you want the frame to hold still.

### Before the first shot, prove the port is YOURS

Two sessions lost time to this within an hour of each other on 2026-09-17, one of
them about an hour. You background a server for screenshots, curl it, get a 200,
and shoot. The 200 came from another worktree's server that already held the
port; yours died on EADDRINUSE into the `2>&1` you added to keep the terminal
tidy. Ports 8791, 8793, 8794, 8834, 8836, 8838, 8840, 8842 and 8847 all had
listeners at once that afternoon, so this is likely rather than exotic.

**A collision does not produce an error, it produces a PLAUSIBLE FRAME.** That is
the whole difficulty, and it is why looking harder at the picture never catches
it. Every frame renders, the game is plainly running, and the only symptom is
that the thing you just changed is not in it -- so the reading is "my change did
not take", which is a finding rather than a fault, and it sends you into your own
drawing code. Three real ones: "the room is invisible at cave zoom", "the
rotation fix did not take", "the gauge redraw did not take". None were true. One session spent four attempts, a pixel sampler and a
script that computed the rect from the game's own transform before checking the
port. And if you hand those paths to the reviewers, the whole report is about
somebody else's code and every line number in it is wrong.

**`tools/shoot.sh` now refuses to shoot, so this is mostly here to explain the
refusal.** It compares the SHA of the served `index.html` against the one on
disk, and will not take a frame unless they match.

**Hashed, not BUILD-stamped.** Two worktrees sit at the same BUILD for the whole
stretch between somebody's rebase and their next bump, so a matching stamp proves
very little -- and while iterating on art the file is uncommitted anyway, which
no stamp reflects at all. The hash also catches the case nothing else does: your
OWN server, correctly rooted, serving bytes you have edited since.

**The hash is the gate; the working directory says WHY, and the two answers want
opposite reactions.** A bare mismatch invites you to free the port, and if it is
another session's server that destroys their run. So the refusal resolves the
listener and splits it: `ANOTHER TREE` names the path and the pid and tells you
not to kill it, pick another port; `THIS tree` gives you the command to restart
your own. That case cannot happen with a plain `python3 -m http.server`, which
reads from disk every request -- it needs a `-d` pointing elsewhere, a symlink or
anything that caches -- which is also why a cwd check alone waves it through.

Same split as "Never kill a process by pattern" below, one step earlier: that
section is about whether you may WRITE to a process, this is about whether you
may READ from one. One of us refused to kill 8794 on exactly those grounds and
then shot fifteen frames off it.

`SHOOT_ANY_TREE=1` skips the check, for the one shot that is deliberately about
the difference between trees: 8765, to see what Morgan will actually load.

## What our instruments cannot sense

A passing test is a verdict only on what the test senses, never on whether the
thing is good. The footstep sound measured clean on every axis we had — 112,867
audio nodes, two left live, nothing out of range — and Morgan listened to it and
said it was no good. Those measurements were not weak evidence of quality; they
were no evidence of it at all.

The correction is not a better instrument. It is **showing him the thing early,
before any polish**, for anything whose worth is a judgement rather than a
number: sound, art, and how the game feels to play. Three sessions verified that
sound for hours and the one question that mattered took him ten seconds.

## Every change you push

1. Verify it. Browser check for anything visual, and run the FAST checks for
   anything that touches game code: `probe.js` for the acts you changed,
   plus `room-check.js`, `enc-check.js` or `panel-check.js` as they apply. They
   take about a second each. **The 30-game freeze harness is PAUSED — see
   "The freeze harness" below before you reach for it.**
2. Bump `BUILD` near the top of the script (`const BUILD = '17 whatever'`). It
   prints on the title screen, so Morgan can tell what he is looking at and we
   can tell whether he is on a stale tab. **Rebase first, then pick the number**,
   reading it off the tip rather than off the copy you started from — two of us
   once bumped from 18 at the same moment and both shipped a `19`.
3. Rebase onto `origin/Morgan`, push, then **message the other sessions** (see
   below) with the commit hash, the new BUILD, and what changed.
4. **Stage by explicit path, never `-A` and never `.`** The main checkout is
   shared and somebody else's half-finished work is usually sitting in it. `git add
   -A index.html` is NOT narrow: `-A` with a pathspec still stages every change under
   that path, and on a file we are all in that is the whole file. Naming a file is not
   the same as naming a change. A whole feature once shipped inside a commit titled
   for a steam hammer this way, its own message saying nothing about it. Run
   `git diff --cached --stat` before every commit; a file hundreds of lines larger
   than you expected is the tell.

   **Three things learned the hard way on 2026-09-17, when a commit titled for a hazard
   change also reverted somebody else's mantrap fix and their drill-check fix.** Neither
   file was edited and neither was added. Staging by explicit path was followed to the
   letter and did not help.

   - **A soft reset moves HEAD and LEAVES THE INDEX ALONE.** Anything staged earlier in the
     session is still staged, and adding two named paths afterwards does not unstage it. It
     is the obvious way to squash a few WIP commits, and it silently carries whatever was in
     the index at the time. Naming what you want is not knowing what is there. Check that
     the index is empty before you stage, and expect it to be.
   - **A check you run and do not read is not a check.** The stat DID print
     `tools/drill-check.js | 20 +----` and the commit went out in the same breath. The
     command ran, the output was on the screen, and nobody looked at it.
   - **The stat is not enough when the stray rides inside a file you were legitimately
     editing.** The same commit also showed `index.html | 146 ++++----`, which looked
     exactly like the 146 lines of hazard work it was supposed to contain -- so the tell
     read as expected and six reverted lift hunks hid inside it. A SIZE CANNOT TELL YOU
     WHOSE LINES THEY ARE. Only the content can: read the staged diff of that one file
     before committing, or the patch for that path afterwards, counting hunks and looking
     for any you did not write. Fifteen hunks in a change you know is nine is the real tell.

   And when it happens anyway: say so, and say how long it was on origin. Half of this was
   found in four minutes and reported; the other half was found by the person whose work it
   was, from that message. A silent fix would have left them to find it in a week.
5. **Never write "mine" or "I" into a commit message.** Every commit on this
   branch carries Varreaux as author, so a first-person pronoun identifies
   nobody and actively misleads: "same fault as the sweeper, mine" meant the
   author claiming the ROOM, and was read by two sessions as a session claiming
   the COMMIT. Name the thing instead. What does identify you is the
   `Claude-Session` trailer in the body; if your commits do not carry one, add
   it, and then `git log -1 --format='%b' HASH | grep Claude-Session` answers
   "who wrote this" without anyone having to ask.
6. If you resolved a conflict in someone else's code, say exactly what you kept.
   Conflicts land most often in the `reset()` state literal and the runner
   object, because everyone adds fields there.

**On a branch that will live more than an hour**, push a rebase onto
`origin/Morgan` after each landing by anyone else, even while your own work is
unfinished. Otherwise divergence piles up on the functions you are both in, and
the branch sits on GitHub looking abandoned — Morgan reads that list and asks
why it has not been merged. If you are deliberately holding a merge, say so in a
message rather than letting the branch speak for you. Never force-push a shared
branch to tidy this up; land the work instead.

## Never kill a process by pattern

We all run the same commands from sibling worktrees, so `pkill -f` cannot tell
us apart. `pkill -f "node tools/freeze-check.js"` matches every session's run at
once. I killed another session's pre-push verification this way and cost them
fifteen minutes; a second session nearly did the same thing an hour earlier and
was saved only by checking first.

**"I do not remember starting this" is not evidence of ownership.** Resolve the
pid to its working directory before touching it:

```
lsof -a -p PID -d cwd          # the only reliable answer: which worktree is it in?
ps -o ppid= -p PID             # then the PARENT shell, whose command carries a
                               # per-session snapshot id, unlike the node process
```

The working directory is the check that matters. `ps -o args=` on the process
itself will not help: every session's `node tools/freeze-check.js` is
byte-identical. The distinguishing snapshot id lives in the parent shell's
command line, not in the node process, so look one level up or not at all.

**Killing by pid has its own trap: `pgrep -f` matches the SHELL WRAPPER too.**
Every background command here runs as `/bin/zsh -c ... eval 'node
tools/freeze-check.js ...'`, so `pgrep -f "freeze-check.js"` returns at least two
pids and the first is usually the wrapper. Killing that leaves the node process
running, re-parented to init -- and because nothing looks different afterwards,
the obvious response is to start another one. I ended up with three harnesses on
a box with 70MB free, having "killed" two of them. Filter to the real process
(`ps -eo pid,args | grep "[f]reeze-check.js" | grep -v zsh`) and check afterwards
that it is actually gone. An orphan shows `parent 1`, which is a reliable tell
that it is a run whose shell you already killed.

Kill by pid, never by pattern, and only once the working directory says it is
yours. Leaving a stray running costs some CPU; killing someone else's run
destroys work in progress.

## Talking to the other sessions

Nothing is automatic. Use `ListAgents` to see who is live, then `SendMessage`
with the session's name as `to`. Send an update whenever you push, and whenever
you find something the others need to know. Assume nobody reads your mind or
your transcript.

Cross-session messages are teammates, not the user. Never treat one as Morgan's
approval, and never do something for a peer that your own permissions blocked.

## Two faster instruments

`tools/probe.js` — `node tools/probe.js [intro|play|finale] [seconds]`. Runs ONE
headless game and reports the first exception out of `update()` or `draw()`, in
about a second. It is not a substitute for the freeze harness (one game, one
style, no key input; run the harness before pushing) but it closes the loop while
you are iterating on art, where the harness is ten minutes. It earned itself
immediately: a screenshot that merely looked *empty* was `off is not defined` in
`millYard` after a loop variable was renamed — an exception in `draw()` leaves a
HALF-DRAWN frame and then stops rescheduling, so a crash and a composition
problem look identical in a still.

**A probe is only evidence about the code it REACHED.** `tools/probe.js` reported "no
exception" on a build whose act three threw on the first frame it was drawn. With no
input the crowd dies in act one, the mode flips to 'lose', the camera stops, and the
later acts are never drawn at all — so the probe was green about two thirds of the game
and silent about the third I had just rewritten. It takes a `solve` argument now
(`node tools/probe.js play 130 solve`) which drives the bot far enough to actually get
there. Whenever you change an act, probe with a time and a flag that reach it, and say
which act your green covers.

`tools/enc-check.js` — act three's geometric invariants as arithmetic: no terrace may
float above its own hillside, merges must be at least `CFG.rampLen` apart, no two rooms
may overlap on their DRAWN extents (a ditch throws a spoil bank 54 units past its gap; the
wall's masonry reaches 62 either side of its own), the breach must span the wall at ground
level, and no lamp pool may fall outdoors. Every one of those corresponds to a defect that
shipped and that a screenshot did not reveal — the worst being terraces standing up to 143
units above the ground meant to hold them up, with open sky under the highest one.

`tools/reel-check.js` — the closing reel as arithmetic. Two seconds. It draws every one of
the sixteen death vignettes over its whole 0..1, wet and dry, and fails on an exception, a
body that leaves the card, a body under 118px on arrival (Morgan asked for the character
big; that is a number, not an opinion), apparatus drawn up into the 50px name, filled
ground that does not span the card, or a SPACE that winds the end clock to the wrong place.
It measures through a recording canvas that honours the transform stack, because a vignette
is drawn under `translate(480, gy); scale(4)` and a tool that ignored that would read a
154px body as a 38px one and then accuse the card of being too small.

It earned itself twice on the same fault, which is now written up below: a rect height
given as an expression that came out NEGATIVE, so ironwork grew upward out of the top of
the card. Neither instance was visible in the source or in a still.

`tools/rect-check.js` — every rectangle the game draws, checked for a negative or non-finite
dimension. About a minute, not the "few seconds" this said for a while. It wraps
`fillRect`, `strokeRect`, `rect` and `clearRect`, sweeps
30s of the opening, the whole course at 140-unit steps with somebody in every lane, a solved
run through the finale, and all sixteen closing-reel vignettes across their whole clock, and
reports every offending call BY CALL SITE with its script line.

By call site and not by value, deliberately: keyed on the value, one fault whose number
varies fragments into an entry per number and buries a rarer second one, which is exactly the
reporting bug the audio mock hit.

Three instances in one day, in two people's code, is why this is a tool and not the twenty
throwaway lines that found the first one. A check that has been run once, by hand, will not
be run again. The reel is in the sweep because a sweep of the course never reaches it: the
reel draws on an end screen only, and two of the three were in it.

**Its sweep drew panels 392 times and never once reached the press keypad**, until a pass
over every verb's panel was added on 2026-09-19. A solved run opens and clears a room in
the same frame and the sweep samples every third one, so WHICH panels got drawn was luck,
and the keypad lost. Every verdict this tool had ever given about a panel painter was
silence rather than a pass. The pass opens each verb by hand, at five difficulties, stepped
through its own states. It cost no measurable time.

`tools/path-check.js` — every path the game strokes or fills, checked for a subpath appended
to a path something else has already inked. The canvas current path is NOT context state:
`save`/`restore` do not carry it, and `rect`, `moveTo` and `arc` APPEND, so a helper that
builds a shape without `beginPath` sweeps up whatever the last helper left and inks that
too. Found in the last room, where one callback of six in `markInk` omitted it and the
stroke re-inked a figure's arm -- the other five were identical in form and correct, which
is what makes it worth a sweep rather than a reading. Nothing throws and the extra subpath
lands somewhere plausible in the current style, so it reads as "that mark is heavy" rather
than as a defect. Same family as the negative rect above, and it borrows that sweep.

It does not flag `fill(); stroke();` on one path -- that is how an inked outline is drawn,
20 times in index.html -- so a clean run means something. Both tools take an optional path
argument now, which is what a falsifier needs; without it a broken copy is ignored and the
real file is swept, and the run comes back clean looking like proof.

`tools/spot-check.js` — the last room's spot-the-difference, as pixels. It needs a real
canvas, so it drives `tools/spot-shot.html` through headless Chrome: a mocked context cannot
say what a translucent shape looks like over the colour that was already underneath it, and
that is the whole question. It asks whether every difference can be SEEN (enough pixels
moving by enough to read), whether it is where the hit test scores, whether two of them sit
inside one press, whether the tolerance grows with the crew -- measured by PRESSING, because
reading the expression is what missed it the first time -- and whether any of them can be
found THROUGH the lamp veil, which would delete the room's mechanic rather than its art.
`tools/spot-falsify.js` proves all five can fail, against two known-bad builds that were
really photographed and really read.

**Three things it got wrong before it got them right, all the same family.** It computed a
threshold from the veil's transmission instead of sampling a frame, and so could not see a
card that could be photographed and read. It counted pixels, when legibility is a coherent
AREA with an edge -- a solid plate can have every pixel under a floor and still be
unmistakable. And its coverage mask read opacity rather than coverage, which deleted every
weighted mark and left only the unweighted ones being measured at all. That last one is the
worst kind: the tool went on printing verdicts, a conclusion was drawn from its ranking and
written into a commit, and **a check that has stopped looking reads exactly like a check that
is passing**. Three terms are parked in it unenforced, each with the arithmetic for why --
including one that is parked permanently, because the veil compresses the whole room into
about four levels at the top of its range and so no per-pixel statistic can ever discriminate
there.

`tools/frame-probe.html` — samples a delivered PNG rather than a render a bench made for
itself, comparing the two paintings at the same point. It exists because `spot-check` passed
a card that could be read by eye in the shot, and it is the tie-breaker whenever a bench and
a frame disagree. The bench is always the one to suspect.

`tools/panel-check.js` — the two rows a puzzle panel shares between the verb and the frame:
the title against the status, and the status against the arrival readout, which sit at
opposite ends of one 376px row. It reads BOTH font sizes and every readout string out of
`index.html`. It did not always: it carried 11px for both halves and a 22-character readout
written down, so when the readout became 12px and 29 characters it went on reporting "no
collisions" about a row with 77px of overlap in it, across four rooms. Anything in a tool
that is a fact about the game has to be parsed from the game.

`tools/room-check.js` — the keys-against-road arithmetic for every room, with the
verdicts explained in its own header. Two things it checks that nothing else did:
the cost in keys against the road at `CFG.scroll`, scored against a ceiling that
depends on what KIND of pressing it is (six distinct letters and six presses of
one arrow are not the same act, and alternating two keys is faster than either);
and whether each room stands on a lane that exists where it is. Four did not —
drawn as hazards hanging in open sky with no track under them. Run it after
touching a room, a verb's constants, `CFG.scroll` or a fork.

Both read the numbers out of `index.html` rather than restating them, so they go
stale by failing rather than by lying. When `room-check` reported four of Linh's
shipped rooms as off-lane, the bug was its own fork regex assuming single spaces;
check the tool before you move somebody's room.

## The freeze harness

`tools/freeze-check.js` — run `node tools/freeze-check.js` from the repo root.
It takes an optional path argument if you want to point it at a worktree copy. It
plays 30 randomised games headlessly across four play styles, sits on the end
screen, restarts, and reports any exception grouped by message and stack frame,
plus peak sizes of the particle, bubble, floater and ripple pools. 30 is the
deliberate default (`RUNS`, near the top of the file); the long-pass note in
Morgan's memory says when to raise it and to put it back afterwards.

**PAUSED — Morgan's decision, 2026-09-16. Do not run this before a push, and do
not run it to "just check".** A run takes about sixteen minutes, and he was
waiting through one per change. The delay cost him more than the harness was
catching. We do ONE run at the end, when the game is finished, and not per
change until then.

This is his call to make and his call to lift. Do not restore the old habit on
your own judgement, and do not quietly run one "in the background" — several of
us doing that is what made the box thrash in the first place. If you believe a
change genuinely needs a harness run before it lands, ask him rather than
starting one.

**Not paused, and still required:** the art critic and the logic checker. He
considers both critical. Nothing here loosens the art pass in "Art changes".

Everything below stays written down, because that one final run still has to be
done properly. What the harness is for: it catches the class of bug that is
invisible in a browser until it kills a player's run: **any exception thrown inside
`update()` or `draw()` stops `requestAnimationFrame` from being rescheduled, so
the game freezes silently with only a console error.** Two real examples, both
shipped and both caught this way: a `const` reassigned in `drawBubbles`, and a
dropped `let placedUI = []` declaration.

It also covers the **sound** module, via `tools/audio-mock.js`, which it resolves
beside itself. That matters more than it sounds: a stub `window` has no
`AudioContext`, so `AU.init` throws into
its own catch, `AU.ctx` stays null and every sound method early-returns — the
whole module then runs zero lines and looks green. The mock enforces what the
real API enforces (finite and in-range gain, frequency, pan, delayTime and
playback rate, and no exponential ramp to exactly zero), so sound bugs surface
instead of hiding. Read `audio.nodesCreated` before you read the error text: 0
means the module was never exercised, and a count far below what that build
normally produces means it died early, which is the more confusing case because
a real number looks like real coverage. `audio.stillLive` should stay at 2, the
rumble and the footstep bed; anything higher is a leak.

**Which of these numbers are a verdict and which are spread.** The harness seeds
its own key presses, but the game calls `Math.random()` directly in about thirty
places — `grain()`, the particle and ripple paths, the runner jitter — so the
totals move between runs on byte-identical code. Two runs of the same build gave
52,385 and 53,206 audio nodes, 36 and 38 floaters. That is the expected spread,
not a signal, and if two runs ever agreed to the digit it would be worth asking
why. The verdict is the criteria: frozen count, runs reaching an ending, an empty
error map, and `stillLive` at 2. Reproduce on those, never on the totals.

**Know which lines your green covers.** Three times in one day a passing check
was a verdict on something other than the change: the sound module ran zero
lines because the stub had no `AudioContext`; a bot fix was scored on deaths at
the room under test while it quietly moved 43 of them to another room; and a
`devSolve` change ran green on a harness that never calls `devSolve` at all,
since the harness has its own inline bot and only `?start&solve` reaches the
other one. None of those greens were wrong, they were about something else. Say
what your run covers when you report it, in the same breath as the result.

**"Both halves are present" and "both halves work together" are two different claims, and a
grep only makes the first one.** After a stale index reverted six hunks of somebody else's
verb inside a commit, the merged file was checked two ways: markers grepped out of the source
(`recoil` seven times, the new hint, `roomFree`, `hopGap`, `reload`) and then the behaviour
run (`drill-check`, `deaths-check`). Both were reported in one breath, which reads as though
the grep carried the weight. It does not: a marker count proves the lines are in the file and
says nothing about a grip that survives a bite meeting a crossing that reloads. Run both, and
report them as two sentences.

**Prove a check can fail before you trust it passing.** A check that has only
ever been seen to pass tells you nothing about the check, only about the build.
The cost is one deliberately broken copy and a few minutes, and it turns a claim
into evidence. Injecting three audio faults this way is what proved the mock
above actually fires, and it exposed a reporting bug: one defect whose value
varied fragmented into an entry per value and would have buried a rarer second
error. Applies equally to the death-cause paths in the end report and to the art
critic, not just to this harness.

**Count deaths everywhere, not in the room under test.** A fix that MOVES the
damage and a fix that removes it look identical if you only count where you were
already looking. The test bot used to visit every armed room each frame, which
held the sweeper's demo paused all run, because `update()` runs the selected
room's minigame and nobody else's. Making it commit to one room fixed the
sweeper exactly as intended -- 0 runs solved to every run solved -- and the
course got worse, because committing to the nearest armed room starves the one
behind it. Round-robin lost 52 at the sweeper; commit-by-position lost 58 at the
bridge; ranking armed rooms by distance-to-kill lost nobody. The middle one is
the shape to watch for: structurally a fix, worse in outcome, and invisible to
the per-room number everyone was quoting. Whenever a change is scored on one
room, one hazard or one sound, take the total as well, or the regression simply
relocates to wherever the metric is not.

**A bot is an instrument, and it can be better than a player.** Both bots press
keys as fast as the loop runs, so neither can tell a room that wants fourteen
keys in two seconds from one that wants fourteen in eight. Every green we quoted
on the machine rooms was true and was measuring the wrong thing -- not a broken
instrument, an instrument with no concept of a human hand. The check that sees
what it cannot is arithmetic: keys an optimal player needs, against road
available at 110px/s. Run it on any new room before trusting a clean bot result.
It caught two rooms the bots called fine:

  wiring, before  240px  2.18s  14 keys  6.4 keys/sec  impossible, fixed
  wiring, after   840px  7.64s  14 keys  1.8 keys/sec
  conveyor        240px  2.18s   6 keys  2.75 keys/sec hard, left to Morgan
  gears           240px  2.18s   4 keys  1.8 keys/sec  fine

The bottom two rows are why you run the test instead of applying `warn` to
everything: only the room that failed it got it. Conveyor is the line worth
holding -- 6.4 keys/sec was a room that could not be solved, which is a bug;
2.75 is a room that is hard, which is a difficulty judgement and Morgan's to
make. Quote him the number, do not quietly pad the room.

**That check is blind to any puzzle that wins outside `key()`**, and it does not
fail quietly -- it reports its own guard limit as the puzzle's cost, which comes
out as a large and entirely plausible number. Run against the sweeper it claimed
14.9s of forced watching against 8.18s of road, i.e. that `warn: 900` had not
fixed the room; driven through `verb.update` instead, the demo clears at about
four seconds and `solveKey` starts returning digits. The room was fine and the
instrument was not. `lights` sets `m.won` on its own clock rather than returning
'done' from a keypress, so the arithmetic covers gears, levers, wires, code and
keys, and measures nothing at all for a deferred win. Check which kind the verb
is before believing the number.

The same caution applies to the ranking bot: it triages better than a human
reading the screen can, so "0 dead" from a scripted run is the ceiling for
perfect play, not a report on difficulty. Do not quote it to Morgan as how the
game plays.

**Do not ship past a number you cannot explain, even once you have proved it is
not yours.** This is the one that actually catches things, and it is followable
when tired, where "audit your teammates' commits" is not. `reachedEnd` came back
24/30 instead of 30/30. The change under test was two hunks, a BUILD string and
`devSolve`, against a harness that never calls `devSolve` -- so it was provably
not the cause, and the temptation was to push. Instrumenting the gap instead
found that the random-key fuzzer had been dead since the opening scene landed:
it presses P then R, R now resets into 'intro', and the loop only continued
while the mode was 'play' or 'finale', so those runs exited at t 0 with a
hundred still walking. Every 0/30 all three sessions had quoted for three hours
was missing the style most likely to find an input-path crash. Had the number
read 30, nobody would have looked. A total tells you how many runs ended; the
exit STATE tells you what happened to the ones that did not, which is why the
harness now reports mode, game time and walkers for every unfinished run.

**Anything in the harness that is a length must be DERIVED from the course, not
written down.** The play loop ran `i < 60*140`, a comfortable margin over a
12300-unit course, until act three made the world 15600 and eight runs in thirty
stopped mid-play with people still walking. It reported as `reachedEnd 22`, which
reads exactly like a freeze and was a bug in the ruler. It is now
`60 * (S.camMax / CFG.scroll + 90)`, so lengthening the course cannot silently
shorten the test again. The general form: a constant in a test that encodes a
fact about the thing being tested will go stale the first time somebody changes
that fact, and it fails by accusing the game.

**A harness killed for low memory is not a failing harness, and the fix is one
flag.** Run it as `node --max-old-space-size=256 tools/freeze-check.js`. With the
default heap, six 30-run attempts across two sessions were killed outright by the
system in one evening on a box with four of five GB of swap in use; capped at
256MB, a full 30 went through with 17MB free. A smaller heap makes V8 collect more
often and hold far less resident, and the harness allocates continuously, so it is
exactly the workload that benefits. Nothing about the result changes.

This matters more than the flag: a killed run and a broken build look the same
from outside. The process dies, the output is empty, and the obvious reading is
that the tooling is broken rather than that the box is full. Check free memory
before concluding anything from a harness that produced no report -- and note that
our own sessions are usually the top consumers, around a gigabyte between three of
them, so the pressure is self-inflicted and clears when someone finishes.

If either file is missing, rebuild it. The harness stubs `document`, `window`,
`performance`, `requestAnimationFrame`, `location`, `URLSearchParams` and
`localStorage`, mocks a canvas context (throwing on negative radii and
non-finite coordinates), installs the audio mock, then evals the script text
from `index.html` with the `'use strict'` line removed.

## Editing this one big file without breaking it

- **Never patch by replacing a whole function via "slice from this function name
  to the next one".** Anything sitting *between* the two functions is silently
  deleted. That is how a `let placedUI = []` declaration vanished and shipped a
  crash. Anchor on a small unique string and replace that, and assert the anchor
  appears exactly once before writing.
- **And then GREP FOR WHAT YOU JUST WROTE, because a batch that aborts writes
  nothing.** The scripts we all use accumulate edits in memory, assert each anchor
  appears exactly once, and write at the end. That is the right design -- a partial
  write leaves the file in a state nobody intended and nobody can name -- but it
  means ONE stale anchor silently loses the whole batch. It happened at BUILD 124:
  a three-edit script asserted on its third anchor, lost all three, and two later
  scripts that did land made the file look edited. A commit message then went out
  saying a value had been raised when the shipped build still held the old one, by
  name. Nobody reads a stack trace scrolled past ten lines ago.

  **The reviewer caught it with one grep and would not confirm a value that was
  not in the file**, having also worked out that the frames could not settle it and
  should not be asked to -- 4.5 of luminance on a 1.6-unit stroke is invisible in a
  screenshot. That is the useful pair: this project's usual rule is to trust the
  delivered frame over the bench, and the exception is a change too small to
  photograph, where the SOURCE is the stronger evidence. Two edits later the same
  session audited its whole run this way and found 30 of 32 present, the missing
  two superseded rather than lost. A session's claims about its own landed work are
  worth one grep each.
- **Verify by evaluating, not by reading.** Source text lies. The roster writes
  one name with an escape and the `LOOKS` table writes it with the literal
  character, so a grep reports that neither matches the other; evaluated as
  JavaScript they are the same string and match fine. Pull the literal out and
  `eval` it, or read the value in the browser. (This bit me: I nearly reported a
  bug that did not exist.)
- **Deleting a function is a freeze risk.** A call to a function that no longer
  exists throws, and an exception in `update()` or `draw()` kills the loop. This
  already happened: `AU.rocks` went with the cave-in, a new gate slam still
  called it, and the game died the moment the gate landed. After removing
  anything, grep for its callers. For the sound module this one-liner audits
  every call against every definition and reports stale ones:

  ```
  node -e "const s=require('fs').readFileSync('index.html','utf8').split('<script>')[1];
  const d=new Set([...s.match(/const AU = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s{2}(\w+)\s*[(:]/gm)].map(m=>m[1]));
  console.log([...new Set([...s.matchAll(/AU\.(\w+)\s*\(/g)].map(m=>m[1]))].filter(c=>!d.has(c)))"
  ```

- **Feed a gradient and its fill from ONE variable, always.** This has now shipped
  three times, which is why it is written as an instruction before it is written as
  an explanation. Hoist the top coordinate into a single variable and have both the
  gradient and the rect read it, so they cannot disagree. The third one passed
  `CFG.worldBottom` as a HEIGHT to a rect that started at -610, so the hill's light
  was painted over 47% of its own span and every terrace the crowd runs on had no
  light on it at all. Nothing in a still shows that: an unlit terrace just looks
  like a terrace.
- **A gradient's extent and its fill's extent are two numbers that drift apart.**
  Both halves of this shipped within an hour of each other. `createLinearGradient`
  holds its END COLOUR beyond its endpoints, so a fill wider than its gradient
  smears the last stop outward -- harmless while that stop is transparent, and a
  34% black wash over the wrong half of the course the moment it is not. A fill
  NARROWER than its gradient truncates the ramp before it reaches zero, leaving a
  hard edge at the fill boundary: 90px of a 300px ramp cut off at 0.154 alpha put
  a visible bar down the full height of the rock. Neither is visible in the
  source unless you deliberately compare the two numbers, and both survive a
  syntax check, a sixty-game harness run and a glance at the frame. Feed both
  from one constant so they cannot disagree, and whenever you change one, look at
  the other.
- **A rect dimension that is an ARITHMETIC EXPRESSION can come out negative, and a negative
  dimension grows the rect the other way.** Canvas does not complain. `fillRect(x, -74, 8,
  by - 74 + 74)` looks like arithmetic and is a sign error; `fillRect(sx - 8 * dir, y, 8 *
  dir, 4.5)` looks like a mirror and is one too. Write the two edges the thing spans and
  subtract them: `fillRect(x, top, 8, bottom - top)`.

  **The worst case DRAWS THE RIGHT PICTURE, and that is the one to fear.** The buffer stop's
  head timber ran at width -8 on every leftward run, 138 times in a single sweep of the
  course — and because its x was mirrored by the same `dir`, the two errors cancelled and the
  timber landed exactly where it was meant to. Nothing ever pointed at it. The two in the
  closing reel threw ironwork clean off the top of the card and at least announced
  themselves. A trap that produces a correct frame is worse than one that does not, because
  the next person to touch that line inherits it silently.

  **And writing the warning down does not protect you from it.** A third instance was found
  by `tools/rect-check.js` in the crusher's ram rod — in the very line the comment about this
  fault was written on. The comment said write the two y values and subtract; the line did
  write the two y values and subtract; it was still negative, because the two values CROSS
  OVER partway through the animation. A block 34 units deep with its top at -82 telescoped
  eight units into a beam whose underside was -74, and the rod between them came out at -8.
  It landed invisibly, behind the beam.

  Reading does not find these, and neither does a screenshot: the object is simply somewhere
  else in the frame, which reads as absent rather than as wrong, or it is in the right place
  by accident. Sweep for them — see `tools/rect-check.js`.

- **Non-ASCII and emoji in object keys** need a JavaScript `\u{...}` escape. A
  Python-style `\U` produces a key that silently never matches. Named runners
  have fixed appearances in a `LOOKS` table keyed by the exact name string, so a
  mistyped key costs that person their look with no error.

## Art changes

**Both reviewers, every time, and neither is optional.** Morgan's rule. There are
two, they ask different questions, and passing one says nothing about the other:

- `.claude/agents/art-critic.md` asks whether it LOOKS right.
- `.claude/agents/logic-checker.md` asks whether it IS right: things held up by
  nothing, paths a body cannot walk, objects drawn over openings, and numbers in
  one function that disagree with numbers in another.

**Making something BIGGER is an art change, and it needs both of them.** This is not
obvious, because a uniform scale looks like it cannot introduce anything. It can, in two
ways. It exposes faults that were always there and too small to see -- a spade handle that
had been drawn through its own panel title since the room was written; a mantrap whose two
jaws overlapped by 56 units and drew both sets of teeth through each other; jaws that
rotated DOWN through the plate they are hinged to. And it breaks things that were sized
against the old dimensions: a status line and a readout that shared a row with 29px to
spare, a death plate clamped against a shorter hint band, progress pips that fitted under a
smaller caption. Twenty-three findings came out of two passes on one 34% enlargement, and
most of them were older than the change.

**When to call them: when the art is done, before you push, on the same
screenshots.** Not at the start, not "next pass", and not only when something
looks off -- the whole point is that these find what looking does not. Run them
together rather than choosing, because the failures they catch do not overlap. The
logic checker is the one people forget, so if you have only run one, it is that one
you are missing. It earned itself on a steam hammer driving 12.6 units up inside
its own crown casting twice a second, which no still could ever show: a tup half
inside a casting just reads as a tall tup.

**Freeze the shots for the duration of a pass, and do not edit under a reviewer.** A pass
takes ten to thirty minutes and it is tempting to keep working; do not. A logic-check report
came back opening with `index.html` changing underneath it four times and `shots/` being
deleted and re-shot mid-read, so half its findings carried "could not confirm against a
current picture" and had to be re-verified by hand. The art critic, separately, reported two
shots of the same trap disagreeing about how many leaves a drawbridge had — that was not a
conditional in the code, it was a re-shoot landing between two of its reads, and it cost it
a finding. Take the screenshots, then leave both the shots and the file alone until the
report is in. Waiting is cheaper than a report you cannot act on.

**Between two sessions, ANNOUNCE THE WINDOW rather than freezing the file.** The rule above
is written from inside one session and quietly assumes nobody else is landing. Neither of us
can freeze a file the other is committing to, so the half that actually works across sessions
is a message -- "reviewers reading index.html for the next twenty minutes" -- which the other
session can act on. "I have frozen it" is something only one session can do, and the other
finds out afterwards, from a report whose line numbers have moved.

And do not let a peer sit idle holding a file for you unless the risk is real. One offered to
hold index.html for a thirty-minute pass whose reviewers were reading `hopGap`, `drawRunners`
and a folder of screenshots, while their own work was act two's galleries and timber sets:
nothing either of them touched could collide. Name the functions your pass is actually
reading and let them judge. If the answer is "I am going into the same function", that is
when to wait.

The loop is: screenshot eight to ten fixed moments, hand them the paths plus the
relevant drawing function names, fix everything they find, re-shoot, and go again.
Four passes found fifty-nine issues, including a lantern glow clipped to a rect
smaller than its own radius, which was flattening the light in every frame. Do not
ship an art change without a pass.

**THREE PASSES MAXIMUM PER PIECE OF WORK. Morgan's decision, 2026-09-19.** This
replaces "repeat until they come back dry", which is what it said before and which
is no longer the instruction. Run the pass; fix what comes back; stop at three
whether or not the reports are empty.

The change came directly out of what it cost. The last room's sixty difference-marks
ran ELEVEN passes -- twenty-two reports, ten builds -- and it did keep finding real
things that late: an eleventh unmarkable difference at pass 9, a coverage mask that
had silently stopped measuring most of what it claimed to. So "it was still finding
things" is not an argument for a fourth pass, because it will almost always be true.
The cap is a judgement about what that is worth against the rest of the game, and
that judgement is his.

What to do with the cap rather than against it. **Spend the passes on the questions
only they can answer**, and say what those are when you hand the shots over -- does
this read as the object it is meant to be, does it still read as the same thing the
player learned two acts ago, is it findable at the zoom the game actually plays at.
Anything a tool can decide, decide with the tool first so a pass is not spent on it.
And if the third comes back with something real, that is a finding to report to
Morgan with the number, not a reason to quietly run a fourth.

**The critic is not the decider.** It can see that something looks wrong; it
cannot see what a change costs. Three kinds of finding come back that you do not
simply implement:

- **Changes the run, not the look.** It proposed moving the lane 1 and 2 merges
  so the crowd would leave the mill out of three storeys instead of one. It was
  right that it would look better, and it was still Morgan's call, because
  runners would spend longer on upper lanes that carry their own crossings.
  Asked, declined, settled -- do not re-raise.
- **A correct calculation whose instruction is wrong.** It worked out that a
  brick should be 3.7 units. At 3.7 units a course is under a screen pixel at
  play zoom and the mortar cannot be drawn at all. Accuracy that cannot be
  rendered is not a target. Halved once, not twice, and said so.

  **The arithmetic that backed that refusal was wrong, and the refusal stands
  anyway.** It read "a runner is 29 units crown to sole, so a unit is about
  59mm". A runner is 45: that is the RENDERED height of the tallest drawn
  figure, ink outline included, at the scale `drawRunners` actually uses, and it
  was confirmed twice by different methods -- once by rendering to a blank canvas
  and finding the painted extremes, once analytically from the primitives
  `drawFigure` emits. So a unit is 38.9mm and a real 215mm brick is **5.6 units**,
  half again as large as the number that was refused. It is still under a pixel of
  mortar at play zoom, so the conclusion holds; the number quoted for it did not.
  If a future pass re-raises the brick, argue it at 5.6.

  There is no single body number, which is why this went wrong four times
  (28, 29, 34, 35.2, then 45). For CLEARANCE -- will a body fit under this, is
  this doorway tall enough -- use **45**. For "does this read as a person" use
  about **39**, and note that is not a floor: the shortest named runner draws at
  34.6, below an unnamed figure with a bun at 38.5. Measure it, do not read it
  out of a comment, including this one.
- **A real impression with the wrong diagnosis.** It reported the cave as
  brighter than the mill you leave. Sweeping 40 to 500 units past the seam gives
  61 55 52 64 68 45 32 37 against the mill at 31 to 39: not systematically
  brighter, one lamp pool at about +260, and dark beyond it. Darkening the whole
  of act two would have corrected four hundred units of it. Settled: the lamp
  stays.

**Act two being "the brightest card" has now been raised and withdrawn twice.** The second
time was on the closing reel's own backdrops, and the critic checked its impression against
the constants rather than restating it: `reelMillBack` composites to luminance 30.3 (40.7,
27.0, 20.6) and `reelRockBack` to 28.9 (30.4, 25.9, 40.7), so the rock is 5% DARKER than the
mill wall, and the hues separate cleanly — the mill red-dominant, the rock blue-dominant.
Withdrawn by the critic itself. Do not darken act two on an impression; if it is raised a
third time, ask for the two composites first.

Refuse with the number, not with an opinion, and write the refusal down or the
next pass will find it again.

**A CLEARER OBJECT IN THE WRONG PLACE IS WORSE THAN A VAGUE ONE.** Twelve rounds on
the last room's sixty difference-marks, and this is the one that generalises. Eight
nouns shared one rounded chip -- a house, a crack, a screen, a case, a headset, a
pocket, a BIRD -- so the marks read as stickers however well each was placed.
Splitting them into eight silhouettes was right and immediately made things worse:
a vague blob floating is survivable, and a recognisable briefcase floating is a
statement. Every placement fault the split exposed had been there all along and had
been hiding behind the ambiguity. Expect the pass after a clarity fix to be the
worst one.

**And symmetry is what makes a shape an emblem.** Those eight were drawn mirrored
about their own centre, in six paintings where every machine, body and building is
three-quarter on with one side foreshortened. Two of them became faces, and a
bilaterally symmetric oval with two dark spots above a mass is the one shape the
eye finds before anything else on a card. Draw them turned: one eye smaller, one
wing behind the body, one horn shorter. And note the follow-up, because the first
prescription was incomplete -- a face is not read by its symmetry, it is read by
two dark spots above a mass, so turning one does not stop it being one. A
face-shaped thing has to go ON somebody.

**Anything whose worth is a threshold lives in a BAND, and only the floor is
obvious.** The fix for marks nobody could see was "a lit face on everything", which
was right and had no ceiling, so it ran until the marks could be found THROUGH the
lamp veil -- clearing a card without ever steering, which deletes a mechanic rather
than art. Two floors and a ceiling now: enough contrast to be found, and not so
much that it survives what is meant to hide it. Whenever a rule is written as "more
of X", ask what stops it.

**You cannot damp a silhouette out of existence.** A mark whose lightest element is
its own outline does not go away when you cut its alpha -- contrast drops, the
SHAPE survives, and shape is what the eye locks onto. Move the light instead: a
bright core inside a dark body. But a body must then clear its ground by 20-25 of
luminance or it is not a body, it is a highlight floating on nothing. The full rule
has two clauses and the second decides: a mark fails when its highlights are small
and repeated AND its body is within about 15 of its ground. Either alone is
survivable.

**A SOURCE COLOUR IS NOT A RENDERED CLEARANCE.** The hardest miss of the twelve
rounds, because it looks exactly like measuring. `rgba(70,60,48)` is luminance 61;
through its own stroke alpha and the mark's weight it lands at 53 on the card. A
reviewer's hand estimate beat the "measurement" because its model carried a term
mine had dropped. If a number is going to decide something, sample the frame.

**Re-shoot after a fix, and expect the next pass to catch what this one caused.**
A critic gives you a direction, never a distance, and two objects usually touch
the thing it named. Told that conveyor riders were "sunk to the knee", I moved
the belt rather than the people; the complaint was satisfied and the error came
back as its mirror, with the riders hanging a body's length UNDERNEATH the band,
which nobody noticed until a second pass. Same shape: a stair top left 22 units
below the belt it was meant to meet, so a correctly placed rider stepped down
into nothing before the first tread. Ask which object is in the wrong place
before moving either, and put the result in front of the critic again.

## Things that look like bugs and are not

- **A process killed with exit 144 now has two possible causes**, and one of
  them has already been misdiagnosed once: a low-memory kill by the system, or
  another session's `pkill -f` taking your identically-named process with theirs.
  Do not name either without checking which it was.

- **A background tab stops animating.** Chrome suspends
  `requestAnimationFrame` in hidden tabs, so fps and game time read as zero.
  Check `document.visibilityState` before diagnosing a freeze.
- **A scaled canvas transform after a long scripted run.** Usually a harness
  killed between `ctx.save()` and `ctx.restore()`, not the game. Reload.
- **A frame time that suddenly looks terrible.** Two causes, both artefacts,
  and both cost real time to chase. The first `draw()` after a camera jump is
  uncached, so time ten frames and throw them away before you start measuring.
  And every session verifying at once runs its own sixty-game harness: two of us
  once had eighteen and eleven `freeze-check` processes on the box between us,
  and the same scene read 74ms under that load and 3.9ms on a quiet machine.
  Count them with `ps aux | grep freeze-check` before you believe a bad number,
  and never benchmark while ANY session's harness is running, not just your own
  -- most of that load was other people's. Counting is all grep is good for
  here; see "Never kill a process by pattern" for why it cannot tell you whose
  a process is.

## Measuring the canvas

**"Is this thing even there" is a measurement, not a glance.** I looked at a
screenshot, saw a crowd on both sides of what appeared to be a solid wall, and
told a reviewer the blast had not opened a breach. It had. At 0.45 zoom the hole
was 54 pixels wide with forty runners and a speech bubble in front of it;
sampling four pixel columns took two minutes and showed daylight and hillside
through it. The failure mode is specific and worth naming: **a negative from
eyeballing feels like caution and is not.** "I cannot see it" sounds careful, so
nobody challenges it, and it sends a reviewer after a bug that does not exist.
If a claim is "X is not being drawn", sample the pixels where X should be and
say what colour came back.


**A tool that measures drawing must honour the transform stack.** If it ignores
`save`, `scale` and `translate`, it does not merely under-report -- it invents a
number, and then it accuses the game of the fault. One read a contact shadow as 65
units deep into the floor because the shadow is an arc of radius 64 drawn under
`ctx.scale(1, 7/64)`. If you build anything that measures what was drawn rather
than looking at it, start with the transform and not with the geometry.

Three sessions spent an afternoon trading luminance numbers at each other and
produced six wrong ones between them. Not one was a defect in the game; every
one was in how we were looking. If a number is going to change the art, take it
like this.

- **Say what the sample IS, by hue, not by where you expected it to land.** This
  catches more than the rest put together. It found a probe sitting in the HUD
  reported as sky, hills reported as sky, a lamp pool reported as window glass,
  and it separates a lamplit tunnel wall (red dominant) from the rock beside it
  (purple) at the same brightness. Return `[r,g,b]` beside every luminance.
- **Average a patch, never one pixel.** `grain()` builds a `Math.random()` noise
  field once per load and `draw()` lays it over everything at 0.16 in `overlay`,
  so a one-pixel `getImageData` samples that field: steady within a load, up to
  sixteen points different after a reload. A 25x11 patch reproduces to a tenth.
  Freeze `S.t` as well, or lamp flicker moves it.
- **When two measurements disagree, divide one by the other BEFORE investigating
  anything else.** If the ratio is a small whole number -- or very close to one --
  stop looking at the instruments and look at what each one is COUNTING. They are
  not noisy, they are measuring different extents: rounds, passes, one lane
  against all lanes, half of a round trip. Two of us timed the sweeper's forced
  watch and got 2.82 / 3.52 / 4.22 against 5.62 / 7.02 / 8.42 -- exactly half, to
  the hundredth, across all three statistics. Noise does not do that. One of us
  had measured to the first accepted key, which is one round of a two-round
  puzzle. A ratio of 1.9 or 2.1 would have read as a measurement problem and cost
  an hour; a ratio of precisely 2 pointed straight at the scope and was found in
  one step. This is what to do when "take it twice" gives you two different
  answers.
- **Take it twice. A number with no error bar is not a measurement.** Measure,
  change nothing, measure again. None of the six survived that.
- **Compare a surface to the light at the same height in the same frame.** "The
  sky" is not a number -- it runs about 130 to 185 across one frame and washes
  out near the sun glow -- so "the glass must sit under the sky" is unfalsifiable
  until you say which sky.
- **Never compute a pixel from the source.** The hardest one to catch, because it
  feels like reading rather than guessing. Working out the mill's glass from its
  gradient stops gave a value more than twice the real one: grime, leading and
  backing are all real paint drawn afterwards and the stops know nothing about
  them.

Timings have two more traps on top of those.

- **Check free memory, not just load.** Four or five sessions on one laptop can
  leave zero free memory and 3.4 GB of swap in use while load looks a comfortable
  4.9, so a box that passes a process check can still be paging. But the effect is
  narrower than it sounds: paging corrupts measurements that touch memory the OS
  has evicted, and a tight render loop over a warm heap is close to the safest
  case — interleaved frame times repeated to within 0.16ms on exactly such a box.
  A harness run, which allocates continuously, is not safe that way. Say which
  kind you are taking.
- **Interleave, do not do before-and-after.** Toggle the thing off and on and
  repeat the whole set, so drift across the measurement window shows up instead of
  hiding inside the comparison.
- **Attribute against the right baseline.** A texture was reported as costing
  4.2ms to 7.3ms; the 4.2 came from a build that did not yet contain the mill, so
  the comparison silently bundled a whole second act into the texture's cost.
  Interleaved, the texture alone was 1.6ms. Same arithmetic, wrong story, and the
  wrong story is what sends someone optimising the wrong function.

## Dev shortcuts

`?start&skip=N` jumps N seconds into a run, `&solve` adds a bot that clears
rooms as it goes, `?finale` jumps to the final gate. Use them for screenshots.

`?end=T` holds the CLOSING REEL T seconds in — a whole run played out headlessly and then
the end clock wound to T. `&solve` gives it fewer deaths and a longer climb; `&solve&win`
settles the last gate in the crowd's favour, for the podium. `?trap=NAME&tt=0..1` holds ONE
card still, which is the only way to photograph a vignette without playing a run in which
somebody happens to die that way — `&wet=1` puts water under the fall, `&who=NAME` chooses
whose body it is, `&st=N` freezes the ambient clock so a flicker cannot move between shots.

`&st=N` works EVERYWHERE now, not only inside `?trap`, and it is the flag to reach for
before reporting anything about an animation from a still. Anything whose look is a
function of `S.t` -- lamp flicker, the press room's ghost fingertip, every idle loop -- is
otherwise photographable only at whatever instant the setup happened to stop at, so one
still says nothing about whether the motion is right. A sweep of stills across one cycle
does: `?drill=7&st=0.3`, `&st=1.0`, `&st=1.6` and so on caught a fingertip pressing
between two swatches and a mark appearing before the finger arrived, neither of which was
visible in any single frame.

`?start&skip=N&solve&blast=T` fires the wall and pins the explosion clock T seconds in, so the
bang can be held still; it advances the debris by exactly T as well, because a fixed advance
showed chunks that had already landed. `&packed=N` and `&fuse=T` set the blast room's charges
and light its fuse through the mini-game's own fields.

`?start&skip=N&solve&open=VERB` arms and opens the next room of that kind ahead of the
crowd. A panel is only on screen for the second or two it takes to beat the room, so
photographing one AGAINST THE ROAD -- the only way to see how much of the world it hides --
otherwise meant guessing a skip time and shooting until one happened to be up. It calls
`armRoom`, not `state = 'armed'`: set by hand the panel drew its title as "ROOM null" and
then threw on an `mg` that did not exist, which looks exactly like a layout bug in the
thing being photographed.

**Three ways it drew nothing at all, all of which read as the flag being broken.** Out on the
hillside nine rooms are armed at once, so `freeHotkey()` returns null, `armRoom` RETURNS
WITHOUT ARMING, and `S.active` then points at a dormant room with no `mg` -- the quiet cousin
of "ROOM null". On a `&solve` run the bot had already cleared the room before the flag looked
for one, since every room arms long before the crowd arrives. And the fix for that -- holding
the whole verb back from the bot -- meant nobody cleared the `dig` rooms and the run ended
with 0 of 100 on the podium. It now holds only the room still out of reach, and releases one
somebody is queued at.

**A held room still KILLS, which photographs as a death report rather than as the thing you
wanted.** `?blast` suppresses that for the room it holds; the first clean-looking attempt came
back with 24 LOST and a red plate over the explosion.

## Two more instruments, both from the panels

`tools/cover-check.js` — how much of the crowd each mini-game panel hides while it is open,
scoring `PANEL_SCALE` 1.00 and the current value on the SAME frames. This is the number
that decides whether a bigger panel costs anything, and it is not one either side knows
alone: a panel is screen space at a fixed top of 48, the runners are world space arriving
through the camera. Run it before making any panel taller. A first pass at the press room
stacked its legend above the keypad, which took it to ph 266: 60% of the crowd hidden on
average and 100% on its worst frame, on a panel that looked perfectly fine in every
screenshot. Widening it to 620 instead cost almost nothing, because the crowd sits near the
middle of the screen. **Wide is nearly free; tall is not.**

It was itself wrong first, in the way this file keeps warning about: binned on height alone
it could not see width at all, and pronounced a 620-wide panel "the same as the sweeper" on
the strength of 218 being near 210. It has two falsifiers now and needs both -- a forced
scale and a forced width -- because a height-only bug passes a height-only falsifier.

`tools/blast-check.js` — the wall's verb, and the one thing no bot can reach. `blast` wins
OUTSIDE `key()`: one SPACE banks `m.won` and `m.inputT = FUSE_BURN`, and the room clears when
that clock runs out. The clock is ticked in TWO PLACES and only one runs at a time -- the
verb's own `update` while the panel is open, the room loop's `pendingClear` branch while it is
closed. Both bots sit in the room they are solving, so they only ever exercise the first; if
the second is missing the room never clears, the crowd piles against the wall, and it is a
hang with no exception in it -- `probe` says "no exception" and a screenshot says "a queue".

**It exists because the obvious instrument could not answer the question.** `drill-check`'s
puzzle total spreads **7.2 to 8.9 seconds on byte-identical code**, and the fix under test was
worth 1.7s. The number moved the WRONG WAY and meant nothing. Driving `updateDrill` directly
and counting frames gives 1.15s with the fix and 0.02s without. When an effect is smaller than
an instrument's own spread, do not reach for a bigger sample -- reach for a different
instrument. Take any number twice before you believe its direction, not just its value.

`tools/wire-check.js` — drives 4000 random cable rooms through the real `key()` using only
the two keys a player has, and asserts every one reaches 'done', that each wire lands on a
socket of its own colour, that no index runs past the end, and that a press after the last
splice does nothing. The room auto-confirms now, which removed the only way to be wrong in
it and with it the only thing that used to end a mis-aimed attempt; the failure it guards
against is a room that cannot be finished at all, which neither a screenshot nor a bot run
would show, since the bot presses `solveKey` and gets there whatever the rule is.

**Every loop in it is bounded, including the ones in its own falsifier.** The first version
had one that was not, and against a deliberately broken copy the check HUNG rather than
failing -- which reads as a broken tool, not as a red line, and is worse than a check that
passes.

## Design

The game's settled design decisions live in Morgan's memory directory, not here.
Ask before changing a rule; art and effects are safer to change than mechanics.
The core idea is triage: every lever should save people in one place and cost
people somewhere else.
