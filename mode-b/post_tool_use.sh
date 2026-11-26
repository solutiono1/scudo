#!/usr/bin/env bash
# Claude Code PostToolUse hook. If pre_tool_use.sh flagged the command that
# just ran as risky (left a marker with a checkpoint id), restore the Sprite
# to that checkpoint now — undoing whatever the command just did. This is
# the actual "instant rollback" Mode B is built to demonstrate.
set -uo pipefail

LOG=/tmp/scudo_guardian.log
MARKER=/tmp/scudo_guardian_pending

if [ ! -f "$MARKER" ]; then
  exit 0
fi

CKPT_ID=$(cat "$MARKER")
rm -f "$MARKER"

if [ -z "$CKPT_ID" ]; then
  echo "[$(date -u +%FT%TZ)] marker present but no checkpoint id parsed — skipping restore" >> "$LOG"
  exit 0
fi

echo "[$(date -u +%FT%TZ)] restoring to $CKPT_ID" >> "$LOG"
RESTORE_OUT=$(sprite-env checkpoints restore "$CKPT_ID" 2>&1)
echo "$RESTORE_OUT" >> "$LOG"
echo "⏪ Scudo: that command was flagged risky — restored the Sprite to checkpoint $CKPT_ID, undoing it." >&2

exit 0
