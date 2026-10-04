import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.env.NODE_ENV !== 'test' || !['api', 'worker'].includes(process.argv[2])) {
  throw new Error('This container entry point requires NODE_ENV=test and api|worker');
}
// Docker Desktop bind-mounted secrets may report 0444 even when created with
// mode 0600 on Windows. Copy into each container's private Linux directory so
// the API's file-permission checks apply to an actual 0600 file.
const privateDir = '/run/research-private';
mkdirSync(privateDir, { recursive: true, mode: 0o700 });
for (const [variable, name] of [
  ['LAB_CREDENTIAL_KEY_FILE', 'lab-key'], ['OPENIM_SECRET_FILE', 'im-admin'],
  ['OPENIM_CALLBACK_KEY_FILE', 'im-callback'],
]) {
  const source = process.env[variable];
  if (!source) throw new Error(`Missing mounted secret: ${variable}`);
  const value = readFileSync(source, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid mounted secret: ${variable}`);
  const target = resolve(privateDir, name);
  writeFileSync(target, `${value}\n`, { mode: 0o600 });
  process.env[variable] = target;
}
await import(process.argv[2] === 'api' ? './start-test-api.mjs' : '../../apps/api/dist/worker.js');
