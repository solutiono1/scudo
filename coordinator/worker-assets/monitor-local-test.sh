#!/usr/bin/env bash
# Local test harness: same logic as worker-check.sh but against an already-present
# local directory, skipping the GitHub checkout step.
set -uo pipefail
SRC_DIR="$1"
LOG_DIR="$2"
mkdir -p "$LOG_DIR"

if ! command -v strace >/dev/null 2>&1; then
  sudo apt-get update -qq >/dev/null 2>&1
  sudo apt-get install -y -qq strace >/dev/null 2>&1
fi

find /home/sprite -xdev -type f -printf '%T@ %p\n' 2>/dev/null > "$LOG_DIR/fs_before.txt" || true

cd "$SRC_DIR" || exit 1
strace -f -q -e trace=connect,execve,openat,open \
  -o "$LOG_DIR/strace.log" \
  -- npm install > "$LOG_DIR/cmd_stdout.txt" 2> "$LOG_DIR/cmd_stderr.txt"
CMD_EXIT=$?

find /home/sprite -xdev -type f -printf '%T@ %p\n' 2>/dev/null > "$LOG_DIR/fs_after.txt" || true
echo "$CMD_EXIT" > "$LOG_DIR/exit_code.txt"

node /home/sprite/parse-fingerprint.js "$LOG_DIR" "$SRC_DIR"
