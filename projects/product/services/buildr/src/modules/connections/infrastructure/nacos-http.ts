import { connectionFailure } from '../domain/connection.ts';
import { nacosApiBase, NACOS_CONTENT_BYTES, type NacosApiVersion, type NacosConfiguration } from '../domain/nacos-connection.ts';

export type NacosHttpOptions = { fetch?: typeof globalThis.fetch; timeoutMs?: number; maxResponseBytes?: number };
export type NacosResponse = { status: number; headers: Headers; text: string };
type RequestInput = { method?: 'GET' | 'POST'; query?: Record<string, string>; form?: Record<string, string>; casMd5?: string; authenticated?: boolean };
export function nacosJson(text: string): unknown {
  try { return JSON.parse(text); } catch { throw connectionFailure('nacos_response_invalid', 'Nacos 返回格式不受支持，请检查接口版本与网关。', 502); }
}
export function nacosData(value: unknown, legacy = false): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw connectionFailure('nacos_response_invalid', 'Nacos 返回格式不受支持。', 502);
  const object = value as Record<string, unknown>;
  if (object.code !== 0 && !(legacy && object.code === 200)) {
    if (object.code === 20005 || /cas.*fail|md5.*changed|resource conflict/iu.test(String(object.message || ''))) throw connectionFailure('nacos_config_conflict', 'Nacos 拒绝发布：配置版本已变化，请重新读取并判断。', 409);
    if ([401, 403, 10001].includes(Number(object.code))) throw connectionFailure('nacos_access_denied', 'Nacos 认证或账号权限不足。', 403);
    if (object.code === 20004) throw connectionFailure('nacos_config_missing', '指定 Nacos 配置不存在。', 404);
    throw connectionFailure('nacos_request_failed', 'Nacos 拒绝本次请求，请检查范围、账号权限与接口版本。', 502);
  }
  return object.data;
}

