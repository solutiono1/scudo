# Architecture

## 1. System overview

Everything runs on Fly.io Sprites. A long-lived **Coordinator Sprite** owns orchestration and state; short-lived **Worker Sprites** do the actual risky execution and get thrown away after.

```mermaid
flowchart TB
    subgraph GH["GitHub"]
        PR["Pull Request / Dependabot update"]
        Status["Status check + PR comment"]
    end

    subgraph Coord["Coordinator Sprite (long-lived, sleeps when idle)"]
        Webhook["Webhook receiver"]
        Orchestrator["Orchestrator"]
        Reporter["Reporter"]
        Dash["Dashboard (served over HTTPS)"]
    end

    subgraph Worker["Worker Sprite (created per-check, disposable)"]
        Checkout["Git checkout of PR branch"]
        Checkpoint["Pre-install checkpoint"]
        Monitor["Runtime monitor (net / fs / process watch)"]
        Install["npm/pip/cargo install + build"]
    end

    subgraph Connectors["Sprites Connectors (credential gateway — keys never touch disk)"]
        GitHubC["GitHub connector"]
        TypeSafeC["TypeSafeAI connector (ready; needs paid credits)"]
        PineconeC["Pinecone connector"]
    end

    OllamaLocal["Local Ollama (tev1) — self-hosted on the Coordinator itself, no connector, no cost — the verdict engine actually running"]

    PR -->|webhook| Webhook
    Webhook --> Orchestrator
    Orchestrator -->|create via Sprites API| Worker
    Orchestrator -->|checkout via| GitHubC
    GitHubC --> Checkout
    Checkout --> Checkpoint --> Install
    Install --> Monitor
    Monitor -->|behavior fingerprint| Orchestrator
    Orchestrator -->|lookup fingerprint| PineconeC
    PineconeC -->|cache hit: known verdict| Orchestrator
    PineconeC -->|cache miss| Orchestrator
    Orchestrator -->|verdict call, provider chosen by config| OllamaLocal
    Orchestrator -.->|same request shape, if credits available| TypeSafeC
    OllamaLocal -->|typed verdict: noul / score / choice| Orchestrator
    Orchestrator -->|write back fingerprint + verdict| PineconeC
    Orchestrator --> Reporter
    Reporter -->|post via| GitHubC
    GitHubC --> Status
    Reporter --> Dash
```

## 2. Sequence: one PR check, start to finish

```mermaid
sequenceDiagram
    participant GH as GitHub
    participant Co as Coordinator
    participant W as Worker Sprite
    participant PC as Pinecone
    participant TS as Verdict engine (Ollama, local)

    GH->>Co: webhook: PR opened (dependabot/renovate/external)
    Co->>W: create Sprite, checkout PR branch (GitHub connector)
    W->>W: checkpoint disk (baseline)
    W->>W: run install/build under monitor
    W->>Co: behavior fingerprint (hosts contacted, files touched, procs spawned)
    Co->>PC: query: have we seen this fingerprint before?
    alt known-bad fingerprint
        PC-->>Co: cached verdict: BLOCK
    else unknown fingerprint
        Co->>TS: typed query: risk score, category, confidence
        TS-->>Co: verdict (e.g. 0.92 exfiltration, high confidence)
        Co->>PC: store fingerprint + verdict
    end
    alt verdict = risky
        Co->>W: destroy Sprite (nothing to roll back to — disposable by design)
        Co->>GH: status check FAIL + comment: what was seen, why blocked
    else verdict = clean
        Co->>GH: status check PASS + comment: "0 unexpected hosts, 0 unexpected writes"
    end
    Co->>W: destroy Sprite
```

## 3. Backend components

