import { describe,it,expect } from 'vitest'
import { inferPaperFields,libraryRegistrationName,planPaperQuery,paperQueryContext,matchesPaper,type PaperRecord } from '../src/paper-library.js'
const fields=[{id:'title',name:'题目',type:1},{id:'year',name:'年份',type:2},{id:'grade',name:'级别（CCF或者IF）',type:1},{id:'venue',name:'发表期刊会议',type:1},{id:'abstract',name:'摘要',type:1}]
const mapping=inferPaperFields(fields),at=new Date('2026-10-21T04:00:00Z')
const row:PaperRecord={id:'r1',title:'Synthetic Backdoor Study',year:'2026',date:'',grade:'CCF A',venue:'Synthetic main conference',abstract:'合成后门研究方法',authors:'Synthetic',url:'https://synthetic.feishu.cn/base/SyntheticBase123'}
describe('paper library bounded query language',()=>{
 it('maps real column naming patterns and persists a user-supplied alias',()=>{expect(mapping).toMatchObject({title:'title',grade:'grade',year:'year',date:null});expect(libraryRegistrationName('这个是我的论文库 https://synthetic.feishu.cn/base/SyntheticBase123','合成表')).toBe('论文库')})
 it('matches annual grade conditions, never Findings labels or venues',()=>{const p=planPaperQuery('我想从论文库里面找到2026年的ccfa论文',mapping,at);expect(p.clarification).toBeNull();expect(matchesPaper(row,p)).toBe(true);expect(matchesPaper({...row,grade:'CCF A(ACL Findings)'},p)).toBe(false);expect(matchesPaper({...row,venue:'Findings of Synthetic'},p)).toBe(false);expect(matchesPaper({...row,year:'2025'},p)).toBe(false)})
 it('does not fabricate rolling dates from a year field',()=>{const p=planPaperQuery('论文库最近一年的ccfa论文',mapping,at);expect(p.clarification).toContain('没有发表日期');expect(p.fromYear).toBeNull()})
 it('uses a publication-date column for a real rolling range',()=>{const p=planPaperQuery('过去一年CCF A论文',{...mapping,date:'published'},at);expect(p.clarification).toBeNull();expect(matchesPaper({...row,date:String(new Date('2026-06-01').getTime())},p)).toBe(true);expect(matchesPaper({...row,date:String(new Date('2025-01-01').getTime())},p)).toBe(false)})
 it('keeps explicit filters for deictic follow-ups and replaces them for a new year',()=>{const prior='2026年 CCF A 论文';expect(planPaperQuery('对比这几篇论文',mapping,at,prior)).toEqual(planPaperQuery(prior,mapping,at));expect(planPaperQuery('那去年呢',mapping,at,prior)).toMatchObject({fromYear:2025,grade:'A'})})
 it('supports explicit keyword evidence and refuses unsupported conditions',()=>{const p=planPaperQuery('关于后门的论文',mapping,at);expect(matchesPaper(row,p)).toBe(true);expect(matchesPaper({...row,title:'Unrelated',abstract:'其他'},p)).toBe(false);expect(planPaperQuery('CCF A和CCF B的论文',mapping,at).clarification).toBeTruthy();expect(planPaperQuery('引用量超过100的高质量研究',mapping,at).clarification).toBeTruthy()})
 it('retains inherited conditions across multiple turns and removes the named library from keywords',()=>{
   const first=planPaperQuery('从论文库找2026年CCFA后门论文',mapping,at,undefined,'论文库');expect(first).toMatchObject({terms:['后门'],grade:'A',fromYear:2026,clarification:null})
   expect(planPaperQuery('2026年CCFA后门论文',mapping,at)).toMatchObject({terms:['后门'],grade:'A',fromYear:2026,clarification:null})
   const next=planPaperQuery('那去年呢',mapping,at,paperQueryContext(first));expect(next).toMatchObject({terms:['后门'],grade:'A',fromYear:2025})
   expect(planPaperQuery('对比这几篇',mapping,at,paperQueryContext(next))).toEqual(next)
 })
 it('uses the publication year in China at a UTC year boundary',()=>{
   const p=planPaperQuery('2026年论文',{...mapping,year:null,date:'published'},at)
   expect(matchesPaper({...row,year:'',date:String(Date.parse('2025-12-31T16:30:00Z'))},p)).toBe(true)
 })
})
