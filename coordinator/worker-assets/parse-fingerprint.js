'use strict';
// Reads strace's syscall-level trace plus a before/after filesystem snapshot from
// a Worker Sprite's install run, and normalizes them into one JSON "fingerprint"
// object printed to stdout. This describes what happened — it does not judge it;
// that's the verdict engine's job (the TypeSafeAI call), not the monitor's.
const fs = require('fs');
const path = require('path');

const logDir = process.argv[2];
const srcDir = process.argv[3];

function readLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const straceLines = readLines(path.join(logDir, 'strace.log'));

// --- network: real connect() syscalls, not polled snapshots — catches connections
// that open and close faster than any poll interval could sample. ---
const CONNECT_V4_RE = /connect\(\d+,\s*\{sa_family=AF_INET,\s*sin_port=htons\((\d+)\),\s*sin_addr=inet_addr\("([^"]+)"\)/;
const CONNECT_V6_RE = /connect\(\d+,\s*\{sa_family=AF_INET6,\s*sin6_port=htons\((\d+)\).*?inet_pton\(AF_INET6,\s*"([^"]+)"/;

const hostsContacted = new Set();
for (const line of straceLines) {
  const m4 = line.match(CONNECT_V4_RE);
  if (m4) {
    const [, port, addr] = m4;
    // port 0 and 53 are DNS/pre-connect noise, not a real destination worth flagging
    if (port !== '53' && port !== '0') hostsContacted.add(`${addr}:${port}`);
    continue;
  }
  const m6 = line.match(CONNECT_V6_RE);
  if (m6) {
    const [, port, addr] = m6;
    if (port !== '53' && port !== '0') hostsContacted.add(`[${addr}]:${port}`);
  }
}

// --- processes: every successfully-exec'd program (execve returning 0), by basename.
// Unlike comm-name polling, this sees the real argv too. ---
const EXECVE_RE = /execve\("([^"]+)",\s*\[(.*?)\],.*?\)\s*=\s*0\s*$/;
const EXPECTED_BUILD_TOOLS = new Set([
  'node', 'npm', 'npx', 'sh', 'bash', 'env', 'which', 'tar', 'gzip', 'uname',
  'make', 'cc1', 'gcc', 'g++', 'c++', 'cc', 'ld', 'ld.gold', 'ld.lld', 'as', 'ar',
  'ranlib', 'strip', 'pkg-config', 'cmake', 'ninja', 'node-gyp',
  'python', 'python3', 'pip', 'pip3', 'wheel', 'cargo', 'rustc', 'gem', 'bundle',
  'rm', 'mkdir', 'mv', 'cp', 'touch',
  'sort', 'uniq', 'head', 'tail', 'cat', 'grep', 'sed', 'awk', 'tr', 'find',
  // routine POSIX utilities used internally by nvm/npm's own shell wrappers —
  // seen in every install regardless of what the package itself does.
  'dirname', 'basename', 'readlink', 'expr', 'date', 'id', 'pwd', 'true',
  'false', 'wc', 'cut', 'nproc', 'getconf', 'dim', 'test', 'xargs',
]);
const execs = [];
for (const line of straceLines) {
  const m = line.match(EXECVE_RE);
  if (!m) continue;
  const [, execPath, argvRaw] = m;
  execs.push({ path: execPath, argv_preview: argvRaw.slice(0, 200) });
}
const unexpectedProcesses = execs
  .map((e) => ({ ...e, basename: path.basename(e.path) }))
  .filter((e) => !EXPECTED_BUILD_TOOLS.has(e.basename));

// --- sensitive file access, straight from openat()/open() syscalls (sees reads too,
// not just writes — before/after diffing below only catches writes). ---
const OPEN_RE = /open(?:at)?\((?:AT_FDCWD,\s*)?(?:\d+,\s*)?"([^"]+)"/;
// Deliberately narrow: routine reads of DNS/TLS/locale system config
// (/etc/resolv.conf, /etc/ssl/*, /etc/localtime, etc.) and npm's own .npmrc are
// normal for *every* install and were flooding this signal with noise — see
// .internal/SECURITY_INTERNAL.md for the false-positive tuning note. known_hosts
// is excluded because it's a host-key cache, not a secret.
const SENSITIVE_PATTERNS = [
  /\.ssh\/(?!known_hosts$)/,
  /\.aws\//,
  /\.netrc/,
  /\.env$/,
  /\.gnupg\//,
  /\/etc\/shadow/,
  /\/etc\/sudoers/,
  /ssh_host_.*_key/,
];
const sensitiveOpens = new Set();
for (const line of straceLines) {
  const m = line.match(OPEN_RE);
  if (!m) continue;
  const filePath = m[1];
  if (SENSITIVE_PATTERNS.some((re) => re.test(filePath))) sensitiveOpens.add(filePath);
}

// --- filesystem before/after diff: secondary signal, catches writes via mechanisms
// strace's open/openat trace might miss (e.g. a statically-linked binary using raw
// syscalls strace wasn't told to watch). ---
function parseFsSnapshot(lines) {
  const map = new Map();
  for (const line of lines) {
    const idx = line.indexOf(' ');
    if (idx === -1) continue;
    map.set(line.slice(idx + 1), line.slice(0, idx));
  }
  return map;
}
const KNOWN_BENIGN_PATTERNS = [
  new RegExp(`^${logDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`),
  /\.npm\/_logs\//,
  /\.npm\/_update-notifier-last-checked$/,
  /\.npm\/_cacache\//,
  /\.cache\/pip\//,
  /\.cargo\/(registry|git)\//,
  /\.node-gyp\//,
];
const fsBefore = parseFsSnapshot(readLines(path.join(logDir, 'fs_before.txt')));
const fsAfter = parseFsSnapshot(readLines(path.join(logDir, 'fs_after.txt')));
const newOrChangedFiles = [];
for (const [filePath, mtime] of fsAfter) {
  if (KNOWN_BENIGN_PATTERNS.some((re) => re.test(filePath))) continue;
  if (!fsBefore.has(filePath) || fsBefore.get(filePath) !== mtime) newOrChangedFiles.push(filePath);
}
const outsideRepoWrites = newOrChangedFiles.filter((f) => !f.startsWith(srcDir));

let exitCode = null;
try {
  exitCode = parseInt(fs.readFileSync(path.join(logDir, 'exit_code.txt'), 'utf8').trim(), 10);
} catch {
  // leave null
}

const fingerprint = {
  exit_code: exitCode,
  hosts_contacted: [...hostsContacted].sort(),
  sensitive_path_opens: [...sensitiveOpens],
  unexpected_processes: unexpectedProcesses,
  outside_repo_writes: outsideRepoWrites.slice(0, 50),
  new_or_changed_file_count: newOrChangedFiles.length,
};

process.stdout.write(JSON.stringify(fingerprint));
