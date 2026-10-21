import type { FeishuLibraryField, FeishuLibraryMapping } from '@research-agent-platform/contracts'

const compact = (s:string) => s.normalize('NFKC').toLowerCase().replace(/[\s_()（）:：/-]/g,'')
export function inferPaperFields(fields:FeishuLibraryField[]):FeishuLibraryMapping {
  const find=(names:string[], types:number[]) => fields.find(f=>types.includes(f.type)&&names.includes(compact(f.name)))?.id??null
  const text=[1,3,4], number=[1,2], title=find(['题目','标题','论文题目','论文标题','title','name','名称'],text)??fields.find(f=>f.type===1)?.id
  if(!title)throw new Error('没有可用的标题字段，请先在飞书提供题目或标题列。')
  return {title,year:find(['年份','发表年份','出版年份','year'],number),date:find(['发表日期','发布日期','出版日期','publicationdate','publisheddate'],[5]),
    grade:find(['级别ccf或者if','级别ccf或if','级别','ccf','ccf级别','ccf等级','会议等级','等级','分区'],text),
    venue:find(['发表期刊会议','发表会议期刊','会议期刊','会议','期刊','venue','conference','journal'],text),
    abstract:find(['摘要','abstract','论文摘要','摘要翻译'],text),authors:find(['作者','authors','author'],[1,11])}
}
export function libraryRegistrationName(instruction:string,fallback:string) {
  const plain=instruction.replace(/https?:\/\/[^\s<>"“”]+/g,'').trim()
  const named=/(?:命名为|名字叫|叫做|记为|这是我的|这个是我的|这是|这个是|添加为|绑定为)[\s“"「]*(.{1,80}?)[”"」]?(?:[，。；！\n]|$)/.exec(plain)?.[1]
  return (named?.replace(/(?:请记住|以后就叫|帮我保存).*$/,'').trim().replace(/[”"」]+$/,'')||fallback).slice(0,200)
}
export type PaperPlan={grade:string|null;fromYear:number|null;toYear:number|null;fromDate:number|null;toDate:number|null;terms:string[];conditions:string[];clarification:string|null}
/** Queries are a small, explicit read language, never executable SQL or provider formulas. */
export function planPaperQuery(question:string,mapping:FeishuLibraryMapping,at=new Date(),previous?:string,libraryName?:string):PaperPlan {
  const follow=/这些|这几|上述|刚才|它们|继续|详细|比较|对比|总结/.test(question)
  const explicit=/ccf|20\d{2}|今年|去年|前年|近.{0,2}年|最近|过去|关于|关键词/i.test(question)
  const chosen=follow&&!explicit&&previous?previous:question
  const text=libraryName?chosen.split(libraryName).join(''):chosen
  const year=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Shanghai',year:'numeric'}).format(at))
  const plan:PaperPlan={grade:null,fromYear:null,toYear:null,fromDate:null,toDate:null,terms:[],conditions:[],clarification:null}
  const grades=[...text.matchAll(/ccf[\s_-]*([abc])/gi)].map(m=>m[1]!.toUpperCase())
  const prior=previous&&/那|继续|换成|改成|这些|这几|上述|再|呢|就按/.test(question)?planPaperQuery(previous,mapping,at):undefined
  if(!grades.length&&prior?.grade&&!/全部等级|所有等级|不限等级/.test(text))grades.push(prior.grade)
  if(new Set(grades).size>1)plan.clarification='这次请指定一个 CCF 等级，例如“2026年 CCF A 论文”。'
  if(grades[0]){plan.grade=grades[0];plan.conditions.push(`CCF ${plan.grade}（库中标注，排除 Findings/Workshop/Short）`);if(!mapping.grade)plan.clarification='这个库没有识别到 CCF 等级列，请在飞书补充或明确命名等级字段后重新绑定。'}
  const years=[...text.matchAll(/\b(20\d{2})\s*年?/g)].map(m=>Number(m[1]))
  if(years.length){plan.fromYear=Math.min(...years);plan.toYear=Math.max(...years)}
  else if(/去年/.test(text)){plan.fromYear=year-1;plan.toYear=year-1}
  else if(/前年/.test(text)){plan.fromYear=year-2;plan.toYear=year-2}
  else if(/今年|本年/.test(text)){plan.fromYear=year;plan.toYear=year}
  else if(/最近[一1]?年|近[一1]年|过去[一1]?年|近12个?月|过去12个?月/.test(text)){
    if(!mapping.date)plan.clarification=`当前库只有年份，没有发表日期，无法精确筛过去12个月。可以继续说“${year}年 CCF ${plan.grade??'A'} 论文”按年度查询，或在飞书补充发表日期。`
    else {const end=at.getTime(),start=new Date(end);start.setUTCFullYear(start.getUTCFullYear()-1);plan.fromDate=start.getTime();plan.toDate=end;plan.conditions.push(`发表日期 ${start.toISOString().slice(0,10)} 至 ${at.toISOString().slice(0,10)}（过去12个月）`)}
  } else {const n=/近([二三四五两2345])年/.exec(text)?.[1];if(n){const count=Number(n)||({二:2,两:2,三:3,四:4,五:5} as Record<string,number>)[n]!;plan.fromYear=year-count+1;plan.toYear=year}}
  if(plan.fromYear!==null){plan.conditions.push(plan.fromYear===plan.toYear?`${plan.fromYear}年度`:`${plan.fromYear}—${plan.toYear}年度`);if(!mapping.year&&!mapping.date)plan.clarification='这个库没有年份或发表日期字段，无法按时间筛选。'}
  if(prior&&plan.fromYear===null&&plan.fromDate===null&&!/全部年份|所有年份|不限时间/.test(text)){
    if(prior.fromYear!==null){plan.fromYear=prior.fromYear;plan.toYear=prior.toYear;plan.conditions.push(prior.fromYear===prior.toYear?`${prior.fromYear}年度`:`${prior.fromYear}—${prior.toYear}年度`)}
    if(prior.fromDate!==null){plan.fromDate=prior.fromDate;plan.toDate=prior.toDate;plan.conditions.push(...prior.conditions.filter(c=>c.startsWith('发表日期')))}
  }
  const keywordText=text.replace(/ccf[\s_-]*[abc](?:类)?/gi,'').replace(/\b20\d{2}\s*年?/g,'').replace(/最近[一1]?年|近[一1]年|过去[一1]?年|近12个?月|过去12个?月|近[二三四五两2345]年|今年|去年|前年|本年/g,'')
  const keyword=(/(?:关键词[是为:：]?|关于|有关)\s*[“"「]?(.+?)[”"」]?(?:的论文|论文|[，。；]|$)/.exec(keywordText)?.[1]??/(?:查找|查询|查|检索|搜索|找出|找到|找|有什么|有哪些)(?:一下)?\s*(.*?)(?:的论文|论文|[，。；]|$)/.exec(keywordText)?.[1]??/^\s*([\p{L}\p{N}][\p{L}\p{N}\s._-]{0,119}?)的?论文[。？?]?\s*$/u.exec(keywordText)?.[1])?.trim().replace(/^(?:从)?(?:里面|里|中|内)?(?:的)?/,'').replace(/的$/,'').trim()
  if(keyword&&!/^(?:全部|所有|一些|几篇|所有的|有哪些|全部的)$/.test(keyword)){plan.terms=keyword.split(/[、,，]|和|与/).map(s=>s.trim()).filter(Boolean).slice(0,5);plan.conditions.push(`标题/摘要/会议包含：${plan.terms.join('、')}`)}
  else if(prior?.terms.length&&!/全部关键词|不限关键词/.test(text)){plan.terms=prior.terms;plan.conditions.push(`标题/摘要/会议包含：${plan.terms.join('、')}`)}
  if(!plan.conditions.length&&!/全部|所有|列出|浏览|概览|看看|有什么|有哪些/.test(text)&&text.trim()&&!follow)plan.clarification='可以按年份、CCF等级或关键词查找，例如“今年 CCF A 论文”“关于后门攻击的论文”。'
  if(!plan.conditions.length)plan.conditions.push('当前可读记录概览')
  if(/不是|不含|除外|至少|大于|小于|引用量|影响因子|作者|发表在|发表于|或者|IF\s*[<>]/i.test(text)||years.length>2||(years.length===2&&!/至|到|—|~|～|-/.test(text)))plan.clarification='当前支持一个CCF等级、年度/连续年份范围、发表日期范围及论文关键词；请把这些条件说清楚，其他条件暂不能保证准确。'
  return plan
}
export function paperQueryContext(plan:PaperPlan) {
  const time=plan.fromYear!==null?(plan.fromYear===plan.toYear?`${plan.fromYear}年`:`${plan.fromYear}至${plan.toYear}年`):plan.fromDate!==null?'过去一年':'全部'
  return `${time} ${plan.grade?`CCF ${plan.grade}`:''} ${plan.terms.length?`关于${plan.terms.join('、')}的`:''}论文`
}
export type PaperRecord={id:string;title:string;year:string;date:string;grade:string;venue:string;abstract:string;authors:string;url:string}
export function matchesPaper(row:PaperRecord,plan:PaperPlan) {
  if(plan.grade&&(!new RegExp(`^(?:ccf[\\s_-]*)?${plan.grade}(?:类)?$`,'i').test(row.grade.trim())||/findings|workshop|short\s*paper/i.test(row.venue)))return false
  if(plan.fromYear!==null){const date=new Date(Number(row.date));const y=Number(row.year)||(row.date&&!Number.isNaN(date.getTime())?Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Shanghai',year:'numeric'}).format(date)):NaN);if(!Number.isInteger(y)||y<plan.fromYear||y>plan.toYear!)return false}
  if(plan.fromDate!==null){const date=Number(row.date);if(!date||date<plan.fromDate||date>plan.toDate!)return false}
  const haystack=`${row.title}\n${row.abstract}\n${row.venue}`.normalize('NFKC').toLowerCase()
  return plan.terms.every(t=>haystack.includes(t.normalize('NFKC').toLowerCase()))
}
