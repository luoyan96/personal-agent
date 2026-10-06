import {createServer,type ServerResponse} from 'node:http'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {callHarness} from '../src/execution-worker.js'

afterEach(()=>vi.unstubAllEnvs())
const frame=(value:Record<string,unknown>)=>`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`
const begin=()=>frame({type:'message_start',message:{usage:{input_tokens:100,cache_read_input_tokens:20,output_tokens:0}}})+frame({type:'content_block_start',index:1,content_block:{type:'thinking',thinking:''}})+frame({type:'content_block_delta',index:1,delta:{type:'thinking_delta',thinking:'PRIVATE_REASONING_MUST_NOT_STREAM'}})+frame({type:'content_block_stop',index:1})+frame({type:'content_block_start',index:0,content_block:{type:'text',text:''}})
const text=(value:string)=>frame({type:'content_block_delta',index:0,delta:{type:'text_delta',text:value}})
const finish=(reason='end_turn')=>frame({type:'content_block_stop',index:0})+frame({type:'message_delta',delta:{stop_reason:reason},usage:{output_tokens:10}})+frame({type:'message_stop'})

describe('real pinned Harness/child NDJSON over synthetic loopback SSE, no vendor calls',()=>{
 it('delivers actual UTF8 answer deltas before final, excludes thinking, and preserves cached totals',async()=>{
  let response!:ServerResponse,requestReady!:()=>void,wireBody:Record<string,unknown>={};const entered=new Promise<void>(r=>{requestReady=r})
  const server=createServer((req,res)=>{let raw='';req.on('data',v=>raw+=v);req.on('end',()=>{wireBody=JSON.parse(raw);response=res;res.writeHead(200,{'content-type':'text/event-stream'});res.write(begin());const bytes=Buffer.from(text('你好，'));for(let i=0;i<bytes.length;i+=3)res.write(bytes.subarray(i,i+3));requestReady()})})
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error('No loopback')
  vi.stubEnv('DEEPSEEK_BASE_URL',`http://127.0.0.1:${address.port}/anthropic`)
  const controller=new AbortController(),deltas:string[]=[];let completed=false,deltaReady!:()=>void;const delta=new Promise<void>(r=>{deltaReady=r})
  const pending=callHarness({system:'Synthetic: natural plain answer only.',prompt:'合成测试。',model:'deepseek-flash',maxTokens:64,timeoutMs:5000},controller.signal,{apiKey:'synthetic-key-no-vendor'},part=>{deltas.push(part);deltaReady()}).then(value=>{completed=true;return value})
  try{
   await entered;await delta;expect(deltas.join('')).toBe('你好，');expect(completed).toBe(false)
   response.end(text('我在。')+finish());const actual=await pending
   expect(actual).toMatchObject({text:'你好，我在。',failure:null,inputTokens:120,outputTokens:10,finishReason:'stop'})
   expect(deltas.join('')).toBe(actual.text);expect(wireBody).toMatchObject({stream:true,max_tokens:64,tools:[]})
  }finally{controller.abort();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
 },12000)
 it('discards limited partial final while retaining real usage, and gracefully interrupts without calling again',async()=>{
  for(const mode of ['limit','abort'] as const){
   const server=createServer((req,res)=>{req.resume();req.on('end',()=>{res.writeHead(200,{'content-type':'text/event-stream'});res.write(begin()+text('临时部分'));if(mode==='limit')res.end(finish('max_tokens'))})})
   await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw new Error('No loopback')
   vi.stubEnv('DEEPSEEK_BASE_URL',`http://127.0.0.1:${address.port}/anthropic`)
   const controller=new AbortController(),received:string[]=[]
   const pending=callHarness({system:'Synthetic only.',prompt:'合成',model:'deepseek-flash',maxTokens:64,timeoutMs:5000},controller.signal,{apiKey:'synthetic-key'},part=>{received.push(part);if(mode==='abort')controller.abort()})
   try{const actual=await pending;expect(received.join('')).toBe('临时部分');expect(actual.text).toBe('');expect(actual.failure).not.toBeNull();if(mode==='limit')expect(actual).toMatchObject({failure:'OUTPUT_LIMIT',inputTokens:120,outputTokens:10});else expect(actual.outputTokens).toBeNull()}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
  }
 },15000)
})
