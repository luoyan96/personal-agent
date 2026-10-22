import { ErrorResponse, routes, type RequestFor, type ResponseFor, type RouteName } from '@research-agent-platform/contracts';

export type WireRequest = { id: string; url: string; method: string; headers: Record<string, string>; body: string | null };
export type WireResponse = { status: number; body: string; cookies: string[] };
export interface Transport { request(request: WireRequest, signal: AbortSignal): Promise<WireResponse> }
export interface SessionStorage { read(): Promise<string | null>; write(value: string): Promise<void>; clear(): Promise<void> }
export class ApiError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
export type Actor = ResponseFor<'session'>['data'];
type Options<K extends RouteName> = {
  params?: RequestFor<K>['params']; query?: Partial<RequestFor<K>['query']>;
  body?: RequestFor<K>['body']; key?: string;
  priorCookie?: string;
};
const messages: Record<string, string> = {
  UNAUTHENTICATED: '登录已过期，请重新登录。', INVALID_CREDENTIALS: '账号或密码不正确。',
  FORBIDDEN: '当前账号无权执行此操作，请刷新后核对。', RATE_LIMITED: '请求过于频繁，请稍后重试。',
  VERSION_CONFLICT: '记录已变化，请刷新后核对。', MODEL_UNAVAILABLE: '模型暂不可用，请在桌面端检查模型设置。',
  IDEMPOTENCY_CONFLICT: '发送记录冲突，请刷新核对会话。',
  NOT_FOUND: '记录不存在或当前账号无权查看。',
};
export function validateOrigin(value: string): string {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash)
    throw new Error('服务地址必须是 HTTPS 来源地址。');
  return u.origin;
}

