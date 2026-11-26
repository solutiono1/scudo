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
- [x] Verdict engine wired and live — not via TypeSafeAI (no free tier, see Day 4 notes) but via self-hosted Ollama (`tev1`), same typed `noul`/`score`/`choice` API shape. TypeSafeAI code path is written and ready as a one-line swap if a credit grant comes through.
- [ ] Hand-label a broader test corpus (currently have 1 clean benign + 1 clear malicious case; want a few borderline ones too) — lower priority than closing the verdict loop, revisit if time allows.

## Day 3 (Wed Nov 25–26) — Checkpoint/rollback + the GitHub report — COMPLETE

- [x] Wire pre-install checkpointing via the Sprites API. Measured timing (corrected from the original "sub-second" assumption): checkpoint create ~5s, restore ~4–15s end-to-end via the CLI. Restore also auto-creates a "pre-restore" safety snapshot.
- [x] Build the GitHub status check + PR comment reporter. One architecture correction: reporting runs *inside the worker* (via curl, shelled in from the coordinator), not from the coordinator directly — the GitHub connector's access policy only allows `chk-*`-named Sprites, and this is arguably a better security story anyway (the coordinator never touches the GitHub connector at all).
- [x] Staged the canonical demo on the real throwaway repo: PR #2 on `chaperone-test-target` bumps `left-pad` with a simulated malicious postinstall (curl to a safe real domain + a `.ssh` write, confined entirely to the throwaway repo — never a real exfiltration). Caught cleanly: real resolved IPs, the exact sensitive file, `curl` flagged as unexpected — while PR #1 (genuinely benign) reports a completely empty signal.
- **Exit test: PASSED in full.** Full loop runs end-to-end with zero manual intervention — PR → webhook → checkpoint → monitored install → fingerprint → real typed verdict → GitHub status + comment, including the actual checkpoint-restore firing on the risky PR. Confirmed real pass/fail distinction: PR #1 (benign) → GitHub `success`; PR #2 (malicious demo) → GitHub `failure` + restore.

## Day 4 (Thu Nov 27) — Memory + Mode B stretch

- [x] **Ollama integration — done early, on Day 3 night, and upgraded in scope**: not just "swappable second-opinion model" as originally planned, but the actual *primary* verdict engine right now (self-hosted `tev1`, free, inside the Coordinator Sprite), because TypeSafeAI turned out to have no free tier. See `.internal/HANDOFF.md` for the full story. If TypeSafeAI's Discord credit ask comes through, it becomes a one-line config change (`TYPESAFE_CONNECTION_ID`) to switch — the code already supports both with identical behavior.
- [x] Pinecone caching code written and deployed (gracefully no-ops when unavailable — confirmed via clean restart). Rebuilt once to match the index type actually available (Pinecone's "documents" API with hosted embedding, not raw vectors — see `.internal/HANDOFF.md`). Real endpoints confirmed via docs, not guessed.
- [x] **Index + connector created, connector itself blocked** — not a setup-friction issue as originally expected. Every call (including Fly's own literal example command) returns "no custom_api connection configured," which looks like a Fly-side bug specific to Custom API connector types, not something in our config. Thoroughly ruled out: credentials, auth header format, sprite-name policy. Deprioritized — the pipeline is fully functional without it; caching only makes repeat checks cheaper, it was never load-bearing for the pass/fail verdict itself.
- [ ] Cache-hit path remains untested live (blocked by the above). Code path exists and is ready if the connector issue resolves.
- [x] Mode B (stretch, completed and live-tested): hook Claude Code's `PreToolUse` and `PostToolUse` into the local Ollama verdict engine (`tev1`) inside a development Sprite (`chaperone-guardian-demo`). Automatically checkpoints the Sprite on commands with destructive risk score ≥ 0.5 (e.g. `rm -rf`), and triggers `sprite-env checkpoints restore` immediately in `PostToolUse` to revert file changes.
- **Exit test:** Mode B tested and passed live on `chaperone-guardian-demo` — `rm -rf` command scored 0.85 for destructive risk, checkpointed to `v12`, and successfully restored/rolled back via `post_tool_use.sh`. Cache-hit path remains untested live due to the Fly Custom API connector bug.

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