| Component | Lives in | Responsibility | Talks to |
|---|---|---|---|
| Webhook receiver | Coordinator Sprite | Verifies GitHub webhook signature, enqueues check | GitHub connector |
| Orchestrator | Coordinator Sprite | Creates/destroys worker Sprites, drives the check lifecycle | Sprites API, all connectors |
| Runtime monitor | Worker Sprite | Snapshots `ss -tupn` (network), filesystem checksums, `ps` tree before/after install; produces a normalized fingerprint | — (local only) |
| Verdict engine | Coordinator Sprite | Pinecone lookup (currently blocked, see `.internal/HANDOFF.md`), then a typed verdict call — self-hosted Ollama (`tev1`) by default, or TypeSafeAI if that connector is configured | Local Ollama; TypeSafeAI connector (ready, not yet active); Pinecone connector (blocked) |
| Reporter | Coordinator Sprite | Posts GitHub status + comment, updates dashboard | GitHub connector |
| Dashboard | Coordinator Sprite, served over its own HTTPS endpoint | Recent checks, verdicts, drill-down into what was observed | Reporter (internal) |
| MCP server (stretch) | Coordinator Sprite | Exposes `chaperone.check(pr_url)` as a callable tool for other agents | Orchestrator (internal) |

## 4. Mode B variant (guardrail for your own coding agent)

```mermaid
flowchart LR
    Agent["Claude Code / Codex / Cursor (running in your personal Sprite)"]
    Hook["PreToolUse hook"]
    Engine["Same verdict engine (local Ollama / TypeSafeAI)"]
    Checkpoint["Sprite checkpoint"]
    Human["Slack / Pushover alert (borderline cases only)"]

    Agent -->|about to run a tool call| Hook
    Hook --> Engine
    Engine -->|low risk| Agent
    Engine -->|flagged risky| Checkpoint
    Checkpoint -->|rollback in about 1 second| Agent
    Engine -->|borderline| Human
```

Here the checkpoint/restore feature carries the whole pitch: it is the undo button for a command the agent already ran.

## 5. UI / UX — dashboard navigation

A minimal dashboard is a stretch goal (Day 5), not the core deliverable — the primary interface is the GitHub PR itself. If built:

```mermaid
flowchart TD
    Login["Sign in with GitHub"] --> RepoList["Connected repos"]
    RepoList --> RepoDetail["Repo check history (list of PRs checked, verdict, timestamp)"]
    RepoDetail --> CheckDetail["Check detail: hosts contacted, files touched, processes spawned, verdict + confidence"]
    RepoList --> Settings["Settings: risk threshold, which repos are watched, connector status"]
    CheckDetail -->|"this was a false positive"| Feedback["Mark reviewed (writes correction back to Pinecone)"]
```

The one piece of UX worth getting right for the demo: the **PR comment itself** is the real interface most users will ever see. It should read like a human wrote it — plain pass/fail, plain reasons, no AI-generated hedging.

## 6. Why this isn't just Minder or Cloud Custodian

Both are **policy-declaration** tools — you write rules ahead of time (branch protection, signing requirements, resource tags) and they check configuration against those rules. Chaperone does not require you to predict the rule in advance: it **runs the code and watches what it actually does**, which is the dynamic-analysis gap Socket.dev and Snyk both say they're still building toward. Complementary, not competing — worth saying plainly if a judge asks.

## 7. Day 1 implementation notes (how this maps to what's actually built)

- The Coordinator is a real Sprite (`chaperone-coordinator`), running a dependency-free Node.js HTTP server (`coordinator/index.js`) as a managed `sprite-env` service on port 8080, with its URL set to public access (needed for GitHub to reach `/webhook` — the handler's own HMAC signature check is what keeps this safe, same as any public webhook endpoint).
- Worker Sprite create/destroy/exec is done by shelling out to the Sprite's own built-in `sprite` CLI (`/.sprite/bin/sprite`), authenticated with its own isolated login — **not** by holding a raw Sprites API bearer token in application code. This was a deliberate Day 1 design change from the original plan (see `.internal/HANDOFF.md`, 2026-11-25 entry) specifically to avoid handling that credential at all.
- The GitHub **connector** (for the actual checkout step, via the gateway path `/v1/gateway/github/<connection_id>/repos/{owner}/{repo}/tarball/{ref}`) is separate from the webhook, and is the one piece that needs a human to click through Fly's dashboard OAuth flow — see `.internal/HANDOFF.md` for current status.
