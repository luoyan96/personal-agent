import { generate } from './index.js'
const controller=new AbortController(),parent=process.ppid
const abort=(value:unknown)=>{if((value as {type?:unknown})?.type==='abort')controller.abort()}
process.on('message',abort)
const watch=setInterval(()=>{try{process.kill(parent,0)}catch{controller.abort()}},1000)
let raw=''
for await (const chunk of process.stdin) {
  raw += String(chunk)
  if(raw.length>200000) { process.exitCode=1; break }
}
if (!process.exitCode) {
  try {
    const {stream,...input}=JSON.parse(raw)
    const result=await generate(input,controller.signal,stream===true?text=>process.stdout.write(JSON.stringify({type:'delta',text})+'\n'):undefined)
    process.stdout.write(stream===true?JSON.stringify({type:'result',result})+'\n':JSON.stringify(result))
  }
  catch { process.stdout.write(JSON.stringify({text:'',failure:'HARNESS_ERROR',inputTokens:null,outputTokens:null,elapsedMs:0}));process.exitCode=1 }
}

clearInterval(watch)
process.removeListener('message',abort)
if(process.connected)process.disconnect()
