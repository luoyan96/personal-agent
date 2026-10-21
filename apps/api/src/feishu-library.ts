import { createHash } from 'node:crypto'
import { FeishuLibrary,FeishuLibraryResult,routes,type RequestFor,type ResponseFor } from '@research-agent-platform/contracts'
import { inferPaperFields,libraryRegistrationName,planPaperQuery,paperQueryContext,matchesPaper } from '@research-agent-platform/research-core'
import { z } from 'zod'
import type { DatabaseSync } from 'node:sqlite'
import type { Actor } from './auth.js'
import type { Config } from './config.js'
import { transaction } from './database.js'
import { encrypt,decrypt } from './lab-ai-settings.js'
import { fail } from './errors.js'
import { FeishuBitableClient,feishuBaseLink } from './integrations/feishu-bitable.js'
import { ResearchLibraryService } from './research-library.js'

const stored=FeishuLibrary.omit({collectionId:true,name:true,version:true}).extend({appToken:z.string()})
export class FeishuLibraryService {
  constructor(readonly db:DatabaseSync,readonly config:Config,readonly client:FeishuBitableClient){}
  private scope(actor:Actor){return `feishu:${this.config.feishu.appId}:${actor.labId}:${actor.id}`}
  private connection(actor:Actor){
    const row=this.db.prepare('SELECT * FROM feishu_connections WHERE member_id=? AND lab_id=? AND app_id=?').get(actor.id,actor.labId,this.config.feishu.appId??'')
    if(!row||String(row.expires_at)<=new Date(Date.now()+10000).toISOString())fail('FEISHU_REAUTHORIZE')
    return {version:row.version,token:decrypt(this.config,this.scope(actor),String(row.encrypted_token))}
  }
  private recheck(actor:Actor,version:unknown,reauthorize:()=>Actor){const current=reauthorize();if(current.id!==actor.id||current.labId!==actor.labId)fail('FORBIDDEN');if(this.connection(actor).version!==version)fail('FEISHU_REAUTHORIZE')}
  private async read<T>(actor:Actor,version:unknown,operation:()=>Promise<T>):Promise<T>{
    try{return await operation()}catch(error){
      if(error instanceof Error&&error.message==='FEISHU_REAUTHORIZE')this.db.prepare('DELETE FROM feishu_connections WHERE member_id=? AND lab_id=? AND app_id=? AND version=?').run(actor.id,actor.labId,this.config.feishu.appId!,version as string)
      throw error
    }
  }
  private source(actor:Actor,id:string){
    const row=this.db.prepare("SELECT f.*,c.name,c.version FROM feishu_library_sources f JOIN research_collections c ON c.id=f.collection_id WHERE f.collection_id=? AND f.member_id=? AND f.lab_id=? AND f.app_id=? AND c.owner_id=? AND c.lab_id=? AND c.scope='owner_private' AND c.status='available'").get(id,actor.id,actor.labId,this.config.feishu.appId??'',actor.id,actor.labId)
    if(!row)fail('NOT_FOUND')
    const value=stored.parse(JSON.parse(decrypt(this.config,this.scope(actor),String(row.encrypted_source))))
    return {...value,collectionId:id,name:String(row.name),version:Number(row.version)}
  }
  list(actor:Actor):ResponseFor<'feishuLibraries'>{
    const rows=this.db.prepare("SELECT f.collection_id FROM feishu_library_sources f JOIN research_collections c ON c.id=f.collection_id WHERE f.member_id=? AND f.lab_id=? AND f.app_id=? AND c.owner_id=? AND c.scope='owner_private' AND c.status='available' ORDER BY c.updated_at DESC LIMIT 100").all(actor.id,actor.labId,this.config.feishu.appId??'',actor.id)
    return {data:rows.map(r=>FeishuLibrary.strip().parse(this.source(actor,String(r.collection_id))))}
  }
  async bind(actor:Actor,body:RequestFor<'bindFeishuLibrary'>['body'],key:string,reauthorize:()=>Actor,signal?:AbortSignal):Promise<ResponseFor<'bindFeishuLibrary'>>{
    const link=feishuBaseLink(body.url),fingerprint=createHash('sha256').update(JSON.stringify(body)).digest('hex')
    if(body.tableId&&link.tableId&&body.tableId!==link.tableId)fail('FEISHU_LINK_INVALID')
    const cached=this.db.prepare("SELECT * FROM idempotency_results WHERE actor_id=? AND command='bindFeishuLibrary' AND resource_id='*' AND key=?").get(actor.id,key)
    if(cached){if(cached.request_hash!==fingerprint)fail('IDEMPOTENCY_CONFLICT');const saved=routes.bindFeishuLibrary.response.parse(JSON.parse(String(cached.response_json)));if(saved.data.state!=='bound')fail('INVALID_STATE');return {data:{state:'bound',library:FeishuLibrary.strip().parse(this.source(actor,saved.data.library.collectionId))}}}
    const connection=this.connection(actor),tables=await this.read(actor,connection.version,()=>this.client.tables(link.appToken,connection.token,signal))
    const requested=body.tableId??link.tableId,table=requested?tables.find(t=>t.id===requested):tables.length===1?tables[0]:undefined
    if(requested&&!table)fail('FEISHU_ACCESS_DENIED')
    if(!table){if(!tables.length)fail('FEISHU_ACCESS_DENIED');this.recheck(actor,connection.version,reauthorize);return {data:{state:'choose_table',tables}}}
    const fields=await this.read(actor,connection.version,()=>this.client.fields(link.appToken,table.id,connection.token,signal))
    let mapping;try{mapping=inferPaperFields(fields)}catch{fail('FEISHU_LIBRARY_SCHEMA')}
    const sourceUrl=`${link.origin}/base/${link.appToken}?table=${table.id}`,name=libraryRegistrationName(body.instruction,table.name)
    const sourceKey=createHash('sha256').update(`${link.appToken}:${table.id}`).digest('hex')
    if(signal?.aborted)fail('INVALID_STATE')
    this.recheck(actor,connection.version,reauthorize)
    return transaction(this.db,()=>{
      this.recheck(actor,connection.version,reauthorize)
      const replay=this.db.prepare("SELECT request_hash,response_json FROM idempotency_results WHERE actor_id=? AND command='bindFeishuLibrary' AND resource_id='*' AND key=?").get(actor.id,key)
      if(replay){if(replay.request_hash!==fingerprint)fail('IDEMPOTENCY_CONFLICT');const value=routes.bindFeishuLibrary.response.parse(JSON.parse(String(replay.response_json)));if(value.data.state!=='bound')fail('INVALID_STATE');return {data:{state:'bound' as const,library:FeishuLibrary.strip().parse(this.source(actor,value.data.library.collectionId))}}}
      const same=this.db.prepare('SELECT collection_id FROM feishu_library_sources WHERE member_id=? AND lab_id=? AND app_id=? AND source_key=?').get(actor.id,actor.labId,this.config.feishu.appId!,sourceKey)
      const duplicate=this.db.prepare("SELECT id FROM research_collections WHERE owner_id=? AND lab_id=? AND status='available' AND lower(name)=lower(?) AND id!=?").get(actor.id,actor.labId,name,String(same?.collection_id??''))
      if(duplicate)fail('FEISHU_LIBRARY_NAME_CONFLICT')
      let id=String(same?.collection_id??'')
      if(id){
        const existing=this.db.prepare('SELECT owner_id,scope,status FROM research_collections WHERE id=?').get(id)
        if(existing?.owner_id!==actor.id||existing.scope!=='owner_private')fail('FORBIDDEN')
        this.db.prepare("UPDATE research_collections SET name=?,status='available',version=version+1,updated_at=? WHERE id=?").run(name,new Date().toISOString(),id)
      }else{
        const library=new ResearchLibraryService(this.db,actor,this.config.blobRoot)
        const created=library.run('createResearchCollection',{params:{},query:{},headers:{},body:{name,description:'飞书外部资料库；按问题实时只读查询，原始资料在飞书维护。',scope:'owner_private',taskIds:[]}}) as ResponseFor<'createResearchCollection'>
        id=created.data.id
      }
      const source=stored.parse({appToken:link.appToken,sourceUrl,tableId:table.id,tableName:table.name,fields,mapping})
      this.db.prepare('INSERT INTO feishu_library_sources VALUES (?,?,?,?,?,?) ON CONFLICT(collection_id) DO UPDATE SET encrypted_source=excluded.encrypted_source').run(id,actor.id,actor.labId,this.config.feishu.appId!,sourceKey,encrypt(this.config,this.scope(actor),JSON.stringify(source)))
      const result=routes.bindFeishuLibrary.response.parse({data:{state:'bound',library:FeishuLibrary.strip().parse(this.source(actor,id))}})
      this.db.prepare('INSERT INTO idempotency_results VALUES (?,?,?,?,?,?,?,?)').run(actor.id,'bindFeishuLibrary','*',key,fingerprint,JSON.stringify(result),200,new Date().toISOString())
      return result
    })
  }
  async query(actor:Actor,body:RequestFor<'queryFeishuLibrary'>['body'],reauthorize:()=>Actor,signal?:AbortSignal):Promise<ResponseFor<'queryFeishuLibrary'>>{
    const source=this.source(actor,body.collectionId),connection=this.connection(actor)
    const fields=await this.read(actor,connection.version,()=>this.client.fields(source.appToken,source.tableId,connection.token,signal))
    // Names may change, identities/types must still match the saved mapping.
    for(const id of Object.values(source.mapping).filter(Boolean)){const old=source.fields.find(f=>f.id===id),current=fields.find(f=>f.id===id);if(!current||old?.type!==current.type)fail('FEISHU_LIBRARY_SCHEMA')}
    const fresh={...source,fields},library=FeishuLibrary.strip().parse(fresh),plan=planPaperQuery(body.question,source.mapping,new Date(),body.previousQuestion,source.name)
    this.recheck(actor,connection.version,reauthorize)
    if(this.source(actor,body.collectionId).version!==source.version)fail('VERSION_CONFLICT')
    const base={library,readAt:new Date().toISOString(),question:body.question,contextQuestion:plan.clarification?body.question:paperQueryContext(plan),conditions:plan.conditions,limitations:['仅查询本次飞书用户身份可读记录；高级权限可能限制返回范围。','会议等级与发表信息来自库中标注，未独立核验；未读取附件 PDF 全文。','分页读取不是锁定快照；读取期间飞书表若有改动，需重新查询核对。']}
    if(plan.clarification){this.recheck(actor,connection.version,reauthorize);return {data:FeishuLibraryResult.parse({...base,state:'clarification',clarification:plan.clarification,scanned:0,matched:0,complete:false,records:[]})}}
    const scan=await this.read(actor,connection.version,()=>this.client.records(fresh,connection.token,signal))
    if(signal?.aborted)fail('INVALID_STATE')
    this.recheck(actor,connection.version,reauthorize)
    const current=this.source(actor,body.collectionId);if(current.version!==source.version)fail('VERSION_CONFLICT')
    const matched=scan.rows.filter(r=>matchesPaper(r,plan)),limitations=[...base.limitations]
    if(!scan.complete)limitations.push('已到本次2000条扫描上限，结果仅覆盖已读部分，不能视为全库统计。')
    if(!scan.rows.length)limitations.push('飞书返回零条可读记录，可能是空表或高级权限限制；不能确认整个库没有论文。')
    if(matched.length>50)limitations.push('匹配超过50条，下方仅展示前50条；请缩小年份或关键词。')
    return {data:FeishuLibraryResult.parse({...base,readAt:new Date().toISOString(),state:'results',clarification:null,scanned:scan.rows.length,matched:matched.length,complete:scan.complete,records:matched.slice(0,50),limitations})}
  }
}
