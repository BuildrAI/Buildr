import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, chmod, lstat, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { ModelAccessError, type CatalogModel, type ModelAccessOptions, type ModelAccountView, type ModelGatewayLease, type ModelLeaseInput, type ModelOffering, type ModelProtocol, type ModelProviderRuntime, type ProtocolJson } from './contracts.ts';
import { effectiveModel, selectedOffering, modelConfiguration, modelLeaseIdentity } from './model-preferences.ts';
import type {ModelPreference,ModelPreferenceUpdate} from './contracts.ts';
import { translateRequest, translateResponse, type OpaqueReasoning } from './protocols.ts';
import { modelFailure, upstreamFailure } from './errors.ts';
import { modelQuotaFailure } from './quota.ts';
import {guardToolArgumentStream} from './tool-stream-guard.ts';

const object = (value: unknown): ProtocolJson => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ProtocolJson : {};
const safeId = (value: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const byId = (left: { id: string }, right: { id: string }) => left.id.localeCompare(right.id);
const selectionEfforts = (values: Array<{ id: string; label: string }> | undefined) => (values ?? []).map(({ id, label }) => ({ id, label })).sort(byId);
const selectionTiers = (values: ModelOffering['serviceTiers']) => (values ?? []).map(tier => ({ id: tier.id, label: tier.label, contextWindow: tier.contextWindow, defaultReasoningEffort: tier.defaultReasoningEffort, reasoningEfforts: selectionEfforts(tier.reasoningEfforts) })).sort(byId);
/** Stable snapshot for revision changes; observable quota and timestamps stay outside selection identity. */
const selectionModels = (models: ModelOffering[]) => models.map(model => ({
  id: model.id, label: model.label, contextWindow: model.contextWindow, reportedContextWindow: model.reportedContextWindow,
  contextWindowOverride: model.contextWindowOverride, maxOutputTokens: model.maxOutputTokens, images: model.images, tools: model.tools,
  enabled: model.enabled, kind: model.kind, family: model.family, defaultReasoningEffort: model.defaultReasoningEffort,
  reasoningEfforts: selectionEfforts(model.reasoningEfforts), defaultServiceTier: model.defaultServiceTier,
  serviceTiers: selectionTiers(model.serviceTiers),
})).sort(byId);
function conflict(actual: string, expected: string | undefined) { if (expected !== undefined && expected !== actual) throw new ModelAccessError('model_revision_conflict', '模型账号已变化，请刷新后重试。'); }
interface Stored { version: 1; accounts: ModelAccountView[]; preferences?:Record<string,Record<string,ModelPreference>> }
interface LeaseRecord { view: ModelGatewayLease; input: ModelLeaseInput; tokenHash: string; requests: Map<AbortController,string>; cancelledRun?:string; streamFailure?:{code:string;message:string;runId:string} }

/** Owns metadata and local routes. Upstream credentials stay inside provider runtimes. */
export class ModelAccessApplication {
  private readonly providers: Map<string, ModelAccessOptions['providers'][number]>;
  private readonly rows = new Map<string, ModelAccountView>();
  private readonly preferences = new Map<string,Record<string,ModelPreference>>();
  private readonly runtimes = new Map<string, Promise<ModelProviderRuntime>>();
  private readonly checks = new Map<string, { operation: number; promise: Promise<ModelAccountView> }>();
  private readonly urls = new Map<string, { attemptId: string; url: string }>();
  private readonly leasesByToken = new Map<string, LeaseRecord>();
  private readonly leasesByIdentity = new Map<string, LeaseRecord>();
  private readonly operations = new Map<string, number>();
  private ready: Promise<void>;
  private writeChain: Promise<void> = Promise.resolve();
  private pendingWrites = 0;
  private server?: Server;
  private starting?: Promise<string>;
  private origin?: string;
  private closed = false;
  private key?: Buffer;
  private keyLoading?: Promise<Buffer>;
  private storageError?: ModelAccessError;
  private storedDigest?: string;
  private metadataReadOnly = false;
  private readonly options: ModelAccessOptions;
  private get now() { return (this.options.now?.() ?? new Date()).toISOString(); }
  constructor(options: ModelAccessOptions) {
    this.options = options;
    this.providers = new Map(options.providers.map(provider => [provider.id, provider]));
    if (this.providers.size !== options.providers.length || [...this.providers.keys()].some(id => !safeId(id))) throw new ModelAccessError('model_provider_invalid', '模型提供者声明无效。');
    try { this.load(); } catch (error) { this.storageError = error instanceof ModelAccessError ? error : new ModelAccessError('model_storage_unavailable','模型账号存储不可读取。'); }
    this.ready = Promise.resolve();
  }
  private load() {
    try {
      const stat = lstatSync(join(this.options.root, 'accounts.json'));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('unsafe');
      const content = readFileSync(join(this.options.root, 'accounts.json'), 'utf8'); this.storedDigest = digest(content);
      const data: unknown = JSON.parse(content);
      const stored = object(data);
      if (stored.version !== 1 || !Array.isArray(stored.accounts)) throw new Error('invalid');
      let migrated = false;
      for (const raw of stored.accounts) {
        const row = object(raw);
        if (typeof row.id !== 'string' || !safeId(row.id) || typeof row.provider !== 'string' || typeof row.revision !== 'string' || !Array.isArray(row.models)) throw new Error('invalid');
        const view = row as unknown as ModelAccountView;
        // Legacy records predate credential generations; their stable account ID is isolated.
        if(!view.identity) view.identity = digest('legacy-account:'+view.id);
        // A source that now owns its credential domain no longer acts as an agent connection.
        // Keep the observation but require an explicit login in the source's own domain.
        const provider = this.providers.get(view.provider);
        if (!this.metadataReadOnly && view.connectionId && provider && typeof provider.connectionId !== 'string' && provider.linked) {
          delete view.connectionId;
          view.status = 'not-authenticated'; view.models = []; delete view.quota; delete view.accountLabel; delete view.observedAt; delete view.loginAttempt;
          row.revision = randomUUID(); migrated = true;
        }
        if(view.sourceEnabled!==undefined&&typeof view.sourceEnabled!=='boolean')throw new Error('invalid-source-preference');
        if(view.loginAttempt) delete view.loginAttempt.url;
        if (!this.metadataReadOnly && view.loginAttempt && ['initializing', 'waiting-browser', 'checking'].includes(view.loginAttempt.state)) view.loginAttempt = { ...view.loginAttempt, state: 'expired', diagnostic: '服务已重启，请重新登录。' };
        const prefs=object(object(stored.preferences)[view.id]) as Record<string,ModelPreference>;
        for(const model of view.models)if(!Object.hasOwn(prefs,model.id))Object.defineProperty(prefs,model.id,{value:{enabled:model.kind!=='combination'&&!/^fusion(?:-|$)/i.test(model.id)},enumerable:true,writable:true,configurable:true});
        for(const value of Object.values(prefs))if(!value||typeof value.enabled!=='boolean'||value.contextWindow!==undefined&&(!Number.isSafeInteger(value.contextWindow)||value.contextWindow<1||value.contextWindow>10000000))throw new Error('invalid-preference');
        this.preferences.set(view.id,prefs);this.rows.set(view.id, view);
      }
      if (migrated) this.persistMigrated();
    } catch (error) { if (object(error).code !== 'ENOENT') throw new ModelAccessError('model_storage_unavailable', '模型账号存储不可读取，原数据已保留。'); }
  }
  /** One bounded write for a schema-level ownership correction; failures keep the loaded state. */
  private persistMigrated() {
    try {
      const body: Stored = { version: 1, preferences:structuredClone(Object.fromEntries(this.preferences)), accounts: [...this.rows.values()].map(row => { const copy = structuredClone(row); if (copy.loginAttempt) delete copy.loginAttempt.url; return copy; }) };
      const content = JSON.stringify(body) + '\n';
      writeFileSync(join(this.options.root, 'accounts.json'), content, { mode: 0o600 });
      this.storedDigest = digest(content);
    } catch { /* The in-memory correction still applies; the next save writes it. */ }
  }
  private async privateRoot() {
    await mkdir(this.options.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.options.root);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new ModelAccessError('model_storage_unsafe', '模型账号目录来源不安全。');
    await chmod(this.options.root, 0o700);
  }
  private async save() {
    if (this.metadataReadOnly) throw new ModelAccessError('model_owner_transferred', '账号配置已交由新版维护，请使用当前入口。', 409);
    if (this.storageError) throw this.storageError;
    const body: Stored = { version: 1, preferences:structuredClone(Object.fromEntries(this.preferences)), accounts: [...this.rows.values()].map(row => { const copy = structuredClone(row); if (copy.loginAttempt) delete copy.loginAttempt.url; return copy; }) };
    this.pendingWrites++;
    const work = this.writeChain.then(async () => {
      await this.privateRoot();
      const lock = join(this.options.root, 'accounts.lock');
      try { await writeFile(lock, '', {mode:0o600,flag:'wx'}); } catch { throw new ModelAccessError('model_storage_busy','另一个入口正在修改模型账号，请重新读取。'); }
      const temporary = join(this.options.root, `accounts-${randomUUID()}.tmp`);
      try {
        let current: string | undefined;
        try { current = digest(await readFile(join(this.options.root,'accounts.json'),'utf8')); } catch(error) { if (object(error).code !== 'ENOENT') throw error; }
        if (current !== this.storedDigest) throw new ModelAccessError('model_revision_conflict','模型账号存储已被其他入口修改，请重新加载。');
        const content = JSON.stringify(body) + '\n';
        await writeFile(temporary, content, { mode: 0o600, flag: 'wx' });
        await rename(temporary, join(this.options.root, 'accounts.json')); this.storedDigest = digest(content);
      } finally { await unlink(temporary).catch(()=>{}); await unlink(lock).catch(()=>{}); }
    });
    this.writeChain = work.catch(() => {}); try { await work; } finally { this.pendingWrites--; }
  }
  private current(id: string): ModelAccountView {
    if (this.metadataReadOnly) {
      const filename=join(this.options.root,'accounts.json'),stat=lstatSync(filename);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new ModelAccessError('model_storage_unsafe','模型账号存储来源不安全。',409);
      const content = readFileSync(filename, 'utf8');
      if (digest(content) !== this.storedDigest) { this.rows.clear(); this.preferences.clear(); this.load(); }
    }
    if (this.storageError) throw this.storageError;
    const row = this.rows.get(id);
    if (!row) throw new ModelAccessError('model_account_missing', '模型账号不存在。', 404);
    return row;
  }
  private view(row: ModelAccountView): ModelAccountView {
    const result = {...structuredClone(row),sourceEnabled:row.sourceEnabled!==false}, url = this.urls.get(row.id);
    const provider = this.providers.get(row.provider);
    if (provider?.authentication) result.authType = provider.authentication.type;
    if (provider?.group) result.group = structuredClone(provider.group);
    if (provider?.modeLabel) result.modeLabel = provider.modeLabel;
    result.models=result.models.map(model=>effectiveModel(model,this.preferences.get(row.id)?.[model.id]));
    if (result.loginAttempt && url?.attemptId === result.loginAttempt.id) result.loginAttempt.url = url.url;
    return result;
  }
  private selectionState(row: ModelAccountView): string {
    const current=this.view(row);
    return JSON.stringify({identity:current.identity,enabled:current.enabled,sourceEnabled:current.sourceEnabled,status:current.status,label:current.label,accountLabel:current.accountLabel,models:selectionModels(current.models)});
  }
  private async changed(row: ModelAccountView) { row.revision = randomUUID(); await this.save(); this.options.changed?.(structuredClone(row)); return this.view(row); }
  private async observed(row: ModelAccountView, before: string) {
    const changed=before!==this.selectionState(row);
    if(changed)row.revision=randomUUID();
    await this.save();
    if(changed)this.options.changed?.(structuredClone(row));
    return this.view(row);
  }
  private async runtime(id: string): Promise<ModelProviderRuntime> {
    if (this.closed) throw new ModelAccessError('model_access_closed', '模型服务已关闭。', 503);
    const row = this.current(id), provider = this.providers.get(row.provider);
    if (!provider) throw new ModelAccessError('model_provider_unavailable', '此模型来源当前不可用。', 503);
    let runtime = this.runtimes.get(id);
    if (!runtime) {
      runtime = (async () => { await this.privateRoot(); const root = join(this.options.root, 'accounts', id); await mkdir(root, { recursive: true, mode: 0o700 }); const info = await lstat(root); if (!info.isDirectory() || info.isSymbolicLink()) throw new ModelAccessError('model_storage_unsafe', '账号配置目录来源不安全。'); return await provider.open({ accountId: id, configRoot: root, environment: this.options.environment ?? {} }); })();
      this.runtimes.set(id, runtime);
      void runtime.catch(() => { if (this.runtimes.get(id) === runtime) this.runtimes.delete(id); });
    }
    return await runtime;
  }
  async ensureLinked() {
    await this.ready;
    for (const provider of this.providers.values()) {
      if ((!provider.connectionId && !provider.linked) || this.rows.has(provider.id)) continue;
      this.rows.set(provider.id, { id:provider.id, identity:randomUUID(), provider:provider.id, ...(provider.connectionId?{connectionId:provider.connectionId}:{}), label:provider.label, revision:randomUUID(),enabled:true,status:'not-authenticated',models:[] });
      await this.save();
    }
  }
  /** Status-only downgrade keeps an in-flight lease alive; explicit revocation still ends it. */
  invalidate(id:string,input:{abortActive?:boolean}={}) {
    const row=this.rows.get(id); if(!row)return;
    this.operations.set(id,(this.operations.get(id)??0)+1);
    row.status='not-authenticated';row.models=[];delete row.quota;delete row.accountLabel;delete row.observedAt;
    for(const lease of [...this.leasesByIdentity.values()])if(lease.input.accountId===id&&!(input.abortActive===false&&lease.requests.size>0))this.release(lease.view.identity);
  }
  list(input:{includeDisabled?:boolean}={}) {
    if (this.storageError) throw this.storageError;
    return {
      accounts: [...this.rows.values()].filter(row=>input.includeDisabled||row.sourceEnabled!==false).map(row => this.view(row)),
      providers: [...this.providers.values()].filter(provider => !provider.connectionId).map(provider => ({
        id: provider.id,
        label: provider.label,
        ...(provider.authentication ? { authentication: structuredClone(provider.authentication) } : {}),
        ...(provider.group ? { group: structuredClone(provider.group) } : {}),
        ...(provider.modeLabel ? { modeLabel: provider.modeLabel } : {}),
      })),
    };
  }
  read(id: string) { return this.view(this.current(id)); }
  async add(input: { provider: string; label?: string }) {
    await this.ready; if (this.storageError) throw this.storageError;
    const provider = this.providers.get(input.provider);
    if (!provider || provider.connectionId) throw new ModelAccessError('model_provider_unavailable', '此模型来源由已有账号自动发现。', 404);
    const row: ModelAccountView = { id: randomUUID(), identity:randomUUID(), provider: provider.id, label: input.label?.trim().slice(0, 160) || provider.label, revision: randomUUID(), enabled: true, status: 'not-authenticated', credentialConfigured: false, models: [] };
    this.rows.set(row.id, row); await this.save(); this.options.changed?.(this.view(row)); return this.view(row);
  }
  async configure(id: string, input: { expectedRevision: string; apiKey: string }) {
    await this.ready;
    if (this.closed || this.metadataReadOnly) throw new ModelAccessError('model_access_closed', '模型账号配置未能保存。', 503);
    const row = this.current(id);
    if (row.connectionId) throw new ModelAccessError('model_managed_account', '此账号复用原生登录，请在对应账号入口操作。', 409);
    conflict(row.revision, input.expectedRevision);
    const provider = this.providers.get(row.provider);
    if (provider?.authentication?.type !== 'api-key') throw new ModelAccessError('model_credential_unsupported', '此模型来源不支持 API Key 配置。', 400);
    if (typeof input.apiKey !== 'string' || !input.apiKey.trim() || input.apiKey.length > 4096) throw new ModelAccessError('model_api_key_invalid', 'API Key 不能为空且不能超过 4096 个字符。', 400);
    const runtime = await this.runtime(id);
    if (!runtime.configure) throw new ModelAccessError('model_credential_unsupported', '此模型来源尚未实现 API Key 配置。', 503);
    const operation = (this.operations.get(id) ?? 0) + 1;
    this.operations.set(id, operation);
    const observation = await runtime.configure({ apiKey: input.apiKey });
    if (this.closed || this.metadataReadOnly) throw new ModelAccessError('model_access_closed', '模型账号配置未能保存。', 503);
    const before = this.selectionState(row);
    if (observation.identity && row.identity !== digest(observation.identity)) {
      row.identity = digest(observation.identity);
      for (const lease of [...this.leasesByIdentity.values()]) if (lease.input.accountId === id) this.release(lease.view.identity);
    }
    row.enabled = true;
    row.status = observation.status;
    row.credentialConfigured = observation.credentialConfigured ?? true;
    if (observation.label) row.accountLabel = observation.label;
    row.diagnostic = observation.diagnostic;
    if (observation.status === 'ready') {
      const preferences = this.preferences.get(id) ?? {};
      for (const model of observation.models) if (!Object.hasOwn(preferences, model.id)) Object.defineProperty(preferences, model.id, { value: { enabled: false }, enumerable: true, writable: true, configurable: true });
      this.preferences.set(id, preferences);
      row.models = structuredClone(observation.models);
      row.observedAt = this.now;
      if (observation.quota) row.quota = observation.quota;
      else delete row.quota;
    }
    return await this.observed(row, before);
  }
  async check(id: string, input: { expectedRevision?: string } = {}) {
    await this.ready; const row = this.current(id); conflict(row.revision, input.expectedRevision);
    const pending=this.checks.get(id);
    if(pending&&pending.operation===this.operations.get(id))return pending.promise;
    const operation = (this.operations.get(id) ?? 0) + 1; this.operations.set(id, operation);
    const promise=this.inspectAccount(row,operation).finally(()=>{if(this.checks.get(id)?.operation===operation)this.checks.delete(id);});
    this.checks.set(id,{operation,promise});return promise;
  }
  private async inspectAccount(row: ModelAccountView, operation: number): Promise<ModelAccountView> {
    const id=row.id;
    let before: string | undefined;
    try {
      const observation = await (await this.runtime(id)).inspect();
      if (this.closed || this.metadataReadOnly || this.operations.get(id) !== operation) return this.view(this.current(id));
      before=this.selectionState(row);
      if(observation.identity && row.identity!==digest(observation.identity)){row.status='not-authenticated';row.identity=digest(observation.identity);row.models=[];delete row.quota;delete row.accountLabel;delete row.observedAt;for(const lease of [...this.leasesByIdentity.values()])if(lease.input.accountId===id)this.release(lease.view.identity);}
      // An incomplete observation is not evidence that a previously usable account expired.
      // Explicit authentication results and identity changes still invalidate it immediately.
      row.enabled = true; row.status = observation.status === 'failed' && observation.incomplete === true && row.status === 'ready' && (!observation.identity || row.identity === digest(observation.identity)) ? 'ready' : observation.status; if(observation.credentialConfigured!==undefined)row.credentialConfigured=observation.credentialConfigured; if(observation.label) row.accountLabel = observation.label; row.diagnostic = observation.diagnostic;
      if(observation.status==='ready') {
        const prefs=this.preferences.get(id)??{};
        for(const model of observation.models)if(!Object.hasOwn(prefs,model.id))Object.defineProperty(prefs,model.id,{value:{enabled:false},enumerable:true,writable:true,configurable:true});
        this.preferences.set(id,prefs);row.models = structuredClone(observation.models); row.observedAt = this.now;
      }
      if(observation.quota)row.quota=!observation.quota.available&&row.quota?.available?{...row.quota,stale:true,diagnostic:'本次额度读取未完成，以下保留上次观察。'}:observation.quota;
    } catch { if (this.closed || this.metadataReadOnly || this.operations.get(id) !== operation) return this.view(this.current(id)); before??=this.selectionState(row); if (row.status !== 'ready') row.status = 'failed'; row.diagnostic = '模型账号检查未完成，已保留上次目录。'; }
    return await this.observed(row, before!);
  }
  async login(id: string, input: { expectedRevision: string }) {
    await this.ready; const row = this.current(id); if(row.connectionId)throw new ModelAccessError('model_managed_account','此账号复用原生登录，请在对应账号入口操作。'); conflict(row.revision, input.expectedRevision);
    if (row.loginAttempt && ['initializing', 'waiting-browser', 'checking'].includes(row.loginAttempt.state)) return this.view(row);
    const attemptId = randomUUID(); this.operations.set(id,(this.operations.get(id)??0)+1); row.identity=randomUUID(); row.status='not-authenticated';
    for(const lease of [...this.leasesByIdentity.values()]) if(lease.input.accountId===id) this.release(lease.view.identity);
    row.enabled = true; row.loginAttempt = { id: attemptId, state: 'initializing', updatedAt: this.now };
    const result = await this.changed(row);
    const update = async (value: NonNullable<ModelAccountView['loginAttempt']> | Omit<NonNullable<ModelAccountView['loginAttempt']>, 'id' | 'updatedAt'>) => {
      const current = this.current(id);
      if (this.closed || current.loginAttempt?.id !== attemptId || ['completed', 'cancelled', 'expired', 'failed'].includes(current.loginAttempt.state)) return;
      if(value.state==='completed') {
        const identity=current.identity;
        current.loginAttempt={id:attemptId,updatedAt:this.now,state:'checking'};this.urls.delete(id);
        await this.changed(current);
        if(this.closed||this.current(id).loginAttempt?.id!==attemptId||this.current(id).loginAttempt?.state!=='checking'||this.current(id).identity!==identity)return;
        const checked=await this.check(id);
        const latest=this.current(id);
        if(this.closed||latest.loginAttempt?.id!==attemptId||latest.loginAttempt.state!=='checking'||latest.identity!==checked.identity)return;
        latest.loginAttempt={id:attemptId,updatedAt:this.now,state:checked.status==='ready'&&checked.models.length?'completed':'failed',...(checked.status==='ready'&&checked.models.length?{}:{diagnostic:checked.diagnostic??'账号登录后未取得可用模型，请重新检查。'})};
        await this.changed(latest);return;
      }
      if (value.url) { try { const url = new URL(value.url); if (url.protocol === 'https:') this.urls.set(id, { attemptId, url: url.href }); } catch {} }
      current.loginAttempt = { id: attemptId, updatedAt: this.now, state: value.state, ...(value.diagnostic ? { diagnostic: value.diagnostic } : {}) };
      if (['completed', 'failed', 'expired', 'cancelled'].includes(value.state)) this.urls.delete(id);
      await this.changed(current);
    };
    void this.runtime(id).then(runtime => runtime.beginLogin(value => { void update(value).catch(() => {}); })).catch(() => update({ state: 'failed', diagnostic: '登录未完成，请重新发起。' }).catch(() => {}));
    return result;
  }
  async attempt(id: string, attemptId: string) { const view = await this.read(id); if (view.loginAttempt?.id !== attemptId) throw new ModelAccessError('model_login_stale', '登录尝试已变化。', 404); return view; }
  async cancelLogin(id: string, attemptId: string, input: { expectedRevision: string }) {
    await this.ready; const row = this.current(id); conflict(row.revision, input.expectedRevision);
    if (row.loginAttempt?.id !== attemptId) throw new ModelAccessError('model_login_stale', '登录尝试已变化。', 404);
    this.operations.set(id,(this.operations.get(id)??0)+1);
    row.loginAttempt = { ...row.loginAttempt, state: 'cancelled', updatedAt: this.now }; this.urls.delete(id);
    const result = await this.changed(row); await this.runtimes.get(id)?.then(runtime => runtime.cancelLogin()).catch(() => {}); return result;
  }
  async disconnect(id: string, input: { expectedRevision: string }) {
    await this.ready; const row = this.current(id); conflict(row.revision, input.expectedRevision); this.operations.set(id, (this.operations.get(id) ?? 0) + 1);
    row.enabled = false; row.status = 'disconnected'; row.identity=randomUUID(); this.urls.delete(id);
    if (row.loginAttempt && ['initializing','waiting-browser','checking'].includes(row.loginAttempt.state)) row.loginAttempt.state = 'cancelled';
    for (const lease of [...this.leasesByIdentity.values()]) if (lease.input.accountId === id) this.release(lease.view.identity);
    const pending = this.runtimes.get(id); this.runtimes.delete(id); await pending?.then(runtime => runtime.close()).catch(() => {}); return await this.changed(row);
  }
  async updatePreferences(id:string,input:ModelPreferenceUpdate) {
    await this.ready;const row=this.current(id);conflict(row.revision,input.expectedRevision);
    if(input.sourceEnabled!==undefined&&typeof input.sourceEnabled!=='boolean'||input.models!==undefined&&(!Array.isArray(input.models)||!input.models.length||input.models.length>2000)||input.models===undefined&&input.sourceEnabled===undefined)throw new ModelAccessError('model_preferences_invalid','请选择需要修改的模型。',400);
    const next=structuredClone(this.preferences.get(id)??{}),seen=new Set<string>();
    for(const update of input.models??[]){
      const model=row.models.find(model=>model.id===update.id);
      if(!model||seen.has(update.id))throw new ModelAccessError('model_unavailable','模型目录已变化，请刷新后重试。',409);
      seen.add(update.id);const preference=next[model.id]??{enabled:false};
      if(update.enabled!==undefined){if(typeof update.enabled!=='boolean')throw new ModelAccessError('model_preferences_invalid','模型开关无效。',400);preference.enabled=update.enabled;}
      if(update.contextWindow!==undefined){
        const value=update.contextWindow,limit=model.reportedContextWindow??model.contextWindow;
        if(value===null)delete preference.contextWindow;
        else {if(!Number.isSafeInteger(value)||value<1||value>10000000||limit!==undefined&&value>limit)throw new ModelAccessError('model_context_invalid','上下文必须为正整数，且不能超过平台报告上限。',400);preference.contextWindow=value;}
      }
      Object.defineProperty(next,model.id,{value:preference,enumerable:true,writable:true,configurable:true});
    }
    const previous=this.preferences.get(id),revision=row.revision,sourceEnabled=row.sourceEnabled;this.preferences.set(id,next);
    if(input.sourceEnabled!==undefined)row.sourceEnabled=input.sourceEnabled;
    const saving=this.changed(row),writtenRevision=row.revision;
    try{return await saving;}catch(error){if(row.revision===writtenRevision&&this.preferences.get(id)===next){if(previous)this.preferences.set(id,previous);else this.preferences.delete(id);row.revision=revision;row.sourceEnabled=sourceEnabled;}throw error;}
  }
  catalog() {
    if (this.storageError) throw this.storageError;
    const models: CatalogModel[] = [];
    for (const stored of this.rows.values()) { if(stored.sourceEnabled===false)continue; const row=this.view(stored); for (const model of row.models) models.push({ ...structuredClone(model), id: `${row.id}::${model.id}`, accountId: row.id, accountIdentity:row.identity, provider: row.provider, accountLabel: row.accountLabel || row.label, modelId: model.id, accountRevision: row.revision, available: row.enabled && row.status === 'ready' && model.enabled!==false, observedAt: row.observedAt }); }
    return { models };
  }
  private async encryptionKey() {
    if (this.key) return this.key; if(this.keyLoading)return this.keyLoading;
    this.keyLoading=(async()=>{
      await this.privateRoot(); const filename = join(this.options.root, 'reasoning.key');
      try { await writeFile(filename, randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (error) { if (object(error).code !== 'EEXIST') throw error; }
      const info = await lstat(filename); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new ModelAccessError('model_storage_unsafe', '模型恢复密钥来源不安全。');
      this.key = await readFile(filename); if (this.key.length !== 32) throw new ModelAccessError('model_storage_unavailable', '模型恢复密钥不可用。'); return this.key;
    })().finally(()=>{this.keyLoading=undefined;});return this.keyLoading;
  }
  private opaque(key: Buffer, namespace: string): OpaqueReasoning {
    return {
      encode(value) { const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(Buffer.from(namespace)); const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]); return 'buildr-v1.' + Buffer.concat([nonce, cipher.getAuthTag(), data]).toString('base64url'); },
      decode(value) { try { if (!value.startsWith('buildr-v1.')) throw new Error('foreign'); const data = Buffer.from(value.slice(10), 'base64url'); const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0,12)); decipher.setAAD(Buffer.from(namespace)); decipher.setAuthTag(data.subarray(12,28)); return object(JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'))); } catch { throw new ModelAccessError('model_reasoning_binding_mismatch', '推理恢复信息不属于当前模型来源，请使用新的执行上下文。', 400); } },
    };
  }
  private start(): Promise<string> {
    if (this.origin) return Promise.resolve(this.origin); if (this.starting) return this.starting;
    this.starting = (async () => { const server = createServer((req,res) => { void this.handle(req,res); }); this.server = server; server.requestTimeout = 30_000; server.headersTimeout = 15_000; server.keepAliveTimeout = 5_000; server.listen(0,'127.0.0.1'); await once(server,'listening'); const address = server.address(); if (!address || typeof address === 'string') throw new Error('model_gateway_listen_failed'); return this.origin = `http://127.0.0.1:${address.port}`; })().finally(() => { this.starting = undefined; });
    return this.starting;
  }
  async createLease(input: ModelLeaseInput): Promise<ModelGatewayLease> {
    await this.ready; const account = this.current(input.accountId);
    if(account.sourceEnabled===false)throw new ModelAccessError('model_source_disabled','所选模型来源已停用，请重新启用或选择其他来源。');
    conflict(account.revision,input.expectedRevision);
    if(input.expectedIdentity!==undefined&&input.expectedIdentity!==account.identity) throw new ModelAccessError('model_account_identity_changed','套餐登录来源已变化，请建立新的执行上下文。');
    if (!account.enabled || account.status !== 'ready') throw new ModelAccessError('model_account_unavailable', '所选模型套餐当前不可用。');
    const model = this.view(account).models.find(model => model.id === input.modelId);
    if(model?.enabled===false)throw new ModelAccessError('model_disabled','所选模型已停用，请重新选择。');
    const offering=model?selectedOffering(model,input.serviceTier):undefined; if (!offering) throw new ModelAccessError('model_unavailable', '所选模型不在账号当前目录中。');
    const quotaFailure = modelQuotaFailure(account, offering, Date.parse(this.now)); if (quotaFailure) throw quotaFailure;
    if (!input.agentId || !input.conversationId || !input.runId) throw new ModelAccessError('model_binding_invalid','模型绑定缺少准确执行身份。',400);
    const identity = modelLeaseIdentity(account.id,account.identity,input.modelId,input.conversationId,input.agentId,modelConfiguration(offering,input.serviceTier));
    const existing = this.leasesByIdentity.get(identity); if (existing) { this.updateRun(identity,input.runId); return structuredClone(existing.view); }
    const baseUrl = await this.start(), token = randomBytes(32).toString('base64url'); await this.encryptionKey();
    const view: ModelGatewayLease = { identity, baseUrl: baseUrl + '/v1', apiKey: token, model: `buildr-${identity.slice(0,32)}`, offering: structuredClone(offering), accountId: account.id, accountLabel: account.accountLabel || account.label, provider: account.provider };
    const lease: LeaseRecord = { view, input: { ...input, expectedIdentity: account.identity }, tokenHash: digest(token), requests: new Map() }; this.leasesByToken.set(lease.tokenHash,lease); this.leasesByIdentity.set(identity,lease); return structuredClone(view);
  }
  async generate(input: ModelLeaseInput & { prompt: string; signal: AbortSignal; reasoningEffort?: string }): Promise<string> {
    input.signal.throwIfAborted();
    const lease = await this.createLease(input);
    try {
      input.signal.throwIfAborted();
      const efforts = lease.offering.reasoningEfforts;
      const ranks: Record<string, number> = {off:0,none:0,disabled:0,minimal:1,low:2,medium:3,high:4,xhigh:5,max:6,ultra:7};
      if (input.reasoningEffort !== undefined && !efforts?.some(value => value.id === input.reasoningEffort)) {
        throw new ModelAccessError('model_reasoning_effort_invalid', '所选推理强度不适用于当前模型与服务档位，请重新选择。', 400);
      }
      const effort = input.reasoningEffort ?? (efforts?.length && efforts.every(value => ranks[value.id] !== undefined)
        ? [...efforts].sort((a,b) => ranks[a.id]! - ranks[b.id]!)[0]?.id : undefined);
      const response = await fetch(lease.baseUrl + '/chat/completions', {
        method: 'POST', signal: input.signal,
        headers: {'Content-Type':'application/json',Authorization:'Bearer ' + lease.apiKey},
        body: JSON.stringify({model:lease.model,stream:false,messages:[{role:'user',content:input.prompt}],tools:[],
          max_tokens: Math.min(4096, lease.offering.maxOutputTokens ?? 4096), ...(effort ? {reasoning_effort:effort} : {})}),
      });
      if (!response.ok) { await response.body?.cancel(); throw new ModelAccessError('model_generation_failed','模型生成未完成，请检查账号与额度。',502); }
      if (!response.body) throw new ModelAccessError('model_response_empty','模型返回空响应。',502);
      const reader=response.body.getReader(); const chunks: Uint8Array[]=[]; let size=0;
      try { while(true){ input.signal.throwIfAborted(); const part=await reader.read(); if(part.done)break;size+=part.value.length;
        if(size>2*1024*1024)throw new ModelAccessError('model_response_too_large','模型结果超过本次限制。',502); chunks.push(part.value); }
      } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
      input.signal.throwIfAborted();
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const message = result?.choices?.[0]?.message;
      if (result?.choices?.length !== 1 || message?.tool_calls?.length || message?.function_call || result.choices[0].finish_reason === 'length' || typeof message?.content !== 'string' || !message.content.trim()) {
        throw new ModelAccessError('model_generation_output_invalid','模型未返回完整的纯文本结果。',502);
      }
      return message.content;
    } finally { this.release(lease.identity); }
  }
  hasActiveRequests(identity:string):boolean{return (this.leasesByIdentity.get(identity)?.requests.size??0)>0;}
  stopRun(conversationId:string,runId:string):void {
    for(const lease of this.leasesByIdentity.values())if(lease.input.conversationId===conversationId){
      if(lease.input.runId===runId)lease.cancelledRun=runId;
      for(const [request,owner] of lease.requests)if(owner===runId)request.abort();
    }
  }
  streamFailure(conversationId:string,runId:string):string|undefined {
    return [...this.leasesByIdentity.values()].find(lease=>lease.input.conversationId===conversationId&&lease.streamFailure?.runId===runId)?.streamFailure?.message;
  }
  release(identity: string) { const lease = this.leasesByIdentity.get(identity); if (!lease) return; this.leasesByIdentity.delete(identity); this.leasesByToken.delete(lease.tokenHash); for (const request of lease.requests.keys()) request.abort(); }
  /** Explicit native-fork bridge, never a gateway route or a credential export. */
  async rebindReasoning(from: string, to: string, value: string): Promise<string> {
    await this.ready;
    const key = await this.encryptionKey();
    const source = this.leasesByIdentity.get(from), target = this.leasesByIdentity.get(to);
    if (!source || !target) throw new ModelAccessError('model_binding_missing', '分叉模型绑定已失效。');
    const a = source.input, b = target.input, account = this.current(a.accountId);
    if (a.accountId !== b.accountId || a.expectedIdentity !== b.expectedIdentity || account.identity !== a.expectedIdentity ||
        !account.enabled || account.status !== 'ready' || account.sourceEnabled === false ||
        a.modelId !== b.modelId || a.agentId !== b.agentId ||
        modelConfiguration(source.view.offering,a.serviceTier) !== modelConfiguration(target.view.offering,b.serviceTier))
      throw new ModelAccessError('model_reasoning_binding_mismatch', '分叉只能恢复相同账号、模型和执行器的推理信息。', 400);
    return this.opaque(key, to).encode(this.opaque(key, from).decode(value));
  }
  updateRun(identity:string,runId:string) { const lease=this.leasesByIdentity.get(identity); if(!lease||!runId) throw new ModelAccessError('model_binding_missing','本次模型绑定已失效。'); if(lease.input.runId!==runId){delete lease.cancelledRun;delete lease.streamFailure;}lease.input.runId=runId; }
  private async body(req: IncomingMessage): Promise<ProtocolJson> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of req) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.length; if (size > 64 * 1024 * 1024) throw new ModelAccessError('model_request_too_large','模型输入超过本机限制。',413); chunks.push(value); } try { const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('object'); return value as ProtocolJson; } catch { throw new ModelAccessError('model_request_invalid','模型请求不是有效 JSON 对象。',400); } }
  private json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
  private async handle(req: IncomingMessage,res: ServerResponse) {
    const controller = new AbortController(),upstreamController=new AbortController(); let lease: LeaseRecord | undefined;
    let phase = 'request', requestId: string | undefined, upstreamHttpStatus: number | undefined;
    let diagnostic: Record<string, unknown> | undefined;
    const reportFailure = (error: unknown, failurePhase = phase) => {
      if (!diagnostic || controller.signal.aborted) return;
      this.options.diagnostics?.({event:'model-request-failed', ...diagnostic, requestId, phase:failurePhase, upstreamHttpStatus,
        httpStatus:error instanceof ModelAccessError ? error.status : undefined, code:modelFailure(error).code});
    };
    req.once('aborted',()=>controller.abort()); res.once('close',()=>{ if (!res.writableEnded) controller.abort(); });
    try {
      if (this.closed || !this.origin || req.headers.host !== new URL(this.origin).host || req.headers.origin) throw new ModelAccessError('model_gateway_forbidden','模型入口只接受已授权本机调用。',403);
      const auth = req.headers.authorization, apiKey=req.headers['x-api-key'];
      const token=auth?.startsWith('Bearer ')?auth.slice(7):typeof apiKey==='string'?apiKey:undefined;
      if(!token || (typeof apiKey==='string'&&auth?.startsWith('Bearer ')&&apiKey!==token)) throw new ModelAccessError('model_gateway_unauthorized','模型调用缺少准确本机认证。',401);
      lease = this.leasesByToken.get(digest(token)); if (!lease) throw new ModelAccessError('model_gateway_unauthorized','模型调用的本机凭据已失效。',401);
      const account = this.current(lease.input.accountId); if (!account.enabled) throw new ModelAccessError('model_account_unavailable','所选套餐已断开。');
      if(account.identity!==lease.input.expectedIdentity)throw new ModelAccessError('model_account_identity_changed','账号登录来源已变化，原调用不可改用新身份。',409);
      const pathname = new URL(req.url ?? '/',this.origin).pathname;
      if (req.method === 'GET' && (pathname === '/v1/models' || pathname === '/models')) { this.json(res,200,{object:'list',data:[{id:lease.view.model,object:'model',owned_by:account.provider}]}); return; }
      const protocols: Record<string,ModelProtocol> = {'/v1/responses':'responses','/v1/chat/completions':'chat-completions','/v1/messages':'anthropic-messages'};
      const protocol = protocols[pathname]; if (req.method !== 'POST' || !protocol) throw new ModelAccessError('model_route_missing','模型接口不存在。',404);
      const body = await this.body(req); if (body.model !== lease.view.model) throw new ModelAccessError('model_binding_mismatch','本机凭据不允许调用所请求的模型。',403);
      if(lease.cancelledRun===lease.input.runId)throw new ModelAccessError('model_run_stopped','本轮已停止，不再发出模型请求。',409);
      const binding={...lease.input};lease.requests.set(controller,binding.runId);
      const runtime = await this.runtime(account.id), opaque = this.opaque(await this.encryptionKey(),lease.view.identity);
      controller.signal.throwIfAborted();
      const quotaFailure = modelQuotaFailure(account, lease.view.offering, Date.parse(this.now)); if (quotaFailure) throw quotaFailure;
      requestId = randomUUID();
      diagnostic = {provider:account.provider,conversationId:binding.conversationId,runId:binding.runId};
      phase = 'request-translation';
      const translated = translateRequest(body,protocol,runtime.protocol,opaque); translated.model = binding.modelId;
      // Capability ceiling only: leave native output defaults and context budgeting intact.
      const limit=lease.view.offering.maxOutputTokens;
      if(limit)for(const key of ['max_tokens','max_completion_tokens','max_output_tokens'])if(typeof translated[key]==='number'&&translated[key]>limit)translated[key]=limit;
      delete translated.service_tier;if(binding.serviceTier)translated.service_tier=binding.serviceTier;
      if (runtime.protocol === 'chat-completions' && Array.isArray(translated.messages)) {
        diagnostic.toolResultCount = translated.messages.filter(message => object(message).role === 'tool').length;
      }
      phase = 'provider-request';
      const upstream = await runtime.infer({body:translated,modelId:binding.modelId,signal:AbortSignal.any([controller.signal,upstreamController.signal]),context:{accountId:account.id,agentId:binding.agentId,conversationId:binding.conversationId,runId:binding.runId,requestId}});
      upstreamHttpStatus = upstream.status;
      phase = 'provider-response';
      if (!upstream.ok) {
        // Read only a bounded JSON error, never expose an arbitrary upstream body.
        let size = 0, body = ''; const reader = upstream.body?.getReader(), decoder = new TextDecoder();
        try { if (reader) for (;;) { const part = await reader.read(); if (part.done) { body += decoder.decode(); break; } size += part.value.length; if (size > 8192) break; body += decoder.decode(part.value, {stream:true}); } }
        finally { await reader?.cancel().catch(()=>{}); reader?.releaseLock(); }
        let detail: unknown; try { if (size <= 8192) detail = object(JSON.parse(body)).error; } catch { /* Non-JSON error bodies stay private. */ }
        throw upstreamFailure(detail, upstream.status);
      }
      const guarded=guardToolArgumentStream(upstream,runtime.protocol,error=>{lease!.streamFailure={...modelFailure(error),runId:binding.runId};upstreamController.abort();});
      phase = 'response-translation';
      const response = await translateResponse(guarded,runtime.protocol,protocol,{model:lease.view.model,stream:body.stream===true,request:body,opaque,signal:controller.signal,onStreamError:error=>reportFailure(error,'response-stream')});
      if (!response.body) throw new ModelAccessError('model_response_empty','模型服务返回空响应。',502);
      res.writeHead(response.status,{'Content-Type':response.headers.get('content-type') || 'application/json','Cache-Control':'no-store'});
      const reader = response.body.getReader();
      // A translated upstream may have no SSE pings during a long reasoning
      // pause. Keep the Claude consumer alive without buffering model content.
      let frameTail='',betweenFrames=true;
      const heartbeat=protocol==='anthropic-messages'&&body.stream===true&&binding.agentId==='claude-code'&&response.headers.get('content-type')?.includes('text/event-stream')
        ?setInterval(()=>{if(betweenFrames&&!controller.signal.aborted&&!res.destroyed&&!res.writableEnded&&!res.writableNeedDrain)res.write('event: ping\ndata: {"type":"ping"}\n\n');},10000):undefined;
      heartbeat?.unref();
      try { while (!controller.signal.aborted) {
        const chunk = await reader.read(); if (chunk.done) break;
        // HTTP chunks can end inside a JSON token. A ping is safe only after
        // an SSE frame delimiter; keep only the bounded byte suffix.
        frameTail=(frameTail+Buffer.from(chunk.value.subarray(-4)).toString('latin1')).slice(-4);
        betweenFrames=frameTail.endsWith('\n\n')||frameTail.endsWith('\r\n\r\n');
        if (!res.write(chunk.value)) await once(res,'drain',{signal:controller.signal});
      } }
      finally { clearInterval(heartbeat);if (controller.signal.aborted) await reader.cancel().catch(()=>{}); if (!res.destroyed && !res.writableEnded) res.end(); reader.releaseLock(); }
    } catch (error) {
      reportFailure(error);
      if (!res.headersSent && !res.destroyed) { this.json(res,error instanceof ModelAccessError ? error.status : 502,{error:modelFailure(error)}); }
      else if (!res.destroyed) res.destroy();
    } finally { lease?.requests.delete(controller); }
  }
  activity() {
    if(this.metadataReadOnly)for(const lease of [...this.leasesByIdentity.values()]){
      try{const account=this.current(lease.input.accountId);if(!account.enabled||account.identity!==lease.input.expectedIdentity)this.release(lease.view.identity);}catch{this.release(lease.view.identity);}
    }
    const requests=[...this.leasesByIdentity.values()].reduce((count,lease)=>count+lease.requests.size,0);
    const logins=this.metadataReadOnly ? 0 : [...this.rows.values()].filter(row=>['initializing','waiting-browser','checking'].includes(row.loginAttempt?.state??'')).length;
    return [{kind:'model-request',count:requests},{kind:'model-login',count:logins},{kind:'model-check',count:this.checks.size},{kind:'model-write',count:this.pendingWrites}].filter(value=>value.count>0);
  }
  freezeMetadata(value = true) {
    const wasReadOnly=this.metadataReadOnly;this.metadataReadOnly=value;
    if(wasReadOnly&&!value){
      try{this.rows.clear();this.preferences.clear();this.storedDigest=undefined;this.load();}
      catch{this.storageError=new ModelAccessError('model_storage_unavailable','配置维护恢复后账号资料未能核对，原数据已保留。',409);}
    }
  }
  async close() { if (this.closed) return; this.closed = true; await this.ready.catch(()=>{}); for (const identity of [...this.leasesByIdentity.keys()]) this.release(identity); this.urls.clear(); await Promise.allSettled([...this.runtimes.values()].map(async pending => { await (await pending).close(); })); this.runtimes.clear(); if (this.server) { this.server.closeAllConnections(); await new Promise<void>(resolve => this.server!.close(()=>resolve())); } await this.writeChain; }
}

