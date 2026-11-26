# Security

Chaperone is a dynamic, runtime verification layer: it runs incoming code inside an isolated Fly.io Sprite and verifies what it actually does, as a complement to static scanners (Snyk, Socket.dev, GitHub Advanced Security), not a replacement for them.

## What this protects against

- A dependency update or external PR that behaves maliciously *during install/build* — unexpected outbound network connections, writes outside the expected build output, unexpected subprocess spawns, reads of credential-shaped files.
- Repeat attempts using the same behavior pattern, caught instantly via a durable memory of prior verdicts.

## What this does not (yet) protect against

This is a hackathon-stage proof of concept built in five days. It is not hardened for production use. In particular:

- It does not currently defend against payloads that deliberately delay malicious behavior past the monitored install/build window (e.g. logic bombs triggered only during runtime execution in production).
- Network egress detection: outbound connections during install/build are captured via deterministic syscall interception (`strace -e trace=connect`), allowing exfiltration attempts to be caught and the PR blocked. Hardware-isolated Sprite VMs ensure host immunity and zero credentials present on disk.
- Ecosystem adapters: primary focus has been validated on npm/Node.js, with built-in auto-detection for Python (`pip`) and Rust (`cargo`). Future versions will expand sandbox pre-provisioning for larger toolchains (e.g. full Ruby or Go toolchains).

We'd rather state these plainly than have anyone rely on this for more than it currently does.

## Isolation model

Each check runs in a disposable Fly.io Sprite — a hardware-isolated Linux VM — that is destroyed after the check completes, regardless of outcome. Provider credentials (GitHub, TypeSafeAI, Pinecone, Ollama) are held by Fly's Sprites connector gateway and are never written to the Sprite's disk, so code running inside the Sprite being evaluated cannot read them even if it tries.

## Reporting a vulnerability

If you find a way to get malicious behavior past Chaperone's checks, or a way for code running inside a Worker Sprite to reach credentials it shouldn't be able to reach, please open an issue or reach out directly rather than exploiting it. This is pre-production hackathon software; we'd rather know.
