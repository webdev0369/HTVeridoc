/**
 * Frees API/web ports and clears a locked Next.js .next folder before `pnpm dev`.
 * Avoids Windows EADDRINUSE / EPERM when a previous stack is still running.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Monolith + gateway + microservice slices (dev-micro)
const PORTS = [3000, 3001, 3002, 3011, 3012, 3013, 3014, 3015];

function killPort(port) {
  if (process.platform === 'win32') {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (Number.isFinite(pid) && pid > 0) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          console.log(`[free-dev-ports] killed PID ${pid} (port ${port})`);
        } catch {
          /* already gone */
        }
      }
    } catch {
      /* nothing listening */
    }
    return;
  }

  try {
    execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: 'ignore' });
  } catch {
    /* nothing listening */
  }
}

for (const port of PORTS) {
  killPort(port);
}

// Only wipe .next when explicitly asked — wiping while Next is still
// shutting down causes ENOENT on routes-manifest.json mid-request.
const cleanNext =
  process.argv.includes('--clean-next') ||
  process.env.CLEAN_NEXT === '1';
if (cleanNext) {
  // Give killed Next processes a moment to release file locks (Windows).
  const start = Date.now();
  while (Date.now() - start < 400) {
    /* busy wait intentionally short */
  }
  const nextDir = path.join(__dirname, '..', 'apps', 'web', '.next');
  try {
    fs.rmSync(nextDir, { recursive: true, force: true });
    console.log('[free-dev-ports] cleared apps/web/.next');
  } catch {
    /* not present or already cleared */
  }
}
