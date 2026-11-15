#!/bin/zsh
# Render deterministic ?shot= frames from the training build into shots-rendered/.
# Usage: zsh render_shots.sh [port]
set -e
PORT=${1:-8901}
DIR=$(dirname $0)
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# (re)start the dev server
if ! nc -z localhost $PORT 2>/dev/null; then
  (cd $DIR && nohup node serve.ts --port $PORT > /tmp/fps-serve-$PORT.log 2>&1 &)
  sleep 1.5
fi

mkdir -p $DIR/shots-rendered
for shot in start play end bots plant buy match nade radar; do
  "$CHROME" --headless=new --window-size=1280,800 --virtual-time-budget=8000 \
    --screenshot=$DIR/shots-rendered/$shot.png \
    "http://localhost:$PORT/?shot=$shot&seed=1&cb=$RANDOM" 2>/dev/null
  echo "$shot: $(stat -f %z $DIR/shots-rendered/$shot.png) bytes"
done
