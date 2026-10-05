// Pinned dsh-llm TokenUsage counts are DISJOINT: inputTokens excludes cache
// reads/writes. totalTokens is the authoritative aggregate including output.
// Cache details are optional; absence can mean zero only when total reconciles.
const tokenCount=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0
export function normalizeUsage(value:unknown):{inputTokens:number|null;outputTokens:number|null} {
  if(!value||typeof value!=='object')return {inputTokens:null,outputTokens:null}
  const usage=value as Record<string,unknown>,outputTokens=tokenCount(usage.outputTokens)?usage.outputTokens:null
  const unknown=()=>({inputTokens:null,outputTokens})
  if(!tokenCount(usage.inputTokens)||outputTokens===null||!tokenCount(usage.totalTokens))return unknown()
  const read=usage.cacheReadTokens===undefined?0:usage.cacheReadTokens,write=usage.cacheWriteTokens===undefined?0:usage.cacheWriteTokens
  if(!tokenCount(read)||!tokenCount(write))return unknown()
  const inputTokens=usage.inputTokens+read+write,total=inputTokens+outputTokens
  if(!Number.isSafeInteger(total)||total!==usage.totalTokens)return unknown()
  // outputTokens already includes provider reasoning. Never add reasoningTokens.
  return {inputTokens,outputTokens}
}
