import { join } from 'node:path';
import { homedir } from 'node:os';
import { lstat, readFile } from 'node:fs/promises';
import { ModelAccessError, type CustomProviderConfigureInput, type ModelOffering, type ModelProvider, type ModelProviderObservation } from '../contracts.ts';
import { createCustomModelProvider } from './custom.ts';
import { record, string } from './private-account.ts';
import { ManagedMagpie, type MagpieInstallation } from './magpie-installation.ts';

const loopback = '127.0.0.1';
const catalogLimit = 2 * 1024 * 1024;
const gateway = (port: number) => `http://${loopback}:${port}`;
const queryHeaders = { authorization: 'Bearer magpie-buildr' }; // App attribution, not an upstream credential.

export function magpieOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new ModelAccessError('model_magpie_url_invalid', '请填写有效的本机 Magpie 地址。', 400); }
  if (url.protocol !== 'http:' || ![loopback, '[::1]', 'localhost'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !['/', '/v1', '/v1/'].includes(url.pathname)) {
    throw new ModelAccessError('model_magpie_url_invalid', 'Magpie 首版仅支持本机 HTTP 地址，不接受路径、密钥或远程地址。', 400);
  }
  if (url.hostname === 'localhost') url.hostname = loopback;
  return url.origin;
}
async function json(fetcher: typeof fetch, url: string, limit: number, signal?: AbortSignal) {
  const r = await fetcher(url, { redirect:'error', headers:queryHeaders, signal:signal ? AbortSignal.any([signal, AbortSignal.timeout(2600)]) : AbortSignal.timeout(2600) });
  if (!r.ok || !r.body) { await r.body?.cancel(); throw new Error('magpie_http'); }
  const reader = r.body.getReader(), decoder = new TextDecoder();
  let received = 0, value = '';
  try {
    for (;;) {
      const {done, value: chunk}=await reader.read(); if (done) break;
      received += chunk.length; if (received > limit) throw new Error('magpie_response_too_large');
      value += decoder.decode(chunk, {stream:true});
    }
    return record(JSON.parse(value + decoder.decode()));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
async function hello(fetcher: typeof fetch, origin: string, signal?: AbortSignal) {
  try { const j = await json(fetcher, origin + '/api/hello', 4096, signal); return j.name === 'magpie' ? string(j.version) : undefined; }
  catch { return undefined; }
}
const integer = (n: unknown, max = 10_000_000) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && n <= max ? n : undefined;
async function configuredOrigin(): Promise<string | undefined> {
  const home = process.env.BUILDR_HOST_HOME || homedir();
  const file = join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'magpie', 'settings.json');
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > catalogLimit) return;
    const port = integer(record(JSON.parse(await readFile(file, 'utf8'))).port, 65535);
    return port ? gateway(port) : undefined;
  } catch { return undefined; }
}
function offerings(value: unknown[]): ModelOffering[] {
  const out = new Map<string, ModelOffering>();
  for (const valueRow of value) {
    const row = record(valueRow), id = string(row.id);
    if (!id || !/^[^\s\u0000-\u001f]{1,256}$/u.test(id) || out.has(id) || (row.kind && row.kind !== 'chat' && row.kind !== 'model')) continue;
    const label = string(row.display_name)?.trim().slice(0,160) || id;
    const input = record(row.modalities).input;
    const contextWindow = integer(row.context_window), maxOutputTokens = integer(row.max_output_tokens);
    const efforts = [...new Set((Array.isArray(row.reasoning_levels) ? row.reasoning_levels : []).filter((item): item is string => typeof item === 'string' && /^(none|minimal|low|medium|high|xhigh|max|ultra)$/.test(item)))];
    out.set(id, {id, label, images: Array.isArray(input) && input.includes('image'), tools: row.supports_tools !== false,
      ...(contextWindow ? {contextWindow} : {}), ...(maxOutputTokens ? {maxOutputTokens} : {}),
      ...(efforts.length ? {reasoningEfforts:efforts.map(id=>({id,label:id}))} : {})});
    if (out.size >= 1000) break;
  }
  return [...out.values()];
}
export function createMagpieModelProvider(options: {root: string; fetch?: typeof fetch; installation?: MagpieInstallation; configuredOrigin?: () => Promise<string|undefined>}): ModelProvider {
  const fetcher = options.fetch ?? fetch;
  const identify = (origin: string, signal?: AbortSignal) => hello(fetcher, origin, signal);
  const installation = options.installation ?? new ManagedMagpie(options.root, identify);
  const custom = createCustomModelProvider({fetch: (url, init) => {
    const headers = new Headers(init?.headers); headers.set('Authorization', queryHeaders.authorization);
    return fetcher(url, {...init, headers});
  }});
  function configuration(origin: string): CustomProviderConfigureInput {
    return {label:'Magpie',baseUrl:origin+'/v1',protocol:'responses',useApiKey:false,models:[]};
  }
  return {
    id:'magpie',label:'Magpie',custom:true,singleton:true,inference:'gateway',sharing:{kind:'gateway'},enableDiscoveredModelsByDefault:true,
    presentation:{vendorLabel:'Magpie',sourceLabel:'Magpie',quotaUnavailableNote:'额度由 Magpie 按上游账号管理，请在 Magpie 查看。'},
    async resolveCustom(input, prepare, signal) {
      if (input && (input.useApiKey || input.apiKey || input.protocol !== 'responses' || (input.modelsPath && input.modelsPath !== '/models'))) {
        throw new ModelAccessError('model_magpie_config_invalid','Magpie 使用本机 Responses 网关，不填写上游 API Key。',400);
      }
      const explicit = input ? magpieOrigin(input.baseUrl) : undefined;
      const managed = await installation.address().catch(error=>{if(prepare)throw error;return undefined;});
      const candidates = explicit ? [explicit] : [...new Set([managed, await (options.configuredOrigin ?? configuredOrigin)(), gateway(3425)])];
      for (const origin of candidates) if (origin && await identify(origin, signal)) return configuration(origin);
      signal.throwIfAborted();
      if (prepare && (!explicit || explicit === managed)) return configuration(await installation.start(signal));
      throw new ModelAccessError('model_magpie_not_found','未找到可连接的本机 Magpie。请启动 Magpie、填写实际地址，或选择“下载并启动”。',409);
    },
    async open(input) {
      if (!input.custom) throw new ModelAccessError('model_magpie_config_invalid','Magpie 缺少网关地址。',400);
      const origin = magpieOrigin(input.custom.baseUrl);
      const base = await custom.open({...input,custom:{baseUrl:origin+'/v1',protocol:'responses',models:[],useApiKey:false}});
      const lifetime = new AbortController();
      async function inspect(): Promise<ModelProviderObservation> {
        if (!await identify(origin, lifetime.signal)) return {status:'failed',models:[],diagnostic:'未检测到已连接的 Magpie，请启动该实例后刷新。'};
        let values: unknown;
        try { const catalog=await json(fetcher, origin+'/v1/models', catalogLimit, lifetime.signal); if(catalog.has_more!==true)values=catalog.data; } catch { /* preserve previous catalog on failure */ }
        if (!Array.isArray(values)) return {status:'failed',models:[],diagnostic:'Magpie 已连接，但本次无法读取模型目录。'};
        const models = offerings(values);
        return {status:'ready',identity:'magpie:'+origin,models,...(models.length ? {} : {diagnostic:'Magpie 已连接。请在 Magpie 添加上游来源，然后刷新模型。'})};
      }
      return {
        protocol:'responses',inspect,
        async configureCustom(config) {
          if (config.protocol!=='responses'||config.useApiKey||config.apiKey||(config.modelsPath&&config.modelsPath!=='/models')||config.models?.length) throw new ModelAccessError('model_magpie_config_invalid','Magpie 模型目录由本机 Magpie 管理。',400);
          const result = await inspect();
          if (result.status !== 'ready') throw new ModelAccessError('model_magpie_unavailable',result.diagnostic ?? '无法连接 Magpie。',409);
          return result;
        },
        async infer(value) {
          if (!await identify(origin, value.signal)) return Response.json({error:{code:'model_magpie_unavailable',message:'已选择的 Magpie 网关不可用。'}},{status:503});
          return base.infer(value);
        },
        async beginLogin() { throw new ModelAccessError('model_magpie_login_external','请在 Magpie 管理上游账号。',409); },
        async cancelLogin() {},
        async openSettings() { await installation.open(origin); },
        async close() { lifetime.abort(); await base.close(); },
      };
    },
  };
}
