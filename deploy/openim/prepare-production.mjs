import { existsSync, lstatSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { privateDirectory, privateJson, runtimeSecret, writeRuntimeConfig } from './runtime-config.mjs';

function publicAddress(value, protocols, originOnly = false) {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      (originOnly && url.origin !== value) || /[\s'"$]/.test(value)) throw new Error('INVALID_PUBLIC_ADDRESS');
  return value.replace(/\/$/, '');
}

export function prepareProduction({ runtime, origin, imApiURL, imWsURL, fileOrigin }) {
  if (!runtime || !isAbsolute(runtime) || /[\r\n'"$]/.test(runtime)) throw new Error('ABSOLUTE_RUNTIME_REQUIRED');
  runtime = resolve(runtime);
  origin = publicAddress(origin, ['https:'], true);
  imApiURL = publicAddress(imApiURL ?? `${origin}/im-api`, ['https:']);
  imWsURL = publicAddress(imWsURL ?? `${origin.replace(/^https:/, 'wss:')}/im-ws`, ['wss:']);
  fileOrigin = publicAddress(fileOrigin, ['https:'], true);
  // The supplied reverse-proxy template has these exact same-origin mounts.
  if (imApiURL !== `${origin}/im-api` || imWsURL !== `${origin.replace(/^https:/, 'wss:')}/im-ws` ||
      fileOrigin === origin) throw new Error('PUBLIC_PROXY_LAYOUT_MISMATCH');
  const manifest = { format: 1, mode: 'production', runtime, origin, imApiURL, imWsURL, fileOrigin };
  const path = resolve(runtime, 'production.json');
  if (existsSync(runtime) && readdirSync(runtime).length && !existsSync(path)) throw new Error('NONEMPTY_RUNTIME_REFUSED');
  privateDirectory(runtime);
  let prepared = false;
  if (existsSync(path)) {
    const prior = privateJson(path);
    prepared = prior.prepared;
    delete prior.prepared;
    if (typeof prepared !== 'boolean' || JSON.stringify(prior) !== JSON.stringify(manifest)) throw new Error('PRODUCTION_CONFIGURATION_CONFLICT');
  } else writeFileSync(path, JSON.stringify({ ...manifest, prepared: false }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const research = resolve(runtime, 'research');
  privateDirectory(research);
  if (existsSync(resolve(research, 'accounts.json'))) throw new Error('SYNTHETIC_RUNTIME_REFUSED');
  if (prepared && ['im-admin.secret', 'im-callback.key', 'lab-credentials.key', 'mongo.secret', 'redis.secret', 'minio.secret']
      .some(name => !existsSync(resolve(runtime, name)))) throw new Error('MISSING_EXISTING_PRODUCTION_SECRET');
  if (!prepared && existsSync(resolve(research, 'platform.sqlite'))) throw new Error('DATABASE_WITH_INCOMPLETE_RUNTIME');
  const imSecret = runtimeSecret(runtime, 'im-admin.secret');
  const callbackKey = runtimeSecret(runtime, 'im-callback.key');
  runtimeSecret(runtime, 'lab-credentials.key');
  const passwords = Object.fromEntries(['mongo', 'redis', 'minio'].map(name => [name, runtimeSecret(runtime, `${name}.secret`)]));
  writeRuntimeConfig(runtime, callbackKey);
  const env = [
    `RAP_OPENIM_RUNTIME='${runtime.replaceAll('\\', '/')}'`,
    `APP_ORIGIN=${origin}`, `OPENIM_PUBLIC_API_URL=${imApiURL}`,
    `OPENIM_PUBLIC_WS_URL=${imWsURL}`, `OPENIM_PUBLIC_FILE_URL=${fileOrigin}`,
    `MONGO_PASSWORD=${passwords.mongo}`, `REDIS_PASSWORD=${passwords.redis}`,
    `MINIO_PASSWORD=${passwords.minio}`, `OPENIM_SECRET=${imSecret}`,
  ].join('\n') + '\n';
  const envPath = resolve(runtime, 'compose.env');
  if (existsSync(envPath)) privateJsonCheck(envPath);
  writeFileSync(envPath, env, { mode: 0o600 });
  writeFileSync(path, JSON.stringify({ ...manifest, prepared: true }, null, 2) + '\n', { mode: 0o600 });
  return manifest;
}

// Same private-file checks, without trying to parse the Compose env as JSON.
function privateJsonCheck(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() ||
      (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) throw new Error('PRIVATE_FILE_REQUIRED');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), values = {};
    if (args.length % 2) throw new Error('EXPECTED_FLAG_VALUE_PAIRS');
    const names = { '--runtime': 'runtime', '--origin': 'origin', '--im-api': 'imApiURL', '--im-ws': 'imWsURL', '--files': 'fileOrigin' };
    for (let i = 0; i < args.length; i += 2) {
      const name = names[args[i]];
      if (!name || values[name]) throw new Error('INVALID_ARGUMENT');
      values[name] = args[i + 1];
    }
    const result = prepareProduction(values);
    console.log(`Production runtime prepared for ${result.origin}; secrets remain in private files.`);
    console.log('No database, lab, accounts or tokens were created. Run explicit migrate and bootstrap next.');
  } catch (error) {
    console.error(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PRODUCTION_PREPARATION_FAILED');
    process.exitCode = 1;
  }
}
