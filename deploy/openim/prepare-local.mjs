import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This stack contains synthetic accounts only. No existing lab keys are read.
const repository = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && !isAbsolute(args[0]))) {
  throw new Error('Usage: node deploy/openim/prepare-local.mjs [absolute-runtime-directory]');
}
const runtime = args[0] ? resolve(args[0]) : resolve(repository, '.runtime/openim-local');
if (/[\r\n'"$]/.test(runtime)) throw new Error('Unsupported runtime path');
mkdirSync(runtime, { recursive: true, mode: 0o700 });
mkdirSync(resolve(runtime, 'research'), { recursive: true, mode: 0o700 });

function secret(name) {
  const path = resolve(runtime, name);
  if (!existsSync(path)) writeFileSync(path, `${randomBytes(32).toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128) throw new Error(`Invalid local secret file: ${name}`);
  const value = readFileSync(path, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid local secret format: ${name}`);
  if (process.platform !== 'win32' && (stat.mode & 0o007) !== 0) throw new Error(`Local secret must not be world readable: ${name}`);
  return value;
}
const imSecret = secret('im-admin.secret');
const callbackKey = secret('im-callback.key');
secret('lab-credentials.key');
const passwords = Object.fromEntries(['mongo', 'redis', 'minio'].map(name => [name, secret(`${name}.secret`)]));

// Keys verified against open-im-server v3.8.3-patch.15/config/webhooks.yml.
// Unsupported hook names do not provide protection. Group owner remains the
// backend IM administrator, so SDK users cannot kick/transfer/dismiss groups.
const before = [
  'beforeSendSingleMsg', 'beforeSendGroupMsg', 'beforeMsgModify',
  'beforeAddFriend', 'beforeAddFriendAgree', 'beforeImportFriends',
  'beforeCreateGroup', 'beforeMemberJoinGroup', 'beforeApplyJoinGroup',
  'beforeInviteUserToGroup', 'beforeSetGroupMemberInfo',
  'beforeUpdateUserInfo', 'beforeUpdateUserInfoEx',
  'beforeSetGroupInfo', 'beforeSetGroupInfoEx', 'beforeUserRegister',
];
const after = ['afterSendSingleMsg', 'afterSendGroupMsg', 'afterQuitGroup',
  'afterKickGroupMember', 'afterDismissGroup', 'afterTransferGroupOwner',
  'afterSetGroupMemberInfo', 'afterSetGroupInfo', 'afterSetGroupInfoEx'];
const url = `http://research-api:3217/api/v1/im/callback/${callbackKey}`;
const webhooks = [`url: ${JSON.stringify(url)}`,
  ...before.map(name => `${name}:\n  enable: true\n  timeout: 5\n  failedContinue: false`),
  ...after.map(name => `${name}:\n  enable: true\n  timeout: 5`),
].join('\n') + '\n';
writeFileSync(resolve(runtime, 'webhooks.yml'), webhooks, { mode: 0o600 });
// Use one process per role for the small synthetic lab instead of the upstream
// eight push/eight transfer processes. This is not a production sizing profile.
const roles = ['openim-api', 'openim-crontask', 'openim-rpc-user',
  'openim-msggateway', 'openim-push', 'openim-msgtransfer',
  'openim-rpc-conversation', 'openim-rpc-auth', 'openim-rpc-group',
  'openim-rpc-friend', 'openim-rpc-msg', 'openim-rpc-third'];
writeFileSync(resolve(runtime, 'start-config.yml'),
  `serviceBinaries:\n${roles.map(role => `  ${role}: 1`).join('\n')}\ntoolBinaries:\n  - check-free-memory\n  - check-component\n  - seq\nmaxFileDescriptors: 10000\n`, { mode: 0o600 });
const env = [
  `RAP_OPENIM_RUNTIME='${runtime.replaceAll('\\', '/')}'`,
  `MONGO_PASSWORD=${passwords.mongo}`, `REDIS_PASSWORD=${passwords.redis}`,
  `MINIO_PASSWORD=${passwords.minio}`, `OPENIM_SECRET=${imSecret}`,
].join('\n') + '\n';
writeFileSync(resolve(runtime, 'compose.env'), env, { mode: 0o600 });
console.log(`Prepared synthetic OpenIM runtime: ${runtime}`);
console.log('Secrets were generated/reused locally; no credentials are printed.');
console.log('Start only after the research API implements every enabled callback.');
