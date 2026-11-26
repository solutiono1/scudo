# Hacksgiving 2026 — submission fit

## Event facts (confirmed from fly.io/hacksgiving)

- Window: Mon Nov 23 – Sun Nov 29, 2026. Deadline: before midnight **PST**, Nov 29.
- Winners announced: Tuesday, Dec 1, by email.
- Requirement: an agent that runs on a Sprite, using **at least one** Sprites connector.
- 1 entry per developer. Fly.io account required.
- Prizes: Grand Prize $2,500, Second Place $1,500, "Weird Uncle Award" $1,000 (strangest agent).
- Judges: Daniel Gafni (TypeSafe AI), Carter Rabasa (Box), Scott Johnston (Fly.io CEO), Asaf Ashirov (Pinecone), Michael Chiang (Ollama).
- Submission: Google Form — link to code, a demo, a short description.
- Video demo earns "bonus points" but explicitly does **not** affect the score.

## Rule-by-rule checklist

| Requirement | How Chaperone satisfies it |
|---|---|
| Runs on a Sprite | Both the Coordinator and every Worker are Sprites — not a Fly Machine, not external compute. |
| Uses ≥1 connector | Uses the **GitHub connector** as load-bearing infrastructure (zero-credential checkout + reporting). The verdict engine runs on a **self-hosted Ollama model inside the Sprite itself** (no connector needed — TypeSafeAI has no free tier, so this is the live path; the TypeSafeAI connector is coded and ready if credits come through, a one-line config change). A Pinecone connector for fingerprint caching is built but currently blocked by what looks like a Fly-side issue with Custom API connectors — see `.internal/HANDOFF.md`. Comfortably exceeds the minimum either way. |
| 1 entry per developer | Single entry. Mode B (agent guardrail) is built as a feature of the same entry, not a second submission. |
| Link to code + demo + description | Public repo, 90-second demo video, one-paragraph description (see `README.md`). |
| Fly.io ToS compliance | No destructive, abusive, or malicious use beyond deliberately-malicious *test* packages run inside our own throwaway repos for demo purposes — never targeting a third party's real infrastructure. |

## Prize-category fit

| Prize | Fit | Why |
|---|---|---|
| Grand Prize ($2,500) | Strong | Severe, freshly-evidenced problem (real 2026 incidents), architecture that could not be faked on non-Sprite compute, broad connector usage. |
| Second Place ($1,500) | Strong | Same strengths as Grand Prize — the realistic fallback. |
| Weird Uncle ($1,000) | Weak, deliberately | The pitch here is credibility, not novelty — this project doesn't try to be both. |

## Honest gaps (stated here, not just internally)

- The runtime monitor built in 5 days (`ss`/`ps`/checksum diffing) is a credible proof of concept, not production-grade syscall interception (eBPF).
- False-positive tuning (legitimate packages doing unusual-but-benign install-time work) is a real open problem, not solved in the hackathon build.
- Coverage is npm-first for the demo; other ecosystems (pip, cargo, gems) follow the same pattern but aren't built in the five days.

See `SECURITY.md` for the security-specific scope and limitations.
