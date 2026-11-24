# Working agreement for any agent in this repo

This file is auto-loaded by Claude Code for any session rooted here. These rules are **compulsory**, not suggestions — they exist so that if a session dies, loses context, or hits a limit, the next one (or a human) can pick up cold instead of re-deriving everything or contradicting a decision already made.

## Before doing anything else

1. Read `.internal/HANDOFF.md` in full.
2. Read `.internal/PRD.md` if the task touches scope/requirements.
3. Check `BUILD_PLAN.md` for which day's checklist is active.

## After any meaningful step (a decision, a file created, a command run, a blocker hit)

1. Update `.internal/HANDOFF.md`: refresh "Current status," move items between Done/In progress/Next, and **append** (never delete) a dated entry to the decisions log.
2. If a bypass/limitation is discovered, log it in `.internal/SECURITY_INTERNAL.md`, not just in conversation.
3. If scope changes, update `.internal/PRD.md` to match reality — it should describe what we're actually building, not what we once planned.
4. Tick off completed items in `BUILD_PLAN.md`.

## Hard rules

- **Never commit or push `.internal/`.** It's gitignored on purpose — it holds judge-profiling notes and revenue strategy that must never reach the public hackathon submission repo. If `.gitignore` ever looks like it's missing that line, stop and fix it before any commit, don't just proceed.
- **Never relax `--dangerously-skip-permissions` discussions into actually disabling guardrails on this project's own development.** Ironic failure mode for a project about agent guardrails.
- Keep the public docs (`README.md`, `ARCHITECTURE.md`, `BUILD_PLAN.md`, `INTEGRATIONS.md`, `SUBMISSION.md`, `SECURITY.md`) honest about limitations — judges (per research) respond better to "this is a 5-day proof of concept, here's the production gap" than to overclaiming.
- Follow `BUILD_PLAN.md`'s day-by-day scope. Do not silently expand scope (new connectors, new ecosystems, a full dashboard) without updating `PRD.md` first.
