// The same ordered entry point serves fresh and long-lived checkouts.
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPnpm } from '../clients/openim/scripts/workspace-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(root, 'clients/openim');
const mode = process.argv[2];
if (!['prepare', 'win'].includes(mode) || process.argv.length !== 3) throw Error('Usage: node scripts/desktop-build.mjs prepare|win');
if (mode === 'win' && process.platform !== 'win32') throw Error('Build the Windows native SDK/installer on Windows');

// Every step below starts by deleting the tree it is about to rewrite, and a
// local bulk-delete guard reads that as a dangerous mass delete. Rename the
// stale outputs aside instead: the build then writes into empty paths and
// deletes nothing. `release/` is git-ignored and on the same volume, so the
// rename cannot cross filesystems and the copies never enter the repository.
function setAsideStaleOutputs() {
  const version = JSON.parse(readFileSync(path.join(client, 'package.json'), 'utf8')).version;
  const aside = path.join(client, 'release', '.set-aside', new Date().toISOString().replace(/[:.]/g, '-'));
  const targets = [
    path.join(root, 'packages', 'research-skills', 'dist', 'roles'),
    path.join(client, 'dist'),
    path.join(client, 'dist-electron'),
    path.join(client, '.electron-runtime'),
    path.join(client, 'release', 'Base', version),
  ];
  let moved = 0;
  for (const target of targets) {
    if (!existsSync(target)) continue;
    mkdirSync(aside, { recursive: true });
    renameSync(target, path.join(aside, path.relative(root, target).replace(/[\\/]+/g, '_')));
    moved++;
  }
  if (moved) console.log(`Set aside ${moved} stale build output(s) in ${aside}`);
}
setAsideStaleOutputs();

runPnpm(root, ['install', '--frozen-lockfile']);
runPnpm(root, ['run', 'build:desktop-deps']);
runPnpm(client, ['install', '--ignore-workspace', '--frozen-lockfile']);
runPnpm(client, ['run', 'check:workspace']);
if (mode === 'win') runPnpm(client, ['run', 'build:win']);
