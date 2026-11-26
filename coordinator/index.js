'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { renderLandingPage, renderInstalledPage } = require('./onboarding');

const SPRITE_CLI = '/.sprite/bin/sprite';

function runSpriteCli(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    execFile(SPRITE_CLI, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`sprite ${args.join(' ')} failed: ${stderr || err.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

// Writes `content` to `remotePath` inside `workerName` by piping it through
// `sprite exec --stdin -- bash -c "cat > path"` — the same pattern proven on
// Day 1 for pushing files onto the Coordinator itself.
function pushFileContent(workerName, content, remotePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(SPRITE_CLI, ['exec', '-o', SPRITES_ORG, '-s', workerName, '--stdin', '--', 'bash', '-c', `cat > ${remotePath}`]);
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`pushFileContent(${remotePath}) exited ${code}: ${stderr}`));
      else resolve();
    });
    child.stdin.write(content);
    child.stdin.end();
  });
}

// --- tiny .env loader (no deps, keeps Day 1 dependency-free) ---
function loadEnv(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (e) {
    console.warn(`[env] no env file at ${file} (${e.code || e.message})`);
  }
}
loadEnv(path.join(__dirname, '.env'));

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const SPRITES_ORG = process.env.SPRITES_ORG || 'solution-kanu';
const GITHUB_CONNECTION_ID = process.env.GITHUB_CONNECTION_ID || '';
const TYPESAFE_CONNECTION_ID = process.env.TYPESAFE_CONNECTION_ID || ''; // Day 2: set once the TypeSafeAI connector exists
const PINECONE_CONNECTION_ID = process.env.PINECONE_CONNECTION_ID || ''; // Day 4: durable fingerprint memory
const PINECONE_SIMILARITY_THRESHOLD = 0.92; // cosine score above which we trust a cached verdict instead of re-asking

// No SPRITES_TOKEN handled in this process at all — the in-Sprite `sprite` CLI
// authenticates itself once (its own isolated keyring) and we shell out to it.
// See .internal/HANDOFF.md 2026-11-25 entry for why.

if (!WEBHOOK_SECRET) console.warn('[config] WEBHOOK_SECRET not set — webhook signature checks will fail closed');
if (!GITHUB_CONNECTION_ID) console.warn('[config] GITHUB_CONNECTION_ID not set — checkout step will be skipped, smoke-test only');
console.log(
  TYPESAFE_CONNECTION_ID
    ? '[config] verdict engine: TypeSafeAI (Jev)'
    : `[config] verdict engine: local Ollama (${process.env.OLLAMA_MODEL || 'tev1'}) — no TypeSafeAI connector configured`
);
if (!PINECONE_CONNECTION_ID) console.warn('[config] PINECONE_CONNECTION_ID not set — no fingerprint caching yet, every check calls the verdict engine fresh');

const WORKER_CHECK_SH = fs.readFileSync(path.join(__dirname, 'worker-assets', 'worker-check.sh'), 'utf8');
const PARSE_FINGERPRINT_JS = fs.readFileSync(path.join(__dirname, 'worker-assets', 'parse-fingerprint.js'), 'utf8');

function verifySignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET || !signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function createWorkerSprite(name) {
  return runSpriteCli(['create', '-o', SPRITES_ORG, '--skip-console', name]);
}

async function destroyWorkerSprite(name) {
  try {
    await runSpriteCli(['destroy', '-o', SPRITES_ORG, '-s', name, '--force']);
  } catch (e) {
    console.warn(`[worker] destroy ${name} failed: ${e.message}`);
  }
}

// Background safety reaper: lists all chk-* workers and destroys any whose age
// exceeds 10 minutes (prevents orphaned VMs if coordinator crashes mid-install).
const REAPER_MAX_AGE_MS = 10 * 60 * 1000;
const REAPER_INTERVAL_MS = 5 * 60 * 1000;

async function reapOrphanWorkers() {
  try {
    const stdout = await runSpriteCli(['list', '-o', SPRITES_ORG, '--prefix', 'chk-', '--json']);
    let sprites = [];
    try {
      const parsed = JSON.parse(stdout);
      sprites = Array.isArray(parsed) ? parsed : (parsed.sprites || []);
    } catch {
      const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts[0] && parts[0].startsWith('chk-')) {
          sprites.push({ name: parts[0] });
        }
      }
    }

    const now = Date.now();
    for (const s of sprites) {
      const name = s.name || s.id;
      if (!name || !name.startsWith('chk-')) continue;

      // Parse timestamp from name format: chk-<pr>-<base36_timestamp>
      const parts = name.split('-');
      const tsBase36 = parts[parts.length - 1];
      const createdMs = parseInt(tsBase36, 36);

      let ageMs = null;
      if (!isNaN(createdMs) && createdMs > 1700000000000) {
        ageMs = now - createdMs;
      } else if (s.created_at || s.createdAt) {
        ageMs = now - new Date(s.created_at || s.createdAt).getTime();
      }

      if (ageMs !== null && ageMs > REAPER_MAX_AGE_MS) {
        console.log(`[reaper] worker ${name} is orphaned (age ${Math.round(ageMs / 60000)}m > 10m) — reaping`);
        await destroyWorkerSprite(name);
      }
    }
  } catch (err) {
    console.warn(`[reaper] check failed: ${err.message}`);
  }
}

// Returns the checkpoint version id (e.g. "v4"), parsed from the CLI's own
// confirmation line — there's no --json output for this subcommand.
async function createCheckpoint(name, comment) {
  const out = await runSpriteCli(['checkpoint', 'create', '-o', SPRITES_ORG, '-s', name, '--comment', comment]);
  const m = out.match(/Checkpoint (v\d+) created/);
  if (!m) throw new Error(`could not parse checkpoint id from: ${out}`);
  return m[1];
}

async function restoreCheckpoint(name, versionId) {
  await runSpriteCli(['restore', '-o', SPRITES_ORG, '-s', name, versionId], 30000);
}

async function execInWorker(name, cmdParts, timeoutMs) {
  const out = await runSpriteCli(['exec', '-o', SPRITES_ORG, '-s', name, '--no-stdin', '--', ...cmdParts], timeoutMs);
  return { raw: out };
}

// TypeSafeAI's Jev and Ollama's local decision models (tev1/nimble/clef) both
// implement the identical /v1/systemone request and response shape — same
// question types (noul/score/choice), same answer fields. Confirmed directly
// against both APIs on 2026-11-25, not assumed. That means one request builder
// and one response consumer serve either provider; only the transport differs.
const VERDICT_QUESTIONS = {
  is_malicious: {
    type: 'noul',
    instructions:
      'This is a machine-collected report of network connections, file accesses, and processes spawned ' +
      'during an npm install/build of a third-party pull request. Does it show signs of malicious intent ' +
      '(credential theft, data exfiltration, destructive file operations, or unauthorized privilege escalation)?',
  },
  severity: {
    type: 'score',
    instructions: 'How severe is the risk shown in this report, if any?',
    criteria: ['Benign — nothing unusual', 'Unusual but plausibly benign', 'Likely malicious or destructive'],
  },
  category: {
    type: 'choice',
    instructions: 'Which category best describes the primary risk shown, if any?',
    criteria: {
      benign: 'No concerning behavior observed',
      exfiltration: 'Reads or transmits credentials/secrets/sensitive files',
      destructive: 'Deletes, overwrites, or corrupts data outside expected scope',
      privilege_escalation: 'Attempts to gain access beyond what the install should need',
    },
  },
};

async function getVerdictViaTypeSafe(fingerprint) {
  const body = { state: JSON.stringify(fingerprint), model: 'jev-latest', questions: VERDICT_QUESTIONS };
  const res = await fetch(`https://api.sprites.dev/v1/gateway/typesafe/${TYPESAFE_CONNECTION_ID}/v1/systemone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TypeSafeAI verdict call failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Local Ollama decision model, self-hosted inside this Coordinator Sprite (no
// API key, no cost — see .internal/HANDOFF.md 2026-11-25 for why this exists:
// TypeSafeAI has no free tier, and this is the primary verdict path unless/until
// a TypeSafeAI connector comes through).
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'tev1';
async function getVerdictViaOllama(fingerprint) {
  const body = { model: OLLAMA_MODEL, state: JSON.stringify(fingerprint), questions: VERDICT_QUESTIONS };
  const res = await fetch('http://127.0.0.1:11434/v1/systemone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Ollama verdict call failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// TypeSafeAI first if its connector is configured (Jev is the larger, more
// capable model); otherwise the free local Ollama path. Gateway calls just
// need to originate from *some* Sprite, not specifically a Worker — the
// Coordinator itself qualifies. See .internal/HANDOFF.md for that correction.
async function getVerdict(fingerprint) {
  if (TYPESAFE_CONNECTION_ID) return getVerdictViaTypeSafe(fingerprint);
  return getVerdictViaOllama(fingerprint);
}

// Pinecone, via the connector gateway. Uses the "documents" API (2026-07),
// confirmed against docs.pinecone.io on 2026-11-26 — not guessed. This index
// type embeds text with Pinecone's own hosted model (llama-text-embed-v2), so
// we don't compute our own vectors — we just describe the fingerprint in
// plain English and let Pinecone's embedding do the similarity matching. That
// also means near-duplicate attack patterns (same behavior, different IP)
// still land close together, which is what actually closes the
// fingerprint-randomization gap noted in .internal/SECURITY_INTERNAL.md —
// not exact-match caching.
const PINECONE_NAMESPACE = '__default__';

async function pineconeRequest(path, body) {
  // "custom_api" is the gateway provider slug for a Custom API connector (confirmed
  // from the connector's own dashboard page) — not "pinecone", which would only
  // apply to a native/built-in provider type, which this isn't.
  const res = await fetch(`https://api.sprites.dev/v1/gateway/custom_api/${PINECONE_CONNECTION_ID}/namespaces/${PINECONE_NAMESPACE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Pinecone-Api-Version': '2026-07' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Pinecone ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// A plain-English description of the fingerprint — this is what Pinecone
// actually embeds and searches on, not a vector we compute ourselves.
function describeFingerprint(fingerprint) {
  const parts = [];
  parts.push(fingerprint.hosts_contacted.length ? `Contacted hosts: ${fingerprint.hosts_contacted.join(', ')}.` : 'No network connections.');
  parts.push(
    fingerprint.sensitive_path_opens.length ? `Opened sensitive paths: ${fingerprint.sensitive_path_opens.join(', ')}.` : 'No sensitive paths opened.'
  );
  parts.push(
    fingerprint.unexpected_processes.length
      ? `Unexpected processes: ${fingerprint.unexpected_processes.map((p) => p.basename || p).join(', ')}.`
      : 'No unexpected processes.'
  );
  parts.push(
    fingerprint.outside_repo_writes.length ? `Wrote outside the repo: ${fingerprint.outside_repo_writes.join(', ')}.` : 'No writes outside the repo.'
  );
  return parts.join(' ');
}

// Local persistent fingerprint similarity cache: ensures similarity caching works
// immediately even when an external vector DB connector is unavailable.
const LOCAL_CACHE_FILE = path.join(__dirname, 'fingerprint-cache.json');
let localCache = [];
try {
  if (fs.existsSync(LOCAL_CACHE_FILE)) {
    localCache = JSON.parse(fs.readFileSync(LOCAL_CACHE_FILE, 'utf8'));
    console.log(`[cache] loaded ${localCache.length} cached fingerprints from ${LOCAL_CACHE_FILE}`);
  }
} catch (e) {
  console.warn(`[cache] could not load local cache: ${e.message}`);
}

function saveLocalCache() {
  try {
    fs.writeFileSync(LOCAL_CACHE_FILE, JSON.stringify(localCache.slice(-500), null, 2), 'utf8');
  } catch (e) {
    console.warn(`[cache] could not save local cache: ${e.message}`);
  }
}

function computeFingerprintSimilarity(fp1, fp2) {
  const getKeys = (fp) => {
    const s = new Set();
    (fp.hosts_contacted || []).forEach((h) => s.add('host:' + h));
    (fp.sensitive_path_opens || []).forEach((p) => s.add('path:' + p));
    (fp.unexpected_processes || []).forEach((pr) => s.add('proc:' + (pr.basename || pr.path || pr)));
    (fp.outside_repo_writes || []).forEach((w) => s.add('write:' + w));
    return s;
  };
  const s1 = getKeys(fp1);
  const s2 = getKeys(fp2);
  if (s1.size === 0 && s2.size === 0) return 1.0;
  let intersection = 0;
  for (const item of s1) {
    if (s2.has(item)) intersection++;
  }
  const union = new Set([...s1, ...s2]).size;
  return union === 0 ? 1.0 : intersection / union;
}

function queryLocalCache(fingerprint) {
  let best = null;
  let bestScore = 0;
  for (const entry of localCache) {
    const score = computeFingerprintSimilarity(fingerprint, entry.fingerprint);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (best && bestScore >= 0.85) {
    return { verdict: best.verdict, score: bestScore, provider: 'local_cache' };
  }
  return null;
}

// Returns a cached verdict if a near-duplicate fingerprint was already judged,
// checking Pinecone first (if configured), then falling back to local persistent cache.
async function queryFingerprintCache(fingerprint) {
  if (PINECONE_CONNECTION_ID) {
    try {
      const result = await pineconeRequest('/documents/search', {
        top_k: 1,
        score_by: [{ type: 'embed', fields: ['chunk_text'], query: describeFingerprint(fingerprint) }],
        include_fields: ['verdict'],
      });
      const top = result.result && result.result.hits && result.result.hits[0];
      if (top && top._score >= PINECONE_SIMILARITY_THRESHOLD && top.fields && top.fields.verdict) {
        return { verdict: JSON.parse(top.fields.verdict), score: top._score, provider: 'pinecone' };
      }
    } catch (e) {
      console.warn(`[cache] Pinecone query failed, checking local cache: ${e.message}`);
    }
  }
  return queryLocalCache(fingerprint);
}

async function storeFingerprintVerdict(fingerprint, verdict) {
  // Always record to local cache
  localCache.push({ fingerprint, verdict, stored_at: Date.now() });
  saveLocalCache();

  if (!PINECONE_CONNECTION_ID) return;
  try {
    await pineconeRequest('/documents/upsert', {
      documents: [
        {
          _id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          chunk_text: describeFingerprint(fingerprint),
          verdict: JSON.stringify(verdict),
        },
      ],
    });
  } catch (e) {
    console.warn(`[cache] store failed (non-fatal): ${e.message}`);
  }
}

// Reporting runs INSIDE the worker (via curl, shelled in through execInWorker),
// not from the coordinator. Two reasons: (1) the GitHub connector's access policy
// only allows `chk-*`-named Sprites — the coordinator doesn't match, and 403s if it
// tries the gateway directly; (2) it's a better security story anyway — the
// coordinator never touches the GitHub connector at all, only the disposable
// worker does, for both checkout and reporting.
async function postViaWorker(workerName, gatewayPath, jsonBody) {
  const remoteFile = `/home/sprite/_report_${Date.now()}.json`;
  await pushFileContent(workerName, JSON.stringify(jsonBody), remoteFile);
  const result = await execInWorker(workerName, [
    'curl', '-s', '-o', '/dev/null', '-w', '%{http_code}',
    '-X', 'POST', `https://api.sprites.dev/v1/gateway/github/${GITHUB_CONNECTION_ID}${gatewayPath}`,
    '-H', 'Content-Type: application/json', '--data', `@${remoteFile}`,
  ]);
  const code = parseInt(result.raw.trim(), 10);
  if (!(code >= 200 && code < 300)) console.warn(`[report] POST ${gatewayPath} returned HTTP ${code}`);
}

function formatReport(fingerprint, verdict) {
  const lines = [];
  lines.push('### 🛡️ Scudo Runtime Security Check');
  lines.push('');
  if (verdict) {
    const { is_malicious, severity, category } = verdict.answers;
    // severity.score is a float (e.g. 0.59); legend keys are integer strings — round
    // to the nearest rubric level rather than indexing directly, which would miss.
    const severityLabel = severity.legend[String(Math.round(severity.score))] || severity.score;
    lines.push(
      `**Verdict:** ${is_malicious.noul >= 0.5 ? '⚠️ Risky' : '✅ Clean'} ` +
        `(malicious-intent probability ${is_malicious.noul.toFixed(2)}, category: ${category.choice}, severity: ${severityLabel})`
    );
    lines.push('');
  } else {
    lines.push('**Verdict:** ⏳ not available yet — reporting raw observations only.');
    lines.push('');
  }
  lines.push('**What was observed during install:**');
  lines.push(`- Hosts contacted: ${fingerprint.hosts_contacted.length ? fingerprint.hosts_contacted.join(', ') : 'none'}`);
  lines.push(`- Sensitive paths opened: ${fingerprint.sensitive_path_opens.length ? fingerprint.sensitive_path_opens.join(', ') : 'none'}`);
  lines.push(
    `- Unexpected processes: ${fingerprint.unexpected_processes.length ? fingerprint.unexpected_processes.map((p) => p.basename).join(', ') : 'none'}`
  );
  lines.push(`- Files written outside the repo: ${fingerprint.outside_repo_writes.length ? fingerprint.outside_repo_writes.join(', ') : 'none'}`);
  lines.push('');
  lines.push('_Verified inside a disposable Fly.io Sprite VM. The install never held a GitHub token — checkout executed through the zero-credential connector gateway._');
  return lines.join('\n');
}

async function reportResult(workerName, pr, fingerprint, verdict) {
  if (!GITHUB_CONNECTION_ID) return;
  const [owner, repo] = pr.head.repo.full_name.split('/');
  const risky = verdict ? verdict.answers.is_malicious.noul >= 0.5 : null;
  const state = risky === true ? 'failure' : risky === false ? 'success' : 'pending';
  const description =
    risky === true
      ? 'Scudo flagged risky runtime behavior'
      : risky === false
      ? 'Scudo: runtime behavior clean'
      : 'Scudo: fingerprint collected, verdict pending';

  await postViaWorker(workerName, `/repos/${owner}/${repo}/statuses/${pr.head.sha}`, {
    state,
    description: description.slice(0, 140),
    context: 'scudo',
  });
  await postViaWorker(workerName, `/repos/${owner}/${repo}/issues/${pr.number}/comments`, {
    body: formatReport(fingerprint, verdict),
  });
}

async function runCheck(pr) {
  const workerName = `chk-scudo-${pr.number}-${Date.now().toString(36)}`;
  console.log(`[check] starting for PR #${pr.number} (${pr.head.repo.full_name}@${pr.head.sha}) as worker ${workerName}`);
  let fingerprint = null;
  let verdict = null;
  let baselineCheckpoint = null;
  try {
    await createWorkerSprite(workerName);
    console.log(`[check] worker ${workerName} created`);

    if (!GITHUB_CONNECTION_ID) {
      console.warn('[check] GITHUB_CONNECTION_ID not set yet — skipping real checkout, Day 1 smoke test only');
      return;
    }

    // Checkpoint the pristine worker before anything untrusted runs on it. In Mode A
    // the worker is destroyed either way, so this isn't load-bearing here — it's
    // deliberately exercised anyway to prove the mechanism for the pitch; Mode B
    // (guarding a long-lived personal Sprite) is where restoring actually matters
    // instead of just discarding the whole machine.
    baselineCheckpoint = await createCheckpoint(workerName, 'pre-check baseline');
    console.log(`[check] baseline checkpoint ${baselineCheckpoint} for ${workerName}`);

    await pushFileContent(workerName, WORKER_CHECK_SH, '/home/sprite/worker-check.sh');
    await pushFileContent(workerName, PARSE_FINGERPRINT_JS, '/home/sprite/parse-fingerprint.js');
    await execInWorker(workerName, ['chmod', '+x', '/home/sprite/worker-check.sh']);

    const [owner, repo] = pr.head.repo.full_name.split('/');
    // 5 minutes: strace adds real overhead, and installs can be slow on a cold Sprite.
    // 'auto' detects the repository ecosystem (npm, pip, cargo, etc.)
    const result = await execInWorker(
      workerName,
      ['bash', '/home/sprite/worker-check.sh', owner, repo, pr.head.sha, GITHUB_CONNECTION_ID, 'auto'],
      5 * 60 * 1000
    );

    try {
      fingerprint = JSON.parse(result.raw.trim().split('\n').pop());
    } catch (e) {
      console.error(`[check] could not parse fingerprint JSON for ${workerName}:`, result.raw.slice(0, 500));
      return;
    }
    console.log(`[check] fingerprint for ${workerName}:`, JSON.stringify(fingerprint));

    const cached = await queryFingerprintCache(fingerprint);
    if (cached) {
      verdict = cached.verdict;
      console.log(`[check] cache hit for ${workerName} (similarity ${cached.score.toFixed(3)}) — skipped a fresh verdict call`);
    } else {
      verdict = await getVerdict(fingerprint);
      console.log(`[check] verdict for ${workerName}:`, JSON.stringify(verdict.answers));
      await storeFingerprintVerdict(fingerprint, verdict);
    }

    // Report *before* restoring — restore triggers an environment restart on the
    // worker, which would kill the exec session reporting depends on.
    await reportResult(workerName, pr, fingerprint, verdict);
    console.log(`[check] reported result for ${workerName} to GitHub`);

    if (verdict && verdict.answers.is_malicious.noul >= 0.5 && baselineCheckpoint) {
      console.log(`[check] risky verdict — restoring ${workerName} to ${baselineCheckpoint} before destroying`);
      await restoreCheckpoint(workerName, baselineCheckpoint);
    }
  } catch (err) {
    console.error(`[check] failed for ${workerName}:`, err.message);
  } finally {
    await destroyWorkerSprite(workerName);
    console.log(`[check] worker ${workerName} destroyed`);
  }
  return { fingerprint, verdict };
}

const server = http.createServer((req, res) => {
  const host = req.headers.host ? `https://${req.headers.host}` : 'https://chaperone-coordinator-b6utb.sprites.app';

  if (req.method === 'GET' && (req.url === '/' || req.url === '/install')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderLandingPage(host, { ollamaModel: OLLAMA_MODEL }));
    return;
  }

  if (req.method === 'GET' && req.url === '/installed') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderInstalledPage());
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok\n');
    return;
  }

  if (req.method === 'POST' && req.url === '/webhook') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks);
      const signature = req.headers['x-hub-signature-256'];
      if (!verifySignature(rawBody, signature)) {
        console.warn('[webhook] signature verification failed');
        res.writeHead(401);
        res.end('bad signature');
        return;
      }

      let payload;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch (e) {
        res.writeHead(400);
        res.end('bad json');
        return;
      }

      const event = req.headers['x-github-event'];
      console.log(`[webhook] received event=${event} action=${payload.action || ''}`);

      res.writeHead(202);
      res.end('accepted');

      if (event === 'pull_request' && ['opened', 'synchronize', 'reopened'].includes(payload.action)) {
        runCheck(payload.pull_request).catch((e) => console.error('[check] unhandled error', e));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Scudo coordinator listening on 0.0.0.0:${PORT}`);
  // Initial orphan reaper check, then periodically every 5 minutes
  reapOrphanWorkers().catch((e) => console.warn(`[reaper] initial run failed: ${e.message}`));
  setInterval(() => {
    reapOrphanWorkers().catch((e) => console.warn(`[reaper] periodic run failed: ${e.message}`));
  }, REAPER_INTERVAL_MS);
});
