# Integrations — SDKs, connectors, MCP

## Fly.io Sprites (the host)

- Provisioning: CLI (`sprite create / exec / console`), REST API (`api.sprites.dev/v1`), or SDKs in JS, Go, Python, Elixir. Chaperone's coordinator uses the SDK directly (JS or Python) rather than shelling out to the CLI, so Sprite lifecycle is just function calls: `sprites.create()`, `sprites.checkpoint()`, `sprites.restore()`, `sprites.destroy()`.
- Every Sprite comes with Claude Code, Codex, Gemini CLI, Antigravity, Cursor, Pi, and Grok preinstalled. Worth noting in the pitch: Claude Code ships configured with `--dangerously-skip-permissions` on Sprites by default — i.e. the exact unguarded failure mode Mode B defends against is the platform's own out-of-the-box state. That's not a criticism of Fly, it's the live demo.
- Checkpointing is the mechanism, not a feature we bolted on: whole-disk, copy-on-write, sub-second, restores files rather than resuming processes.

## Sprites Connectors (credential isolation layer)

A connector means the provider's API key lives in Fly's dashboard/gateway and is never written to the Sprite's disk — the untrusted code running inside a Worker Sprite cannot read it even if it tries. Chaperone uses three connectors as load-bearing infrastructure, not decoration:

### GitHub connector
- Used for: checking out the PR branch, posting the status check, posting the PR comment.
- Why it matters for the pitch: the untrusted PR code runs *inside* the same Sprite whose job is to check out that PR — without this connector, the GitHub token would have to live somewhere the untrusted code could reach it. The connector is what makes "run untrusted code to check if it's trustworthy" not self-defeating.
- Scopes needed: `contents:read` (checkout), `checks:write` (status), `pull_requests:write` (comment). Use a GitHub App, not a personal access token — apps scope cleanly per-repo and rotate independently of any one person's account.

### TypeSafeAI connector
- Used for: turning the runtime-behavior fingerprint into a typed verdict: `{risk_score: 0–1, category: exfiltration|destructive|privilege_escalation|benign, confidence: 0–1}`.
- Why it matters for the pitch: this is a typed, machine-consumable decision, not a free-text LLM opinion you have to parse and hope is consistent. TypeSafeAI's own positioning — "reviewing the results of AI agents" — is close to a direct description of this exact call.

### Pinecone connector
- Used for: storing a vector embedding of each behavior fingerprint + its verdict, and querying for a match before paying for a fresh TypeSafeAI call.
- Design note from research: Pinecone's free tier aggressively archives ephemeral/per-session indexes. Use **one durable, namespaced index** (namespace per org/repo), not a new index per check.
- Why it matters for the pitch: this is "agent memory as compiled knowledge" — a repeat-offender package gets caught in milliseconds on the second attempt, not re-litigated from scratch every time.

### Ollama Cloud connector (secondary, closes a judging gap)
- Used for: an optional second-opinion classifier so the verdict pipeline isn't hard-locked to one proprietary model. Framed honestly: Ollama Cloud is still a third-party API call, not on-device inference — the real win here is model choice, not a privacy claim.

### Box / Slack connectors (not used in Mode A, available for Mode B extensions)
- If Mode B (agent guardrail) is extended past the hackathon: Slack/Pushover for human-in-the-loop alerts on borderline verdicts.

## MCP: exposing Chaperone as a tool, not just a bot

Beyond the GitHub App surface, plan (post-hackathon, stub if time allows during the hackathon) an MCP server that exposes:

- `chaperone.check(pr_url)` — run a check on demand, return the typed verdict synchronously or as a polling job.
- `chaperone.status(check_id)` — poll a running check.
- `chaperone.history(repo)` — list past verdicts for a repo.

This matters for two reasons: (1) it means any agent stack — Claude Desktop, Cursor, a custom internal agent — can call Chaperone mid-task ("ask Chaperone before you trust this dependency") instead of only reacting to a GitHub webhook, and (2) it's a second, independent distribution surface for the business case in `BUSINESS.md` — sell the verification engine as infrastructure other tools call, not only as a standalone GitHub App.

## Why not just static scanning (Snyk / Socket.dev)?

Both vendors say directly that static analysis struggles to see runtime behavior, and that dynamic/sandboxed analysis is an emerging, not-yet-complete part of their own product. Chaperone isn't trying to replace them — a real deployment would run *after* static scanning passes, as the dynamic layer neither currently ships as a mature, standalone default.
