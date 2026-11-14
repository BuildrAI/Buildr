import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { privateDirectories } from '../../executors/native-process.ts';
import { ModelAccessError, type ModelProvider } from '../contracts.ts';
import { antigravityModelVariant } from '../../domain/antigravity-model.ts';
import { cliProxyQuotaReader } from './cliproxy-quota.ts';
import {
  GOOGLE_AI_ANTIGRAVITY_CATALOG,
  buildGoogleAiRouteTable,
  googleAiModelAlias,
  resolveGoogleAiUpstreamModel,
  type GoogleAiRouteTable,
} from './google-ai-proxy-catalog.ts';
import {
  cliProxyBinaryName,
  ensureCliProxyInstalled,
  type CliProxyInstallLimits,
  type CliProxyReleaseAsset,
} from './google-ai-proxy-install.ts';

const providerId = 'google-ai-subscription';
const failure = () => new ModelAccessError('google_ai_service_unavailable', 'Google AI 服务暂不可用，请稍后重试。', 503);
const DEFAULT_STOP_GRACE_MS = 1_000;

const liveProxyChildren = new Set<ChildProcess>();
let exitHookRegistered = false;

function killProcessTree(child: ChildProcess, sig: NodeJS.Signals): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== 'win32' && child.pid && child.pid > 1) {
    try {
      process.kill(-child.pid, sig);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
    }
  }
  try {
    child.kill(sig);
  } catch {
    /* Process already exited. */
  }
}

function ensureExitHook(): void {
  if (exitHookRegistered) return;
  exitHookRegistered = true;
  process.on('exit', () => {
    for (const child of liveProxyChildren) {
      killProcessTree(child, 'SIGKILL');
    }
  });
}

export interface GoogleAiProxyProviderOptions {
  fetch?: typeof fetch;
  platform?: NodeJS.Platform;
  arch?: string;
  releaseBaseUrl?: string;
  allowedHosts?: readonly string[];
  releases?: Readonly<Partial<Record<string, CliProxyReleaseAsset>>>;
  limits?: CliProxyInstallLimits;
  stopGraceMs?: number;
}

const CATALOG_SNAPSHOT_JSON = JSON.stringify(GOOGLE_AI_ANTIGRAVITY_CATALOG) + '\n';

