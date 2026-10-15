import { connectionFailure } from './errors.mjs';
function bounded(work, signal) {
    return new Promise((resolve, reject)=>{
        const abort = ()=>reject(new Error('request deadline'));
        if (signal.aborted) return abort();
        signal.addEventListener('abort', abort, {
            once: true
        });
        Promise.resolve(work).then(resolve, reject).finally(()=>signal.removeEventListener('abort', abort));
    });
}
import { nacosApiBase, NACOS_CONTENT_BYTES } from './configuration.mjs';
export function nacosJson(text) {
    try {
        return JSON.parse(text);
    } catch  {
        throw connectionFailure('nacos_response_invalid', 'Nacos 返回格式不受支持，请检查接口版本与网关。', 502);
    }
}
export function nacosData(value, legacy = false) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw connectionFailure('nacos_response_invalid', 'Nacos 返回格式不受支持。', 502);
    const object = value;
    if (object.code !== 0 && !(legacy && object.code === 200)) {
        if (object.code === 20005 || /cas.*fail|md5.*changed|resource conflict/iu.test(String(object.message || ''))) throw connectionFailure('nacos_config_conflict', 'Nacos 拒绝发布：配置版本已变化，请重新读取并判断。', 409);
        if ([
            401,
            403,
            10001
        ].includes(Number(object.code))) throw connectionFailure('nacos_access_denied', 'Nacos 认证或账号权限不足。', 403);
        if (object.code === 20004) throw connectionFailure('nacos_config_missing', '指定 Nacos 配置不存在。', 404);
        throw connectionFailure('nacos_request_failed', 'Nacos 拒绝本次请求，请检查范围、账号权限与接口版本。', 502);
    }
    return object.data;
}
export class NacosHttpClient {
    config;
    baseUrl;
    password;
    fetcher;
    timeoutMs;
    maxResponseBytes;
    token = '';
    expiresAt = 0;
    secrets;
    constructor(config, password, options = {}){
        this.secrets = options.secrets ?? new Set();
        this.secrets.add(password);
        this.config = config;
        this.baseUrl = nacosApiBase(config.consoleUrl);
        this.password = password;
        this.fetcher = options.fetch || globalThis.fetch;
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.maxResponseBytes = options.maxResponseBytes ?? NACOS_CONTENT_BYTES + 64 * 1024;
    }
    async send(route, input, authenticated) {
        if (!/^\/(?:v1|v2|v3)\/[a-zA-Z0-9/_-]+$/u.test(route)) throw connectionFailure('nacos_route_invalid', 'Nacos 操作路径无效。');
        const url = new URL(this.baseUrl + route), headers = new Headers({
            Accept: 'application/json, text/plain',
            'Accept-Charset': 'UTF-8'
        });
        for (const [key, value] of Object.entries(input.query || {}))url.searchParams.set(key, value);
        if (authenticated && this.token) {
            headers.set('Authorization', 'Bearer ' + this.token);
            if (!route.startsWith('/v3/')) url.searchParams.set('accessToken', this.token);
        }
        if (input.casMd5) headers.set('casMd5', input.casMd5);
        if (input.form) headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
        const signal = AbortSignal.timeout(this.timeoutMs);
        try {
            const response = await bounded(this.fetcher(url, {
                method: input.method || 'GET',
                headers,
                body: input.form ? new URLSearchParams(input.form).toString() : undefined,
                redirect: 'manual',
                signal
            }), signal);
            if (response.status >= 300 && response.status < 400) {
                await response.body?.cancel();
                throw connectionFailure('nacos_redirect_rejected', 'Nacos 请求发生重定向，已阻止认证信息转发，请配置实际目标地址。', 502);
            }
            const chunks = [];
            let bytes = 0;
            if (Number(response.headers.get('content-length')) > this.maxResponseBytes) {
                await response.body?.cancel();
                throw connectionFailure('nacos_response_too_large', 'Nacos 响应超过大小限制，请缩小查询范围。', 413);
            }
            if (response.body) {
                const reader = response.body.getReader();
                try {
                    while(true){
                        const chunk = await bounded(reader.read(), signal);
                        if (chunk.done) break;
                        bytes += chunk.value.byteLength;
                        if (bytes > this.maxResponseBytes) {
                            await reader.cancel();
                            throw connectionFailure('nacos_response_too_large', 'Nacos 响应超过大小限制，请缩小查询范围。', 413);
                        }
                        chunks.push(chunk.value);
                    }
                } finally{
                    reader.releaseLock();
                }
            }
            let text;
            try {
                text = new TextDecoder('utf-8', {
                    fatal: true,
                    ignoreBOM: true
                }).decode(Buffer.concat(chunks));
            } catch  {
                throw connectionFailure('nacos_response_invalid', 'Nacos 响应不是有效 UTF-8 文本，未转换或截断内容。', 502);
            }
            return {
                status: response.status,
                headers: response.headers,
                text
            };
        } catch (error) {
            const code = error?.code;
            if (typeof code === 'string' && code.startsWith('nacos_')) throw error;
            throw connectionFailure(signal.aborted ? 'nacos_timeout' : 'nacos_unreachable', signal.aborted ? 'Nacos 调用超时，未自动重发请求。' : '无法连接 Nacos，请检查网站地址与网络；未自动重发请求。', signal.aborted ? 504 : 502);
        }
    }
    async login() {
        const versions = this.config.apiVersion === 'v1' || this.config.apiVersion === 'v2' ? [
            'v1'
        ] : [
            'v3',
            'v1'
        ];
        for (const version of versions){
            let result = await this.send(version === 'v3' ? '/v3/auth/user/login' : '/v1/auth/login', {
                method: 'POST',
                form: {
                    username: this.config.username,
                    password: this.password
                }
            }, false);
            if (version === 'v1' && result.status === 404) result = await this.send('/v1/auth/users/login', {
                method: 'POST',
                form: {
                    username: this.config.username,
                    password: this.password
                }
            }, false);
            if ([
                404,
                410
            ].includes(result.status)) continue;
            if ([
                401,
                403
            ].includes(result.status)) throw connectionFailure('nacos_access_denied', 'Nacos 登录失败，请检查本机账号密码。', 403);
            if (result.status !== 200) throw connectionFailure('nacos_auth_failed', 'Nacos 登录请求失败，请检查地址与认证设置。', 502);
            let value;
            try {
                value = nacosJson(result.text);
            } catch  {
                throw connectionFailure('nacos_auth_failed', 'Nacos 登录返回格式不受支持。', 502);
            }
            const outer = value;
            const data = outer && typeof outer.data === 'object' && outer.data !== null ? nacosData(outer) : outer;
            if (data && typeof data.accessToken === 'string' && data.accessToken && data.accessToken.length <= 32768 && !/[\u0000-\u0020\u007f]/u.test(data.accessToken)) {
                this.token = data.accessToken;
                this.secrets.add(this.token);
                const ttl = typeof data.tokenTtl === 'number' && Number.isFinite(data.tokenTtl) && data.tokenTtl > 0 ? data.tokenTtl : 300;
                this.expiresAt = Date.now() + ttl * 1000;
                return;
            }
            throw connectionFailure('nacos_auth_failed', 'Nacos 登录未返回可用访问令牌（Access Token），请检查账号与认证设置。', 403);
        }
        throw connectionFailure('nacos_api_unsupported', '该地址未提供受支持的 Nacos 登录接口。', 502);
    }
    async request(route, input = {}) {
        const authenticated = input.authenticated !== false;
        if (authenticated && (!this.token || Date.now() >= this.expiresAt)) await this.login();
        let response = await this.send(route, input, authenticated);
        if (authenticated && response.status === 401 && (input.method || 'GET') === 'GET') {
            await this.login();
            response = await this.send(route, input, true);
        }
        if ([
            401,
            403
        ].includes(response.status)) throw connectionFailure('nacos_access_denied', 'Nacos 认证或账号权限不足。', 403);
        if (response.status === 404) {
            let data;
            try {
                data = JSON.parse(response.text);
            } catch  {}
            if (data?.code === 20004 || /config (?:data )?not exist/iu.test(typeof data?.message === 'string' ? data.message : response.text)) throw connectionFailure('nacos_config_missing', '指定 Nacos 配置不存在。', 404);
        }
        if ([
            404,
            410
        ].includes(response.status)) throw connectionFailure('nacos_route_missing', '指定 Nacos 配置或接口不存在，请核对目标与接口版本。', 404);
        if (response.status === 409) throw connectionFailure('nacos_config_conflict', 'Nacos 配置正在变化，请重新读取并判断。', 409);
        if (route.startsWith('/v1/') && input.method === 'POST' && input.casMd5 && response.status === 500 && response.text.trim() === 'Cas publish fail, server md5 may have changed.') throw connectionFailure('nacos_config_conflict', 'Nacos 拒绝发布：配置版本已变化，请重新读取并判断。', 409);
        if (response.status < 200 || response.status >= 300) {
            try {
                nacosData(nacosJson(response.text));
            } catch (error) {
                if (error.code === 'nacos_config_conflict') throw error;
            }
            throw connectionFailure('nacos_request_failed', 'Nacos 拒绝本次请求，请检查范围、账号权限与接口版本。', 502);
        }
        return response;
    }
    async serverVersion() {
        for (const route of [
            '/v3/admin/core/state',
            '/v1/console/server/state'
        ]){
            try {
                const result = nacosJson((await this.request(route, {
                    authenticated: false
                })).text);
                const data = result.data && typeof result.data === 'object' ? result.data : result;
                if (typeof data.version === 'string' && data.version.length <= 100) return data.version;
            } catch  {}
        }
        return undefined;
    }
}
