# Build plan — 5 days (Nov 24–29, 2026)

Deadline: submission form closes midnight PST, Nov 29, 2026. Plan for the demo/video/writeup to be done by midday Nov 29, not 11:59pm.

## Day 1 (Mon Nov 24) — Skeleton + checkout

- [ ] Fly.io account, Sprite CLI installed, read `fly.io/sprites` + ecosystem connector docs end to end.
- [ ] Create the Coordinator Sprite. Confirm it can create/destroy a Worker Sprite via the Sprites API/SDK.
- [ ] Wire the GitHub connector: a GitHub App (not a personal token) with `contents:read`, `pull_requests:write`, `checks:write`. Confirm a Worker Sprite can check out a PR branch with zero raw token on disk.
- [ ] Stand up the webhook receiver (verify signature, log the payload).
- **Exit test:** opening a test PR on a throwaway repo triggers a Worker Sprite that successfully checks out the branch.

## Day 2 (Tue Nov 25) — The monitor + the verdict

- [ ] Build the runtime monitor: before/after snapshots of `ss -tupn` (open connections), a filesystem checksum walk, `ps` tree diff, run across the install/build window.
- [ ] Normalize the three signals into one "behavior fingerprint" (sorted host list, touched-paths-outside-expected-output, spawned process names).
- [ ] Wire the TypeSafeAI connector: send the fingerprint + PR diff, get back a typed `{risk_score, category, confidence}`.
- [ ] Hand-label ~15 test cases (5 obviously benign installs, 5 obviously destructive/exfiltrating scripts you write yourself, 5 borderline) to sanity-check the verdict call shape and thresholds.
- **Exit test:** a deliberately malicious test package (e.g. one that `curl`s to a test endpoint during `postinstall`) gets correctly flagged; a normal `npm install` doesn't.

## Day 3 (Wed Nov 26) — Checkpoint/rollback + the GitHub report

- [ ] Wire pre-install checkpointing via the Sprites API.
- [ ] Build the GitHub status check + PR comment reporter (clean pass, clear fail with exact evidence: "contacted `evil.example.com:443`, wrote outside `dist/` to `~/.ssh/`").
- [ ] Stage the canonical demo on a real throwaway repo: a Dependabot-style PR that bumps a dependency to a version you've deliberately made malicious → Chaperone catches it, blocks the merge, explains why.
- **Exit test:** full loop works end-to-end without manual intervention, PR → webhook → check → verdict → GitHub comment.

## Day 4 (Thu Nov 27) — Memory + Mode B stretch

- [ ] Wire the Pinecone connector: store each fingerprint + verdict as a durable (not per-session) index entry.
- [ ] Confirm the cache-hit path: re-running the same malicious PR gets caught instantly without a second TypeSafeAI call.
- [ ] If time allows: build Mode B — hook Claude Code's `PreToolUse` into the same verdict engine inside a personal Sprite, demo catching and rolling back a destructive command (`rm -rf`, reading `.env`).
- [ ] Add the Ollama Cloud connector as a swappable second-opinion model (closes the model-agnosticism gap for judging).
- **Exit test:** second identical malicious PR is caught in under a second with no TypeSafeAI round-trip; (stretch) Mode B demo works on at least one destructive command.

## Day 5 (Fri Nov 28 → submit by midday Nov 29) — Polish, demo, submit

- [ ] Record the 90-second demo video (bonus points only, doesn't affect score, but makes the pitch land): real malicious PR → caught → explained → blocked, then show the repeat-offender cache hit.
- [ ] Write the PR-facing copy so it reads like a human wrote it, not an LLM hedging.
- [ ] Finalize README with the honest "why now" framing tied to the 2026 incidents.
- [ ] Submit via the Google Form: code link, demo, short description — **before midnight PST Nov 29**, but target midday to leave slack for submission-form issues.
- [ ] Optional: post the share-on-social step (X/Bluesky/LinkedIn/Reddit, tag `@flydotio`) — not a scored requirement but costs nothing.

## What to deliberately NOT build in 5 days

- Full eBPF-based syscall monitoring (the `ss`/`ps`/checksum-diff approach is good enough to demo the concept credibly; see `BUSINESS.md` for the production-grade version).
- Support for every package ecosystem — pick npm as the primary demo ecosystem, mention pip/cargo as "the same pattern, more adapters" in the pitch.
- A full dashboard — the GitHub PR comment *is* the product for the demo. Build the dashboard only if Days 1–4 finish early.