async function assertNotSymlink(targetPath: string): Promise<void> {
  try {
    const info = await lstat(targetPath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ModelAccessError('model_google_ai_config_unsafe', 'Google AI 代理配置文件路径不安全。', 409);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
}

async function writePrivateRuntimeFile(directory: string, targetPath: string, content: string): Promise<void> {
  await assertNotSymlink(targetPath);
  const tempPath = join(directory, `.runtime-${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, content, { flag: 'wx', mode: 0o600 });
    await assertNotSymlink(targetPath);
    await rename(tempPath, targetPath);
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

export function createGoogleAiProxyProvider(directory: string, options: GoogleAiProxyProviderOptions = {}): ModelProvider {
  const quota = cliProxyQuotaReader(directory);
  const configPath = join(directory, 'config.yaml');
  const runtimeCatalogPath = join(directory, '.buildr-models-catalog.json');
  const runtimeConfigPath = join(directory, '.buildr-runtime-config.yaml');
  const binaryPath = join(directory, cliProxyBinaryName(options.platform));
  let activeInstall: { promise: Promise<{ binaryPath: string; configPath: string; downloaded: boolean }>; controller: AbortController; waiters: number } | undefined;

  async function ensureInstalled(signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!activeInstall) {
      const controller = new AbortController();
      const entry = {
        controller,
        waiters: 0,
        promise: ensureCliProxyInstalled(directory, { ...options, signal: controller.signal }).finally(() => {
          if (activeInstall === entry) activeInstall = undefined;
        }),
      };
      activeInstall = entry;
    }
    const entry = activeInstall;
    entry.waiters++;
    const onAbort = () => {
      entry.waiters = Math.max(0, entry.waiters - 1);
      if (entry.waiters === 0) entry.controller.abort(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await Promise.race([
        entry.promise,
        ...(signal ? [new Promise<never>((_, reject) => {
          if (signal.aborted) reject(signal.reason);
          else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        })] : []),
      ]);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async function config() {
    const value = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, any>;
    const { host, port } = value.server;
    const key = value.access?.['api-keys']?.[0];
    const auth = value.oauth?.['auth-dir'];
    if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 1024 || port > 65535 ||
        typeof key !== 'string' || !key || typeof auth !== 'string' || resolve(directory, auth) !== join(directory, 'auth')) throw failure();
    return { baseUrl: `http://127.0.0.1:${port}/v1`, key, auth: resolve(directory, auth), raw: value };
  }
  async function prepareRuntimeConfig(raw: Record<string, unknown>): Promise<string> {
    await privateDirectories(directory);
    await writePrivateRuntimeFile(directory, runtimeCatalogPath, CATALOG_SNAPSHOT_JSON);
    const existingModels = raw.models && typeof raw.models === 'object' && !Array.isArray(raw.models)
      ? (raw.models as Record<string, unknown>)
      : {};
    const customCatalog = typeof existingModels.catalog === 'string' && existingModels.catalog.trim()
      ? existingModels.catalog
      : runtimeCatalogPath;
    const runtimePayload = {
      ...raw,
      models: {
        ...existingModels,
        catalog: customCatalog,
      },
    };
    await writePrivateRuntimeFile(directory, runtimeConfigPath, JSON.stringify(runtimePayload) + '\n');
    return runtimeConfigPath;
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
    legacyModelVariant: antigravityModelVariant,
    modelAlias: googleAiModelAlias,
    id: providerId, label: 'Google AI', singleton: true,
    authentication: { type: 'oauth', label: 'Google AI', description: '登录 Google AI 账号后即可使用订阅模型；首次添加会自动下载并初始化本地代理组件。' },
    modeLabel: '订阅', group: { id: 'google-ai', label: 'Google AI' },
    presentation: { vendorLabel: 'Google AI', sourceLabel: 'Google AI' },
    sharing: { kind: 'gateway' }, inference: 'gateway', enableDiscoveredModelsByDefault: true,
    clearCatalogOnUnauthenticated: true,
    async prepare({ signal }) {
      await ensureInstalled(signal);
    },
    async open() {
      let server: ChildProcess | undefined, login: ChildProcess | undefined;
      let starting: Promise<void> | undefined;
      let closed = false;
      const lifetime = new AbortController();
      const runtimeChildren = new Set<ChildProcess>();
      const failedSpawns = new WeakSet<ChildProcess>();
      const stopTasks = new WeakMap<ChildProcess, Promise<void>>();
      let cachedRoutes: { identity: string; table: GoogleAiRouteTable } | undefined;

      function start(args: string[], effectiveConfigPath: string): ChildProcess {
        if (closed || lifetime.signal.aborted) throw failure();
        ensureExitHook();
        const child = spawn(binaryPath, [...args, '-config', effectiveConfigPath], {
          cwd: directory,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        liveProxyChildren.add(child);
        runtimeChildren.add(child);
        const release = () => {
          liveProxyChildren.delete(child);
          runtimeChildren.delete(child);
        };
        child.once('error', () => {
          failedSpawns.add(child);
          release();
        });
        child.once('exit', release);
        child.stdout?.resume();
        child.stderr?.resume();
        if (closed || lifetime.signal.aborted) {
          void stop(child);
          throw failure();
        }
        return child;
      }

      async function stop(child: ChildProcess | undefined): Promise<void> {
        if (!child) return;
        const existing = stopTasks.get(child);
        if (existing) return existing;
        const task = (async () => {
          if (failedSpawns.has(child) || child.exitCode !== null || child.signalCode !== null) return;
          const exited = new Promise<void>(done => {
            if (failedSpawns.has(child) || child.exitCode !== null || child.signalCode !== null) {
              done();
              return;
            }
            child.once('exit', () => done());
            child.once('error', () => done());
          });
          killProcessTree(child, 'SIGTERM');
          await Promise.race([exited, delay(options.stopGraceMs ?? DEFAULT_STOP_GRACE_MS, undefined, { ref: false })]);
          if (!failedSpawns.has(child) && child.exitCode === null && child.signalCode === null) {
            killProcessTree(child, 'SIGKILL');
            await exited;
          }
        })().finally(() => {
          liveProxyChildren.delete(child);
          runtimeChildren.delete(child);
        });
        stopTasks.set(child, task);
        return task;
      }

      async function ensureServer(settings: Awaited<ReturnType<typeof config>>, expectModels: boolean) {
        lifetime.signal.throwIfAborted();
        if (starting) return starting;
        if (server?.pid && server.exitCode === null && server.signalCode === null) return;
        // Refuse to share the port with an unowned process.
        const existing = await fetch(settings.baseUrl + '/models', { signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(700)]), redirect: 'error' }).catch(() => undefined);
        if (existing) { await existing.body?.cancel(); throw failure(); }
        lifetime.signal.throwIfAborted();
        if (starting) return starting;
        if (server?.pid && server.exitCode === null && server.signalCode === null) return;
        const effectiveConfigPath = await prepareRuntimeConfig(settings.raw);
        lifetime.signal.throwIfAborted();
        if (starting) return starting;
        if (server?.pid && server.exitCode === null && server.signalCode === null) return;
        const child = server = start(['-local-model'], effectiveConfigPath);
        starting = (async () => {
          let listening = false;
          for (let attempt = 0; attempt < 50; attempt++) {
            await delay(100, undefined, { signal: lifetime.signal });
            if (!child.pid || child.exitCode !== null || child.signalCode !== null) break;
            const response = await fetch(settings.baseUrl + '/models', {
              headers: { authorization: 'Bearer ' + settings.key },
              signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(500)]),
              redirect: 'error',
            }).catch(() => undefined);
            if (!response) continue;
            if (!response.ok) {
              await response.body?.cancel();
              continue;
            }
            listening = true;
            const payload = await response.json().catch(() => undefined);
            if (!expectModels || (Array.isArray(payload?.data) && payload.data.length > 0)) return;
          }
          if (listening && child.pid && child.exitCode === null && child.signalCode === null) return;
          throw failure();
        })().catch(async error => {
          if (server === child) server = undefined;
          await stop(child);
          throw error;
        }).finally(() => { starting = undefined; });
        return starting;
      }
      async function request(settings: Awaited<ReturnType<typeof config>>, route: string, init: RequestInit, expectModels = true) {
        await ensureServer(settings, expectModels);
        return fetch(settings.baseUrl + route, { ...init, redirect: 'error',
          signal: AbortSignal.any([lifetime.signal, init.signal ?? AbortSignal.timeout(10_000)]),
          headers: { authorization: 'Bearer ' + settings.key, 'content-type': 'application/json', ...(route === '/messages' ? { 'anthropic-version': '2023-06-01' } : {}) } });
      }
      async function loadRouteTable(
        settings: Awaited<ReturnType<typeof config>>,
        identity: string,
        signal: AbortSignal,
        forceRefresh: boolean,
      ): Promise<GoogleAiRouteTable> {
        if (!forceRefresh && cachedRoutes?.identity === identity && cachedRoutes.table.models.length > 0) {
          return cachedRoutes.table;
        }
        let data: unknown;
        for (let attempt = 0; attempt < 15; attempt++) {
          const response = await request(settings, '/models', { signal }, true);
          if (!response.ok) { await response.body?.cancel(); throw failure(); }
          data = (await response.json()).data;
          if (Array.isArray(data) && data.length) break;
          await delay(200, undefined, { signal: AbortSignal.any([lifetime.signal, signal]) });
        }
        const table = buildGoogleAiRouteTable(data);
        if (table.models.length > 0) cachedRoutes = { identity, table };
        return table;
      }
      return {
        protocol: 'chat-completions',
        protocolForModel,
        async inspect() {
          try {
            await ensureInstalled(lifetime.signal);
            const settings = await config();
            const account = await credential(settings.auth);
            if (!account) {
              cachedRoutes = undefined;
              return { status: 'not-authenticated', models: [] };
            }
            const table = await loadRouteTable(settings, account.identity, lifetime.signal, true);
            if (!table.models.length) throw failure();
            return { status: 'ready', credentialConfigured: true, identity: account.identity, models: table.models, quota: await quota(providerId, settings.baseUrl, account.project) };
          } catch (error) {
            return { status: 'failed', incomplete: true, models: [], diagnostic: error instanceof ModelAccessError ? error.message : 'Google AI 服务暂不可用，请稍后重新检查。' };
          }
        },
        async beginLogin(update) {
          lifetime.signal.throwIfAborted();
          if (login) return;
          update({ state: 'initializing', diagnostic: '正在检查并准备 Google AI 本地代理组件…' });
          let effectiveConfigPath: string;
          try {
            await ensureInstalled(lifetime.signal);
            const settings = await config();
            effectiveConfigPath = await prepareRuntimeConfig(settings.raw);
          } catch (error) {
            if (!closed && !lifetime.signal.aborted) {
              update({ state: 'failed', diagnostic: error instanceof ModelAccessError ? error.message : 'Google AI 代理组件准备失败，请重试。' });
            }
            return;
          }
          lifetime.signal.throwIfAborted();
          if (login) return;
          const child = login = start(['-antigravity-login', '-no-browser'], effectiveConfigPath);
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
            const [code] = await new Promise<[number | null]>((resolve, reject) => {
              if (failedSpawns.has(child)) { reject(failure()); return; }
              if (child.exitCode !== null || child.signalCode !== null) { resolve([child.exitCode]); return; }
              child.once('exit', exitCode => resolve([exitCode]));
              child.once('error', reject);
            });
            if (login === child && !closed) update(code === 0 && opened ? { state: 'completed' } : { state: 'failed', diagnostic: 'Google AI 授权未完成，请重新登录。' });
          } catch {
            if (login === child && !closed) update({ state: 'failed', diagnostic: 'Google AI 代理登录程序启动失败，请重试。' });
          } finally { clearTimeout(timedOut); if (login === child) login = undefined; }
        },
        async cancelLogin() { const child = login; login = undefined; await stop(child); },
        async infer(input) {
          const combinedSignal = AbortSignal.any([lifetime.signal, input.signal]);
          await ensureInstalled(combinedSignal);
          const settings = await config();
          const account = await credential(settings.auth);
          if (!account || createHash('sha256').update(account.identity).digest('hex') !== input.providerIdentity)
            throw new ModelAccessError('model_identity_conflict', 'Google AI 登录已变化，请刷新模型后重试。', 409);
          const hadCachedTable = cachedRoutes?.identity === account.identity && cachedRoutes.table.models.length > 0;
          let table = await loadRouteTable(settings, account.identity, input.signal, false);
          const body = { ...input.body };
          const reasoning = body.reasoning as { effort?: unknown } | undefined;
          const outputConfig = body.output_config as Record<string, unknown> | undefined;
          // Per-request reasoning effort overrides (such as low-effort auxiliary titles)
          // must win over the conversation lease's default work effort.
          const effort = reasoning?.effort ?? body.reasoning_effort ?? outputConfig?.effort ?? input.reasoningEffort;
          let upstreamModel: string;
          try {
            upstreamModel = resolveGoogleAiUpstreamModel(table, input.modelId, effort);
          } catch (error) {
            if (hadCachedTable && error instanceof ModelAccessError && error.code === 'model_unavailable') {
              table = await loadRouteTable(settings, account.identity, input.signal, true);
              upstreamModel = resolveGoogleAiUpstreamModel(table, input.modelId, effort);
            } else {
              throw error;
            }
          }
          const route = protocolForModel(upstreamModel) === 'anthropic-messages' ? '/messages' : '/chat/completions';
          body.model = upstreamModel;
          delete body.reasoning_effort;
          delete body.reasoning;
          delete body.thinking;
          if (outputConfig && typeof outputConfig === 'object' && !Array.isArray(outputConfig)) {
            const { effort: _effort, ...rest } = outputConfig;
            if (Object.keys(rest).length) body.output_config = rest;
            else delete body.output_config;
          }
          return request(settings, route, { method: 'POST', body: JSON.stringify(body), signal: input.signal }, true);
        },
        async close() {
          closed = true;
          lifetime.abort();
          const pendingStart = starting;
          const children = new Set<ChildProcess>(runtimeChildren);
          if (login) children.add(login);
          if (server) children.add(server);
          login = undefined;
          server = undefined;
          await Promise.allSettled([pendingStart?.catch(() => {}), ...[...children].map(child => stop(child))]);
        },
      };
    },
  };
}
