/**
 * Local microservice mode: gateway (:3001) + 5 API slices + web.
 * Builds API once, then runs 5 node processes (avoids nest --watch fighting over dist/).
 *
 *   node scripts/dev-micro.js
 */
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(ROOT, 'apps', 'api');
const REQUIRED_MAJOR = 20;

function nvmRoots() {
  const home = os.homedir();
  return [
    process.env.NVM_HOME,
    process.env.NVM_DIR,
    path.join(home, '.config', 'herd', 'bin', 'nvm'),
    path.join(process.env.APPDATA || '', 'nvm'),
  ].filter((p) => p && fs.existsSync(p));
}

function findNode20() {
  const major = parseInt(String(process.version).replace(/^v/, ''), 10) || 0;
  if (major >= REQUIRED_MAJOR) {
    return { exe: process.execPath, binDir: path.dirname(process.execPath) };
  }
  for (const root of nvmRoots()) {
    const dirs = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith(`v${REQUIRED_MAJOR}.`))
      .map((d) => d.name)
      .sort()
      .reverse();
    for (const name of dirs) {
      const exe = path.join(
        root,
        name,
        process.platform === 'win32' ? 'node.exe' : 'node',
      );
      if (fs.existsSync(exe)) {
        return { exe, binDir: path.dirname(exe) };
      }
    }
  }
  return null;
}

function envWithNode(binDir, extra = {}) {
  const env = { ...process.env, ...extra };
  const key = process.platform === 'win32' ? 'Path' : 'PATH';
  env[key] = `${binDir}${path.delimiter}${env[key] || ''}`;
  env.PATH = env[key];
  return env;
}

const slices = [
  { name: 'identity', port: 3011 },
  { name: 'documents', port: 3012 },
  { name: 'processing', port: 3013 },
  { name: 'review', port: 3014 },
  { name: 'integrations', port: 3015 },
];

async function main() {
  const node = findNode20();
  if (!node) {
    console.error('[dev-micro] Need Node 20+');
    process.exit(1);
  }

  const pnpmCmd = process.platform === 'win32' ? 'pnpm.CMD' : 'pnpm';
  const baseEnv = envWithNode(node.binDir);
  const children = [];

  console.log('[dev-micro] freeing ports…');
  const free = spawnSync(
    node.exe,
    [path.join(__dirname, 'free-dev-ports.js')],
    { cwd: ROOT, env: baseEnv, stdio: 'inherit' },
  );
  if ((free.status ?? 1) !== 0) {
    console.warn('[dev-micro] free-dev-ports exited non-zero; continuing');
  }

  console.log('[dev-micro] building @htveridoc/api…');
  const build = spawnSync(pnpmCmd, ['--filter', '@htveridoc/api', 'build'], {
    cwd: ROOT,
    env: baseEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if ((build.status ?? 1) !== 0) {
    console.error('[dev-micro] API build failed');
    process.exit(build.status ?? 1);
  }

  const gatewayMods = path.join(ROOT, 'apps', 'gateway', 'node_modules');
  if (!fs.existsSync(gatewayMods)) {
    console.log('[dev-micro] installing gateway deps…');
    const inst = spawnSync(
      pnpmCmd,
      ['install', '--filter', '@htveridoc/gateway...'],
      {
        cwd: ROOT,
        env: baseEnv,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      },
    );
    if ((inst.status ?? 1) !== 0) process.exit(inst.status ?? 1);
  }

  function startPnpm(label, args, extraEnv) {
    console.log(`[dev-micro] start ${label}`);
    const child = spawn(pnpmCmd, args, {
      cwd: ROOT,
      env: envWithNode(node.binDir, extraEnv),
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    children.push(child);
  }

  for (const s of slices) {
    console.log(`[dev-micro] start api:${s.name} :${s.port}`);
    const child = spawn(node.exe, ['dist/main.js'], {
      cwd: API_DIR,
      env: envWithNode(node.binDir, {
        SERVICE_NAME: s.name,
        API_PORT: String(s.port),
        PORT: String(s.port),
      }),
      stdio: 'inherit',
    });
    children.push(child);
  }

  startPnpm('gateway', ['--filter', '@htveridoc/gateway', 'dev'], {
    GATEWAY_PORT: '3001',
    IDENTITY_URL: 'http://127.0.0.1:3011',
    DOCUMENTS_URL: 'http://127.0.0.1:3012',
    PROCESSING_URL: 'http://127.0.0.1:3013',
    REVIEW_URL: 'http://127.0.0.1:3014',
    INTEGRATIONS_URL: 'http://127.0.0.1:3015',
  });

  startPnpm('web', ['--filter', '@htveridoc/web', 'dev'], {});

  const shutdown = () => {
    for (const c of children) {
      try {
        c.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[dev-micro] failed:', err);
  process.exit(1);
});
