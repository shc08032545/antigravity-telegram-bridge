#!/usr/bin/env bash
set -euo pipefail

PORT="${CHROME_CDP_PORT:-9222}"
PROFILE_DIR="${CHROME_PROFILE_DIR:-$HOME/.antigravity-chrome-profile}"
START_URL="${1:-}"

if [[ "$OSTYPE" == "darwin"* ]]; then
  CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif command -v google-chrome >/dev/null 2>&1; then
  CHROME_BIN="$(command -v google-chrome)"
elif command -v chromium >/dev/null 2>&1; then
  CHROME_BIN="$(command -v chromium)"
elif command -v chromium-browser >/dev/null 2>&1; then
  CHROME_BIN="$(command -v chromium-browser)"
else
  echo "Error: Google Chrome / Chromium executable not found." >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR"
echo "Launching Chrome with CDP on http://127.0.0.1:${PORT}"
echo "Profile directory: ${PROFILE_DIR}"

if [[ -n "$START_URL" ]]; then
  exec "$CHROME_BIN" \
    --remote-debugging-port="$PORT" \
    --remote-debugging-address=127.0.0.1 \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    "$START_URL"
else
  exec "$CHROME_BIN" \
    --remote-debugging-port="$PORT" \
    --remote-debugging-address=127.0.0.1 \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check
fi
