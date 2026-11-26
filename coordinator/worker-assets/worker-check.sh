#!/usr/bin/env bash
# Runs entirely inside a disposable Worker Sprite. Downloads a PR's contents through
# the zero-credential GitHub connector, runs the install under strace (deterministic
# syscall capture — not periodic polling, which misses short-lived connections), and
# prints a single JSON "fingerprint" line to stdout for the coordinator to parse.
#
# Usage: worker-check.sh <owner> <repo> <ref> <connection_id> <install_cmd...>
set -uo pipefail

OWNER="$1"; REPO="$2"; REF="$3"; CONN_ID="$4"; shift 4
INSTALL_CMD=("$@")

SRC_DIR="/home/sprite/src"
LOG_DIR="/home/sprite/monitor-logs"
mkdir -p "$SRC_DIR" "$LOG_DIR"

if ! command -v strace >/dev/null 2>&1; then
  sudo apt-get update -qq >/dev/null 2>&1
  sudo apt-get install -y -qq strace >/dev/null 2>&1
fi

# --- checkout, via the GitHub connector gateway (no token ever present on this disk) ---
curl -sL --fail -o /home/sprite/src.tar.gz \
  "https://api.sprites.dev/v1/gateway/github/${CONN_ID}/repos/${OWNER}/${REPO}/tarball/${REF}"
if [ $? -ne 0 ]; then
  echo "{\"error\":\"checkout_failed\"}"
  exit 1
fi
tar -xzf /home/sprite/src.tar.gz -C "$SRC_DIR" --strip-components=1

# --- auto-detect package ecosystem if auto requested or no command provided ---
if [ ${#INSTALL_CMD[@]} -eq 0 ] || [ "${INSTALL_CMD[0]}" = "auto" ]; then
  if [ -f "$SRC_DIR/package.json" ]; then
    INSTALL_CMD=("npm" "install")
  elif [ -f "$SRC_DIR/requirements.txt" ]; then
    INSTALL_CMD=("pip3" "install" "--no-cache-dir" "-r" "requirements.txt")
  elif [ -f "$SRC_DIR/setup.py" ]; then
    INSTALL_CMD=("pip3" "install" "--no-cache-dir" ".")
  elif [ -f "$SRC_DIR/pyproject.toml" ]; then
    INSTALL_CMD=("pip3" "install" "--no-cache-dir" ".")
  elif [ -f "$SRC_DIR/Cargo.toml" ]; then
    INSTALL_CMD=("cargo" "check")
  else
    INSTALL_CMD=("npm" "install")
  fi
fi

# --- baseline filesystem snapshot (secondary signal, alongside strace's openat trace) ---
find /home/sprite -xdev -type f -printf '%T@ %p\n' 2>/dev/null > "$LOG_DIR/fs_before.txt" || true

cd "$SRC_DIR" || exit 1
strace -f -q -e trace=connect,execve,openat,open \
  -o "$LOG_DIR/strace.log" \
  -- "${INSTALL_CMD[@]}" > "$LOG_DIR/cmd_stdout.txt" 2> "$LOG_DIR/cmd_stderr.txt"
CMD_EXIT=$?

find /home/sprite -xdev -type f -printf '%T@ %p\n' 2>/dev/null > "$LOG_DIR/fs_after.txt" || true
echo "$CMD_EXIT" > "$LOG_DIR/exit_code.txt"

node /home/sprite/parse-fingerprint.js "$LOG_DIR" "$SRC_DIR"