/** One operation owns one client; credentials and tokens are never persisted here. */
export class NacosHttpClient {
  readonly config: NacosConfiguration;
  readonly baseUrl: string;
  private readonly password: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private token = '';
  private expiresAt = 0;
  constructor(config: NacosConfiguration, password: string, options: NacosHttpOptions = {}) {
    this.config = config; this.baseUrl = nacosApiBase(config.consoleUrl); this.password = password;
    this.fetcher = options.fetch || globalThis.fetch; this.timeoutMs = options.timeoutMs ?? 10_000; this.maxResponseBytes = options.maxResponseBytes ?? NACOS_CONTENT_BYTES + 64 * 1024;
  }
  private async send(route: string, input: RequestInput, authenticated: boolean): Promise<NacosResponse> {
    const url = new URL(this.baseUrl + route), headers = new Headers({ Accept: 'application/json, text/plain', 'Accept-Charset': 'UTF-8' });
    for (const [key, value] of Object.entries(input.query || {})) url.searchParams.set(key, value);
    if (authenticated && this.token) {
      headers.set('Authorization', 'Bearer ' + this.token);
      if (!route.startsWith('/v3/')) url.searchParams.set('accessToken', this.token);
    }
    if (input.casMd5) headers.set('casMd5', input.casMd5);
    if (input.form) headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      const response = await this.fetcher(url, { method: input.method || 'GET', headers, body: input.form ? new URLSearchParams(input.form).toString() : undefined, redirect: 'manual', signal });
      if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw connectionFailure('nacos_redirect_rejected', 'Nacos 请求发生重定向，已阻止认证信息转发，请配置实际目标地址。', 502); }
      const chunks: Uint8Array[] = []; let bytes = 0;
      if (Number(response.headers.get('content-length')) > this.maxResponseBytes) { await response.body?.cancel(); throw connectionFailure('nacos_response_too_large', 'Nacos 响应超过大小限制，请缩小查询范围。', 413); }
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const chunk = await reader.read(); if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > this.maxResponseBytes) { await reader.cancel(); throw connectionFailure('nacos_response_too_large', 'Nacos 响应超过大小限制，请缩小查询范围。', 413); }
            chunks.push(chunk.value);
          }
        } finally { reader.releaseLock(); }
      }
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); }
      catch { throw connectionFailure('nacos_response_invalid', 'Nacos 响应不是有效 UTF-8 文本，未转换或截断内容。', 502); }
      return { status: response.status, headers: response.headers, text };
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      if (typeof code === 'string' && code.startsWith('nacos_')) throw error;
      throw connectionFailure(signal.aborted ? 'nacos_timeout' : 'nacos_unreachable', signal.aborted ? 'Nacos 调用超时，未自动重发请求。' : '无法连接 Nacos，请检查网站地址与网络；未自动重发请求。', signal.aborted ? 504 : 502);
    }
  }
  private async login(): Promise<void> {
    const versions: NacosApiVersion[] = this.config.apiVersion === 'v1' || this.config.apiVersion === 'v2' ? ['v1'] : ['v3', 'v1'];
    for (const version of versions) {
      let result = await this.send(version === 'v3' ? '/v3/auth/user/login' : '/v1/auth/login', { method: 'POST', form: { username: this.config.username, password: this.password } }, false);
      // Some v1 consoles expose only the users/login alias. Try it only after an
      // explicit missing-route response; never repeat a rejected or uncertain login.
      if (version === 'v1' && result.status === 404) result = await this.send('/v1/auth/users/login', { method: 'POST', form: { username: this.config.username, password: this.password } }, false);
      if ([404, 410].includes(result.status)) continue;
      if ([401, 403].includes(result.status)) throw connectionFailure('nacos_access_denied', 'Nacos 登录失败，请检查本机账号密码。', 403);
      if (result.status !== 200) throw connectionFailure('nacos_auth_failed', 'Nacos 登录请求失败，请检查地址与认证设置。', 502);
      let value: unknown;
      try { value = nacosJson(result.text); } catch { if (this.config.apiVersion === 'auto') continue; throw connectionFailure('nacos_auth_failed', 'Nacos 登录返回格式不受支持。', 502); }
      const outer = value as Record<string, unknown>;
      const data = outer && typeof outer.data === 'object' && outer.data !== null ? nacosData(outer) as Record<string, unknown> : outer;
      if (data && typeof data.accessToken === 'string' && data.accessToken && !/[\r\n]/u.test(data.accessToken)) {
        this.token = data.accessToken;
        const ttl = typeof data.tokenTtl === 'number' && Number.isFinite(data.tokenTtl) && data.tokenTtl > 0 ? data.tokenTtl : 300;
        this.expiresAt = Date.now() + ttl * 1000; return;
      }
      throw connectionFailure('nacos_auth_failed', 'Nacos 登录未返回可用访问令牌（Access Token），请检查账号与认证设置。', 403);
    }
    throw connectionFailure('nacos_api_unsupported', '该地址未提供受支持的 Nacos 登录接口。', 502);
  }
  async request(route: string, input: RequestInput = {}): Promise<NacosResponse> {
    const authenticated = input.authenticated !== false;
    if (authenticated && (!this.token || Date.now() >= this.expiresAt)) await this.login();
    let response = await this.send(route, input, authenticated);
    // Retry only a known rejected read; writes and uncertain transport outcomes are never repeated.
    if (authenticated && response.status === 401 && (input.method || 'GET') === 'GET') { await this.login(); response = await this.send(route, input, true); }
    if ([401, 403].includes(response.status)) throw connectionFailure('nacos_access_denied', 'Nacos 认证或账号权限不足。', 403);
    if (response.status === 404) {
      let data: Record<string, unknown> | undefined;
      try { data = JSON.parse(response.text) as Record<string, unknown>; } catch { /* Legacy missing-config bodies are plain text. */ }
      if (data?.code === 20004 || /config (?:data )?not exist/iu.test(typeof data?.message === 'string' ? data.message : response.text)) throw connectionFailure('nacos_config_missing', '指定 Nacos 配置不存在。', 404);
    }
    if ([404, 410].includes(response.status)) throw connectionFailure('nacos_route_missing', '指定 Nacos 配置或接口不存在，请核对目标与接口版本。', 404);
    if (response.status === 409) throw connectionFailure('nacos_config_conflict', 'Nacos 配置正在变化，请重新读取并判断。', 409);
    // Legacy v1 may return the exact ConfigOperationService CAS exception as a
    // plain-text 500. Only this definite rejection is classified as a conflict.
    if (route.startsWith('/v1/') && input.method === 'POST' && input.casMd5 && response.status === 500 && response.text.trim() === 'Cas publish fail, server md5 may have changed.') throw connectionFailure('nacos_config_conflict', 'Nacos 拒绝发布：配置版本已变化，请重新读取并判断。', 409);
    if (response.status < 200 || response.status >= 300) {
      try { nacosData(nacosJson(response.text)); } catch (error) { if ((error as { code?: string }).code === 'nacos_config_conflict') throw error; }
      throw connectionFailure('nacos_request_failed', 'Nacos 拒绝本次请求，请检查范围、账号权限与接口版本。', 502);
    }
    return response;
  }
  async serverVersion(): Promise<string | undefined> {
    for (const route of ['/v3/admin/core/state', '/v1/console/server/state']) {
      try {
        const result = nacosJson((await this.request(route, { authenticated: false })).text) as Record<string, unknown>;
        const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : result;
        if (typeof data.version === 'string' && data.version.length <= 100) return data.version;
      } catch { /* Optional diagnostic: its absence cannot block configuration reads. */ }
    }
    return undefined;
  }
}
