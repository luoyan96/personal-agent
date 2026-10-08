import { ReuseService, reuseCommands } from './reuse.js'
import type { ReuseCommand } from './reuse.js'
import { AiService, aiCommands } from './ai.js'
import type { AiCommand } from './ai.js'
import { reconcile } from './execution-worker.js'
import Fastify from 'fastify'
import {runSkills,type SkillCommand} from './skills.js'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { contractVersion, data, Health, ErrorResponse, errorStatus, routes } from '@research-agent-platform/contracts'
import { openDatabase, checkDatabase, transaction } from './database.js'
import { checkStorage } from './storage.js'
import type { Config } from './config.js'
import { authenticate, cookieToken, csrfToken, hash, login, requireCsrf, signingKey } from './auth.js'
import { Collaboration, collaborationCommands } from './collaboration.js'
import type { CollaborationCommand } from './collaboration.js'
import type { RequestFor } from '@research-agent-platform/contracts'
import { cleanBlobs } from './coordination.js'
import { ApiError, fail } from './errors.js'
import type { AuthValidationField } from './errors.js'
import { register } from './registration.js'
import { personalModelCommands, runPersonalModel } from './personal-models.js'
import { isLabManager, managerInvites, createManagerInvite, revokeManagerInvite } from './invite-management.js'
import { labAiRuntime, labAiSettings, updateLabAiSettings } from './lab-ai-settings.js'
import { extractAgentFile } from './agent-files.js'
import { ChatService } from './chat.js'
import { beginConnectionProbe, finishConnectionProbe } from './agent-connections.js'
import { callExternalAgent, type ExternalAgentCall } from './external-agent-client.js'
import type { ChatCommand } from './chat.js'
import { reconcileChat } from './chat-worker.js'
import { OpenImBridge } from './openim-bridge.js'
import { OpenImClient } from './openim-client.js'
import { OpenImCallbacks } from './openim-callback.js'

