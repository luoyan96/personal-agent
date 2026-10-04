import { mkdirSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

// Explicit production-only entry: never runs seed, provisions synthetic accounts
// or implicitly migrates a database when an API/worker starts.
try {
  const command = process.argv[2];
  if (process.env.NODE_ENV !== 'production' || process.argv.length !== 3 ||
      !['api', 'worker', 'migrate', 'bootstrap', 'operate', 'check'].includes(command)) {
    throw new Error('PRODUCTION_COMMAND_REQUIRED');
  }
  const privateDir = process.env.RAP_PRIVATE_SECRET_DIR ?? '/run/research-private';
  if (!isAbsolute(privateDir)) throw new Error('PRIVATE_DIRECTORY_REQUIRED');
  mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  const dir = lstatSync(privateDir);
  if (!dir.isDirectory() || dir.isSymbolicLink() ||
      (process.platform !== 'win32' && (dir.mode & 0o077) !== 0)) throw new Error('PRIVATE_DIRECTORY_REQUIRED');
  // Standalone Compose secrets can be 0444 inside the container. The sources
  // are root-only on the host; use actual 0600 per-container copies at runtime.
  for (const [variable, name] of [
    ['LAB_CREDENTIAL_KEY_FILE', 'lab-key'], ['OPENIM_SECRET_FILE', 'im-admin'],
    ['OPENIM_CALLBACK_KEY_FILE', 'im-callback'],
  ]) {
    const source = process.env[variable];
    if (!source || !isAbsolute(source)) throw new Error('MOUNTED_SECRET_REQUIRED');
    const stat = lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128) throw new Error('INVALID_MOUNTED_SECRET');
    const value = readFileSync(source, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('INVALID_MOUNTED_SECRET');
    const target = resolve(privateDir, name);
    if (source === target && process.platform !== 'win32' && (stat.mode & 0o077) !== 0) throw new Error('PRIVATE_SECRET_REQUIRED');
    if (source !== target) {
      try {
        const old = lstatSync(target);
        if (!old.isFile() || old.isSymbolicLink() ||
            (process.platform !== 'win32' && (old.mode & 0o077) !== 0)) throw new Error('PRIVATE_SECRET_REQUIRED');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      writeFileSync(target, `${value}\n`, { mode: 0o600 });
    }
    process.env[variable] = target;
  }
  if (command === 'bootstrap') await import('./bootstrap-lab.mjs');
  else if (command === 'check') await import('./check-production.mjs');
  else {
    const script = { api: 'main', worker: 'worker', migrate: 'manage', operate: 'operate' }[command];
    process.argv = [process.argv[0], resolve(`apps/api/dist/${script}.js`), ...(command === 'migrate' ? ['migrate'] : [])];
    await import(`../../apps/api/dist/${script}.js`);
  }
} catch (error) {
  console.error(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PRODUCTION_OPERATION_FAILED');
  process.exitCode = 1;
}
