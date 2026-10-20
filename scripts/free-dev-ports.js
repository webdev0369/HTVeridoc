/**
 * Frees API/web ports and clears a locked Next.js .next folder before `pnpm dev`.
 * Avoids Windows EADDRINUSE / EPERM when a previous stack is still running.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORTS = [3000, 3001, 3002, 8080];

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

const nextDir = path.join(__dirname, '..', 'apps', 'web', '.next');
try {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log('[free-dev-ports] cleared apps/web/.next');
} catch {
  /* not present or already cleared */
}
