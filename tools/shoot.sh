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
mkdir -p "$ROOT/$OUT"
"$CHROME" --headless=new --disable-gpu --no-sandbox --screenshot="$ROOT/$OUT/$NAME.png" \
  --window-size=1280,720 --virtual-time-budget=1500 --hide-scrollbars \
  "http://127.0.0.1:$PORT/index.html?$Q" >/dev/null 2>&1
echo "$OUT/$NAME.png"
