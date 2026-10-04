import { contractVersion } from '../../packages/contracts/dist/index.js';
import { readConfig } from '../../apps/api/dist/config.js';
import { openDatabase, checkDatabase, checkMigrationHistory } from '../../apps/api/dist/database.js';
import { checkStorage } from '../../apps/api/dist/storage.js';
import { imConfiguration } from '../../apps/api/dist/openim-client.js';
import { processGuard } from '../../apps/api/dist/process-guard.js';

const config = readConfig();
if (config.mode !== 'production') throw new Error('PRODUCTION_COMMAND_REQUIRED');
const release = processGuard(config.databasePath);
try {
  const db = openDatabase(config.databasePath);
  try {
    checkDatabase(db);
    await checkStorage(config.blobRoot);
    imConfiguration(config); // Config validation only, not a real callback probe.
    console.log(JSON.stringify({ mode: config.mode, contractVersion,
      migration: checkMigrationHistory(db).at(-1).version,
      database: 'ok', storage: 'ok', imConfiguration: 'ok',
      imTransport: 'not_verified', harness: 'not_verified' }));
  } finally { db.close(); }
} finally { release(); }
