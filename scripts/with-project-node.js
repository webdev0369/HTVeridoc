/**
 * Run a command with this project's Node major from `.nvmrc` on PATH —
 * WITHOUT calling `nvm use` (which on Windows changes Node for the whole machine).
 *
 * Usage:
 *   node scripts/with-project-node.js pnpm dev
 *   node scripts/with-project-node.js node -v
 *
 * Looks for nvm installs under:
 *   NVM_HOME, NVM_DIR, ~/.config/herd/bin/nvm, %APPDATA%/nvm
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');

function readRequiredMajor() {
  const nvmrc = path.join(ROOT, '.nvmrc');
  if (!fs.existsSync(nvmrc)) return 20;
  const raw = fs.readFileSync(nvmrc, 'utf8').trim();
  const major = parseInt(raw.replace(/^v/i, '').split('.')[0], 10);
  return Number.isFinite(major) ? major : 20;
}

function nvmRoots() {
  const home = os.homedir();
  return [
    process.env.NVM_HOME,
    process.env.NVM_DIR,
    path.join(home, '.config', 'herd', 'bin', 'nvm'),
    path.join(process.env.APPDATA || '', 'nvm'),
    path.join(home, 'AppData', 'Roaming', 'nvm'),
  ].filter((p) => p && fs.existsSync(p));
}

function listVersionDirs(nvmRoot) {
  return fs
    .readdirSync(nvmRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^v\d+/.test(d.name))
    .map((d) => d.name);
}

function parseSemver(name) {
  const m = /^v(\d+)\.(\d+)\.(\d+)/.exec(name);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function pickVersionDir(nvmRoot, major) {
  const candidates = listVersionDirs(nvmRoot)
    .map((name) => ({ name, ver: parseSemver(name) }))
    .filter((x) => x.ver && x.ver[0] === major)
    .sort((a, b) => {
      for (let i = 0; i < 3; i++) {
        if (a.ver[i] !== b.ver[i]) return b.ver[i] - a.ver[i];
      }
      return 0;
    });
  if (!candidates.length) return null;
  return path.join(nvmRoot, candidates[0].name);
}

function resolveNodeBinDir(major) {
  for (const root of nvmRoots()) {
    const dir = pickVersionDir(root, major);
    if (dir && fs.existsSync(path.join(dir, 'node.exe'))) return dir;
    if (dir && fs.existsSync(path.join(dir, 'node'))) return dir;
  }
  return null;
}

function currentMajor() {
  const m = /^v?(\d+)/.exec(process.version);
  return m ? Number(m[1]) : 0;
}

const requiredMajor = readRequiredMajor();
const args = process.argv.slice(2);

if (!args.length) {
  console.error(
    `Usage: node scripts/with-project-node.js <command> [args...]\n` +
      `This project requires Node ${requiredMajor}+ (see .nvmrc).`,
  );
  process.exit(1);
}

let binDir = resolveNodeBinDir(requiredMajor);

// Already on the right major — just run (e.g. CI / correctly set shell).
if (!binDir && currentMajor() >= requiredMajor) {
  binDir = path.dirname(process.execPath);
}

if (!binDir) {
  console.error(
    `[with-project-node] Node ${requiredMajor}.x not found via nvm.\n` +
      `Install it once (does not need to be "active"):\n` +
      `  nvm install ${requiredMajor}\n` +
      `Then re-run. This script does NOT call "nvm use", so your other\n` +
      `projects can keep using Node 16 globally.`,
  );
  process.exit(1);
}

const env = { ...process.env };
const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
const existing = env[pathKey] || env.PATH || '';
env[pathKey] = `${binDir}${path.delimiter}${existing}`;
env.PATH = env[pathKey];

// Keep root .env aligned with branch (monolith vs micro) for migrations/seed/etc.
require('./sync-env').syncEnv();

const [cmd, ...cmdArgs] = args;
const nodeExe = path.join(
  binDir,
  process.platform === 'win32' ? 'node.exe' : 'node',
);

console.log(
  `[with-project-node] using ${binDir} (project Node ${requiredMajor}; shell is ${process.version})`,
);

const child = spawn(cmd, cmdArgs, {
  env,
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

child.on('error', (err) => {
  console.error(`[with-project-node] failed to start "${cmd}":`, err.message);
  console.error(`Tried PATH prefix: ${binDir}`);
  console.error(`Node there: ${nodeExe} exists=${fs.existsSync(nodeExe)}`);
  process.exit(1);
});
