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
PORT="${SHOOT_PORT:-8791}"
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
SERVED="$(curl -s --max-time 5 "http://127.0.0.1:$PORT/index.html" | shasum -a 256 | cut -d' ' -f1)"
MINE="$(shasum -a 256 "$ROOT/index.html" | cut -d' ' -f1)"
if [[ -z "$SERVED" || "$SERVED" == "$(printf '' | shasum -a 256 | cut -d' ' -f1)" ]]; then
  echo "shoot.sh: nothing is serving index.html on port $PORT." >&2
  echo "  start one:  (cd $ROOT && python3 -m http.server $PORT --bind 127.0.0.1 &)" >&2
  exit 1
fi
if [[ "$SERVED" != "$MINE" ]]; then
  echo "shoot.sh: port $PORT is NOT serving this checkout. Refusing to shoot." >&2
  echo "  this checkout: $(grep -m1 -o "const BUILD = '[^']*'" "$ROOT/index.html")  ${MINE:0:12}" >&2
  echo "  port $PORT:     $(curl -s --max-time 5 "http://127.0.0.1:$PORT/index.html" | grep -m1 -o "const BUILD = '[^']*'")  ${SERVED:0:12}" >&2
  echo "  whose is it:   lsof -nP -iTCP:$PORT -sTCP:LISTEN -t | xargs -I% lsof -a -p % -d cwd" >&2
  echo "  do NOT kill it; pick a free port instead:  SHOOT_PORT=<n> $0 ..." >&2
  exit 1
fi
mkdir -p "$ROOT/$OUT"
"$CHROME" --headless=new --disable-gpu --no-sandbox --screenshot="$ROOT/$OUT/$NAME.png" \
  --window-size=1280,720 --virtual-time-budget=1500 --hide-scrollbars \
  "http://127.0.0.1:$PORT/index.html?$Q" >/dev/null 2>&1
echo "$OUT/$NAME.png"
