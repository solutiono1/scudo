#!/usr/bin/env bash
# Claude Code PreToolUse hook. Reads the proposed tool call from stdin (Claude
# Code's documented hook JSON format), and for Bash commands, asks the local
# Ollama decision model whether it looks destructive/dangerous. If so,
# checkpoints the Sprite's current state RIGHT NOW, before the command runs,
# and leaves a marker for post_tool_use.sh to restore afterward. Always exits
# 0 (allow) — the point of this mode is proving the undo, not blocking, per
# ARCHITECTURE.md's Mode B design.
set -uo pipefail

LOG=/tmp/scudo_guardian.log
MARKER=/tmp/scudo_guardian_pending

INPUT=$(cat)

TOOL_NAME=$(printf '%s' "$INPUT" | node -e '
let d="";process.stdin.on("data",c=>d+=c);
process.stdin.on("end",()=>{try{console.log(JSON.parse(d).tool_name||"")}catch(e){console.log("")}})
')

if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

COMMAND=$(printf '%s' "$INPUT" | node -e '
let d="";process.stdin.on("data",c=>d+=c);
process.stdin.on("end",()=>{try{console.log(JSON.parse(d).tool_input.command||"")}catch(e){console.log("")}})
')

if [ -z "$COMMAND" ]; then
  exit 0
fi

echo "[$(date -u +%FT%TZ)] checking: $COMMAND" >> "$LOG"

REQUEST_BODY=$(node -e '
const cmd = process.argv[1];
console.log(JSON.stringify({
  model: "tev1",
  state: cmd,
  questions: {
    is_destructive: {
      type: "noul",
      instructions: "Does running this shell command risk irreversible data loss (e.g. rm -rf), theft of credentials or secrets (e.g. reading .env, .ssh, cloud credential files), or unauthorized privilege escalation, on a real development machine?"
    }
  }
}))
' "$COMMAND")

VERDICT=$(curl -s --max-time 90 http://127.0.0.1:11434/v1/systemone -H 'Content-Type: application/json' -d "$REQUEST_BODY")

SCORE=$(printf '%s' "$VERDICT" | node -e '
let d="";process.stdin.on("data",c=>d+=c);
process.stdin.on("end",()=>{
  try{console.log(JSON.parse(d).answers.is_destructive.noul)}catch(e){console.log("0")}
})')

echo "[$(date -u +%FT%TZ)] score: $SCORE" >> "$LOG"

IS_RISKY=$(node -e "console.log(($SCORE >= 0.5) ? \"1\" : \"0\")" 2>/dev/null || echo "0")

if [ "$IS_RISKY" = "1" ]; then
  CKPT_OUT=$(sprite-env checkpoints create --comment "auto: before risky command (score $SCORE)" 2>&1)
  CKPT_ID=$(printf '%s' "$CKPT_OUT" | grep -oE 'ID:\s*v[0-9]+' | grep -oE 'v[0-9]+' | head -1)
  if [ -z "$CKPT_ID" ]; then
    CKPT_ID=$(printf '%s' "$CKPT_OUT" | grep -oE 'v[0-9]+' | head -1)
  fi
  echo "$CKPT_ID" > "$MARKER"
  echo "{\"command\":$(node -e "console.log(JSON.stringify(process.argv[1]))" "$COMMAND"),\"score\":$SCORE,\"checkpoint\":\"$CKPT_ID\"}" >> "$LOG"
  echo "🛡️  Scudo: this command scored $SCORE for destructive risk — checkpointed to $CKPT_ID before allowing it to run." >&2
fi

exit 0
