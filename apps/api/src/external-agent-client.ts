import { request as httpsRequest } from 'node:https'
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import type { LookupAddress } from 'node:dns'
import { ExternalAgentEndpoint } from '@research-agent-platform/contracts'
import type { ModelResult } from './execution-worker.js'

export type ExternalAgentInput={endpoint:string;model:string;apiKey:string;text:string;maxTokens:number;timeoutMs:number}
export type ExternalAgentCall=(input:ExternalAgentInput,signal:AbortSignal)=>Promise<ModelResult>
const blocked=new BlockList()
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(address,prefix,'ipv4')
const globalV6=new BlockList();globalV6.addSubnet('2000::',3,'ipv6')
const blockedV6=new BlockList();blockedV6.addSubnet('2001::',23,'ipv6');blockedV6.addSubnet('2001:db8::',32,'ipv6');blockedV6.addSubnet('2002::',16,'ipv6')
export function publicAddress(address:string){const family=isIP(address);return family===4?!blocked.check(address,'ipv4'):family===6&&globalV6.check(address,'ipv6')&&!blockedV6.check(address,'ipv6')}
export function externalEndpoint(value:string){
 const parsed=ExternalAgentEndpoint.safeParse(value);if(!parsed.success)throw new Error('EXTERNAL_ENDPOINT_UNSAFE')
 const url=new URL(parsed.data),host=url.hostname.replace(/^\[|\]$/g,'')
 if((isIP(host)&&!publicAddress(host))||/^(?:localhost|.*\.(?:localhost|local|internal))\.?$/i.test(host))throw new Error('EXTERNAL_ENDPOINT_UNSAFE')
 return url
}
export const externalAgentSystem='Reply to this current message as your deployed Agent. Plain text only. No tool calls, resource URLs or instructions for this platform to execute actions. No claims about unseen conversation/history/files.'
type Dependencies={resolve?:(host:string)=>Promise<LookupAddress[]>;request?:typeof httpsRequest}
// Dependency injection is for local wire tests only; production uses these exact
// defaults. No URL, proxy, CA override or DNS override can be supplied by an API.
export function createExternalAgentCaller(dependencies:Dependencies={}):ExternalAgentCall {
 const resolve=dependencies.resolve??(host=>lookup(host,{all:true,verbatim:true})),request=dependencies.request??httpsRequest
 return async(input,signal)=>{
  const started=Date.now(),result:ModelResult={text:'',failure:null,inputTokens:null,outputTokens:null,elapsedMs:0}
  const limit=Math.min(90000,input.timeoutMs),timed=AbortSignal.timeout(limit),abort=AbortSignal.any([signal,timed])
  let dnsAbort:(()=>void)|undefined
  try{
   const url=externalEndpoint(input.endpoint),host=url.hostname.replace(/^\[|\]$/g,'')
   const addresses=await Promise.race([isIP(host)?Promise.resolve([{address:host,family:isIP(host)}]):resolve(host),new Promise<never>((_,reject)=>{dnsAbort=()=>reject(new Error('INTERRUPTED'));if(abort.aborted)dnsAbort();else abort.addEventListener('abort',dnsAbort,{once:true})})])
   if(dnsAbort){abort.removeEventListener('abort',dnsAbort);dnsAbort=undefined}
   if(!addresses.length||addresses.some(value=>!publicAddress(value.address)))throw new Error('EXTERNAL_ENDPOINT_UNSAFE')
   const pinned=addresses[0]!,body=JSON.stringify({model:input.model,messages:[{role:'system',content:externalAgentSystem},{role:'user',content:input.text}],stream:false,max_tokens:input.maxTokens,tools:[],tool_choice:'none'})
   const response=await new Promise<string>((resolve,reject)=>{
    const req=request(url,{method:'POST',agent:false,servername:host,rejectUnauthorized:true,signal:abort,lookup:(_host,options,callback)=>options.all?(callback as unknown as (error:null,addresses:LookupAddress[])=>void)(null,[pinned]):callback(null,pinned.address,pinned.family),headers:{'content-type':'application/json','content-length':Buffer.byteLength(body),authorization:`Bearer ${input.apiKey}`}},res=>{
     if(res.statusCode!==200){reject(new Error(res.statusCode===401||res.statusCode===403?'EXTERNAL_AUTH_FAILED':'EXTERNAL_SERVICE_FAILED'));res.destroy();req.destroy();return}
     const chunks:Buffer[]=[];let bytes=0
     res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>102400){res.destroy();reject(new Error('EXTERNAL_RESPONSE_INVALID'))}else chunks.push(chunk)})
     res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));res.on('error',()=>reject(new Error('EXTERNAL_SERVICE_FAILED')))
    })
    req.on('error',()=>reject(new Error('EXTERNAL_SERVICE_FAILED')));req.end(body)
   })
   let value:any;try{value=JSON.parse(response)}catch{throw new Error('EXTERNAL_RESPONSE_INVALID')}
   const usage=value?.usage,valid=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
   result.inputTokens=valid(usage?.prompt_tokens)?usage.prompt_tokens:null;result.outputTokens=valid(usage?.completion_tokens)?usage.completion_tokens:null
   if(result.inputTokens===null||result.outputTokens===null||!valid(usage?.total_tokens)||!Number.isSafeInteger(result.inputTokens+result.outputTokens)||usage.total_tokens!==result.inputTokens+result.outputTokens){result.inputTokens=null;throw new Error('USAGE_UNCERTAIN')}
   if(result.inputTokens+result.outputTokens>4000||result.outputTokens>input.maxTokens)throw new Error('OUTPUT_LIMIT')
   const choice=Array.isArray(value.choices)&&value.choices.length===1?value.choices[0]:null,message=choice?.message
   if(!message||message.role!=='assistant'||(message.tool_calls!==undefined&&message.tool_calls!==null)||(message.function_call!==undefined&&message.function_call!==null))throw new Error('EXTERNAL_RESPONSE_INVALID')
   result.finishReason=choice.finish_reason==='length'?'max-tokens':choice.finish_reason==='stop'?'stop':'error'
   if(choice.finish_reason==='length')throw new Error('OUTPUT_LIMIT')
   if(choice.finish_reason!=='stop'||typeof message.content!=='string'||!message.content.trim()||message.content.length>8000)throw new Error('EXTERNAL_RESPONSE_INVALID')
   result.text=message.content
  }catch(error){
   const code=(error as Error).message
   result.failure=signal.aborted?'INTERRUPTED':timed.aborted?'EXTERNAL_TIMEOUT':['EXTERNAL_ENDPOINT_UNSAFE','EXTERNAL_AUTH_FAILED','EXTERNAL_RESPONSE_INVALID','USAGE_UNCERTAIN','OUTPUT_LIMIT'].includes(code)?code:'EXTERNAL_SERVICE_FAILED';result.text=''
  }finally{if(dnsAbort)abort.removeEventListener('abort',dnsAbort)}
  result.elapsedMs=Date.now()-started;return result
 }
}
export const callExternalAgent=createExternalAgentCaller()
