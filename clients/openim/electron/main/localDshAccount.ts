import { net } from 'electron';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
const { LocalDshConfiguration, localDshPaths } = require('./localDshRuntime') as typeof import('../../../../integrations/deepseek-harness/desktop/local-runtime');
import { authority } from './localFolderManage';
import { desktopAccountIdentity } from './desktopAccount';
import { getResearchServiceStatus } from './windowManage';
import { desktopSessionCookie } from '../utils/desktopServer';

/** Session credentials never leave the trusted main process. DSH receives only a per-run loopback token. */
export async function dshAccount(event: Electron.IpcMainInvokeEvent) {
  const auth = authority(event), service = new URL(getResearchServiceStatus().address).origin;
  const renderer = new URL(auth.contents.getURL()).origin;
  const name = renderer === service ? 'rap_session' : desktopSessionCookie(service);
  const cookie = async () => (await auth.contents.session.cookies.get({ url: renderer, name })).find(c => c.name === name)?.value;
  const token = await cookie();
  if (!token || !/^[A-Za-z0-9_-]{16,256}$/.test(token)) throw Error('请登录 DeepChat 后使用 DSH。');
  const valid = async () => {
    if (auth.contents.isDestroyed() || authority(event).contents !== auth.contents || (await cookie()) !== token || new URL(getResearchServiceStatus().address).origin !== service)
      throw Error('DeepChat 登录已变化，请重新打开 DSH。');
  };
  const request = (url: string, method = 'GET') => {
    const req = net.request({ url: service + url, method, session: auth.contents.session, useSessionCookies: false, redirect: 'error' });
    req.setHeader('Cookie', 'rap_session=' + token); req.setHeader('Origin', service);
    return req;
  };
  const json = (url: string) => new Promise<any>((resolve, reject) => {
    const req = request(url), chunks: Buffer[] = []; let size = 0;
    const timer = setTimeout(() => { req.abort(); reject(Error('账号服务连接超时。')); }, 10000);
    const fail = () => { clearTimeout(timer); reject(Error('无法读取 DeepChat 账号，请检查连接或重新登录。')); };
    req.on('error', fail);
    req.on('response', res => {
      res.on('error', fail);
      res.on('data', chunk => { size += chunk.length; if (size > 1048576) { req.abort(); fail(); } else chunks.push(Buffer.from(chunk)); });
      res.on('end', () => {
        clearTimeout(timer);
        if (res.statusCode !== 200) { reject(Error(res.statusCode === 404 ? '后台尚未支持本地 DSH，请更新配套后台后重试。' : '账号或模型配置不可用，请检查 DeepChat 设置。')); return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')).data); } catch { fail(); }
      });
    }); req.end();
  });
  const metadata = LocalDshConfiguration.parse(await json(localDshPaths.configuration));
  const session = await json('/api/v1/auth/session');
  if (session?.member?.id !== metadata.memberId || !/^[a-f0-9]{64}$/.test(session?.csrfToken)) throw Error('账号核对失败。');
  await valid();
  return {
    metadata, valid, request, csrf: session.csrfToken as string,
    identity: desktopAccountIdentity(service, metadata.memberId),
    lease: createHash('sha256').update(token).digest('hex'),
  };
}

export async function createDshRelay(account: Awaited<ReturnType<typeof dshAccount>>, hooks?: {
  taskContext: (sessionId:string)=>Promise<{content:string}>;
  taskFeedback: (value:{sessionId:string;seq:number;messageId:string;text:string})=>Promise<unknown>;
}) {
  const secret = randomBytes(32).toString('hex'), pending = new Set<Electron.ClientRequest>();
  const sockets = new Set<Socket>();
  let closed = false;
  const server = createServer(async (req, res) => {
    const failure = (code: number, message: string) => {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'api_error', message } }));
    };
    const key = req.headers.authorization?.replace(/^Bearer /, '') || req.headers['x-api-key'];
    if (closed || req.headers.origin || typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key) || !timingSafeEqual(Buffer.from(key), Buffer.from(secret))) { failure(401, 'DeepChat session required'); return; }
    if(req.method==='POST'&&['/acceptcat/task-context','/acceptcat/task-feedback'].includes(req.url||'')){
      try{
        await account.valid();let length=0;const chunks:Buffer[]=[];
        for await(const chunk of req){length+=chunk.length;if(length>16000)throw Error('Input too large');chunks.push(Buffer.from(chunk));}
        const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(!hooks||typeof value.sessionId!=='string'||!/^acceptcat-[A-Za-z0-9_-]{1,128}$/.test(value.sessionId)){
          res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({content:''}));return;
        }
        const result=req.url==='/acceptcat/task-context'?await hooks.taskContext(value.sessionId):await hooks.taskFeedback(value);
        await account.valid();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));
      }catch{failure(403,'DeepChat task context unavailable');}return;
    }
    const suffix = account.metadata.protocol === 'anthropic-messages' ? '/v1/messages' : '/v1/chat/completions';
    // The bundled Anthropic SDK uses beta.messages.create(), which adds this
    // fixed query. It is the same completion operation, not an arbitrary route.
    const supported = req.url === suffix || (account.metadata.protocol === 'anthropic-messages' && req.url === '/v1/messages?beta=true');
    if (req.method !== 'POST' || !supported) { failure(404, 'Unsupported model operation'); return; }
    if (pending.size >= 2) { failure(429, 'Too many model calls'); return; }
    let upstream: Electron.ClientRequest | undefined;
    try {
      await account.valid();
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > 2 * 1024 * 1024) { failure(413, 'Model input too large'); return; } chunks.push(Buffer.from(chunk)); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      await account.valid(); if (closed || res.destroyed) return;
      if (pending.size >= 2) { failure(429, 'Too many model calls'); return; }
      upstream = account.request(localDshPaths.completion, 'POST'); pending.add(upstream);
      const current = upstream;
      current.setHeader('Content-Type', 'application/json'); current.setHeader('X-CSRF-Token', account.csrf);
      const timer = setTimeout(() => { current.abort(); failure(504, 'Model call timed out'); }, 125000);
      const cleanup = () => { clearTimeout(timer); pending.delete(current); };
      res.once('close', () => { cleanup(); if (!res.writableEnded) current.abort(); });
      current.on('error', () => { cleanup(); if (res.headersSent) res.destroy(); else failure(502, 'DeepChat model connection interrupted'); });
      current.on('response', response => {
        if (response.statusCode !== 200) {
          current.abort(); cleanup(); failure(response.statusCode, 'DeepChat 模型调用失败，请检查登录及模型设置。'); return;
        }
        res.writeHead(200, { 'Content-Type': String(response.headers['content-type'] || 'application/json'), 'Cache-Control': 'no-store' });
        let bytes = 0;
        response.on('data', chunk => { bytes += chunk.length; if (bytes > 16 * 1024 * 1024) { current.abort(); res.destroy(); } else res.write(chunk); });
        response.on('end', () => { cleanup(); res.end(); });
        response.on('error', () => { cleanup(); res.destroy(); });
      });
      current.end(JSON.stringify({ fingerprint: account.metadata.fingerprint, protocol: account.metadata.protocol, request: body }));
    } catch { upstream?.abort(); failure(401, 'DeepChat 登录或模型设置已失效，请重新连接。'); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw Error('本地模型连接启动失败。');
  return { secret, baseURL: `http://127.0.0.1:${address.port}`, close: async () => {
    closed = true; for (const req of pending) req.abort(); pending.clear();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  } };
}
