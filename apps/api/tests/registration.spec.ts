import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, checkDatabase } from '../src/database.js'
import { createServer } from '../src/server.js'
import { maintain } from '../src/maintenance.js'
import { hash } from '../src/auth.js'
import { backup, restore } from '../src/recovery.js'

const cleanup: (()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
async function setup(maxUses=5) {
 const dir=mkdtempSync(join(tmpdir(),'rap-register-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
 const config=readConfig({NODE_ENV:'production',DATABASE_PATH:join(dir,'db.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'https://research.test',PORT:'0'})
 mkdirSync(config.blobRoot)
 const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db)
 const op=(command:object)=>maintain(db,config,'registration_test',{requestId:randomUUID(),labId:'lab_one',...command})
 await op({action:'create-lab',name:'Synthetic team'})
 const inviteCode='RAP-'+randomBytes(24).toString('base64url')
 await op({action:'create-registration-invite',inviteId:'invite_one',codeHash:hash(inviteCode),expiresAt:new Date(Date.now()+3600000).toISOString(),maxUses})
 const app=createServer(config);cleanup.push(()=>app.close())
 const payload=(username='new_member')=>({inviteCode,username,displayName:'Synthetic member',password:'synthetic-only-password-2026'})
 const register=(body=payload(),key=randomUUID(),server=app)=>server.inject({method:'POST',url:'/api/v1/auth/register',headers:{origin:config.origin,'idempotency-key':key},payload:body})
 const login=async(username='new_member',server=app)=>server.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:config.origin},payload:{username,password:payload().password}})
 return {dir,config,db,app,op,inviteCode,payload,register,login}
}
describe('invitation registration',()=>{
 it('creates ordinary membership atomically, stores only password/code digests, then issues secure login',async()=>{
  const s=await setup();const r=await s.register();expect(r.statusCode).toBe(201);expect(r.headers['set-cookie']).toBeUndefined()
  const account=s.db.prepare('SELECT * FROM auth_accounts').get()!;expect(account.password_hash).toMatch(/^scrypt-v1\$/)
  expect(s.db.prepare('SELECT lab_id FROM members').get()!.lab_id).toBe('lab_one')
  expect(s.db.prepare('SELECT used_count FROM registration_invites').get()!.used_count).toBe(1)
  expect(s.db.prepare('SELECT version FROM account_controls').get()!.version).toBe(1)
  const persisted=JSON.stringify({invites:s.db.prepare('SELECT * FROM registration_invites').all(),receipts:s.db.prepare('SELECT * FROM registration_receipts').all(),audit:s.db.prepare('SELECT * FROM maintenance_audit').all(),account})
  expect(persisted).not.toContain(s.inviteCode);expect(persisted).not.toContain(s.payload().password)
  const auth=await s.login();expect(auth.statusCode).toBe(200);expect(auth.headers['set-cookie']).toContain('Secure');expect(auth.headers['set-cookie']).toContain('HttpOnly')
 })
 it('uses real HTTP for eight-character passwords and whitespace-normalized identities without exposing schema internals',async()=>{
  const s=await setup(),url=await s.app.listen({host:'127.0.0.1',port:0})
  const http=(path:string,body:object,key=randomUUID())=>fetch(url+path,{method:'POST',headers:{origin:s.config.origin,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)})
  const short=await http('/api/v1/auth/register',{...s.payload(),password:'1234567'})
  expect(short.status).toBe(400);expect((await short.json()).error).toMatchObject({code:'VALIDATION_ERROR',message:'密码至少需要 8 个字符。'})
  expect(s.db.prepare('SELECT used_count FROM registration_invites').get()!.used_count).toBe(0)
  const key=randomUUID(),body={...s.payload(' \tluoyan\u3000'),inviteCode:` \n${s.inviteCode}\t`,password:'12345678'}
  const registered=await http('/api/v1/auth/register',body,key)
  expect(registered.status).toBe(201);expect(await registered.json()).toEqual({data:{registered:true,username:'luoyan'}})
  expect(s.db.prepare('SELECT username FROM auth_accounts').get()!.username).toBe('luoyan')
  expect((await http('/api/v1/auth/register',{...body,username:'luoyan',inviteCode:s.inviteCode},key)).status).toBe(201)
  expect(s.db.prepare('SELECT used_count FROM registration_invites').get()!.used_count).toBe(1)
  const login=await http('/api/v1/auth/login',{username:'\t luoyan \n',password:'12345678'})
  expect(login.status).toBe(200)
  const member=(await login.json()).data;expect(member.labId).toBe('lab_one')
  expect((await http('/api/v1/auth/register',{...s.payload('luoyan '),password:'12345678'})).status).toBe(409)
  for(const username of ['bad name','luoyan\u200b','ｌｕｏｙａｎ']){
   for(const path of ['/api/v1/auth/register','/api/v1/auth/login']){
    const invalid=await http(path,path.endsWith('register')?s.payload(username):{username,password:'12345678'}),text=await invalid.text()
    expect(invalid.status).toBe(400);expect(JSON.parse(text).error.message).toContain('用户名只能使用')
    for(const internal of ['invalid_format','pattern','Zod','regex','issues',username])expect(text).not.toContain(internal)
   }
  }
  const paddedPassword=' 12345678 ',longPassword='x'.repeat(300)
  for(const [username,password] of [['padded_password',paddedPassword],['long_password',longPassword]]){
   expect((await http('/api/v1/auth/register',{...s.payload(username),password})).status).toBe(201)
   expect((await http('/api/v1/auth/login',{username,password})).status).toBe(200)
  }
  expect((await http('/api/v1/auth/login',{username:'padded_password',password:paddedPassword.trim()})).status).toBe(401)
  expect((await http('/api/v1/auth/register',{...s.payload('oversized'),password:'x'.repeat(9000)})).status).toBe(413)
 })
 it('uses the same normalized identity and eight-character minimum for maintained accounts and password resets',async()=>{
  const s=await setup()
  await expect(s.op({action:'create-account',memberId:'manual',username:'manual',displayName:'Synthetic member',password:'1234567'})).rejects.toThrow('INVALID_INPUT')
  await s.op({action:'create-account',memberId:'manual',username:' manual ',displayName:'Synthetic member',password:'12345678'})
  expect(s.db.prepare('SELECT username FROM auth_accounts').get()!.username).toBe('manual')
  await expect(s.op({action:'create-account',memberId:'duplicate',username:'manual',displayName:'Synthetic member',password:'12345678'})).rejects.toThrow('ACCOUNT_EXISTS')
  await expect(s.op({action:'reset-password',memberId:'manual',expectedVersion:1,password:'1234567'})).rejects.toThrow('INVALID_INPUT')
  await s.op({action:'reset-password',memberId:'manual',expectedVersion:1,password:'87654321'})
  const login=await s.app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:s.config.origin},payload:{username:' manual ',password:'87654321'}})
  expect(login.statusCode).toBe(200)
  const long='z'.repeat(300);await s.op({action:'reset-password',memberId:'manual',expectedVersion:2,password:long})
  expect((await s.app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:s.config.origin},payload:{username:'manual',password:long}})).statusCode).toBe(200)
 })
 it('replays an acknowledged or lost success after expiry without consuming another seat; changed request conflicts',async()=>{
  const s=await setup(1),key=randomUUID();const first=await s.register(s.payload(),key)
  await s.op({action:'revoke-registration-invite',inviteId:'invite_one'})
  expect((await s.register(s.payload(),key)).body).toBe(first.body)
  expect((await s.register({...s.payload(),displayName:'Changed'},key)).json().error.code).toBe('IDEMPOTENCY_CONFLICT')
  expect(s.db.prepare('SELECT count(*) n FROM auth_accounts').get()!.n).toBe(1)
  expect(s.db.prepare('SELECT used_count FROM registration_invites').get()!.used_count).toBe(1)
 })
 it('does not reset or re-enable an existing account on registration retry',async()=>{
  const s=await setup(),key=randomUUID();await s.register(s.payload(),key)
  const memberId=String(s.db.prepare('SELECT member_id FROM auth_accounts').get()!.member_id)
  await s.op({action:'disable-account',memberId,expectedVersion:1})
  expect((await s.register(s.payload(),key)).statusCode).toBe(201)
  expect((await s.login()).statusCode).toBe(401)
 })
 it('rejects invalid, expired, revoked and exhausted codes with the same redacted error',async()=>{
  const s=await setup(1)
  expect((await s.register({...s.payload(),inviteCode:'x'.repeat(24)})).json().error.code).toBe('INVITE_UNAVAILABLE')
  s.db.prepare('UPDATE registration_invites SET expires_at=?').run('2000-01-01T00:00:00.000Z')
  expect((await s.register()).json().error.code).toBe('INVITE_UNAVAILABLE')
  s.db.prepare('UPDATE registration_invites SET expires_at=?').run(new Date(Date.now()+60000).toISOString())
  await s.register();expect((await s.register(s.payload('second'))).json().error.code).toBe('INVITE_UNAVAILABLE')
  await s.op({action:'revoke-registration-invite',inviteId:'invite_one'})
  const denied=await s.register(s.payload('third'));expect(denied.json().error.code).toBe('INVITE_UNAVAILABLE');expect(denied.body).not.toContain('lab_one')
 })
 it('does not consume capacity on a duplicate username and checks invitation before revealing duplication',async()=>{
  const s=await setup();await s.register()
  expect((await s.register()).json().error.code).toBe('USERNAME_TAKEN')
  expect((await s.register({...s.payload(),inviteCode:'x'.repeat(24)})).json().error.code).toBe('INVITE_UNAVAILABLE')
  expect(s.db.prepare('SELECT used_count FROM registration_invites').get()!.used_count).toBe(1)
 })
 it('requires same Origin, strict fields, minimum password length and idempotency key',async()=>{
  const s=await setup()
  for(const origin of [undefined,'https://evil.test']){
   const r=await s.app.inject({method:'POST',url:'/api/v1/auth/register',headers:{...(origin?{origin}:{}),'idempotency-key':randomUUID()},payload:s.payload()});expect(r.statusCode).toBe(403)
  }
  for(const extra of [{labId:'other'},{role:'admin'},{memberId:'existing'},{password:'short'},{displayName:'   '}])expect((await s.register({...s.payload(),...extra})).statusCode).toBe(400)
  expect((await s.app.inject({method:'POST',url:'/api/v1/auth/register',headers:{origin:s.config.origin},payload:s.payload()})).statusCode).toBe(400)
  expect((await s.register({...s.payload(),displayName:'X'.repeat(9000)})).statusCode).toBe(413)
  expect(s.db.prepare('SELECT count(*) n FROM members').get()!.n).toBe(0)
 })
 it('allows only one winner for the final seat through two real HTTP servers and preserves retry after restart',async()=>{
  const s=await setup(1),other=createServer(s.config);cleanup.push(()=>other.close())
  const urls=await Promise.all([s.app.listen({host:'127.0.0.1',port:0}),other.listen({host:'127.0.0.1',port:0})])
  const bodies=[s.payload('concurrent_A'),s.payload('concurrent_B')],keys=[randomUUID(),randomUUID()]
  const responses=await Promise.all(urls.map((url,i)=>fetch(url+'/api/v1/auth/register',{method:'POST',headers:{origin:s.config.origin,'content-type':'application/json','idempotency-key':keys[i]!},body:JSON.stringify(bodies[i])})))
  expect(responses.map(r=>r.status).sort()).toEqual([201,400])
  const winner=responses.findIndex(r=>r.status===201)
  await other.close();const restarted=createServer(s.config);cleanup.push(()=>restarted.close())
  expect((await s.register(bodies[winner],keys[winner],restarted)).statusCode).toBe(201)
  expect(s.db.prepare('SELECT count(*) n FROM auth_accounts').get()!.n).toBe(1)
 })
 it('rechecks revocation while password hashing is in flight',async()=>{
  const again=await setup();const pending=again.register();void pending.then(()=>{})
  for(let i=0;i<100 && !again.db.prepare('SELECT 1 FROM registration_work').get();i++)await new Promise(resolve=>setTimeout(resolve,1))
  expect(again.db.prepare('SELECT 1 FROM registration_work').get()).toBeTruthy()
  await again.op({action:'revoke-registration-invite',inviteId:'invite_one'})
  expect((await pending).json().error.code).toBe('INVITE_UNAVAILABLE')
  expect(again.db.prepare('SELECT count(*) n FROM auth_accounts').get()!.n).toBe(0)
 })
 it('persists rate limits across server restarts and bounds concurrent KDF admission',async()=>{
  const s=await setup()
  for(let i=0;i<20;i++)expect((await s.register({...s.payload(),inviteCode:'x'.repeat(24)})).statusCode).toBe(400)
  const other=createServer(s.config);cleanup.push(()=>other.close())
  const r=await s.register(s.payload(),randomUUID(),other);expect(r.statusCode).toBe(429);expect(r.headers['retry-after']).toBe('900')
  s.db.exec('DELETE FROM login_limits');s.db.prepare('INSERT INTO registration_work VALUES (?,?)').run('one',Date.now()+60000);s.db.prepare('INSERT INTO registration_work VALUES (?,?)').run('two',Date.now()+60000)
  expect((await s.register()).statusCode).toBe(429)
  s.db.exec('UPDATE registration_work SET expires_at=0');expect((await s.register()).statusCode).toBe(201)
 })
 it('keeps newly registered members out of other laboratories',async()=>{
  const s=await setup();await s.op({action:'create-lab',labId:'other_lab',name:'Other team'});await s.register()
  const auth=await s.login(),cookie=String(auth.headers['set-cookie']).split(';')[0]!
  expect((await s.app.inject({url:'/api/v1/labs/other_lab/members',headers:{cookie}})).statusCode).toBe(404)
  const same=await s.app.inject({url:'/api/v1/labs/lab_one/members',headers:{cookie}});expect(same.statusCode).toBe(200);expect(same.json().data).toHaveLength(1)
 })
 it('revokes invitation codes in an isolated restore and retains created accounts',async()=>{
  const s=await setup();await s.register();await s.app.close()
  const backupPath=join(s.dir,'backup'),restored=join(s.dir,'restore')
  backup(s.config,backupPath,'test','a'.repeat(40),'registration-test');restore(backupPath,restored,'test')
  const db=openDatabase(join(restored,'platform.sqlite'));cleanup.push(()=>db.close())
  expect(db.prepare('SELECT revoked_at FROM registration_invites').get()!.revoked_at).toBeTruthy()
  expect(db.prepare('SELECT count(*) n FROM auth_accounts').get()!.n).toBe(1)
 })
 it('upgrades migration 008 twice without changing existing labs, accounts or sessions',async()=>{
  const s=await setup(),path=join(s.dir,'old.sqlite'),db=openDatabase(path,true);cleanup.push(()=>db.close())
  db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT')
  for(const [i,name] of ['001-foundation','002-collaboration','003-invitation-decisions','004-discovery','005-coordination','006-execution','007-authorized-reuse','008-pilot-operations'].entries()){
   const sql=readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8');db.exec(sql);db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(i+1,createHash('sha256').update(sql).digest('hex'),'2026-10-01T00:00:00Z')
  }
  db.exec("INSERT INTO labs VALUES('old','Old team'); INSERT INTO members(id,lab_id,display_name) VALUES('old_member','old','Existing'); INSERT INTO auth_accounts VALUES('old_member','old_account','preserved',0)")
  migrate(db);migrate(db);checkDatabase(db)
  expect(db.prepare('SELECT password_hash FROM auth_accounts').get()!.password_hash).toBe('preserved')
  expect(db.prepare('SELECT count(*) n FROM schema_migrations').get()!.n).toBe(19)
  expect(db.prepare('SELECT count(*) n FROM registration_invites').get()!.n).toBe(0)
 },15000)
 it('promotes only the designated unused single-seat bootstrap invite registrant to lab manager',async()=>{
  const s=await setup(1)
  await s.op({action:'designate-manager-invite',inviteId:'invite_one'})
  const registered=await s.register();expect(registered.statusCode).toBe(201)
  const managerId=String(s.db.prepare('SELECT member_id FROM lab_managers WHERE lab_id=?').get('lab_one')!.member_id)
  expect(managerId).toBe(s.db.prepare('SELECT member_id FROM auth_accounts WHERE username=?').get('new_member')!.member_id)
  const auth=await s.login(),cookie=String(auth.headers['set-cookie']).split(';')[0]!
  const session=await s.app.inject({url:'/api/v1/auth/session',headers:{cookie}})
  expect(session.json().data.isLabManager).toBe(true)
  const other=await setup();await other.register()
  expect((await other.app.inject({url:'/api/v1/auth/session',headers:{cookie:String((await other.login()).headers['set-cookie']).split(';')[0]!}})).json().data.isLabManager).toBe(false)
 })
 it('rejects manager designation for a shared invite or laboratory with existing members',async()=>{
  const shared=await setup(5)
  await expect(shared.op({action:'designate-manager-invite',inviteId:'invite_one'})).rejects.toThrow('INVITE_NOT_ELIGIBLE')
  const existing=await setup(1);await existing.register()
  await expect(existing.op({action:'designate-manager-invite',inviteId:'invite_one'})).rejects.toThrow('INVITE_NOT_ELIGIBLE')
  expect(existing.db.prepare('SELECT count(*) n FROM lab_managers').get()!.n).toBe(0)
 })
 it('lets a manager create, inspect and revoke codes without exposing raw codes in storage or to members',async()=>{
  const s=await setup(1);await s.op({action:'designate-manager-invite',inviteId:'invite_one'});await s.register()
  const auth=await s.login(),cookie=String(auth.headers['set-cookie']).split(';')[0]!
  const csrf=String((await s.app.inject({url:'/api/v1/auth/session',headers:{cookie}})).json().data.csrfToken)
  const url='/api/v1/labs/lab_one/registration-invites',key=randomUUID(),body={expiresAt:new Date(Date.now()+86400000).toISOString(),maxUses:2}
  const request=(payload=body,requestKey=key,headers:Record<string,string>={})=>s.app.inject({method:'POST',url,headers:{origin:s.config.origin,cookie,'x-csrf-token':csrf,'idempotency-key':requestKey,...headers},payload})
  const first=await request();expect(first.statusCode).toBe(201)
  const created=first.json().data;expect(created.code).toMatch(/^RAP-[A-Za-z0-9_-]{43}$/)
  expect((await request()).body).toBe(first.body)
  expect((await request({...body,maxUses:3})).json().error.code).toBe('IDEMPOTENCY_CONFLICT')
  expect((await request(body,randomUUID(),{'x-csrf-token':'wrong'})).statusCode).toBe(403)
  expect((await s.app.inject({url,headers:{cookie}})).json().data.invites).toHaveLength(2)
  const stored=JSON.stringify(s.db.prepare('SELECT * FROM registration_invites').all());expect(stored).not.toContain(created.code)
  const member=await s.register({...s.payload('ordinary_member'),inviteCode:created.code})
  expect(member.statusCode).toBe(201)
  const memberAuth=await s.login('ordinary_member'),memberCookie=String(memberAuth.headers['set-cookie']).split(';')[0]!
  expect((await s.app.inject({url,headers:{cookie:memberCookie}})).statusCode).toBe(403)
  const memberCsrf=String((await s.app.inject({url:'/api/v1/auth/session',headers:{cookie:memberCookie}})).json().data.csrfToken)
  expect((await s.app.inject({method:'POST',url,headers:{origin:s.config.origin,cookie:memberCookie,'x-csrf-token':memberCsrf,'idempotency-key':randomUUID()},payload:body})).statusCode).toBe(403)
  const revoke=await s.app.inject({method:'POST',url:`${url}/${created.invite.id}/revoke`,headers:{origin:s.config.origin,cookie,'x-csrf-token':csrf,'idempotency-key':randomUUID()},payload:{}})
  expect(revoke.statusCode).toBe(200);expect(revoke.json().data.revokedAt).toBeTruthy()
  expect((await s.register({...s.payload('next_member'),inviteCode:created.code})).json().error.code).toBe('INVITE_UNAVAILABLE')
 })
})