/** Native HTTP owns no ambient cookie jar. Only this actor's encrypted session is used. */
export class MobileApi {
  readonly origin: string;
  private cookie = '';
  private csrf = '';
  private epoch = 0;
  private pending = new Set<AbortController>();
  private storageQueue: Promise<void> = Promise.resolve();
  onExpired: () => void = () => {};
  constructor(origin: string, private transport: Transport, private storage: SessionStorage, private uuid: () => string) {
    this.origin = validateOrigin(origin);
  }
  private check(epoch: number) { if (epoch !== this.epoch) throw new ApiError('STALE_SESSION', 0, '会话已切换。'); }
  private persist(value: string | null, epoch: number) {
    const work = this.storageQueue.catch(() => {}).then(async () => {
      if (epoch !== this.epoch) return;
      if (value === null) await this.storage.clear(); else await this.storage.write(value);
    });
    this.storageQueue = work;
    return work;
  }
  private reset() {
    this.epoch++;
    this.cookie = ''; this.csrf = '';
    for (const controller of this.pending) controller.abort();
    return this.persist(null, this.epoch);
  }
  async restore(): Promise<Actor | null> {
    const epoch = this.epoch;
    const raw = await this.storage.read(); this.check(epoch);
    if (!raw) return null;
    try {
      const saved = JSON.parse(raw) as { origin?: string; cookie?: string };
      if (saved.origin !== this.origin || !/^rap_session=[a-f0-9]{64}$/.test(saved.cookie ?? '')) throw new Error();
      this.cookie = saved.cookie!;
    } catch { await this.reset(); return null; }
    // Network failures preserve the encrypted session for an explicit retry.
    try { return (await this.call('session')).data; }
    catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error; }
  }
  async login(username: string, password: string): Promise<Actor> {
    const priorCookie = this.cookie;
    const clearing = this.reset(), epoch = this.epoch;
    await clearing; this.check(epoch);
    await this.call('login', { body: { username: username.trim(), password }, priorCookie });
    this.check(epoch);
    return (await this.call('session')).data;
  }
  async logout(): Promise<boolean> {
    const cookie = this.cookie, csrf = this.csrf;
    const clearing = this.reset();
    await clearing;
    try {
      if (!cookie || !csrf) return false;
      const result = await this.transport.request({ id: this.uuid(), url: this.origin + routes.logout.path,
        method: 'POST', headers: { Origin: this.origin, Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: '{}' }, new AbortController().signal);
      return result.status === 200;
    } catch { return false; }
  }
  async call<K extends RouteName>(name: K, options: Options<K> = {}): Promise<ResponseFor<K>> {
    const epoch = this.epoch, route = routes[name];
    if (route.method !== 'GET' && route.access === 'session' && !this.csrf) {
      await this.call('session'); this.check(epoch);
    }
    const params = route.request.shape.params.parse(options.params ?? {});
    const query = route.request.shape.query.parse(options.query ?? {});
    const body = route.request.shape.body.parse(route.method === 'GET' ? null : options.body ?? {});
    let path: string = route.path;
    for (const [key, value] of Object.entries(params)) path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
    const queryString = Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    const headers: Record<string, string> = { Accept: 'application/json', Origin: this.origin };
    const cookie = name === 'login' ? options.priorCookie : this.cookie;
    if (cookie) headers.Cookie = cookie;
    if (route.method !== 'GET') headers['Content-Type'] = 'application/json';
    if (route.method !== 'GET' && route.access === 'session') headers['X-CSRF-Token'] = this.csrf;
    if (route.idempotent && route.method !== 'GET') {
      // Never create a new send/retry identity after an uncertain network result.
      if (!options.key) throw new Error('写入操作缺少请求标识。');
      headers['Idempotency-Key'] = options.key;
    }
    const controller = new AbortController(); this.pending.add(controller);
    const deadline = setTimeout(() => controller.abort(), 30000);
    try {
      let response: WireResponse;
      try {
        response = await this.transport.request({ id: this.uuid(), url: this.origin + path + (queryString ? '?' + queryString : ''),
          method: route.method, headers, body: route.method === 'GET' ? null : JSON.stringify(body) }, controller.signal);
      } catch {
        this.check(epoch);
        throw new ApiError('NETWORK_ERROR', 0, '连接中断或超时，请检查网络后重试。发送结果可能尚未确认。');
      }
      this.check(epoch);
      if (response.status === 401 && name !== 'login') {
        const clearing = this.reset(), invalidatedEpoch = this.epoch;
        await clearing;
        if (invalidatedEpoch === this.epoch) this.onExpired();
        throw new ApiError('UNAUTHENTICATED', 401, messages.UNAUTHENTICATED!);
      }
      let value: unknown;
      try { value = JSON.parse(response.body); } catch { throw new ApiError('INVALID_RESPONSE', response.status, '服务返回了无法读取的响应，请稍后重试。'); }
      if (response.status < 200 || response.status >= 300) {
        const parsed = ErrorResponse.safeParse(value), code = parsed.success ? parsed.data.error.code : 'HTTP_ERROR';
        throw new ApiError(code, response.status, name === 'login' && response.status === 401 ? '账号或密码不正确。' : messages[code] ?? `服务暂未完成请求（${response.status}），请稍后重试。`);
      }
      const parsed = route.response.safeParse(value);
      if (!parsed.success) throw new ApiError('INVALID_RESPONSE', response.status, '服务响应与接口约定不符，请刷新后核对。');
      this.check(epoch);
      if (name === 'login') {
        const match = response.cookies.flatMap(c => c.match(/(?:^|,\s*)rap_session=([a-f0-9]{64})(?=;|$)/g) ?? []).at(-1);
        const token = match?.match(/[a-f0-9]{64}/)?.[0];
        if (!token) throw new ApiError('COOKIE_MISSING', 0, '未收到登录会话，请检查服务配置。');
        this.cookie = 'rap_session=' + token;
        await this.persist(JSON.stringify({ origin: this.origin, cookie: this.cookie }), epoch);
        this.check(epoch);
      }
      if (name === 'session') this.csrf = (parsed.data as ResponseFor<'session'>).data.csrfToken;
      return parsed.data as ResponseFor<K>;
    } finally { clearTimeout(deadline); this.pending.delete(controller); }
  }
}
