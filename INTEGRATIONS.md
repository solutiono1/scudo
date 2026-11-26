# Integrations — SDKs, connectors, MCP

## Fly.io Sprites (the host)

- Provisioning: CLI (`sprite create / exec / console`), REST API (`api.sprites.dev/v1`), or SDKs in JS, Go, Python, Elixir. Chaperone's coordinator uses the SDK directly (JS or Python) rather than shelling out to the CLI, so Sprite lifecycle is just function calls: `sprites.create()`, `sprites.checkpoint()`, `sprites.restore()`, `sprites.destroy()`.
- Every Sprite comes with Claude Code, Codex, Gemini CLI, Antigravity, Cursor, Pi, and Grok preinstalled. Worth noting in the pitch: Claude Code ships configured with `--dangerously-skip-permissions` on Sprites by default — i.e. the exact unguarded failure mode Mode B defends against is the platform's own out-of-the-box state. That's not a criticism of Fly, it's the live demo.
- Checkpointing is the mechanism, not a feature we bolted on: whole-disk, copy-on-write, restores files rather than resuming processes. Measured directly (2026-11-25): checkpoint create ~5s, restore ~4–15s end-to-end via the CLI. Restoring also auto-creates a "pre-restore" safety checkpoint first, so an undo is itself undoable.

## Sprites Connectors (credential isolation layer)

A connector means the provider's API key lives in Fly's dashboard/gateway and is never written to the Sprite's disk — the untrusted code running inside a Worker Sprite cannot read it even if it tries. Chaperone uses three connectors as load-bearing infrastructure, not decoration:

### GitHub connector
- Used for: checking out the PR branch, posting the status check, posting the PR comment.
- Why it matters for the pitch: the untrusted PR code runs *inside* the same Sprite whose job is to check out that PR — without this connector, the GitHub token would have to live somewhere the untrusted code could reach it. The connector is what makes "run untrusted code to check if it's trustworthy" not self-defeating.
- Scopes needed: `contents:read` (checkout), `checks:write` (status), `pull_requests:write` (comment). Use a GitHub App, not a personal access token — apps scope cleanly per-repo and rotate independently of any one person's account.

### TypeSafeAI connector — and the Ollama fallback that's actually running right now
- Used for: turning the runtime-behavior fingerprint into a typed verdict via three questions — `is_malicious` (noul: probability 0–1), `severity` (score against a 3-level rubric), `category` (choice among exfiltration/destructive/privilege_escalation/benign).
- Why it matters for the pitch: this is a typed, machine-consumable decision, not free-text you have to parse and hope is consistent.
- **Current reality, stated plainly:** TypeSafeAI has no free tier — `console.typesafe.ai` requires a paid credit top-up before an API key can even be created, and no hackathon promo program exists publicly. Rather than block on that, we discovered Ollama's local decision models (`nimble`/`tev1`/`clef`) implement the **identical `/v1/systemone` request and response shape** — same `noul`/`score`/`choice` primitives, confirmed directly against both APIs, not assumed from documentation alone. We self-host `tev1` (4.6GB, CPU-only) inside the Coordinator Sprite — zero API key, zero cost — and it is the verdict engine actually running in this submission. The code supports both providers with zero behavioral difference; if a TypeSafeAI credit grant comes through, it's a one-line config change, not a rewrite. This is also a stronger demonstration of model-agnosticism than originally planned (see the Michael Chiang/Ollama note in `.internal/SUBMISSION_STRATEGY.md`).

### Pinecone connector
- Used for: storing a vector embedding of each behavior fingerprint + its verdict, and querying for a match before paying for a fresh TypeSafeAI call.
- Design note from research: Pinecone's free tier aggressively archives ephemeral/per-session indexes. Use **one durable, namespaced index** (namespace per org/repo), not a new index per check.
- Why it matters for the pitch: this is "agent memory as compiled knowledge" — a repeat-offender package gets caught in milliseconds on the second attempt, not re-litigated from scratch every time.

### Ollama — self-hosted locally, not via the "Ollama Cloud" connector
- Note the distinction: this isn't the Sprites "Ollama Cloud" connector (a third-party API call) — it's Ollama installed directly inside the Coordinator Sprite, running entirely on that Sprite's own CPU. No connector, no API key, no external call at all for the verdict step as currently deployed. This is a stronger privacy/cost story than the originally-planned Ollama Cloud connector would have been: genuinely zero third-party data exposure for the fingerprint data sent to the verdict engine, not just "a cheaper cloud call."

### Box / Slack connectors (not used in Mode A, available for Mode B extensions)
- If Mode B (agent guardrail) is extended past the hackathon: Slack/Pushover for human-in-the-loop alerts on borderline verdicts.

## MCP: exposing Chaperone as a tool, not just a bot

Beyond the GitHub App surface, plan (post-hackathon, stub if time allows during the hackathon) an MCP server that exposes:

- `chaperone.check(pr_url)` — run a check on demand, return the typed verdict synchronously or as a polling job.
- `chaperone.status(check_id)` — poll a running check.
- `chaperone.history(repo)` — list past verdicts for a repo.

This matters for two reasons: (1) it means any agent stack — Claude Desktop, Cursor, a custom internal agent — can call Chaperone mid-task ("ask Chaperone before you trust this dependency") instead of only reacting to a GitHub webhook, and (2) it's a second, independent distribution surface — the verification engine as infrastructure other tools call, not only as a standalone GitHub App.

## Why not just static scanning (Snyk / Socket.dev)?

Both vendors say directly that static analysis struggles to see runtime behavior, and that dynamic/sandboxed analysis is an emerging, not-yet-complete part of their own product. Chaperone isn't trying to replace them — a real deployment would run *after* static scanning passes, as the dynamic layer neither currently ships as a mature, standalone default.
