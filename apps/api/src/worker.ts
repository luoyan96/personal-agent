import { processGuard } from './process-guard.js'
import { readConfig } from './config.js'
import { openDatabase,checkDatabase } from './database.js'
import { ExecutionWorker } from './execution-worker.js'
import { ChatWorker } from './chat-worker.js'
import { OpenImWorker } from './openim-worker.js'
const config=readConfig()
const releaseProcess=processGuard(config.databasePath);process.once('exit',releaseProcess)
const db=openDatabase(config.databasePath)
checkDatabase(db)
let stopping=false
process.once('SIGINT',()=>{stopping=true});process.once('SIGTERM',()=>{stopping=true})
const worker=new ExecutionWorker(db,config)
const chatWorker=new ChatWorker(db,config)
const imWorker=new OpenImWorker(db,config)
console.log('B3 worker started; historical notification outbox is not consumed.')
try { do {const chat=await chatWorker.tick();const execution=await worker.tick();const im=await imWorker.tick();if(!chat&&!execution&&!im)await new Promise(resolve=>setTimeout(resolve,1000))}while(!stopping && !process.argv.includes('--once')) } finally {db.close()}
