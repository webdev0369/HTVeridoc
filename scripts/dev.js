/**
 * Local entry — runs the microservice stack (gateway + 5 APIs + web).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const r = spawnSync(process.execPath, [path.join(__dirname, 'dev-micro.js')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status ?? 1);
