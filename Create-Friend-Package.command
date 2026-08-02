#!/bin/zsh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "APS Watch Together — Friend Package Builder"
echo ""
read "SERVER_URL?Paste your secure room server URL (example: wss://aps-watch.onrender.com/ws): "
if [[ ! "$SERVER_URL" =~ ^wss://.+/ws$ ]]; then
  echo ""
  echo "The address must begin with wss:// and end with /ws"
  echo "No package was created."
  read "?Press Return to close..."
  exit 1
fi

node tools/build-release.mjs --server "$SERVER_URL"
echo "Open the dist folder and send APS-Watch-Together-Extension.zip to your friends."
open "$SCRIPT_DIR/dist"
read "?Press Return to close..."
