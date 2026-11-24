# Chaperone

**Runtime-verified trust for code you didn't write.**

Chaperone is a personal agent that runs on a Fly.io Sprite. When a pull request, a Dependabot/Renovate update, or any third-party dependency wants to merge into your codebase, Chaperone actually *runs* it — inside an isolated, disposable Sprite — and watches what it does: what it connects to, what it touches on disk, what it spawns. It turns that behavior into a typed, auditable verdict (via the TypeSafeAI connector), remembers risky patterns it's seen before (via Pinecone), and posts a plain pass/fail report on the PR — without the untrusted code ever holding your real GitHub token.

Built for **Fly.io Hacksgiving 2026**.

## The problem, in one paragraph

Dependency bots are fast because they're trusted blindly. In March–April 2026 a compromised Axios package reached production in under an hour after Dependabot auto-merged it — attributed to a financially-motivated North Korean group. 2026 alone also saw compromises at TanStack (via CI pipeline), node-ipc, Red Hat's `@redhat-cloud-services` namespace (32 packages, ~80k weekly downloads, attacker bypassed code review entirely), and AsyncAPI (release pipeline compromise, 5 trojanized packages). npm and GitHub's own response was to disable install scripts by default — a blunt fix that also breaks legitimate packages. Meanwhile Snyk and Socket.dev, the two leading scanners, both say openly that static analysis can't fully see what code does once it actually runs, and dynamic/sandboxed analysis is still an emerging part of their own stacks.

Chaperone is the missing piece: run it, watch it, verify it, remember it — instead of trusting it or banning it outright.

## Why a Sprite, specifically

A Sprite is a hardware-isolated Linux VM with a real, durable disk and sub-second copy-on-write checkpoint/restore, created near-instantly and billed only while active. That isn't incidental hosting for Chaperone — it's the actual safety mechanism: isolation gives a real (not metaphorical) blast radius, and checkpointing gives an instant undo. The Sprites **connector** system means the GitHub token, the TypeSafeAI key, and the Pinecone key all live in Fly's gateway, never on the disk the untrusted code is running on.

## Two modes, one engine

| | **Mode A — Perimeter (primary)** | **Mode B — Guardrail (stretch)** |
|---|---|---|
| Watches | Incoming PRs / dependency updates | Your own coding agent's tool calls (Claude Code, Codex, Cursor) |
| Trigger | GitHub webhook | Agent's `PreToolUse` hook |
| Payoff | Audit badge posted to the PR | Instant rollback of a destructive command |
| Evidence | 2026 npm/PyPI supply-chain incidents | Documented Claude Code/Codex file-deletion incidents, incl. a named CVE |

Both modes share the same core: isolate → watch → typed verdict → remember → report.

## Documents in this repo

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system diagrams: backend, connectors, data flow, UI/UX navigation
- [`BUILD_PLAN.md`](./BUILD_PLAN.md) — day-by-day 5-day build plan
- [`INTEGRATIONS.md`](./INTEGRATIONS.md) — exactly how each SDK/connector/MCP surface is wired
- [`SUBMISSION.md`](./SUBMISSION.md) — mapping to Hacksgiving's rules, requirements, and judging
- [`BUSINESS.md`](./BUSINESS.md) — real-world viability, revenue model, and roadmap beyond the hackathon
