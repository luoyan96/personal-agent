import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig } from '../../apps/api/dist/config.js';
import { createServer } from '../../apps/api/dist/server.js';
import { openDatabase, migrate, seed } from '../../apps/api/dist/database.js';
import { provisionTestAccounts } from '../../apps/api/dist/auth.js';

// This entry point is exclusively for the named synthetic local Compose lab.
const config = readConfig();
if (config.mode !== 'test') throw new Error('Synthetic Compose startup requires NODE_ENV=test');
mkdirSync(config.blobRoot, { recursive: true });
const accountPath = join(config.blobRoot, '..', 'accounts.json');
const db = openDatabase(config.databasePath, true);
try {
  migrate(db);
  seed(db, 'test');
  let accounts;
  if (existsSync(accountPath)) accounts = JSON.parse(readFileSync(accountPath, 'utf8'));
  else {
    accounts = ['A', 'B', 'C'].map((letter, index) => ({
      memberId: `member_${letter}`, username: `im_qa_${letter.toLowerCase()}`,
      password: randomBytes(18).toString('base64url'),
      displayName: ['验收负责人', '验收研究员', '验收观察员'][index],
    }));
    writeFileSync(accountPath, JSON.stringify(accounts, null, 2), { mode: 0o600, flag: 'wx' });
  }
  await provisionTestAccounts(db, 'test', accounts);
  for (const account of accounts) db.prepare('UPDATE members SET display_name=? WHERE id=?').run(account.displayName, account.memberId);
  db.prepare('UPDATE labs SET name=? WHERE id=?').run('OpenIM 本地验收实验室（合成账号）', 'lab_synthetic');
  db.prepare('INSERT INTO lab_managers(lab_id,member_id,granted_at) VALUES (?,?,?) ON CONFLICT DO NOTHING').run('lab_synthetic', 'member_A', new Date().toISOString());
} finally { db.close(); }
const app = createServer(config);
await app.listen({ host: config.host, port: config.port });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void app.close());
console.log('Synthetic OpenIM research API ready; credentials remain in the private runtime directory.');
