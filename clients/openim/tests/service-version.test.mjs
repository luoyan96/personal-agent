import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {mkdtemp,writeFile}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';import{fileURLToPath}from'node:url';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite/package.json'))('esbuild');
const dir=await mkdtemp(path.join(tmpdir(),'acceptcat-service-version-')),src=fileURLToPath(new URL('../src/research/',import.meta.url));
await writeFile(path.join(dir,'entry.ts'),`export * from ${JSON.stringify(path.join(src,'api.ts'))};export * from ${JSON.stringify(path.join(src,'service-version.ts'))};`);
await build({entryPoints:[path.join(dir,'entry.ts')],outfile:path.join(dir,'entry.cjs'),bundle:true,platform:'node',format:'cjs',define:{'import.meta.env.VITE_RESEARCH_MODE':'true'},plugins:[{name:'synthetic-profile',setup(b){b.onResolve({filter:/^@\/utils\/storage$/},()=>({path:'storage',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function clearIMProfile(){}'}))}}]});
const api=require(path.join(dir,'entry.cjs'));
const session={data:{member:{id:'synthetic_A',labId:'synthetic_lab',displayName:'Synthetic',publicExpertise:[],availability:null,visibleCommitments:[],version:1},csrfToken:'synthetic_csrf',expiresAt:'2027-10-07T00:00:00.000Z',isLabManager:false,spaceKind:'personal'}};
test('only a successful schema-validated API response can establish the public service version',async t=>{
 const old=globalThis.fetch,window=globalThis.window;t.after(()=>{globalThis.fetch=old;globalThis.window=window});globalThis.window={dispatchEvent(){}};
 assert.equal(api.getServiceVersion(),undefined);
 globalThis.fetch=async()=>Response.json({data:{}},{headers:{'X-Contract-Version':'0.49.0'}});
 await assert.rejects(api.researchApi('session'));assert.equal(api.getServiceVersion(),undefined);
 globalThis.fetch=async()=>Response.json(session,{headers:{'X-Contract-Version':'0.45.0'}});
 await api.researchApi('session');assert.equal(api.getServiceVersion(),'0.45.0');
 globalThis.fetch=async()=>Response.json({error:{code:'UNAUTHORIZED',message:'no',requestId:'synthetic_req'}},{status:401,headers:{'X-Contract-Version':'0.49.0'}});
 await assert.rejects(api.researchApi('session'));assert.equal(api.getServiceVersion(),'0.45.0');
 globalThis.fetch=async()=>Response.json(session,{headers:{'X-Contract-Version':'invalid'}});
 await api.researchApi('session');assert.equal(api.getServiceVersion(),'0.45.0');
});
test('valid version changes notify once, malformed data cannot erase compatibility and subscriptions clean up',()=>{
 const seen=[],off=api.subscribeServiceVersion(()=>seen.push(api.getServiceVersion()));
 api.observeServiceVersion('0.44.0');api.observeServiceVersion('0.44.0');
 for(const invalid of[null,'unknown','0.044.0','0.44','0.44.0 suffix','1'.repeat(41)])api.observeServiceVersion(invalid);
 assert.deepEqual(seen,['0.44.0']);api.observeServiceVersion('0.45.0');assert.deepEqual(seen,['0.44.0','0.45.0']);off();api.observeServiceVersion('0.43.0');assert.equal(seen.length,2);
});
