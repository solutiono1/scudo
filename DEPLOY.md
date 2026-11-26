# Deploy your own Chaperone

These are the exact steps used to stand up the running instance for this submission — every command here has actually been run and confirmed working, not just written down.

## Prerequisites

- A Fly.io account (free to create, no card needed to start)
- A GitHub repo you want Chaperone to watch
- `curl`, `git`, a Linux/macOS/WSL2 shell

## 1. Install the CLIs

```bash
curl -L https://fly.io/install.sh | sh
curl https://sprites.dev/install.sh | bash
```

Log in to both (each opens a browser to approve):

```bash
fly auth login
sprite login
```

## 2. Create the Coordinator Sprite

```bash
sprite create --skip-console chaperone-coordinator
sprite use chaperone-coordinator
```

Make its URL public (needed for GitHub to reach it — the webhook handler's own HMAC signature check is the actual security boundary, not URL privacy):

```bash
sprite config update --url-auth public
```

Note the Sprite's URL from `sprite info` — you'll need it for the webhook and connector setup below.

## 3. Push the coordinator code

From this repo's root:

```bash
sprite exec -- mkdir -p /home/sprite/app
sprite file push -r coordinator/ /home/sprite/app/
```

(If `sprite file push` errors with a confusing "directory does not exist" message, pipe files in via `sprite exec --stdin -- bash -c "cat > /home/sprite/app/<file>"` instead — a workaround that was needed during this project's own setup.)

## 4. Set up the GitHub side

Create a repo-level webhook (simplest for watching one repo — a full GitHub App is the production-scale version, not required to get started):

```bash
WEBHOOK_SECRET=$(openssl rand -hex 32)
gh api repos/<owner>/<repo>/hooks -X POST \
  -f name=web \
  -f config[url]="https://<your-sprite-url>/webhook" \
  -f config[content_type]=json \
  -f config[secret]="$WEBHOOK_SECRET" \
  -F active=true \
  -f events[]=pull_request
```

Then, in the Fly dashboard → your org → **Sprites → Connectors → Add connector → GitHub**, approve the OAuth screen, and set its **Access Configuration** to **Name Prefix** `chk-` (so only the disposable worker Sprites this coordinator creates can use it — not the coordinator itself, which never needs to touch GitHub directly).

## 5. Set up the verdict engine (free, no paid API needed)

Install Ollama directly on the Coordinator Sprite:

```bash
sprite exec -- bash -c 'curl -fsSL https://ollama.com/install.sh | sh'
```

If that errors needing `zstd`: `sprite exec -- bash -c 'sudo apt-get update -qq && sudo apt-get install -y -qq zstd'`, then retry.

Run it as a local-only managed service (no `--http-port` — a Sprite only routes one external HTTP port, and that's the coordinator app):

```bash
sprite exec -- sprite-env services create ollama --cmd /usr/local/bin/ollama --args serve
sprite exec -- /usr/local/bin/ollama pull tev1
```

**Have a TypeSafeAI API key with credits?** Set up that connector the same way as GitHub instead (provider is a Custom/API-key connector; see `INTEGRATIONS.md`), and set `TYPESAFE_CONNECTION_ID` in the next step — the code prefers it automatically over Ollama, with identical behavior either way.

## 6. Configure and start the coordinator

Create `coordinator/.env` locally (never commit this):

```
PORT=8080
SPRITES_ORG=<your-org-slug>
GITHUB_CONNECTION_ID=<from the GitHub connector's dashboard URL>
WEBHOOK_SECRET=<the same value used in step 4>
```

Push it and start the service:

```bash
cat coordinator/.env | sprite exec --stdin -- bash -c 'cat > /home/sprite/app/.env'
sprite exec -- sprite-env services create coordinator --cmd node --args /home/sprite/app/index.js --http-port 8080
```

## 7. Test it

Open a test PR on your repo. Watch it work:

```bash
sprite exec -- tail -f /.sprite/logs/services/coordinator.log
```

You should see the webhook arrive, a Worker Sprite get created, a checkpoint taken, the install run under `strace`, a fingerprint produced, a verdict returned, and a GitHub status + comment posted — then the worker destroyed. That's the whole loop.

## Known gaps in this version

- **Pinecone fingerprint caching**: code is written (`coordinator/index.js`) but currently blocked on what looks like a Fly-side issue with Custom API connectors specifically — see `.internal/HANDOFF.md` for the full troubleshooting trail if picking this back up. The system works completely without it; caching only makes repeat checks cheaper/faster, it's not load-bearing.
- **Mode B** (guarding your own coding agent, not just incoming PRs) is designed in `ARCHITECTURE.md` but not built — stretch scope that didn't fit the timeline.
- npm is the only ecosystem the install monitor targets; pip/cargo/gems follow the same pattern but aren't implemented.
