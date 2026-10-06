import { afterEach,describe,it,expect } from 'vitest'
import { createExternalAgentCaller,externalEndpoint,publicAddress } from '../src/external-agent-client.js'
import { externalWire } from './support/external-wire.js'
const cleanup:(()=>Promise<void>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0))await fn()})
const input={endpoint:'https://agent.synthetic.example/v1/chat/completions',model:'existing-agent',apiKey:'SYNTHETIC_EXTERNAL_KEY',text:'只发送这一条。',maxTokens:128,timeoutMs:1000}
describe('external Agent actual synthetic HTTPS wire',()=>{
 it('pins public addresses with strict TLS, sends only current text, counts inclusive cache/reasoning usage once',async()=>{
  const w=await externalWire();cleanup.push(w.close)
  expect(await w.call(input,new AbortController().signal)).toMatchObject({text:'本地合成 HTTPS 回答。',failure:null,inputTokens:30,outputTokens:15,finishReason:'stop'})
  expect(w.seen).toHaveLength(1);expect(w.seen[0]!.body).toEqual({model:input.model,messages:[{role:'system',content:expect.any(String)},{role:'user',content:input.text}],stream:false,max_tokens:128,tools:[],tool_choice:'none'})
  expect(w.seen[0]!.authorization).toBe('Bearer SYNTHETIC_EXTERNAL_KEY')
 })
 it('rejects private/mixed DNS, mapped IPs, URL credentials/query and never opens a socket',async()=>{
  for(const address of ['127.0.0.1','169.254.169.254','10.1.2.3','::1','::ffff:127.0.0.1','2002:7f00:1::','2001:db8::1'])expect(publicAddress(address)).toBe(false)
  expect(publicAddress('2606:4700:4700::1111')).toBe(true)
  for(const url of ['http://agent.synthetic.example/chat/completions','https://user:secret@agent.synthetic.example/chat/completions','https://agent.synthetic.example/chat/completions?key=secret','https://127.0.0.1/chat/completions'])expect(()=>externalEndpoint(url)).toThrow('EXTERNAL_ENDPOINT_UNSAFE')
  let calls=0
  const call=createExternalAgentCaller({resolve:async()=>[{address:'93.184.216.34',family:4},{address:'10.0.0.1',family:4}],request:((..._args:any[])=>{calls++;throw new Error('UNEXPECTED_SOCKET')}) as any})
  expect(await call(input,new AbortController().signal)).toMatchObject({failure:'EXTERNAL_ENDPOINT_UNSAFE',text:'',inputTokens:null});expect(calls).toBe(0)
 })
 it('does not follow redirects/download errors, rejects oversized/tool/truncated/unknown usage replies with safe failures',async()=>{
  const w=await externalWire();cleanup.push(w.close)
  for(const [mode,failure] of [['redirect','EXTERNAL_SERVICE_FAILED'],['auth','EXTERNAL_AUTH_FAILED'],['huge','EXTERNAL_RESPONSE_INVALID'],['tools','EXTERNAL_RESPONSE_INVALID'],['length','OUTPUT_LIMIT'],['unknown','USAGE_UNCERTAIN'],['timeout','EXTERNAL_TIMEOUT']]){
   w.setMode(mode!);const result=await w.call({...input,timeoutMs:mode==='timeout'?40:1000},new AbortController().signal)
   expect(result).toMatchObject({failure,text:''});expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC_EXTERNAL_KEY|SECRET_DIAGNOSTIC/)
   if(['tools','length'].includes(mode!))expect(result).toMatchObject({inputTokens:30,outputTokens:15})
  }
  expect(w.seen).toHaveLength(7)
 })
})
