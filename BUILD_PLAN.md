# Build plan — 5 days (Nov 24–29, 2026)

Deadline: submission form closes midnight PST, Nov 29, 2026. Plan for the demo/video/writeup to be done by midday Nov 29, not 11:59pm.

## Day 1 (Mon Nov 24–25) — Skeleton + checkout — COMPLETE

- [x] Fly.io account, Sprite CLI installed and authenticated.
- [x] Create the Coordinator Sprite (`chaperone-coordinator`). Confirmed it can create/destroy a Worker Sprite — via the in-Sprite `sprite` CLI's own session, not a raw bearer token held in app code (plan changed from the original "GitHub App" approach — see `.internal/HANDOFF.md`).
- [x] Stand up the webhook receiver (verify HMAC signature, log the payload) — proven against a real PR on the `chaperone-test-target` throwaway repo.
- [x] Wire the GitHub connector (OAuth, scoped to worker Sprites only via Name Prefix `chk-*`).
- **Exit test: PASSED in full.** Real PR → webhook → Worker Sprite created → real zero-credential checkout via the GitHub connector gateway → `README.md` confirmed present → Worker Sprite destroyed → zero orphaned Sprites.

## Day 2 (Tue Nov 25) — The monitor + the verdict

- [x] Build the runtime monitor — upgraded from the originally-planned polling approach to `strace`-based deterministic syscall capture (connect/execve/openat/open) after polling demonstrably missed a fast-completing exfiltration attempt in testing. See `.internal/HANDOFF.md` for the full account.
- [x] Normalize into one "behavior fingerprint" JSON (`hosts_contacted`, `sensitive_path_opens`, `unexpected_processes`, `outside_repo_writes`, `new_or_changed_file_count`).
- [x] Exit test passed: a real `npm install` (left-pad) on the test PR produces an empty fingerprint; a simulated malicious postinstall (curl exfil + `.ssh` write) is caught cleanly — zero false positives on the benign case, zero false negatives on the malicious one.
- [ ] Wire the TypeSafeAI connector (real API confirmed: `POST https://api.typesafe.ai/v1/systemone`, typed `noul`/`score`/`choice` questions) — code is written and ready, blocked on the connector being added in the Fly dashboard (needs the user, same flow as the GitHub connector on Day 1).
- [ ] Hand-label a broader test corpus (currently have 1 clean benign + 1 clear malicious case; want a few borderline ones too) — lower priority than closing the verdict loop, revisit if time allows.

## Day 3 (Wed Nov 25–26) — Checkpoint/rollback + the GitHub report — COMPLETE

- [x] Wire pre-install checkpointing via the Sprites API. Measured timing (corrected from the original "sub-second" assumption): checkpoint create ~5s, restore ~4–15s end-to-end via the CLI. Restore also auto-creates a "pre-restore" safety snapshot.
- [x] Build the GitHub status check + PR comment reporter. One architecture correction: reporting runs *inside the worker* (via curl, shelled in from the coordinator), not from the coordinator directly — the GitHub connector's access policy only allows `chk-*`-named Sprites, and this is arguably a better security story anyway (the coordinator never touches the GitHub connector at all).
- [x] Staged the canonical demo on the real throwaway repo: PR #2 on `chaperone-test-target` bumps `left-pad` with a simulated malicious postinstall (curl to a safe real domain + a `.ssh` write, confined entirely to the throwaway repo — never a real exfiltration). Caught cleanly: real resolved IPs, the exact sensitive file, `curl` flagged as unexpected — while PR #1 (genuinely benign) reports a completely empty signal.
- **Exit test: passed for everything except the final verdict label.** Full loop runs end-to-end with zero manual intervention — PR → webhook → checkpoint → monitored install → fingerprint → GitHub status + comment — on both PRs. Still shows "pending" rather than pass/fail because TypeSafeAI isn't wired in yet (blocked on the user adding that connector). Once it's live, this needs zero further code changes — just restart the service with `TYPESAFE_CONNECTION_ID` set.

## Day 4 (Thu Nov 27) — Memory + Mode B stretch

- [x] **Ollama integration — done early, on Day 3 night, and upgraded in scope**: not just "swappable second-opinion model" as originally planned, but the actual *primary* verdict engine right now (self-hosted `tev1`, free, inside the Coordinator Sprite), because TypeSafeAI turned out to have no free tier. See `.internal/HANDOFF.md` for the full story. If TypeSafeAI's Discord credit ask comes through, it becomes a one-line config change (`TYPESAFE_CONNECTION_ID`) to switch — the code already supports both with identical behavior.
- [x] Pinecone caching code written and deployed (gracefully no-ops until `PINECONE_CONNECTION_ID` is set — confirmed via clean restart). Real Pinecone 2025-10 API confirmed (not guessed): `POST /vectors/upsert`, `POST /query`, header `X-Pinecone-Api-Version: 2025-10`. Built as **similarity search, not exact-match** — a lightweight feature-hashing embedding (`coordinator/embed.js`, not a trained model, documented honestly as such) so a near-duplicate attack pattern (same behavior, different IP) still gets caught, directly closing the "fingerprint randomization evasion" gap flagged in `.internal/SECURITY_INTERNAL.md` on Day 2.
- [ ] Blocked on: user creating a Pinecone index + connector (dashboard flow, same pattern as GitHub/TypeSafeAI — Pinecone does have a real free tier, unlike TypeSafeAI, so this should be low-friction).
- [ ] Confirm the cache-hit path live once the connector exists: re-running the same (or a near-duplicate) malicious PR gets caught instantly without a second verdict-engine call.
- [ ] If time allows: build Mode B — hook Claude Code's `PreToolUse` into the same verdict engine inside a personal Sprite, demo catching and rolling back a destructive command (`rm -rf`, reading `.env`).
- **Exit test:** second identical malicious PR is caught in under a second with no verdict-engine round-trip; (stretch) Mode B demo works on at least one destructive command.

## Day 5 (Fri Nov 28 → submit by midday Nov 29) — Polish, demo, submit

- [ ] Record the 90-second demo video (bonus points only, doesn't affect score, but makes the pitch land): real malicious PR → caught → explained → blocked, then show the repeat-offender cache hit.
- [ ] Write the PR-facing copy so it reads like a human wrote it, not an LLM hedging.
- [ ] Finalize README with the honest "why now" framing tied to the 2026 incidents.
- [ ] Submit via the Google Form: code link, demo, short description — **before midnight PST Nov 29**, but target midday to leave slack for submission-form issues.
- [ ] Optional: post the share-on-social step (X/Bluesky/LinkedIn/Reddit, tag `@flydotio`) — not a scored requirement but costs nothing.

## What to deliberately NOT build in 5 days

- Full eBPF-based syscall monitoring — superseded during the build anyway: the monitor actually uses `strace`-based syscall tracing (connect/execve/openat), not the originally-planned `ss`/`ps` polling, which is a meaningfully stronger approach than planned here. See `ARCHITECTURE.md` and `.internal/HANDOFF.md` for the full story.
- Support for every package ecosystem — pick npm as the primary demo ecosystem, mention pip/cargo as "the same pattern, more adapters" in the pitch.
- A full dashboard — the GitHub PR comment *is* the product for the demo. Build the dashboard only if Days 1–4 finish early.
