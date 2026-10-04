import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// These names are verified against the fixed v3.8.3-patch.15 config. Keep the
// local and production stacks on the same fail-closed callback policy.
export const beforeCallbacks = [
  'beforeSendSingleMsg', 'beforeSendGroupMsg', 'beforeMsgModify',
  'beforeAddFriend', 'beforeAddFriendAgree', 'beforeImportFriends',
  'beforeCreateGroup', 'beforeMemberJoinGroup', 'beforeApplyJoinGroup',
  'beforeInviteUserToGroup', 'beforeSetGroupMemberInfo',
  'beforeUpdateUserInfo', 'beforeUpdateUserInfoEx',
  'beforeSetGroupInfo', 'beforeSetGroupInfoEx', 'beforeUserRegister',
];
export const afterCallbacks = ['afterSendSingleMsg', 'afterSendGroupMsg',
  'afterQuitGroup', 'afterKickGroupMember', 'afterDismissGroup',
  'afterTransferGroupOwner', 'afterSetGroupMemberInfo',
  'afterSetGroupInfo', 'afterSetGroupInfoEx'];

export function privateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) {
    throw new Error('PRIVATE_DIRECTORY_REQUIRED');
  }
}

export function privateJson(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384 ||
      (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) {
    throw new Error('PRIVATE_FILE_REQUIRED');
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function runtimeSecret(runtime, name) {
  const path = resolve(runtime, name);
  if (!existsSync(path)) writeFileSync(path, `${randomBytes(32).toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 ||
      (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) {
    throw new Error('PRIVATE_SECRET_REQUIRED');
  }
  const value = readFileSync(path, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('INVALID_RUNTIME_SECRET');
  return value;
}

export function writeRuntimeConfig(runtime, callbackKey) {
  const url = `http://research-api:3217/api/v1/im/callback/${callbackKey}`;
  const hooks = [`url: ${JSON.stringify(url)}`,
    ...beforeCallbacks.map(name => `${name}:\n  enable: true\n  timeout: 5\n  failedContinue: false`),
    ...afterCallbacks.map(name => `${name}:\n  enable: true\n  timeout: 5`),
  ].join('\n') + '\n';
  // One process per role is a small-lab trial profile, not a capacity claim.
  const roles = ['openim-api', 'openim-crontask', 'openim-rpc-user',
    'openim-msggateway', 'openim-push', 'openim-msgtransfer',
    'openim-rpc-conversation', 'openim-rpc-auth', 'openim-rpc-group',
    'openim-rpc-friend', 'openim-rpc-msg', 'openim-rpc-third'];
  const files = {
    'webhooks.yml': hooks,
    'start-config.yml': `serviceBinaries:\n${roles.map(role => `  ${role}: 1`).join('\n')}\ntoolBinaries:\n  - check-free-memory\n  - check-component\n  - seq\nmaxFileDescriptors: 10000\n`,
  };
  for (const [name, value] of Object.entries(files)) {
    const path = resolve(runtime, name);
    if (existsSync(path)) {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() ||
          (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) throw new Error('PRIVATE_FILE_REQUIRED');
    }
    writeFileSync(path, value, { mode: 0o600 });
  }
}
