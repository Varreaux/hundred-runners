#!/bin/zsh
# Headless frame grabber. Usage: tools/shoot.sh <outdir> <name> <query>
# e.g. tools/shoot.sh shots intro-5.3 "intro=5.3&shot"
# Serves the repo on a private port, so it never touches Morgan's 8765 or his browser.
#
# It SEARCHES for a Chromium rather than naming one. The hardcoded
# /Applications/Google Chrome.app was not on the box after the move and every shot
# failed with exit 127, which reads as a broken script rather than a missing browser.
# Playwright's cached Chrome for Testing is the one that is actually here. The (N)
# qualifier is load-bearing: without it zsh aborts the script on a glob that matches
# nothing, which is every box that has only one of these.
set -e
setopt NULL_GLOB
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$1"; NAME="$2"; Q="$3"
# The page to shoot. A NEW CAPABILITY, not a repair: the URL here has named index.html since
# this script was written, so the bench pages in tools/ -- boss-line.html, lift-shot.html --
# were simply outside its reach and were shot by hand. Defaults to the game, so every
# existing call is unchanged. The check below still hashes index.html whatever this is set
# to: it asks which CHECKOUT is being served, not which file is being shot.
PAGE="${SHOOT_PAGE:-index.html}"
PORT="${SHOOT_PORT:-8791}"
# OUT is relative to the repo root, and an absolute one silently builds a copy of it INSIDE
# the tree: "$ROOT/$OUT" with OUT=/Users/... makes Users/morgan/... under the worktree, puts
# the frame there, and prints the path you asked for. You then look in the right place, find
# nothing, and have a directory tree to discover days later.
if [[ "$OUT" = /* ]]; then
  echo "shoot.sh: outdir must be relative to $ROOT, not an absolute path ($OUT)." >&2
  exit 1
fi
if [[ -z "$CHROME" || ! -x "$CHROME" ]]; then
  CHROME=""
  for c in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    ${HOME}/Library/Caches/ms-playwright/chromium-*/chrome-mac*/*.app/Contents/MacOS/*(N)
  do
    [[ -x "$c" && -f "$c" ]] && CHROME="$c"
  done
fi
if [[ -z "$CHROME" ]]; then
  echo "shoot.sh: no Chromium found. Set CHROME=/path/to/binary." >&2; exit 1
fi
# SHOOT_ANY_TREE=1 skips the whole check, for the one legitimate case: deliberately
# shooting 8765 to see what Morgan will actually load. That shot is ABOUT the difference
# between trees, so the guard would block the one frame whose point is delivery.
if [[ -z "$SHOOT_ANY_TREE" ]]; then
# IS THIS PORT SERVING *THIS* CHECKOUT? A 200 proves a server, not YOUR server.
#
# A session started its own python on a port another worktree already held, saw the
# EADDRINUSE go into /dev/null, curled the port, got a 200, and photographed somebody else's
# build for an hour. It then spent a long stretch hunting for a room it had just moved --
# pixel samplers, a script deriving the on-screen rect from the game's own transform -- and
# concluded the room might be invisible at cave zoom. It was not: the build being served
# still had that room in act one. Two reviewers read those frames, and every finding that
# came from the images was void.
#
# Compared by HASH rather than by BUILD, deliberately. Two worktrees sit at the same BUILD
# for most of the time between someone's rebase and their next bump, so a matching stamp
# proves very little -- and while iterating on art the file is usually uncommitted anyway,
# which no stamp reflects at all.
# BOUNDED CLAIM: this is what CURL saw, and the frame is what CHROME fetched a moment later
# over its own connection. Nothing closes that gap in the check itself -- what closes it is
# the shot command having no --user-data-dir, so every launch gets a fresh temp profile and
# there is no cross-run cache for a stale copy to live in. That is a property of the command
# line below, not of this comparison. If anyone ever adds a persistent profile to make shots
# faster, this guard quietly starts proving something weaker than it appears to.
SERVED="$(curl -s --max-time 5 "http://127.0.0.1:$PORT/index.html" | shasum -a 256 | cut -d' ' -f1)"
MINE="$(shasum -a 256 "$ROOT/index.html" | cut -d' ' -f1)"
if [[ -z "$SERVED" || "$SERVED" == "$(printf '' | shasum -a 256 | cut -d' ' -f1)" ]]; then
  echo "shoot.sh: nothing is serving index.html on port $PORT." >&2
  echo "  start one:  (cd $ROOT && python3 -m http.server $PORT --bind 127.0.0.1 &)" >&2
  exit 1
fi
if [[ "$SERVED" != "$MINE" ]]; then
  # AND THE MISMATCH SAYS WHICH KIND IT IS, by resolving the listener to its working
  # directory rather than printing a command for somebody to run. The two cases want
  # opposite reactions and a hash alone cannot separate them:
  #
  #   another tree   somebody else's server. Do NOT free the port -- killing it destroys
  #                  their run. Move to a free port instead.
  #   this tree      your own server, serving a file you have edited since. The port is
  #                  yours to restart, and a cwd check alone would have passed this happily,
  #                  which is why the hash is the gate and this is only the explanation.
  OWNER_PID="$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null | head -1)"
  OWNER_CWD="$(lsof -a -p "$OWNER_PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  echo "shoot.sh: port $PORT is NOT serving this checkout. Refusing to shoot." >&2
  echo "  this checkout: $(grep -m1 -o "const BUILD = '[^']*'" "$ROOT/index.html")  ${MINE:0:12}" >&2
  echo "  port $PORT:     $(curl -s --max-time 5 "http://127.0.0.1:$PORT/index.html" | grep -m1 -o "const BUILD = '[^']*'")  ${SERVED:0:12}" >&2
  if [[ -n "$OWNER_CWD" && "$OWNER_CWD" != "$ROOT" ]]; then
    echo "  whose is it:   ANOTHER TREE -- $OWNER_CWD (pid $OWNER_PID)" >&2
    echo "  do NOT kill it; pick a free port instead:  SHOOT_PORT=<n> $0 ..." >&2
  elif [[ -n "$OWNER_CWD" ]]; then
    echo "  whose is it:   THIS tree (pid $OWNER_PID) -- your own server, serving a stale copy." >&2
    echo "  restart it:    kill $OWNER_PID && (cd $ROOT && python3 -m http.server $PORT --bind 127.0.0.1 &)" >&2
  else
    echo "  whose is it:   could not resolve the listener; lsof -nP -iTCP:$PORT -sTCP:LISTEN" >&2
    echo "  do NOT kill anything you have not identified; pick a free port instead." >&2
  fi
  exit 1
fi
fi
mkdir -p "$ROOT/$OUT"
"$CHROME" --headless=new --disable-gpu --no-sandbox --screenshot="$ROOT/$OUT/$NAME.png" \
  --window-size=1280,720 --virtual-time-budget=1500 --hide-scrollbars \
  "http://127.0.0.1:$PORT/$PAGE?$Q" >/dev/null 2>&1
echo "$OUT/$NAME.png"
