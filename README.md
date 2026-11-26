# Chaperone

**Runtime-verified trust for code you didn't write.**

Chaperone is a personal agent that runs on a Fly.io Sprite. When a pull request, a Dependabot/Renovate update, or any third-party dependency wants to merge into your codebase, Chaperone actually *runs* it — inside an isolated, disposable Sprite — and watches what it does: what it connects to, what it touches on disk, what it spawns. It turns that behavior into a typed, auditable verdict and posts a plain pass/fail report on the PR — without the untrusted code ever holding your real GitHub token.

**This is a working system, not a mockup.** It's live right now, checking real pull requests on a real repo, with a real pass/fail verdict and a real checkpoint-rollback on risky behavior. Built for **Fly.io Hacksgiving 2026** — see [`DEPLOY.md`](./DEPLOY.md) to run your own instance.

## The problem, in one paragraph

Dependency bots are fast because they're trusted blindly. In March–April 2026 a compromised Axios package reached production in under an hour after Dependabot auto-merged it — attributed to a financially-motivated North Korean group. 2026 alone also saw compromises at TanStack (via CI pipeline), node-ipc, Red Hat's `@redhat-cloud-services` namespace (32 packages, ~80k weekly downloads, attacker bypassed code review entirely), and AsyncAPI (release pipeline compromise, 5 trojanized packages). npm and GitHub's own response was to disable install scripts by default — a blunt fix that also breaks legitimate packages. Meanwhile Snyk and Socket.dev, the two leading scanners, both say openly that static analysis can't fully see what code does once it actually runs, and dynamic/sandboxed analysis is still an emerging part of their own stacks.

Chaperone is the missing piece: run it, watch it, verify it, remember it — instead of trusting it or banning it outright.

## Why a Sprite, specifically

A Sprite is a hardware-isolated Linux VM with a real, durable disk and copy-on-write checkpoint/restore (measured at 4–15 seconds end-to-end via the CLI — fast, not literally instant), created near-instantly and billed only while active. That isn't incidental hosting for Chaperone — it's the actual safety mechanism: isolation gives a real (not metaphorical) blast radius, and checkpointing gives a fast, verified undo (Sprites even auto-snapshot the pre-restore state, so an undo is itself undoable). The Sprites **connector** system means the GitHub token lives in Fly's gateway, never on the disk the untrusted code is running on — and the verdict engine needs no external key at all, since it's self-hosted on the same Sprite.

## Two modes, one engine

| | **Mode A — Perimeter (primary)** | **Mode B — Guardrail (stretch)** |
|---|---|---|
| Watches | Incoming PRs / dependency updates | Your own coding agent's tool calls (Claude Code, Codex, Cursor) |
| Trigger | GitHub webhook | Agent's `PreToolUse` hook |
| Payoff | Audit badge posted to the PR | Instant rollback of a destructive command |
| Evidence | 2026 npm/PyPI supply-chain incidents | Documented Claude Code/Codex file-deletion incidents, incl. a named CVE |

Both modes share the same core: isolate → watch → typed verdict → remember → report.

## The verdict engine, honestly

The pitch always planned to use TypeSafeAI's Jev model for the typed verdict. In practice, TypeSafeAI has no free tier — there was no way to get an API key without a paid credit top-up — so the system currently runs on a **self-hosted Ollama decision model (`tev1`)**, installed directly inside the Coordinator Sprite. It implements the identical typed-question API (`noul`/`score`/`choice`) that TypeSafeAI's Jev does, confirmed directly against both, so the code supports either with zero behavioral difference — swapping in a TypeSafeAI connector later is a one-line config change, not a rewrite.

## Try it yourself

See [`DEPLOY.md`](./DEPLOY.md) for exact steps to run your own instance against your own repo. In short: it's a Fly.io Sprite running a small Node.js coordinator, a GitHub connector for zero-credential checkout, and a self-hosted Ollama model for the verdict — no paid APIs required to get it running end-to-end.

## Documents in this repo

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system diagrams: backend, connectors, data flow, UI/UX navigation
- [`DEPLOY.md`](./DEPLOY.md) — how to run your own instance
- [`BUILD_PLAN.md`](./BUILD_PLAN.md) — day-by-day build log (what's done, what's stretch)
- [`INTEGRATIONS.md`](./INTEGRATIONS.md) — exactly how each connector is wired, with real confirmed API shapes
- [`SUBMISSION.md`](./SUBMISSION.md) — mapping to Hacksgiving's rules, requirements, and judging
- [`SECURITY.md`](./SECURITY.md) — what this protects against, what it doesn't yet, how to report an issue
