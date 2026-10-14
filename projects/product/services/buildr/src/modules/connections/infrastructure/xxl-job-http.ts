import { connectionFailure } from '../domain/connection.ts';
import { XXL_JOB_RESPONSE_BYTES, xxlJobApiBase, type XxlJobConfiguration } from '../domain/xxl-job-connection.ts';
import { XXL_JOB_EDITABLE_FIELDS } from '../domain/xxl-job-job.ts';

export type XxlJobHttpOptions = { fetch?: typeof globalThis.fetch; timeoutMs?: number; maxResponseBytes?: number; maxScanPages?: number; now?: () => Date };
export type XxlJobHttpResponse = { status: number; headers: Headers; text: string };
const COOKIE_NAME = 'XXL_JOB_LOGIN_IDENTITY';
export function xxlJobJson(text: string): unknown {
  try { return JSON.parse(text); } catch { throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 未返回受支持的 JSON，请核对网站、网关和适配版本。', 502); }
}
export function xxlJobData(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'code')) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 返回结构不受支持。', 502);
  const data = value as Record<string, unknown>;
  if (data.code !== 200) throw connectionFailure('xxl_job_request_rejected', 'XXL-JOB 拒绝本次操作，请核对参数、账号权限和远端配置。', 422);
  return data.content;
}
async function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let onAbort = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, { once: true }); });
  try { return await Promise.race([promise, interrupted]); }
  finally { signal.removeEventListener('abort', onAbort); }
}
/** One operation owns this client. Authentication never leaves its fixed origin or memory. */
export class XxlJobHttpClient {
  readonly config: XxlJobConfiguration;
  readonly baseUrl: string;
  readonly signal: AbortSignal;
  private readonly password: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly responseLimit: number;
  private cookie = '';
  private authenticating: Promise<void> | null = null;
  constructor(config: XxlJobConfiguration, password: string, options: XxlJobHttpOptions = {}) {
    this.config = config; this.password = password; this.baseUrl = xxlJobApiBase(config.consoleUrl); this.fetcher = options.fetch || globalThis.fetch;
    this.signal = AbortSignal.timeout(options.timeoutMs ?? 20_000); this.responseLimit = options.maxResponseBytes ?? XXL_JOB_RESPONSE_BYTES;
  }
  private async send(route: string, method: 'GET' | 'POST', fields: Record<string, string>, authenticated: boolean, html = false): Promise<XxlJobHttpResponse> {
    if (!/^\/[a-zA-Z0-9/_]+$/u.test(route)) throw connectionFailure('xxl_job_route_invalid', 'XXL-JOB 操作路径无效。');
    const url = new URL(this.baseUrl + route), headers = new Headers({ Accept: html ? 'text/html' : 'application/json' });
    if (authenticated && this.cookie) headers.set('Cookie', COOKIE_NAME + '=' + this.cookie);
    if (method === 'GET') for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, value);
    else headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
    try {
      const response = await bounded(this.fetcher(url, { method, headers, ...(method === 'POST' ? { body: new URLSearchParams(fields).toString() } : {}), redirect: 'manual', signal: this.signal }), this.signal);
      if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); return { status: response.status, headers: response.headers, text: '' }; }
      if (Number(response.headers.get('content-length')) > this.responseLimit) { await response.body?.cancel(); throw connectionFailure('xxl_job_response_too_large', 'XXL-JOB 响应超过字节限制，请缩小查询范围或调整日志起始行。', 413); }
      const chunks: Uint8Array[] = []; let bytes = 0;
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const chunk = await bounded(reader.read(), this.signal); if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > this.responseLimit) throw connectionFailure('xxl_job_response_too_large', 'XXL-JOB 响应超过字节限制，请缩小查询范围或调整日志起始行。', 413);
            chunks.push(chunk.value);
          }
        } catch (error) { void reader.cancel().catch(() => {}); throw error; }
        finally { reader.releaseLock(); }
      }
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
      catch { throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 响应不是有效 UTF-8，未转换内容。', 502); }
      return { status: response.status, headers: response.headers, text };
    } catch (error) {
      if (String((error as { code?: unknown })?.code || '').startsWith('xxl_job_')) throw error;
      throw connectionFailure(this.signal.aborted ? 'xxl_job_timeout' : 'xxl_job_unreachable', this.signal.aborted ? 'XXL-JOB 动作超时，结果可能未知；未自动重发请求。' : '无法连接 XXL-JOB，结果可能未知；未自动重发请求。', this.signal.aborted ? 504 : 502);
    }
  }
  private authRedirect(response: XxlJobHttpResponse): boolean {
    if (response.status !== 302) return false;
    try {
      const target = new URL(response.headers.get('location') || '', this.baseUrl + '/');
      return target.origin === new URL(this.baseUrl).origin && target.pathname === new URL(this.baseUrl + '/toLogin').pathname && !target.search && !target.hash;
    } catch { return false; }
  }
  private async login(): Promise<void> {
    const response = await this.send('/login', 'POST', { userName: this.config.username, password: this.password }, false);
    if (response.status >= 300 && response.status < 400) throw connectionFailure('xxl_job_redirect_rejected', 'XXL-JOB 登录发生重定向，已阻止认证转发，请配置实际目标网站。', 502);
    if ([401, 403].includes(response.status)) throw connectionFailure('xxl_job_access_denied', 'XXL-JOB 登录失败，请检查本机账号密码。', 403);
    if (response.status !== 200) throw connectionFailure('xxl_job_auth_failed', 'XXL-JOB 登录接口不受支持或请求失败。', 502);
    const value = xxlJobJson(response.text) as Record<string, unknown>;
    if (!value || value.code !== 200) throw connectionFailure('xxl_job_access_denied', 'XXL-JOB 登录失败，请检查本机账号密码。', 403);
    const cookies = response.headers.getSetCookie();
    let identity = '';
    for (const cookie of cookies) {
      const pair = cookie.split(';', 1)[0], index = pair.indexOf('=');
      if (pair.slice(0, index).trim() !== COOKIE_NAME) continue;
      const token = pair.slice(index + 1).trim();
      if (!token || token.length > 32768 || /[\u0000-\u0020\u007f;,]/u.test(token) || identity && identity !== token) throw connectionFailure('xxl_job_auth_failed', 'XXL-JOB 登录凭据（Cookie）不受支持。', 502);
      identity = token;
    }
    if (!identity) throw connectionFailure('xxl_job_auth_failed', 'XXL-JOB 登录未返回受支持的登录凭据（Cookie）。', 502);
    this.cookie = identity;
  }
  private async ensureLogin(): Promise<void> {
    if (this.cookie) return;
    if (!this.authenticating) this.authenticating = this.login().finally(() => { this.authenticating = null; });
    await this.authenticating;
  }
  private async requestResponse(route: string, fields: Record<string, string>, write: boolean, html = false): Promise<XxlJobHttpResponse> {
    await this.ensureLogin();
    let response = await this.send(route, write ? 'POST' : 'GET', fields, true, html);
    if (!write && (response.status === 401 || this.authRedirect(response))) { this.cookie = ''; await this.ensureLogin(); response = await this.send(route, 'GET', fields, true, html); }
    if (this.authRedirect(response) || [401, 403].includes(response.status)) throw connectionFailure('xxl_job_access_denied', 'XXL-JOB 登录状态失效或账号权限不足；未自动重发写入。', 403);
    if (response.status >= 300 && response.status < 400) throw connectionFailure('xxl_job_redirect_rejected', 'XXL-JOB 请求发生重定向，已阻止认证信息转发。', 502);
    if (response.status === 404) throw connectionFailure('xxl_job_route_unsupported', 'XXL-JOB 未提供本次操作所需的 2.3.0 管理接口。', 404);
    if (response.status === 429) throw connectionFailure('xxl_job_rate_limited', 'XXL-JOB 已限流；未自动重发请求。', 429);
    if (response.status < 200 || response.status >= 300) throw connectionFailure('xxl_job_request_failed', 'XXL-JOB 请求失败，结果可能未知；未自动重发请求。', 502);
    return response;
  }
  async request(route: string, fields: Record<string, string> = {}, write = false): Promise<unknown> {
    return xxlJobJson((await this.requestResponse(route, fields, write)).text);
  }
  async logDetailPage(id: number): Promise<string> {
    if (!Number.isSafeInteger(id) || id < 1) throw connectionFailure('xxl_job_input_invalid', '日志详情编号无效。');
    return (await this.requestResponse('/joblog/logDetailPage', { id: String(id) }, false, true)).text;
  }
  sanitize<T>(value: T): T {
    const secrets = [this.password, this.cookie].filter(Boolean).sort((a, b) => b.length - a.length);
    const outsideRedactions = (value: string, change: (part: string) => string) => value.split(/(\[REDACTED\])/u).map(part => part === '[REDACTED]' ? part : change(part)).join('');
    const visit = (value: unknown): unknown => {
      if (typeof value === 'string') {
        let result = value;
        for (const secret of secrets) result = secret.includes('[REDACTED]') ? result.replaceAll(secret, '[REDACTED]') : outsideRedactions(result, part => part.replaceAll(secret, '[REDACTED]'));
        return outsideRedactions(result, part => part.replace(/((?:XXL_JOB_LOGIN_IDENTITY|cookie|set-cookie|password|authorization)\s*[:=]\s*)[^\r\n;]+/giu, '$1[REDACTED]'));
      }
      if (Array.isArray(value)) return value.map(visit);
      if (value && typeof value === 'object') {
        const input = value as Record<string, unknown>;
        const result = Object.fromEntries(Object.entries(input).map(([key, item]) => [key, /^(?:password|cookie|set-cookie|authorization|XXL_JOB_LOGIN_IDENTITY)$/iu.test(key) ? '[REDACTED]' : ['revision', 'glueRevision', 'apiVersion', 'concurrencyProtection', 'availability', 'timeZone', 'action', 'triggerResult', 'handleResult'].includes(key) ? item : visit(item)]));
        if (typeof input.revision === 'string' && typeof input.jobGroup === 'number' && XXL_JOB_EDITABLE_FIELDS.some(key => input[key] !== result[key])) result.redacted = true;
        return result;
      }
      return value;
    };
    return visit(value) as T;
  }
}
