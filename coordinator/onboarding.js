'use strict';
// Turnkey GitHub App Onboarding page for Scudo
// Serves a clean, modern dashboard with a 1-click GitHub App Manifest creator

function getManifestJson(hostUrl) {
  return JSON.stringify({
    name: 'Scudo Security Bot',
    url: hostUrl,
    hook_attributes: {
      url: `${hostUrl}/webhook`,
      active: true,
    },
    redirect_url: `${hostUrl}/installed`,
    callback_urls: [`${hostUrl}/callback`],
    public: true,
    default_permissions: {
      pull_requests: 'write',
      statuses: 'write',
      issues: 'write',
      contents: 'read',
    },
    default_events: ['pull_request'],
    description: 'Runtime-verified trust for untrusted code. Scudo isolates pull requests & coding agents in disposable Fly.io Sprites.',
  });
}

function renderLandingPage(hostUrl, config = {}) {
  const manifest = getManifestJson(hostUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scudo · Runtime Security for Code You Didn't Write</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #111827;
      --border: #1f2937;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --accent: #10b981;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 1rem; }
    .container { max-width: 760px; width: 100%; }
    .header { text-align: center; margin-bottom: 2.5rem; }
    .badge { display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa; padding: 0.35rem 0.85rem; border-radius: 9999px; font-size: 0.825rem; font-weight: 500; margin-bottom: 1.25rem; }
    .badge .dot { width: 8px; height: 8px; background: var(--accent); border-radius: 50%; box-shadow: 0 0 8px var(--accent); }
    h1 { font-size: 2.75rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 0.75rem; background: linear-gradient(135deg, #fff 40%, #93c5fd); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    p.tagline { color: var(--muted); font-size: 1.15rem; line-height: 1.6; max-width: 620px; margin: 0 auto; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 1rem; padding: 2rem; margin-bottom: 1.5rem; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem; width: 100%; background: var(--primary); color: #fff; padding: 0.95rem 1.5rem; border-radius: 0.6rem; font-size: 1.05rem; font-weight: 600; text-decoration: none; border: none; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 14px 0 rgba(59, 130, 246, 0.4); }
    .btn:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
    .status-item { background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.85rem 1rem; }
    .status-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem; }
    .status-val { font-size: 0.95rem; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 0.4rem; }
    .status-val.ok { color: var(--accent); }
    pre { background: #000; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.85rem 1rem; font-size: 0.85rem; color: #a7f3d0; overflow-x: auto; margin-top: 0.75rem; }
    h3 { font-size: 1.15rem; margin-bottom: 0.5rem; }
    .manual-toggle { color: var(--muted); font-size: 0.85rem; text-decoration: underline; cursor: pointer; text-align: center; display: block; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge"><span class="dot"></span> Live on Fly.io Sprites</div>
      <h1>🛡️ Scudo</h1>
      <p class="tagline">Runtime-verified trust for code you didn't write. Disposable hardware VMs, deterministic syscall tracing, and typed AI safety verdicts for every PR.</p>
    </div>

    <div class="card">
      <h3>🚀 1-Click Turnkey Bot Onboarding</h3>
      <p style="color: var(--muted); font-size: 0.95rem; margin-bottom: 1.25rem;">
        Install the Scudo GitHub Bot directly to your organization or repository. No command lines, no server tokens, zero-friction setup.
      </p>

      <form action="https://github.com/settings/apps/new" method="post" target="_blank">
        <input type="hidden" name="manifest" value='${manifest.replace(/'/g, '&apos;')}'>
        <button type="submit" class="btn">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
          Install Scudo on GitHub
        </button>
      </form>

      <div class="status-grid">
        <div class="status-item">
          <div class="status-label">Engine</div>
          <div class="status-val ok">Ollama (${config.ollamaModel || 'tev1'})</div>
        </div>
        <div class="status-item">
          <div class="status-label">Sandbox</div>
          <div class="status-val ok">Fly.io Sprites</div>
        </div>
        <div class="status-item">
          <div class="status-label">Syscall Trace</div>
          <div class="status-val ok">Deterministic strace</div>
        </div>
        <div class="status-item">
          <div class="status-label">Cache Memory</div>
          <div class="status-val ok">Dual Persistent</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 0;">
      <h3>⚡ Quick Webhook Option</h3>
      <p style="color: var(--muted); font-size: 0.875rem;">Prefer wiring a single repository manually? Run this command:</p>
      <pre>gh api repos/&lt;owner&gt;/&lt;repo&gt;/hooks -X POST \\
  -f name=web \\
  -f config[url]="${hostUrl}/webhook" \\
  -f config[content_type]=json \\
  -f config[secret]="&lt;YOUR_SECRET&gt;" \\
  -F active=true \\
  -f events[]=pull_request</pre>
    </div>
  </div>
</body>
</html>`;
}

function renderInstalledPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Scudo · Installed Successfully</title>
  <style>
    body { background: #090d16; color: #f3f4f6; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; }
    .box { background: #111827; border: 1px solid #1f2937; padding: 3rem; border-radius: 1rem; max-width: 500px; }
    h1 { margin-bottom: 1rem; color: #10b981; }
    p { color: #9ca3af; line-height: 1.6; margin-bottom: 1.5rem; }
    a { color: #60a5fa; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="box">
    <h1>🛡️ Scudo is Armed</h1>
    <p>Scudo has been successfully installed on your repository. From now on, any new Pull Request or dependency bump will be automatically isolated and verified in a disposable Sprite VM.</p>
    <a href="/">← Return to Scudo Dashboard</a>
  </div>
</body>
</html>`;
}

module.exports = { renderLandingPage, renderInstalledPage };