export function createModelAccess(options: ModelAccessOptions) {
  const application = new ModelAccessApplication(options);
  return {
    ensureLinked: () => application.ensureLinked(), invalidate: (id:string,input?:{abortActive?:boolean}) => application.invalidate(id,input),
    accounts: { list: (input?:{includeDisabled?:boolean}) => application.list(input), read: (id: string) => application.read(id), snapshot: (id:string) => application.read(id), preferences:(id:string,input:ModelPreferenceUpdate)=>application.updatePreferences(id,input), add: (input: {provider:string;label?:string}) => application.add(input), configure: (id:string,input:{expectedRevision:string;apiKey:string}) => application.configure(id,input), login: (id:string,input:{expectedRevision:string}) => application.login(id,input), attempt: (id:string,attemptId:string) => application.attempt(id,attemptId), cancelLogin: (id:string,attemptId:string,input:{expectedRevision:string}) => application.cancelLogin(id,attemptId,input), check: (id:string,input:{expectedRevision?:string}={}) => application.check(id,input), disconnect: (id:string,input:{expectedRevision:string}) => application.disconnect(id,input) },
    catalog: { list: () => application.catalog() },
    activity: () => application.activity(),
    freezeMetadata: (value = true) => application.freezeMetadata(value),
    generate: (input: ModelLeaseInput & {prompt:string;signal:AbortSignal;reasoningEffort?:string}) => application.generate(input),
    leases: { rebindReasoning:(from:string,to:string,value:string)=>application.rebindReasoning(from,to,value), stopRun:(conversationId:string,runId:string)=>application.stopRun(conversationId,runId), streamFailure:(conversationId:string,runId:string)=>application.streamFailure(conversationId,runId), hasActiveRequests:(identity:string)=>application.hasActiveRequests(identity), create: (input:ModelLeaseInput) => application.createLease(input), release: (identity:string) => application.release(identity), updateRun:(identity:string,runId:string)=>application.updateRun(identity,runId) },
    close: () => application.close(),
  };
}
export type ModelAccess = ReturnType<typeof createModelAccess>;
