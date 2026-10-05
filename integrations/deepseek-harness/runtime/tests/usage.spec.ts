import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join,resolve } from 'node:path'
import { afterEach,describe,expect,it } from 'vitest'
import { normalizeUsage } from '../src/usage.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
describe('official disjoint usage totals; synthetic only, no live credentials',()=>{
  it('counts cache reads/writes once and leaves official output including reasoning intact',()=>{
    expect(normalizeUsage({inputTokens:233,cacheReadTokens:640,cacheWriteTokens:128,outputTokens:100,reasoningTokens:70,totalTokens:1101})).toEqual({inputTokens:1001,outputTokens:100})
    expect(normalizeUsage({inputTokens:233,outputTokens:100,totalTokens:333})).toEqual({inputTokens:233,outputTokens:100})
  })
  it.each([
    {inputTokens:233,outputTokens:100},
    {inputTokens:233,outputTokens:100,totalTokens:1101},
    {inputTokens:233,cacheReadTokens:null,outputTokens:100,totalTokens:333},
    {inputTokens:233,cacheWriteTokens:-1,outputTokens:100,totalTokens:332},
    {inputTokens:233,cacheReadTokens:0.5,outputTokens:100,totalTokens:333.5},
    {inputTokens:233,cacheReadTokens:640,outputTokens:100,totalTokens:333},
    {inputTokens:Number.MAX_SAFE_INTEGER,cacheReadTokens:1,outputTokens:100,totalTokens:Number.MAX_SAFE_INTEGER},
  ])('fails closed on missing/invalid/unreconciled totals while preserving known output (%j)',value=>{
    expect(normalizeUsage(value)).toEqual({inputTokens:null,outputTokens:100})
  })
  it.each([
    {name:'cached input',usage:{input_tokens:233,cache_read_input_tokens:640,cache_creation_input_tokens:128,output_tokens:0},input:1001,failure:null},
    {name:'optional cache zeros',usage:{input_tokens:233,output_tokens:0},input:233,failure:null},
    {name:'invalid provider cache',usage:{input_tokens:233,cache_read_input_tokens:-1,output_tokens:0},input:null,failure:'MALFORMED_RESPONSE'},
  ])('uses the pinned real Messages adapter with loopback synthetic SSE: $name',async fixture=>{
    const home=mkdtempSync(join(tmpdir(),'rap-cache-usage-'));cleanup.push(()=>rmSync(home,{recursive:true,force:true}))
    const events=[
      {type:'message_start',message:{usage:fixture.usage}},
      {type:'content_block_start',index:0,content_block:{type:'text',text:''}},
      {type:'content_block_delta',index:0,delta:{type:'text_delta',text:'SYNTHETIC_REPLY'}},
      {type:'content_block_stop',index:0},
      {type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:100}},
      {type:'message_stop'},
    ]
    const seen:{path:string;maxTokens:number}[]=[]
    const server=createServer((request,response)=>{
      let raw='';request.on('data',chunk=>{raw+=String(chunk)})
      request.on('end',()=>{
        seen.push({path:request.url??'',maxTokens:JSON.parse(raw).max_tokens})
        response.writeHead(200,{'content-type':'text/event-stream'})
        response.end(events.map(event=>`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
      })
    })
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));cleanup.push(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())))
    const address=server.address();if(!address||typeof address==='string')throw new Error('Expected loopback address')
    // Do not inherit ambient model keys, user history, or provider endpoint.
    const env:NodeJS.ProcessEnv={DSH_HOME:home,DEEPSEEK_API_KEY:'sk-synthetic-cache-usage-not-real',DEEPSEEK_BASE_URL:`http://127.0.0.1:${address.port}/anthropic`}
    for(const name of ['SystemRoot','WINDIR','PATH','TEMP','TMP'])if(process.env[name])env[name]=process.env[name]
    const child=spawn(process.execPath,[resolve('integrations/deepseek-harness/runtime/dist/cli.js')],{env,windowsHide:true,stdio:['pipe','pipe','pipe']})
    cleanup.push(()=>{if(child.exitCode===null)child.kill()})
    let output='';child.stdout.on('data',chunk=>{output+=String(chunk)});child.stderr.resume()
    const ended=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})
    child.stdin.end(JSON.stringify({system:'Synthetic fixture only.',prompt:'Synthetic cache accounting.',model:'deepseek-flash',maxTokens:300,timeoutMs:3000}))
    expect(await ended).toBe(0);const result=JSON.parse(output)
    expect(seen).toEqual([{path:'/anthropic/v1/messages',maxTokens:300}])
    expect(result.inputTokens).toBe(fixture.input);expect(result.failure).toBe(fixture.failure)
    if(fixture.failure){expect(result.text).toBe('');expect(result.outputTokens).toBeNull()}
    else {expect(result.text).toBe('SYNTHETIC_REPLY');expect(result.outputTokens).toBe(100)}
  },10000)
})
