import { readFileSync } from 'node:fs'
import { readConfig } from './config.js'
import { checkDatabase, openDatabase } from './database.js'
import { CommunityCatalogWorker, readCommunityCatalog, replaceReviewedCommunityCatalog } from './community-catalog.js'

// Operator-only CLI. User-facing GET routes cannot promote a candidate or
// replace reviewed source versions. No upstream code is installed or executed.
const config=readConfig(),db=openDatabase(config.databasePath)
checkDatabase(db)
try {
  const [command,file,...extra]=process.argv.slice(2)
  if(extra.length)throw new Error('Invalid catalog command')
  if(command==='replace-reviewed'&&file){replaceReviewedCommunityCatalog(db,JSON.parse(readFileSync(file,'utf8')));console.log('Reviewed community catalog saved; current private Skill installations were not changed.')}
  else if(command==='sync'&&!file){const worker=new CommunityCatalogWorker(db,config);try{await worker.tick();const result=readCommunityCatalog(db,config).data;console.log(JSON.stringify({state:result.sync.state,entries:result.entries.length,candidates:result.candidates.length,nextCheckAt:result.sync.nextCheckAt}))}finally{worker.close()}}
  else if(command==='status'&&!file)console.log(JSON.stringify(readCommunityCatalog(db,config)))
  else if(command==='export-reviewed'&&!file)console.log(JSON.stringify(readCommunityCatalog(db,config).data.entries.map(({github:_g,...entry})=>entry),null,2))
  else throw new Error('Use status, sync, export-reviewed, or replace-reviewed <reviewed-public-json>')
}finally{db.close()}
