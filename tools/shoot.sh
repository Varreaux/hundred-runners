#!/bin/zsh
# Headless frame grabber. Usage: tools/shoot.sh <outdir> <name> <query>
# e.g. tools/shoot.sh shots intro-5.3 "intro=5.3&shot"
# Serves the repo on a private port, so it never touches Morgan's 8765 or his browser.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$1"; NAME="$2"; Q="$3"
PORT="${SHOOT_PORT:-8791}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$ROOT/$OUT"
"$CHROME" --headless=new --disable-gpu --no-sandbox --screenshot="$ROOT/$OUT/$NAME.png" \
  --window-size=1280,720 --virtual-time-budget=1500 --hide-scrollbars \
  "http://127.0.0.1:$PORT/index.html?$Q" >/dev/null 2>&1
echo "$OUT/$NAME.png"
