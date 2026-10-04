import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { readConfig } from '../../apps/api/dist/config.js';
import { openDatabase, checkDatabase } from '../../apps/api/dist/database.js';
import { maintain } from '../../apps/api/dist/maintenance.js';
import { hash } from '../../apps/api/dist/auth.js';
import { processGuard } from '../../apps/api/dist/process-guard.js';
import { privateDirectory, privateJson } from './runtime-config.mjs';

const config = readConfig();
if (config.mode !== 'production') throw new Error('PRODUCTION_COMMAND_REQUIRED');
const operator = process.env.OPERATOR_ID ?? '';
if (!/^[a-zA-Z0-9_.@-]{1,100}$/.test(operator)) throw new Error('OPERATOR_REQUIRED');
const labId = process.env.BOOTSTRAP_LAB_ID ?? 'lab_ifrc';
const labName = process.env.BOOTSTRAP_LAB_NAME ?? 'IFRC 实验室';
const days = Number(process.env.BOOTSTRAP_INVITE_DAYS ?? '7');
if (!/^[a-zA-Z0-9_-]{1,100}$/.test(labId) || !labName.trim() || labName.length > 200 ||
    !Number.isInteger(days) || days < 1 || days > 29) throw new Error('INVALID_BOOTSTRAP_OPTIONS');
const directory = resolve(dirname(config.databasePath), 'bootstrap');
const path = process.env.BOOTSTRAP_INVITE_FILE ?? resolve(directory, `${labId}.json`);
const child = relative(directory, path);
if (!isAbsolute(path) || child.startsWith('..') || isAbsolute(child) || !child) throw new Error('PRIVATE_INVITE_PATH_REQUIRED');
privateDirectory(directory);
const release = processGuard(config.databasePath);
try {
  const db = openDatabase(config.databasePath);
  try {
    checkDatabase(db);
    let record;
    if (existsSync(path)) {
      record = privateJson(path);
      if (record.format !== 1 || record.labId !== labId || record.labName !== labName || record.operator !== operator || record.days !== days ||
          !/^RAP-[a-zA-Z0-9_-]{32}$/.test(record.inviteCode) ||
          !/^[a-zA-Z0-9_-]{1,100}$/.test(record.inviteId) ||
          ![record.requests?.lab, record.requests?.invite, record.requests?.manager].every(v => /^[a-zA-Z0-9_-]{1,100}$/.test(v)) ||
          !Number.isFinite(Date.parse(record.expiresAt))) throw new Error('BOOTSTRAP_FILE_CONFLICT');
    } else {
      // Do not take over a lab or overwrite a previous invitation if the private
      // handoff file is missing. Operator can use audited maintenance separately.
      if (db.prepare('SELECT 1 FROM labs WHERE id=?').get(labId)) throw new Error('LAB_ALREADY_EXISTS');
      record = { format: 1, labId, labName, operator, days, inviteId: `invite_${randomUUID()}`,
        inviteCode: `RAP-${randomBytes(24).toString('base64url')}`,
        expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
        requests: { lab: randomUUID(), invite: randomUUID(), manager: randomUUID() } };
      writeFileSync(path, JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    }
    // Stable request IDs and file-before-write permit retry after any interrupted
    // step, including after the user has consumed the invitation. No new code.
    await maintain(db, config, operator, { action: 'create-lab', requestId: record.requests.lab, labId, name: labName });
    await maintain(db, config, operator, { action: 'create-registration-invite', requestId: record.requests.invite, labId,
      inviteId: record.inviteId, codeHash: hash(record.inviteCode), expiresAt: record.expiresAt, maxUses: 1 });
    await maintain(db, config, operator, { action: 'designate-manager-invite', requestId: record.requests.manager, labId, inviteId: record.inviteId });
    const state = db.prepare('SELECT used_count,revoked_at,expires_at FROM registration_invites WHERE id=? AND lab_id=?').get(record.inviteId, labId);
    const status = state.used_count ? 'used' : state.revoked_at ? 'revoked' : Date.parse(state.expires_at) <= Date.now() ? 'expired' : 'available';
    console.log(`Lab bootstrap ${status}; single-use manager invitation remains in the private bootstrap directory.`);
    console.log('No account password, session or model key was created or printed.');
  } finally { db.close(); }
} finally { release(); }
