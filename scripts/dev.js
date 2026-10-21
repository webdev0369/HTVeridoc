/**
 * HTVeriDoc dev entry that works even when the shell default is Node 16.
 *
 * Why not `pnpm dev` on Node 16?
 *   pnpm 9 refuses to start on Node < 18, so package.json scripts never run.
 *
 * This file:
 *   1) Re-executes itself under nvm's Node 20 if needed (no `nvm use`)
 *   2) Frees ports
 *   3) Starts API + web via pnpm from that Node 20 folder
 *
 * Usage (from repo root):
 *   node scripts/dev.js
 *   ./dev.cmd          (Windows)
 *   bash dev.sh        (Git Bash)
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
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

function parseSemver(name) {
  const m = /^v(\d+)\.(\d+)\.(\d+)/.exec(name);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function findNodeMajorDir(major) {
  for (const root of nvmRoots()) {
    const dirs = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith(`v${major}.`))
      .map((d) => ({ name: d.name, ver: parseSemver(d.name) }))
      .filter((x) => x.ver)
      .sort((a, b) => {
        for (let i = 0; i < 3; i++) {
          if (a.ver[i] !== b.ver[i]) return b.ver[i] - a.ver[i];
        }
        return 0;
      });
    if (!dirs.length) continue;
    const dir = path.join(root, dirs[0].name);
    const exe = path.join(
      dir,
      process.platform === 'win32' ? 'node.exe' : 'node',
    );
    if (fs.existsSync(exe)) return { dir, exe };
  }
  return null;
}

function majorOf(version) {
  return parseInt(String(version).replace(/^v/, ''), 10) || 0;
}

function envWithNodeFirst(binDir) {
  const env = { ...process.env };
  const key = process.platform === 'win32' ? 'Path' : 'PATH';
  const cur = env[key] || env.PATH || '';
  env[key] = `${binDir}${path.delimiter}${cur}`;
  env.PATH = env[key];
  return env;
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolve(code ?? 1);
    });
    child.on('error', reject);
  });
}

async function main() {
  const currentMajor = majorOf(process.version);

  if (currentMajor < REQUIRED_MAJOR) {
    const found = findNodeMajorDir(REQUIRED_MAJOR);
    if (!found) {
      console.error(
        `[dev] Need Node ${REQUIRED_MAJOR}+ but none found via nvm.\n` +
          `  nvm install ${REQUIRED_MAJOR}\n` +
          `(Do not use "nvm use" if your other app needs Node 16.)`,
      );
      process.exit(1);
    }
    console.log(
      `[dev] shell is ${process.version}; re-exec under ${found.dir}`,
    );
    const r = spawnSync(found.exe, [__filename, ...process.argv.slice(2)], {
      cwd: ROOT,
      env: envWithNodeFirst(found.dir),
      stdio: 'inherit',
    });
    process.exit(r.status ?? 1);
  }

  const binDir = path.dirname(process.execPath);
  const env = envWithNodeFirst(binDir);
  console.log(`[dev] Node ${process.version} · ${binDir}`);

  // Branch profile → root .env (monolith on main, micro on micro-services)
  require('./sync-env').syncEnv();

  // Free ports (same Node is fine)
  const free = spawnSync(process.execPath, [path.join(__dirname, 'free-dev-ports.js')], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });
  if ((free.status ?? 1) !== 0) process.exit(free.status ?? 1);

  const pnpmCmd = process.platform === 'win32' ? 'pnpm.CMD' : 'pnpm';
  const code = await run(
    pnpmCmd,
    [
      '--parallel',
      '--filter',
      '@htveridoc/api',
      '--filter',
      '@htveridoc/web',
      'dev',
    ],
    env,
  );
  process.exit(code);
}

main().catch((err) => {
  console.error('[dev] failed:', err);
  process.exit(1);
});
