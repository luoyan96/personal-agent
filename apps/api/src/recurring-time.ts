import type { FollowupRecurrence } from '@research-agent-platform/contracts'
import { localInstant,parts,reminderRequest } from './personal-time.js'

// Calendar iteration preserves the owner's local time across offset changes.
// A DST gap or overlap is skipped, never silently shifted or fired twice.
export function nextRecurring(at:number,timeZone:string,recurrence:FollowupRecurrence,after:number):number {
 const anchor=parts(at,timeZone),base=parts(after,timeZone)
 for(let offset=0;offset<=370;offset++){
  const date=new Date(Date.UTC(base.year,base.month-1,base.day+offset))
  const weekday=date.getUTCDay()||7
  if(recurrence.frequency==='weekly'&&!recurrence.weekdays.includes(weekday))continue
  const next=localInstant({year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate(),hour:anchor.hour,minute:anchor.minute},timeZone)
  if(next!==null&&next>after)return next
 }
 throw new Error('RECURRING_TIME_UNAVAILABLE')
}

export function scheduledRequest(text:string,timeZone:string,now=Date.now()) {
 const value=text.trim().replace(/^(?:请(?:你)?|帮我)\s*/,'').replace(/^在\s*/,'')
 if(/[?？]$/.test(value)||/[，,。;；]\s*(?:但|不过)?\s*(?:不要|只是引用|只是举例|别做)/.test(value))return null
 const prefix=/^(每天|每个?工作日|每(?:周|星期)([一二三四五六日天1-7]))\s*/.exec(value)
 let recurrence:FollowupRecurrence|null=null
 if(prefix){
  const day=prefix[2]?(/[1-7]/.test(prefix[2])?Number(prefix[2]):Math.min(7,'一二三四五六日天'.indexOf(prefix[2])+1)):0
  recurrence=prefix[1]==='每天'?{frequency:'daily'}:/工作日/.test(prefix[1]!)?{frequency:'weekly',weekdays:[1,2,3,4,5]}:{frequency:'weekly',weekdays:[day]}
 }
 const rest=prefix?value.slice(prefix[0].length):value
 const matched=reminderRequest(prefix?'今天'+rest:rest,timeZone,now)
 if(!matched)return null
 const action=rest.replace(/^(?:今天|明天|后天|\d{4}-\d{1,2}-\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日)\s*/,'').replace(/^(?:凌晨|早上|上午|中午|下午|晚上)?\s*(?:\d{1,2}|[零一二两三四五六七八九十]{1,3})(?::\d{2}|点(?:半|(?:\d{1,2}|[零一二三四五六七八九十]{1,3})分)?)\s*/,'')
 if(/^(?:不要|别|不用|停止|取消)/.test(action))return null
 const isReminder=/^(?:请)?(?:提醒我|帮我提醒|跟进)/.test(action)
 const execute=!isReminder&&/^(?:帮我|请(?:你)?|自动|执行|整理|总结|分析|写|生成|阅读|制定|比较|复盘|检查)/.test(matched.body)
 if(!isReminder&&!execute)return null
 let due=matched.due
 if(recurrence){const weekday=new Date(Date.UTC(parts(due,timeZone).year,parts(due,timeZone).month-1,parts(due,timeZone).day)).getUTCDay()||7
  if(due<=now||recurrence.frequency==='weekly'&&!recurrence.weekdays.includes(weekday))due=nextRecurring(due,timeZone,recurrence,now)
 }
 return {...matched,due,recurrence,execute}
}

export function recurrenceLabel(recurrence:FollowupRecurrence|null){return !recurrence?'一次性':recurrence.frequency==='daily'?'每天':`每周${recurrence.weekdays.map(n=>'一二三四五六日'[n-1]).join('、')}`}
