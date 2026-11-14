import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ModelAccessError, type ModelProvider } from '../contracts.ts';
import { antigravityModelLabel, antigravityModelVariant, antigravityReasoningEffort } from '../../domain/antigravity-model.ts';
import { cliProxyQuotaReader } from './cliproxy-quota.ts';

const providerId = 'google-ai-subscription';
const failure = () => new ModelAccessError('google_ai_service_unavailable', 'Google AI 服务暂不可用，请稍后重试。', 503);

// CLIProxyAPI v8.0.69 Antigravity registry describes configurable routes.
const configurableDepths: Record<string, readonly string[]> = {
  'claude-opus-5-5-high': ['low', 'medium', 'high'],
  'claude-sonnet-5-5-high': ['low', 'medium', 'high'],
  'gemini-4-argon-high': ['low', 'medium', 'high'],
  'gemini-4-carbon-high': ['low', 'medium', 'high'],
  'gemini-4-hydrogen-xhigh': ['low', 'medium', 'high', 'xhigh'],
  'gemini-3.8-flash-tiered': ['low', 'medium', 'high'],
};

export function createGoogleAiProxyProvider(directory: string): ModelProvider {
  const quota = cliProxyQuotaReader(directory);
  const configPath = join(directory, 'config.yaml');
  async function config() {
    const value = JSON.parse(await readFile(configPath, 'utf8'));
    const { host, port } = value.server;
    const key = value.access?.['api-keys']?.[0];
    const auth = value.oauth?.['auth-dir'];
    if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 1024 || port > 65535 ||
        typeof key !== 'string' || !key || typeof auth !== 'string' || resolve(directory, auth) !== join(directory, 'auth')) throw failure();
    return { baseUrl: `http://127.0.0.1:${port}/v1`, key, auth: resolve(directory, auth) };
  }
  async function credential(auth: string) {
    const entries = await readdir(auth).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const accounts = [];
    for (const entry of entries.filter(name => /^antigravity-.*\.json$/.test(name))) {
      const value = JSON.parse(await readFile(join(auth, entry), 'utf8'));
      if (!value.disabled && value.type === 'antigravity' && typeof value.email === 'string' && typeof value.refresh_token === 'string' && value.refresh_token) accounts.push(value);
    }
    if (accounts.length > 1) throw new ModelAccessError('google_ai_account_ambiguous', '发现多个 Google AI 登录，请保留一个账号。', 409);
    const account = accounts[0];
    return account ? { identity: `google-ai:${account.email}:${account.project_id ?? ''}`, project: String(account.project_id ?? '') } : undefined;
  }
  function start(args: string[]) {
    const child = spawn(join(directory, 'cli-proxy-api'), [...args, '-config', configPath], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', () => {});
    child.stdout?.resume();
    child.stderr?.resume();
    return child;
  }
  async function stop(child: ChildProcess | undefined) {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>(done => child.once('exit', () => done()));
    child.kill();
    await Promise.race([exited, delay(1500, undefined, { ref: false })]);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
  }
  const protocolForModel = (model: string) => /^claude-/i.test(model) ? 'anthropic-messages' as const : 'chat-completions' as const;

  let legacySources: { baseUrl: string; accounts: Record<string, unknown> } | undefined;
  try {
    const migration = JSON.parse(readFileSync(join(directory, 'buildr-quota.json'), 'utf8'));
    if (/^http:\/\/127\.0\.0\.1:\d+\/v1$/.test(migration.baseUrl))
      legacySources = { baseUrl: migration.baseUrl, accounts: migration.accounts ?? {} };
  } catch { /* A new installation has no legacy sources. */ }

  return {
    replacesSource(account) {
      if (!legacySources || account.custom?.baseUrl !== legacySources.baseUrl || !account.custom.useApiKey) return false;
      const group = Object.hasOwn(legacySources.accounts, account.id) ? legacySources.accounts[account.id] : undefined;
      return group === 'gemini' && account.custom.protocol === 'chat-completions' ||
        group === 'claude' && account.custom.protocol === 'anthropic-messages';
    },
    modelAlias: id => id === 'gemini-3.8-flash-tiered' ? 'gemini-3.8-flash-high' : undefined,
    id: providerId, label: 'Google AI', linked: true, singleton: true, autoInspect: true,
    authentication: { type: 'oauth', label: 'Google AI', description: '登录 Google AI 账号后即可使用订阅模型。' },
    modeLabel: '订阅', group: { id: 'google-ai', label: 'Google AI' },
    presentation: { vendorLabel: 'Google AI', sourceLabel: 'Google AI' },
    sharing: { kind: 'gateway' }, inference: 'gateway', enableDiscoveredModelsByDefault: true,
    clearCatalogOnUnauthenticated: true,
    async open() {
      let server: ChildProcess | undefined, login: ChildProcess | undefined;
      let starting: Promise<void> | undefined;
      let closed = false;
      const lifetime = new AbortController();
      async function ensureServer(baseUrl: string) {
        lifetime.signal.throwIfAborted();
        if (starting) return starting;
        if (server?.pid && server.exitCode === null && server.signalCode === null) return;
        // Refuse to share the port with an unowned process.
        const existing = await fetch(baseUrl + '/models', { signal: AbortSignal.timeout(700), redirect: 'error' }).catch(() => undefined);
        if (existing) { await existing.body?.cancel(); throw failure(); }
        lifetime.signal.throwIfAborted();
        if (starting) return starting;
        if (server?.pid && server.exitCode === null && server.signalCode === null) return;
        const child = server = start(['-local-model']);
        starting = (async () => {
          for (let attempt = 0; attempt < 40; attempt++) {
            await delay(100, undefined, { signal: lifetime.signal });
            if (!child.pid || child.exitCode !== null || child.signalCode !== null) break;
            const response = await fetch(baseUrl + '/models', { signal: AbortSignal.timeout(400), redirect: 'error' }).catch(() => undefined);
            if (response) { await response.body?.cancel(); return; }
          }
          throw failure();
        })().catch(async error => { await stop(child); throw error; }).finally(() => { starting = undefined; });
        return starting;
      }
      async function request(settings: Awaited<ReturnType<typeof config>>, route: string, init: RequestInit) {
        await ensureServer(settings.baseUrl);
        return fetch(settings.baseUrl + route, { ...init, redirect: 'error',
          signal: AbortSignal.any([lifetime.signal, init.signal ?? AbortSignal.timeout(10_000)]),
          headers: { authorization: 'Bearer ' + settings.key, 'content-type': 'application/json', ...(route === '/messages' ? { 'anthropic-version': '2023-06-01' } : {}) } });
      }
      let flashTiered = false;
      return {
        protocol: 'chat-completions',
        protocolForModel,
        async inspect() {
          try {
            const settings = await config();
            const account = await credential(settings.auth);
            if (!account) return { status: 'not-authenticated', models: [] };
            let data: unknown;
            for (let attempt = 0; attempt < 15; attempt++) {
              const response = await request(settings, '/models', {});
              if (!response.ok) { await response.body?.cancel(); throw failure(); }
              data = (await response.json()).data;
              if (Array.isArray(data) && data.length) break;
              await delay(200, undefined, { signal: lifetime.signal });
            }
            const ids = new Set(Array.isArray(data) ? data.map(row => row?.id) : []);
            flashTiered = ids.has('gemini-3.8-flash-tiered');
            const models = Array.isArray(data) ? data.flatMap((row: { id?: unknown; display_name?: unknown; name?: unknown }) => {
              if (typeof row?.id !== 'string' || !/^(gemini|claude|gpt|carbon)(?:[-_.]|$)/i.test(row.id)) return [];
              if (/-image(?:-|$)/i.test(row.id)) return [];
              if (row.id === 'gemini-3.8-flash-tiered' && ids.has('gemini-3.8-flash-high')) return [];
              const upstreamLabel = row.display_name ?? row.name;
              const label = antigravityModelLabel(row.id, typeof upstreamLabel === 'string' ? upstreamLabel : undefined);
              const depth = antigravityModelVariant(row.id)?.depth ?? /-(low|medium|high|xhigh)$/.exec(row.id)?.[1];
              const route = row.id === 'gemini-3.8-flash-high' && flashTiered ? 'gemini-3.8-flash-tiered' : row.id;
              const levels = configurableDepths[route] ?? (depth ? [depth] : []);
              return [{
                id: row.id, label, tools: true, images: !/^gpt-/i.test(row.id),
                ...(levels.length ? { reasoningEfforts: levels.map(antigravityReasoningEffort), defaultReasoningEffort: depth ?? levels.at(-1) } : {}),
              }];
            }) : [];
            if (!models.length) throw failure();
            return { status: 'ready', credentialConfigured: true, identity: account.identity, models, quota: await quota(providerId, settings.baseUrl, account.project) };
          } catch (error) {
            return { status: 'failed', incomplete: true, models: [], diagnostic: error instanceof ModelAccessError ? error.message : 'Google AI 服务暂不可用，请稍后重新检查。' };
          }
        },
        async beginLogin(update) {
          await config();
          lifetime.signal.throwIfAborted();
          if (login) return;
          const child = login = start(['-antigravity-login', '-no-browser']);
          let buffer = '', opened = false;
          const read = (chunk: Buffer) => {
            if (opened || login !== child) return;
            buffer = (buffer + chunk.toString()).slice(-32768);
            const match = buffer.match(/https:\/\/accounts\.google\.com\/[^\s\u001b]+/);
            if (match && buffer.indexOf(match[0]) + match[0].length < buffer.length) {
              opened = true;
              update({ state: 'waiting-browser', url: match[0] });
            }
          };
          child.stdout?.on('data', read);
          child.stderr?.on('data', read);
          const timedOut = setTimeout(() => { void stop(child); }, 300_000);
          timedOut.unref();
          try {
            const [code] = await once(child, 'exit');
            if (login === child && !closed) update(code === 0 && opened ? { state: 'completed' } : { state: 'failed', diagnostic: 'Google AI 授权未完成，请重新登录。' });
          } finally { clearTimeout(timedOut); if (login === child) login = undefined; }
        },
        async cancelLogin() { const child = login; login = undefined; await stop(child); },
        async infer(input) {
          const settings = await config();
          const account = await credential(settings.auth);
          if (!account || createHash('sha256').update(account.identity).digest('hex') !== input.providerIdentity)
            throw new ModelAccessError('model_identity_conflict', 'Google AI 登录已变化，请刷新模型后重试。', 409);
          const route = protocolForModel(input.modelId) === 'anthropic-messages' ? '/messages' : '/chat/completions';
          const body = { ...input.body };
          const reasoning = body.reasoning as { effort?: unknown } | undefined;
          const outputConfig = body.output_config as Record<string, unknown> | undefined;
          const effort = input.reasoningEffort ?? reasoning?.effort ?? body.reasoning_effort ?? outputConfig?.effort;
          const defaultDepth = /-(low|medium|high|xhigh)$/.exec(input.modelId)?.[1];
          const model = input.modelId === 'gemini-3.8-flash-high' && flashTiered && effort !== undefined && effort !== 'high'
            ? 'gemini-3.8-flash-tiered' : input.modelId;
          const levels = configurableDepths[model];
          if (levels) {
            const depth = effort ?? defaultDepth ?? levels.at(-1);
            if (typeof depth !== 'string' || !levels.includes(depth))
              throw new ModelAccessError('agent_reasoning_unavailable', '该模型不支持所选思考深度。', 400);
            body.model = depth === defaultDepth && model === input.modelId ? model : `${model}(${depth})`;
          }
          if (levels || defaultDepth) {
            delete body.reasoning_effort;
            delete body.reasoning;
            if (outputConfig) {
              const { effort: _effort, ...rest } = outputConfig;
              if (Object.keys(rest).length) body.output_config = rest;
              else delete body.output_config;
            }
          }
          return request(settings, route, { method: 'POST', body: JSON.stringify(body), signal: input.signal });
        },
        async close() {
          closed = true;
          lifetime.abort();
          await Promise.all([stop(login), stop(server)]);
        },
      };
    },
  };
}
