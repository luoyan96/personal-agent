import { processGuard } from './process-guard.js'
import { readConfig } from './config.js'
import { openDatabase,checkDatabase } from './database.js'
import { ExecutionWorker } from './execution-worker.js'
import { ChatWorker } from './chat-worker.js'
import { OpenImWorker } from './openim-worker.js'
import { PersonalFollowupWorker } from './personal-followups.js'
import { CommunityCatalogWorker } from './community-catalog.js'
const config=readConfig()
const releaseProcess=processGuard(config.databasePath);process.once('exit',releaseProcess)
const db=openDatabase(config.databasePath)
checkDatabase(db)
let stopping=false
const catalogWorker=new CommunityCatalogWorker(db,config)
let catalogFlight:Promise<unknown>|undefined
const stop=()=>{stopping=true;catalogWorker.close()}
process.once('SIGINT',stop);process.once('SIGTERM',stop)
const worker=new ExecutionWorker(db,config)
const chatWorker=new ChatWorker(db,config)
const imWorker=new OpenImWorker(db,config)
const followupWorker=new PersonalFollowupWorker(db,config)
console.log('B3 worker started; historical notification outbox is not consumed.')
try { do {if(!catalogFlight&&!stopping)catalogFlight=catalogWorker.tick().catch(()=>{console.error('Community catalog synchronization failed; prior catalog preserved.')}).finally(()=>{catalogFlight=undefined});const reminder=await followupWorker.tick();const chat=await chatWorker.tick();const execution=await worker.tick();const im=await imWorker.tick();if(!reminder&&!chat&&!execution&&!im)await new Promise(resolve=>setTimeout(resolve,1000))}while(!stopping && !process.argv.includes('--once')) } finally {catalogWorker.close();await catalogFlight;db.close()}
