/**
 * Sync branch-specific env profile → root `.env` (what Nest/Next load).
 *
 * Profiles (gitignored):
 *   .env.monolith  — main / monolith
 *   .env.micro     — micro-services branch
 *
 * Selection order:
 *   1) HTVERIDOC_ENV=monolith|micro
 *   2) git branch: main|master → monolith; name contains "micro" → micro
 *   3) whichever profile file exists
 *
 * Usage:
 *   node scripts/sync-env.js
 *   require('./sync-env').syncEnv()
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function currentBranch() {
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.status !== 0) return '';
  return String(r.stdout || '').trim();
}

function resolveMode() {
  const forced = String(process.env.HTVERIDOC_ENV || '')
    .trim()
    .toLowerCase();
  if (forced === 'monolith' || forced === 'micro') return forced;

  const branch = currentBranch();
  if (branch === 'main' || branch === 'master') return 'monolith';
  if (/micro/i.test(branch)) return 'micro';

  if (fs.existsSync(path.join(ROOT, '.env.monolith'))) return 'monolith';
  if (fs.existsSync(path.join(ROOT, '.env.micro'))) return 'micro';
  return null;
}

function syncEnv({ quiet = false } = {}) {
  const mode = resolveMode();
  const branch = currentBranch() || '(unknown)';

  if (!mode) {
    if (!quiet) {
      console.warn(
        '[sync-env] No profile selected and no .env.monolith / .env.micro found — leaving .env unchanged.',
      );
    }
    return { mode: null, branch, synced: false };
  }

  const src = path.join(ROOT, `.env.${mode}`);
  const dest = path.join(ROOT, '.env');

  if (!fs.existsSync(src)) {
    const hint =
      mode === 'monolith'
        ? 'cp .env.example .env.monolith'
        : 'cp .env.micro.example .env.micro';
    console.error(
      `[sync-env] Missing ${path.basename(src)} (mode=${mode}, branch=${branch}).\n` +
        `  Create it once: ${hint}\n` +
        `  Or force: HTVERIDOC_ENV=monolith|micro`,
    );
    process.exit(1);
  }

  fs.copyFileSync(src, dest);
  if (!quiet) {
    console.log(`[sync-env] ${path.basename(src)} → .env  (mode=${mode}, branch=${branch})`);
  }
  return { mode, branch, synced: true };
}

module.exports = { syncEnv, resolveMode, currentBranch };

if (require.main === module) {
  syncEnv();
}
