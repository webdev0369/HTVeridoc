/**
 * Fail fast if this shell's Node is too old for HTVeriDoc.
 * Prefer `pnpm dev` which uses with-project-node.js and does not need nvm use.
 */
const fs = require('fs');
const path = require('path');

const nvmrc = path.join(__dirname, '..', '.nvmrc');
const required = fs.existsSync(nvmrc)
  ? parseInt(fs.readFileSync(nvmrc, 'utf8').trim().replace(/^v/i, ''), 10)
  : 20;
const major = parseInt(process.version.slice(1), 10);

if (major < required) {
  console.error(
    `\n[HTVeriDoc] This command is running on ${process.version}, but the project needs Node ${required}+.\n` +
      `Do NOT run "nvm use ${required}" if you need Node 16 for another app (Windows nvm changes Node globally).\n\n` +
      `Use the project scripts instead (they pin Node ${required} for this repo only):\n` +
      `  pnpm dev\n` +
      `  pnpm dev:api\n` +
      `  pnpm migration:run\n\n` +
      `One-time install (keep your global Node on 16):\n` +
      `  nvm install ${required}\n`,
  );
  process.exit(1);
}