export function createServer(config: Config, options:{imClient?:OpenImClient;externalCall?:ExternalAgentCall}={}) {
  if(options.imClient&&config.mode!=='test')throw new Error('Injected OpenIM clients are test-only')
  if(options.externalCall&&config.mode!=='test')throw new Error('Injected external Agent clients are test-only')
  const imClient=options.imClient??new OpenImClient(config)
  const app = Fastify({ logger: false, bodyLimit: 1048576, genReqId: () => randomUUID(), requestTimeout: 10000 })
  let db: ReturnType<typeof openDatabase> | undefined
  function database() {
    try {
      if (!db) {
        db = openDatabase(config.databasePath)
        checkDatabase(db)
        signingKey(db)
      }
      return db
    } catch { db?.close(); db = undefined; fail('SERVICE_UNAVAILABLE') }
  }
  app.addHook('onClose', async () => { db?.close() })
  app.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); reply.header('X-Contract-Version', contractVersion); reply.header('X-Content-Type-Options', 'nosniff') })
  const authValidationMessages={username:'用户名只能使用字母、数字、下划线或短横线，长度为 1 到 100 个字符。',password:'密码至少需要 8 个字符。',inviteCode:'请输入有效的邀请码。',displayName:'请输入 1 到 200 个字符的显示名称。'} satisfies Record<AuthValidationField,string>
  function error(code: keyof typeof errorStatus, requestId: string, field?:AuthValidationField) {
    const fileErrors:Partial<Record<keyof typeof errorStatus,string>>={EXTERNAL_CONSENT_REQUIRED:'请明确同意将本条文字发送至该 Agent 的外部服务。',EXTERNAL_FILES_UNSUPPORTED:'外部 Agent 暂不支持附件读取，请仅发送本条文字。',EXTERNAL_SCOPE_UNSUPPORTED:'外部 Agent 仅支持文字私聊，不支持任务安排。',EXTERNAL_ENDPOINT_UNSAFE:'外部服务须为公开 HTTPS 地址，不允许内部地址、重定向或 URL 凭据。',FILE_UNSUPPORTED:'仅支持 PDF、UTF8 txt、md 或 csv 文件。',FILE_TOO_LARGE:'文件不能超过 10 MiB。',FILE_INVALID_ENCODING:'文本文件必须为有效的 UTF8 编码。',FILE_ENCRYPTED:'无法读取加密 PDF，请解密后重新发送。',FILE_NO_TEXT:'文件没有可提取的文字；扫描 PDF 需要先做 OCR。',FILE_PARSE_FAILED:'文件损坏或无法解析，请换一个文件。',FILE_PARSE_TIMEOUT:'文件解析超时，请减少页数后重试。',FILE_EXTRACTION_LIMIT:'文件超过 200 页、20 万字符或解析资源上限。',FILE_PAGE_UNAVAILABLE:'选择的页码不在这个附件中。'}
    const message=fileErrors[code]??(code==='VALIDATION_ERROR'?(field?authValidationMessages[field]:'请检查填写内容和请求格式。'):code==='NOT_IMPLEMENTED'?'Endpoint is not implemented in B3.':'Request could not be completed.')
    return ErrorResponse.parse({ error: { code, message, requestId } })
  }
  app.get('/api/v1/health/live', async () => data(Health).parse({ data: { status: 'ok', contractVersion, checks: { database: 'not_checked', storage: 'not_checked', authentication: 'not_checked', harness: 'not_verified' } } }))
  app.get('/api/v1/health/ready', async (_request, reply) => {
    let database: 'ok' | 'unavailable' = 'unavailable'
    let storage: 'ok' | 'unavailable' = 'unavailable'
    try {
      if (!existsSync(config.databasePath)) throw new Error('Database missing')
      db ??= openDatabase(config.databasePath)
      checkDatabase(db); signingKey(db); database = 'ok'
    } catch { db?.close(); db = undefined /* Do not return database paths, SQL, or exceptions. */ }
    try { await checkStorage(config.blobRoot); storage = 'ok' } catch { /* Same privacy boundary. */ }
    const ok = database === 'ok' && storage === 'ok'
    reply.code(ok ? 200 : 503)
    return data(Health).parse({ data: { status: ok ? 'ok' : 'unavailable', contractVersion, checks: { database, storage, authentication: database, harness: 'not_verified' } } })
  })
  app.post('/api/v1/im/callback/:key/:command', async request=>{
    const params=request.params as {key:string;command:string},connection=database(),callbacks=new OpenImCallbacks(new OpenImBridge(connection,config,imClient))
    callbacks.authenticate(params.key)
    const header=(name:string)=>typeof request.headers[name]==='string'?String(request.headers[name]):''
    return transaction(connection,()=>callbacks.handle(params.command,request.body as Record<string,unknown>,{userID:header('x-rap-openim-operator'),platform:header('x-rap-openim-platform'),policy:header('x-rap-openim-policy'),operationID:header('operationid')}))
  })
  for (const [name, route] of Object.entries(routes)) {
    if (route.stage === 'B0') continue
    app.route({ method: route.method, url: route.path.replace(/\{(\w+)\}/g, ':$1'), ...((name==='upload'||name==='agentFileMessage')?{bodyLimit:14000000}:name==='register'?{bodyLimit:8192}:{}), handler: async (request, reply) => {
      if (!route.implemented && name !== 'planRequest') fail('NOT_IMPLEMENTED')
      if (route.method !== 'GET' && request.headers.origin !== config.origin) fail('FORBIDDEN')
      const connection = database()
      const token = cookieToken(request.headers.cookie)
      // Reject malformed query numbers instead of accepting 1x, arrays, or coercing null.
      const query = { ...request.query as Record<string, unknown> }
      if ('limit' in query && typeof query.limit === 'string' && /^\d+$/.test(query.limit)) query.limit = Number(query.limit)
      if ('afterSequence' in query && typeof query.afterSequence === 'string' && /^\d+$/.test(query.afterSequence)) query.afterSequence = Number(query.afterSequence)
      if((name==='upload'||name==='agentFileMessage') && typeof (request.body as {contentBase64?:unknown})?.contentBase64==='string' && (request.body as {contentBase64:string}).contentBase64.length>13981016) fail(name==='agentFileMessage'?'FILE_TOO_LARGE':'PAYLOAD_TOO_LARGE')
      if(name==='agentFileMessage'&&typeof (request.body as {mediaType?:unknown})?.mediaType==='string'&&!['application/pdf','text/plain','text/markdown','text/csv'].includes((request.body as {mediaType:string}).mediaType))fail('FILE_UNSUPPORTED')
      const parsed = route.request.safeParse({ params: request.params, query, headers: route.idempotent ? { 'Idempotency-Key': request.headers['idempotency-key'] } : {}, body: route.method === 'GET' ? null : request.body })
      if (!parsed.success) {
        const field=['login','register'].includes(name)?parsed.error.issues.find(issue=>issue.path[0]==='body'&&typeof issue.path[1]==='string'&&Object.hasOwn(authValidationMessages,issue.path[1]))?.path[1] as AuthValidationField|undefined:undefined
        fail('VALIDATION_ERROR',field)
      }
      reply.code(route.status)
      if (name === 'register') return routes.register.response.parse(await register(connection,parsed.data as RequestFor<'register'>,request.ip))
      const cookie = (value: string, maxAge: number) => `rap_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.mode === 'production' ? '; Secure' : ''}`
      if (name === 'login') {
        const input = parsed.data as RequestFor<'login'>
        const loggedIn = await login(connection, input.body.username, input.body.password, request.ip, token)
        reply.header('Set-Cookie', cookie(loggedIn.token, 43200))
        return transaction(connection, () => {
          const actor = authenticate(connection, loggedIn.token)
          return routes.login.response.parse({ data: new Collaboration(connection, actor).member(loggedIn.memberId) })
        })
      }
      if(name==='agentFileMessage'){
        const input=parsed.data as RequestFor<'agentFileMessage'>
        const authorized=()=>{const actor=authenticate(connection,token);requireCsrf(actor,request.headers['x-csrf-token']);const runtime=labAiRuntime(connection,actor.labId,config);return new ChatService(new Collaboration(connection,actor,config.blobRoot,runtime),config)}
        const initial=transaction(connection,()=>{const chat=authorized();return {cached:chat.run('agentFileMessage',input,undefined,true)}})
        if(initial.cached)return routes.agentFileMessage.response.parse(initial.cached)
        const controller=new AbortController();request.raw.once('aborted',()=>controller.abort());reply.raw.once('close',()=>{if(!reply.raw.writableEnded)controller.abort()})
        const extraction=await extractAgentFile(input.body,controller.signal)
        if(controller.signal.aborted)fail('INVALID_STATE')
        return transaction(connection,()=>{const chat=authorized();const result=chat.run('agentFileMessage',input,extraction);reconcileChat(connection,config);return result})
      }
      if(name==='probeAgentConnection'){
        const input=parsed.data as RequestFor<'probeAgentConnection'>
        const authorized=()=>{const actor=authenticate(connection,token);requireCsrf(actor,request.headers['x-csrf-token']);return new ChatService(new Collaboration(connection,actor,config.blobRoot,labAiRuntime(connection,actor.labId,config)),config)}
        const prepared=transaction(connection,()=>beginConnectionProbe(authorized(),input))
        if(prepared.cached)return route.response.parse(prepared.cached)
        const job=prepared.job!,controller=new AbortController();request.raw.once('aborted',()=>controller.abort());reply.raw.once('close',()=>{if(!reply.raw.writableEnded)controller.abort()})
        const result=await (options.externalCall??callExternalAgent)({endpoint:job.endpoint,model:job.model,apiKey:job.apiKey,text:'Connection check: reply briefly.',maxTokens:128,timeoutMs:15000},controller.signal)
        if(controller.signal.aborted)fail('INVALID_STATE')
        return transaction(connection,()=>finishConnectionProbe(authorized(),input,result))
      }
      if(route.stage==='IM1'&&!route.idempotent){
        const reauthorize=()=>authenticate(connection,token)
        const actor=transaction(connection,()=>{const value=reauthorize();if(route.method!=='GET')requireCsrf(value,request.headers['x-csrf-token']);return value})
        const bridge=new OpenImBridge(connection,config,imClient)
        let result:unknown
        if(name==='imSession')result={data:await bridge.session(token,(parsed.data as RequestFor<'imSession'>).body.platformID)}
        else if(name==='imSync')result={data:await bridge.sync(actor,reauthorize)}
        else if(name==='imSyncConversation')result={data:await bridge.syncConversation(actor,(parsed.data.params as {id:string}).id,reauthorize)}
        else result=transaction(connection,()=>{const chat=bridge.chat(reauthorize());return {data:name==='imContacts'?bridge.contacts(chat):bridge.conversations(chat,(parsed.data.query as {imConversationID?:string}).imConversationID)}})
        transaction(connection,reauthorize)
        return route.response.parse(result)
      }
      let collaboration: Collaboration | undefined
      try { return transaction(connection, () => {
        const actor = authenticate(connection, token)
        if (route.method !== 'GET') requireCsrf(actor, request.headers['x-csrf-token'])
        if (name === 'session') return routes.session.response.parse({ data: { member: new Collaboration(connection, actor).member(actor.id), csrfToken: csrfToken(connection, token), expiresAt: actor.expiresAt, isLabManager:isLabManager(connection,actor), spaceKind:connection.prepare('SELECT 1 FROM personal_spaces WHERE lab_id=?').get(actor.labId)?'personal':'laboratory' } })
        if (name === 'logout') {
          connection.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?').run(new Date().toISOString(), hash(token))
          reply.header('Set-Cookie', cookie('', 0)); return { data: { loggedOut: true } }
        }
        if (name === 'managerInvites') return routes.managerInvites.response.parse(managerInvites(connection,actor,parsed.data as RequestFor<'managerInvites'>))
        if (name === 'createManagerInvite') return routes.createManagerInvite.response.parse(createManagerInvite(connection,actor,parsed.data as RequestFor<'createManagerInvite'>))
        if (name === 'revokeManagerInvite') return routes.revokeManagerInvite.response.parse(revokeManagerInvite(connection,actor,parsed.data as RequestFor<'revokeManagerInvite'>))
        if((personalModelCommands as readonly string[]).includes(name)){const result=runPersonalModel(connection,actor,name as typeof personalModelCommands[number],parsed.data as RequestFor<typeof personalModelCommands[number]>,config);reconcileChat(connection,config);return route.response.parse(result)}
        if (name === 'labAiSettings') return routes.labAiSettings.response.parse(labAiSettings(connection,actor,parsed.data as RequestFor<'labAiSettings'>,config))
        if (name === 'updateLabAiSettings') return routes.updateLabAiSettings.response.parse(updateLabAiSettings(connection,actor,parsed.data as RequestFor<'updateLabAiSettings'>,config))
        const labAi = labAiRuntime(connection,actor.labId,config)
        collaboration = new Collaboration(connection,actor,config.blobRoot,labAi)
        reconcile(connection,config)
        reconcileChat(connection,config)
        if(route.stage==='SKILL1'){const result=runSkills(new ChatService(collaboration,config),name as SkillCommand,parsed.data as RequestFor<SkillCommand>);reconcileChat(connection,config);return result}
        if(route.stage==='CHAT1'||route.stage==='IM1'){const result=new ChatService(collaboration,config).run(name as ChatCommand,parsed.data as RequestFor<ChatCommand>);reconcileChat(connection,config);return result}
        if((reuseCommands as readonly string[]).includes(name)){const result=new ReuseService(collaboration).run(name as ReuseCommand,parsed.data as RequestFor<ReuseCommand>);reconcile(connection,config);return result}
        if((aiCommands as readonly string[]).includes(name))return new AiService(collaboration,labAi.enabled,labAi.model).run(name as AiCommand,parsed.data as RequestFor<AiCommand>)
        if (!(collaborationCommands as readonly string[]).includes(name)) fail('NOT_IMPLEMENTED')
        const result=collaboration.run(name as CollaborationCommand, parsed.data as RequestFor<CollaborationCommand>)
        reconcile(connection,config)
        reconcileChat(connection,config)
        if(name==='content') {const file=collaboration.coordination.artifact((parsed.data.params as {id:string}).id).model;reply.header('Content-Type',file.mediaType);reply.header('Content-Disposition',`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);return Buffer.from(result as Uint8Array)}
        return result
      }) } catch(error) {if(collaboration) cleanBlobs(collaboration.createdBlobs);throw error}
    } })
  }
  app.setNotFoundHandler((request, reply) => reply.code(404).send(error('NOT_FOUND', request.id)))
  app.setErrorHandler((err, request, reply) => {
    const status = (err as { statusCode?: number }).statusCode
    const code = err instanceof ApiError ? err.code : status === 413 ? request.url.includes('/agent-files')?'FILE_TOO_LARGE':'PAYLOAD_TOO_LARGE' : status === 400 || status === 415 ? 'VALIDATION_ERROR' : (err as { code?: string }).code === 'ERR_SQLITE_ERROR' && /locked|busy/i.test(String(err)) ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR'
    if (code === 'RATE_LIMITED') reply.header('Retry-After', '900')
    reply.code(errorStatus[code]).send(error(code, request.id,err instanceof ApiError?err.validationField:undefined))
  })
  return app
}
