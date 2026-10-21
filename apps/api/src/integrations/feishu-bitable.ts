import { z } from 'zod'
import type { FeishuLibraryField, FeishuLibraryMapping } from '@research-agent-platform/contracts'
import { FeishuClient } from './feishu-client.js'
import { fail } from '../errors.js'
import type { PaperRecord } from '@research-agent-platform/research-core'

export function feishuBaseLink(value:string) {
  let url:URL
  try{url=new URL(value)}catch{fail('FEISHU_LINK_INVALID')}
  const match=/^\/base\/([A-Za-z0-9]{8,100})\/?$/.exec(url.pathname)
  if(url.protocol!=='https:'||url.username||url.password||url.port||!/(^|\.)feishu\.cn$/.test(url.hostname)||!match)fail('FEISHU_LINK_INVALID')
  const tableId=url.searchParams.get('table')
  if(tableId&&!/^tbl[A-Za-z0-9]{4,100}$/.test(tableId))fail('FEISHU_LINK_INVALID')
  return {appToken:match[1]!,origin:url.origin,tableId:tableId??undefined}
}
const opaque=z.string().regex(/^[A-Za-z0-9]{4,100}$/)
const page=z.object({has_more:z.boolean(),page_token:z.string().max(4096).optional()})
const text=(value:unknown):string=>typeof value==='string'?value:typeof value==='number'?String(value):Array.isArray(value)?value.map(v=>typeof v==='string'?v:typeof v?.text==='string'?v.text:typeof v?.name==='string'?v.name:'').join(''):''
export class FeishuBitableClient extends FeishuClient {
  async tables(appToken:string,token:string,signal?:AbortSignal) {
    const raw=await this.json(`/bitable/v1/apps/${appToken}/tables?page_size=100`,token,undefined,signal)
    const parsed=page.extend({items:z.array(z.object({table_id:opaque,name:z.string().max(300)})).max(100)}).safeParse(raw.data)
    if(!parsed.success||parsed.data.has_more)fail('FEISHU_LIBRARY_LIMIT')
    return parsed.data.items.map(t=>({id:t.table_id,name:t.name}))
  }
  async fields(appToken:string,tableId:string,token:string,signal?:AbortSignal):Promise<FeishuLibraryField[]> {
    const fields:FeishuLibraryField[]=[],ids=new Set<string>();let cursor:string|undefined
    for(let n=0;n<2;n++){
      const params=new URLSearchParams({page_size:'100',...(cursor?{page_token:cursor}:{})})
      const raw=await this.json(`/bitable/v1/apps/${appToken}/tables/${tableId}/fields?${params}`,token,undefined,signal)
      const parsed=page.extend({items:z.array(z.object({field_id:opaque,field_name:z.string().max(300),type:z.number().int()})).max(100)}).safeParse(raw.data)
      if(!parsed.success)fail('FEISHU_UNAVAILABLE')
      for(const field of parsed.data.items){if(ids.has(field.field_id))fail('FEISHU_UNAVAILABLE');ids.add(field.field_id);fields.push({id:field.field_id,name:field.field_name,type:field.type})}
      if(!parsed.data.has_more)return fields
      if(!parsed.data.items.length||!parsed.data.page_token||parsed.data.page_token===cursor)fail('FEISHU_UNAVAILABLE')
      cursor=parsed.data.page_token
    }
    fail('FEISHU_LIBRARY_LIMIT')
  }
  async records(source:{appToken:string;tableId:string;sourceUrl:string;fields:FeishuLibraryField[];mapping:FeishuLibraryMapping},token:string,signal?:AbortSignal) {
    const names=new Map(source.fields.map(f=>[f.id,f.name])), fieldNames=[...new Set(Object.values(source.mapping).filter((id):id is string=>!!id).map(id=>names.get(id)!))]
    const rows:PaperRecord[]=[],seen=new Set<string>(),tokens=new Set<string>()
    let cursor:string|undefined,complete=false
    for(let p=0;p<20;p++) {
      const params=new URLSearchParams({page_size:'100',user_id_type:'open_id',...(cursor?{page_token:cursor}:{})})
      const raw=await this.json(`/bitable/v1/apps/${source.appToken}/tables/${source.tableId}/records/search?${params}`,token,{field_names:fieldNames,automatic_fields:false},signal)
      const parsed=page.extend({items:z.array(z.object({record_id:opaque,fields:z.record(z.string(),z.unknown())})).max(100),total:z.number().int().nonnegative().optional()}).safeParse(raw.data)
      if(!parsed.success)fail('FEISHU_UNAVAILABLE')
      for(const record of parsed.data.items){
        if(seen.has(record.record_id))fail('FEISHU_UNAVAILABLE')
        seen.add(record.record_id)
        const read=(key:keyof FeishuLibraryMapping,limit:number)=>text(record.fields[names.get(source.mapping[key]??'')??'']).slice(0,limit)
        const url=new URL(source.sourceUrl);url.searchParams.set('record',record.record_id)
        rows.push({id:record.record_id,title:read('title',1000),year:read('year',100),date:read('date',100),grade:read('grade',300),venue:read('venue',1000),abstract:read('abstract',2000),authors:read('authors',1000),url:url.href})
      }
      if(!parsed.data.has_more){complete=true;break}
      cursor=parsed.data.page_token
      if(!cursor||tokens.has(cursor)||!parsed.data.items.length)fail('FEISHU_UNAVAILABLE')
      tokens.add(cursor)
    }
    return {rows,complete}
  }
}
