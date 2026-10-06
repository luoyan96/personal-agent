import { createServer, request, type RequestOptions } from 'node:https'
import type { AddressInfo } from 'node:net'
import { createExternalAgentCaller } from '../../src/external-agent-client.js'
import { syntheticTlsCert, syntheticTlsKey } from './synthetic-external-tls.js'

export async function externalWire() {
 const seen:{body:any;authorization:string}[]=[]
 let mode='success'
 const server=createServer({cert:syntheticTlsCert,key:syntheticTlsKey},(req,res)=>{
  const chunks:Buffer[]=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{
   seen.push({body:JSON.parse(Buffer.concat(chunks).toString()),authorization:req.headers.authorization??''})
   if(mode==='timeout')return
   if(mode==='redirect'){res.writeHead(302,{location:'https://127.0.0.1/chat/completions'});res.end('SECRET_DIAGNOSTIC');return}
   if(mode==='huge'){res.end('x'.repeat(102401));return}
   if(mode==='auth'){res.writeHead(401);res.end('SECRET_DIAGNOSTIC');return}
   const value:any={choices:[{message:{role:'assistant',content:'本地合成 HTTPS 回答。'},finish_reason:'stop'}],usage:{prompt_tokens:30,completion_tokens:15,total_tokens:45,prompt_tokens_details:{cached_tokens:20},completion_tokens_details:{reasoning_tokens:5}}}
   if(mode==='tools')value.choices[0].message.tool_calls=[{id:'forbidden',type:'function',function:{name:'create_agent',arguments:'{}'}}]
   if(mode==='length')value.choices[0].finish_reason='length'
   if(mode==='unknown')delete value.usage.total_tokens
   res.setHeader('content-type','application/json');res.end(JSON.stringify(value))
  })
 })
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 const port=(server.address() as AddressInfo).port
 // Explicit test-only reroute: assert the production destination and TLS/DNS
 // options, then use a real loopback HTTPS socket with this synthetic CA only.
 const call=createExternalAgentCaller({resolve:async()=>[{address:'93.184.216.34',family:4}],request:((url:URL,options:RequestOptions,callback:any)=>{
  if(url.hostname!=='agent.synthetic.example'||options.servername!==url.hostname||options.rejectUnauthorized!==true||options.agent!==false||typeof options.lookup!=='function')throw new Error('TEST_TRANSPORT_SCOPE_INVALID')
  return request(new URL(`https://127.0.0.1:${port}${url.pathname}`),{...options,lookup:undefined,servername:'agent.synthetic.example',ca:syntheticTlsCert},callback)
 }) as typeof request})
 return {call,seen,setMode:(next:string)=>{mode=next},close:async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}}
}
