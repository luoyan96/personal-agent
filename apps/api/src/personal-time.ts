type LocalTime={year:number;month:number;day:number;hour:number;minute:number}
export function parts(at:number,timeZone:string):LocalTime{
 const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at)
 const get=(key:string)=>Number(p.find(v=>v.type===key)!.value)
 return {year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute')}
}
function chineseNumber(v:string){if(/^\d+$/.test(v))return Number(v);const digits='零一二三四五六七八九';if(v==='两')return 2;if(v.includes('十')){const [a,b]=v.split('十');return (a?digits.indexOf(a):1)*10+(b?digits.indexOf(b):0)}return digits.indexOf(v)}
// Check every plausible UTC offset around the local date. Zero matches is a DST
// gap; two matches is an overlap. Neither silently chooses an instant.
export function localInstant(local:LocalTime,timeZone:string):number|null{
 const nominal=Date.UTC(local.year,local.month-1,local.day,local.hour,local.minute)
 const check=new Date(nominal);if(check.getUTCFullYear()!==local.year||check.getUTCMonth()+1!==local.month||check.getUTCDate()!==local.day||local.hour<0||local.hour>23||local.minute<0||local.minute>59)return null
 const offsets=new Set<number>()
 for(let delta=-36;delta<=36;delta+=6){const at=nominal+delta*3600000,p=parts(at,timeZone);offsets.add(Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute)-at)}
 const matches=[...offsets].map(offset=>nominal-offset).filter(at=>{const p=parts(at,timeZone);return Object.keys(local).every(k=>p[k as keyof LocalTime]===local[k as keyof LocalTime])})
 return matches.length===1?matches[0]!:null
}
export function reminderRequest(text:string,timeZone:string,now=Date.now()):{due:number;body:string}|null{
 let value=text.trim().replace(/^(?:请)?(?:提醒我|帮我提醒|跟进)\s*/,'')
 const iso=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2}))\s+(.{1,1000})$/.exec(value)
 if(iso){const stamp=iso[1]!,n=stamp.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})/)!;const [year,month,day,hour,minute]=n.slice(1).map(Number),calendar=new Date(Date.UTC(year!,month!-1,day!));if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()+1!==month||calendar.getUTCDate()!==day||hour!>23||minute!>59)return null;const due=Date.parse(stamp);return Number.isFinite(due)?{due,body:iso[2]!.trim()}:null}
 value=value.replace(/^在\s*/,'')
 const date=/^(今天|明天|后天|\d{4}-\d{1,2}-\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日)\s*/.exec(value);if(!date)return null
 let base=parts(now,timeZone);const d=date[1]!
 if(['今天','明天','后天'].includes(d)){const day=new Date(Date.UTC(base.year,base.month-1,base.day+['今天','明天','后天'].indexOf(d)));base={...base,year:day.getUTCFullYear(),month:day.getUTCMonth()+1,day:day.getUTCDate()}}
 else {const n=d.match(/\d+/g)!.map(Number);base={...base,year:n[0]!,month:n[1]!,day:n[2]!}}
 value=value.slice(date[0].length)
 const time=/^(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2}|[零一二两三四五六七八九十]{1,3})(?::(\d{2})|点(?:(半)|(?:(\d{1,2}|[零一二三四五六七八九十]{1,3})分)?)?)\s*/.exec(value);if(!time)return null
 let hour=chineseNumber(time[2]!),minute=time[3]?Number(time[3]):time[4]?30:time[5]?chineseNumber(time[5]):0
 if(time[1]){if(hour<1||hour>12)return null;if(['下午','晚上'].includes(time[1])&&hour<12)hour+=12;if(['凌晨','早上','上午'].includes(time[1])&&hour===12)hour=0;if(time[1]==='中午'&&hour<11)hour+=12}
 const body=value.slice(time[0].length).replace(/^(?:请)?(?:提醒我|帮我提醒|跟进)\s*/,'').trim().replace(/[。.]$/,'')
 const due=localInstant({...base,hour,minute},timeZone)
 return due!==null&&body.length>0&&body.length<=1000?{due,body}:null
}
export function displayReminderTime(at:string,timeZone:string){return new Intl.DateTimeFormat('zh-CN',{timeZone,year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(Date.parse(at))}
