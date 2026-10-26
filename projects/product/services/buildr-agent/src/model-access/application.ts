import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, chmod, lstat, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { lstatSync, readFileSync } from 'node:fs';
import { ModelAccessError, type CatalogModel, type ModelAccessOptions, type ModelAccountView, type ModelGatewayLease, type ModelLeaseInput, type ModelProtocol, type ModelProviderRuntime, type ProtocolJson } from './contracts.ts';
import { effectiveModel, selectedOffering, modelConfiguration } from './model-preferences.ts';
import type {ModelPreference,ModelPreferenceUpdate} from './contracts.ts';
import { translateRequest, translateResponse, type OpaqueReasoning } from './protocols.ts';

const object = (value: unknown): ProtocolJson => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ProtocolJson : {};
const safeId = (value: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function conflict(actual: string, expected: string | undefined) { if (expected !== undefined && expected !== actual) throw new ModelAccessError('model_revision_conflict', '模型账号已变化，请刷新后重试。'); }
interface Stored { version: 1; accounts: ModelAccountView[]; preferences?:Record<string,Record<string,ModelPreference>> }
interface LeaseRecord { view: ModelGatewayLease; input: ModelLeaseInput; tokenHash: string; requests: Set<AbortController> }

/** Owns metadata and local routes. Upstream credentials stay inside provider runtimes. */
export class ModelAccessApplication {
  private readonly providers: Map<string, ModelAccessOptions['providers'][number]>;
  private readonly rows = new Map<string, ModelAccountView>();
  private readonly preferences = new Map<string,Record<string,ModelPreference>>();
  private readonly runtimes = new Map<string, Promise<ModelProviderRuntime>>();
  private readonly urls = new Map<string, { attemptId: string; url: string }>();
  private readonly leasesByToken = new Map<string, LeaseRecord>();
  private readonly leasesByIdentity = new Map<string, LeaseRecord>();
  private readonly operations = new Map<string, number>();
  private ready: Promise<void>;
  private writeChain: Promise<void> = Promise.resolve();
  private server?: Server;
  private starting?: Promise<string>;
  private origin?: string;
  private closed = false;
  private key?: Buffer;
  private keyLoading?: Promise<Buffer>;
  private storageError?: ModelAccessError;
  private storedDigest?: string;
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
      for (const raw of stored.accounts) {
        const row = object(raw);
        if (typeof row.id !== 'string' || !safeId(row.id) || typeof row.provider !== 'string' || typeof row.revision !== 'string' || !Array.isArray(row.models)) throw new Error('invalid');
        const view = row as unknown as ModelAccountView;
        // Legacy records predate credential generations; their stable account ID is isolated.
        if(!view.identity) view.identity = digest('legacy-account:'+view.id);
        if(view.loginAttempt) delete view.loginAttempt.url;
        if (view.loginAttempt && ['initializing', 'waiting-browser', 'checking'].includes(view.loginAttempt.state)) view.loginAttempt = { ...view.loginAttempt, state: 'expired', diagnostic: '服务已重启，请重新登录。' };
        const prefs=object(object(stored.preferences)[view.id]) as Record<string,ModelPreference>;
        for(const model of view.models)if(!Object.hasOwn(prefs,model.id))Object.defineProperty(prefs,model.id,{value:{enabled:model.kind!=='combination'&&!/^fusion(?:-|$)/i.test(model.id)},enumerable:true,writable:true,configurable:true});
        for(const value of Object.values(prefs))if(!value||typeof value.enabled!=='boolean'||value.contextWindow!==undefined&&(!Number.isSafeInteger(value.contextWindow)||value.contextWindow<1||value.contextWindow>10000000))throw new Error('invalid-preference');
        this.preferences.set(view.id,prefs);this.rows.set(view.id, view);
      }
    } catch (error) { if (object(error).code !== 'ENOENT') throw new ModelAccessError('model_storage_unavailable', '模型账号存储不可读取，原数据已保留。'); }
  }
  private async privateRoot() {
    await mkdir(this.options.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.options.root);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new ModelAccessError('model_storage_unsafe', '模型账号目录来源不安全。');
    await chmod(this.options.root, 0o700);
  }
  private async save() {
    if (this.storageError) throw this.storageError;
    const body: Stored = { version: 1, preferences:structuredClone(Object.fromEntries(this.preferences)), accounts: [...this.rows.values()].map(row => { const copy = structuredClone(row); if (copy.loginAttempt) delete copy.loginAttempt.url; return copy; }) };
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
    this.writeChain = work.catch(() => {}); await work;
  }
  private current(id: string): ModelAccountView {
    if (this.storageError) throw this.storageError;
    const row = this.rows.get(id);
    if (!row) throw new ModelAccessError('model_account_missing', '模型账号不存在。', 404);
    return row;
  }
  private view(row: ModelAccountView): ModelAccountView {
    const result = structuredClone(row), url = this.urls.get(row.id);
    result.models=result.models.map(model=>effectiveModel(model,this.preferences.get(row.id)?.[model.id]));
    if (result.loginAttempt && url?.attemptId === result.loginAttempt.id) result.loginAttempt.url = url.url;
    return result;
  }
  private async changed(row: ModelAccountView) { row.revision = randomUUID(); await this.save(); this.options.changed?.(structuredClone(row)); return this.view(row); }
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
      if (!provider.connectionId || this.rows.has(provider.id)) continue;
      this.rows.set(provider.id, { id:provider.id, identity:randomUUID(), provider:provider.id, connectionId:provider.connectionId, label:provider.label, revision:randomUUID(),enabled:true,status:'not-authenticated',models:[] });
      await this.save();
    }
  }
  invalidate(id:string) {
    const row=this.rows.get(id); if(!row)return;
    this.operations.set(id,(this.operations.get(id)??0)+1);
    row.status='not-authenticated';row.models=[];
    for(const lease of [...this.leasesByIdentity.values()])if(lease.input.accountId===id)this.release(lease.view.identity);
  }
  list() { if (this.storageError) throw this.storageError; return { accounts: [...this.rows.values()].map(row => this.view(row)), providers: [...this.providers.values()].filter(provider=>!provider.connectionId).map(provider => ({ id: provider.id, label: provider.label })) }; }
  read(id: string) { return this.view(this.current(id)); }
  async add(input: { provider: string; label?: string }) {
    await this.ready; if (this.storageError) throw this.storageError;
    const provider = this.providers.get(input.provider);
    if (!provider || provider.connectionId) throw new ModelAccessError('model_provider_unavailable', '此模型来源由已有账号自动发现。', 404);
    const row: ModelAccountView = { id: randomUUID(), identity:randomUUID(), provider: provider.id, label: input.label?.trim().slice(0, 160) || provider.label, revision: randomUUID(), enabled: true, status: 'not-authenticated', models: [] };
    this.rows.set(row.id, row); await this.save(); this.options.changed?.(this.view(row)); return this.view(row);
  }
  async check(id: string, input: { expectedRevision?: string } = {}) {
    await this.ready; const row = this.current(id); conflict(row.revision, input.expectedRevision);
    const operation = (this.operations.get(id) ?? 0) + 1; this.operations.set(id, operation);
    try {
      const observation = await (await this.runtime(id)).inspect();
      if (this.operations.get(id) !== operation) return this.view(this.current(id));
      if(observation.identity && row.identity!==digest(observation.identity)){row.identity=digest(observation.identity);for(const lease of [...this.leasesByIdentity.values()])if(lease.input.accountId===id)this.release(lease.view.identity);}
      row.enabled = true; row.status = observation.status; if(observation.label) row.accountLabel = observation.label; row.diagnostic = observation.diagnostic;
      if(observation.status==='ready') {
        const prefs=this.preferences.get(id)??{};
        for(const model of observation.models)if(!Object.hasOwn(prefs,model.id))Object.defineProperty(prefs,model.id,{value:{enabled:false},enumerable:true,writable:true,configurable:true});
        this.preferences.set(id,prefs);row.models = structuredClone(observation.models); row.observedAt = this.now;
      }
      if(observation.quota)row.quota=!observation.quota.available&&row.quota?.available?{...row.quota,stale:true,diagnostic:'本次额度读取未完成，以下保留上次观察。'}:observation.quota;
    } catch { if (this.operations.get(id) !== operation) return this.view(this.current(id)); row.status = 'failed'; row.diagnostic = '模型账号检查未完成，已保留上次目录。'; }
    return await this.changed(row);
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
        if(this.closed||latest.loginAttempt?.id!==attemptId||latest.loginAttempt.state!=='checking'||latest.identity!==identity)return;
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
    if(!Array.isArray(input.models)||!input.models.length||input.models.length>2000)throw new ModelAccessError('model_preferences_invalid','请选择需要修改的模型。',400);
    const next=structuredClone(this.preferences.get(id)??{}),seen=new Set<string>();
    for(const update of input.models){
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
    const previous=this.preferences.get(id),revision=row.revision;this.preferences.set(id,next);
    const saving=this.changed(row),writtenRevision=row.revision;
    try{return await saving;}catch(error){if(row.revision===writtenRevision&&this.preferences.get(id)===next){if(previous)this.preferences.set(id,previous);else this.preferences.delete(id);row.revision=revision;}throw error;}
  }
  catalog() {
    if (this.storageError) throw this.storageError;
    const models: CatalogModel[] = [];
    for (const stored of this.rows.values()) { const row=this.view(stored); for (const model of row.models) models.push({ ...structuredClone(model), id: `${row.id}::${model.id}`, accountId: row.id, accountIdentity:row.identity, provider: row.provider, accountLabel: row.accountLabel || row.label, modelId: model.id, accountRevision: row.revision, available: row.enabled && row.status === 'ready' && model.enabled!==false, observedAt: row.observedAt }); }
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
    await this.ready; const account = this.current(input.accountId); conflict(account.revision,input.expectedRevision);
    if(input.expectedIdentity!==undefined&&input.expectedIdentity!==account.identity) throw new ModelAccessError('model_account_identity_changed','套餐登录来源已变化，请建立新的执行上下文。');
    if (!account.enabled || account.status !== 'ready') throw new ModelAccessError('model_account_unavailable', '所选模型套餐当前不可用。');
    const model = this.view(account).models.find(model => model.id === input.modelId);
    if(model?.enabled===false)throw new ModelAccessError('model_disabled','所选模型已停用，请重新选择。');
    const offering=model?selectedOffering(model,input.serviceTier):undefined; if (!offering) throw new ModelAccessError('model_unavailable', '所选模型不在账号当前目录中。');
    if (!input.agentId || !input.conversationId || !input.runId) throw new ModelAccessError('model_binding_invalid','模型绑定缺少准确执行身份。',400);
    const identity = digest(JSON.stringify([account.id,account.identity,input.modelId,input.conversationId,input.agentId,modelConfiguration(offering,input.serviceTier)]));
    const existing = this.leasesByIdentity.get(identity); if (existing) { existing.input.runId = input.runId; return structuredClone(existing.view); }
    const baseUrl = await this.start(), token = randomBytes(32).toString('base64url'); await this.encryptionKey();
    const view: ModelGatewayLease = { identity, baseUrl: baseUrl + '/v1', apiKey: token, model: `buildr-${identity.slice(0,32)}`, offering: structuredClone(offering), accountId: account.id, accountLabel: account.accountLabel || account.label, provider: account.provider };
    const lease: LeaseRecord = { view, input: { ...input }, tokenHash: digest(token), requests: new Set() }; this.leasesByToken.set(lease.tokenHash,lease); this.leasesByIdentity.set(identity,lease); return structuredClone(view);
  }
  release(identity: string) { const lease = this.leasesByIdentity.get(identity); if (!lease) return; this.leasesByIdentity.delete(identity); this.leasesByToken.delete(lease.tokenHash); for (const request of lease.requests) request.abort(); }
  updateRun(identity:string,runId:string) { const lease=this.leasesByIdentity.get(identity); if(!lease||!runId) throw new ModelAccessError('model_binding_missing','本次模型绑定已失效。'); lease.input.runId=runId; }
  private async body(req: IncomingMessage): Promise<ProtocolJson> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of req) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.length; if (size > 64 * 1024 * 1024) throw new ModelAccessError('model_request_too_large','模型输入超过本机限制。',413); chunks.push(value); } try { const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('object'); return value as ProtocolJson; } catch { throw new ModelAccessError('model_request_invalid','模型请求不是有效 JSON 对象。',400); } }
  private json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
  private async handle(req: IncomingMessage,res: ServerResponse) {
    const controller = new AbortController(); let lease: LeaseRecord | undefined;
    req.once('aborted',()=>controller.abort()); res.once('close',()=>{ if (!res.writableEnded) controller.abort(); });
    try {
      if (this.closed || !this.origin || req.headers.host !== new URL(this.origin).host || req.headers.origin) throw new ModelAccessError('model_gateway_forbidden','模型入口只接受已授权本机调用。',403);
      const auth = req.headers.authorization, apiKey=req.headers['x-api-key'];
      const token=auth?.startsWith('Bearer ')?auth.slice(7):typeof apiKey==='string'?apiKey:undefined;
      if(!token || (typeof apiKey==='string'&&auth?.startsWith('Bearer ')&&apiKey!==token)) throw new ModelAccessError('model_gateway_unauthorized','模型调用缺少准确本机认证。',401);
      lease = this.leasesByToken.get(digest(token)); if (!lease) throw new ModelAccessError('model_gateway_unauthorized','模型调用的本机凭据已失效。',401);
      const account = this.current(lease.input.accountId); if (!account.enabled) throw new ModelAccessError('model_account_unavailable','所选套餐已断开。');
      const pathname = new URL(req.url ?? '/',this.origin).pathname;
      if (req.method === 'GET' && (pathname === '/v1/models' || pathname === '/models')) { this.json(res,200,{object:'list',data:[{id:lease.view.model,object:'model',owned_by:account.provider}]}); return; }
      const protocols: Record<string,ModelProtocol> = {'/v1/responses':'responses','/v1/chat/completions':'chat-completions','/v1/messages':'anthropic-messages'};
      const protocol = protocols[pathname]; if (req.method !== 'POST' || !protocol) throw new ModelAccessError('model_route_missing','模型接口不存在。',404);
      const body = await this.body(req); if (body.model !== lease.view.model) throw new ModelAccessError('model_binding_mismatch','本机凭据不允许调用所请求的模型。',403);
      lease.requests.add(controller);
      const runtime = await this.runtime(account.id), opaque = this.opaque(await this.encryptionKey(),lease.view.identity);
      const binding={...lease.input};
      const translated = translateRequest(body,protocol,runtime.protocol,opaque); translated.model = binding.modelId;
      delete translated.service_tier;if(binding.serviceTier)translated.service_tier=binding.serviceTier;
      const upstream = await runtime.infer({body:translated,modelId:binding.modelId,signal:controller.signal,context:{accountId:account.id,agentId:binding.agentId,conversationId:binding.conversationId,runId:binding.runId,requestId:randomUUID()}});
      if (!upstream.ok) { await upstream.body?.cancel(); throw new ModelAccessError('model_upstream_failed','所选套餐的模型请求失败，请检查账号与额度。',upstream.status); }
      const response = await translateResponse(upstream,runtime.protocol,protocol,{model:lease.view.model,stream:body.stream===true,request:body,opaque,signal:controller.signal});
      if (!response.body) throw new ModelAccessError('model_response_empty','模型服务返回空响应。',502);
      res.writeHead(response.status,{'Content-Type':response.headers.get('content-type') || 'application/json','Cache-Control':'no-store'});
      const reader = response.body.getReader();
      try { while (!controller.signal.aborted) { const chunk = await reader.read(); if (chunk.done) break; if (!res.write(chunk.value)) await once(res,'drain',{signal:controller.signal}); } if (!controller.signal.aborted) res.end(); }
      finally { if (controller.signal.aborted) await reader.cancel().catch(()=>{}); reader.releaseLock(); }
    } catch (error) {
      if (!res.headersSent && !res.destroyed) { const known = error instanceof ModelAccessError; this.json(res,known ? error.status : 502,{error:{code:known ? error.code : 'model_gateway_failed',message:known ? error.message : '模型请求未完成，请检查本次执行。'}}); }
      else if (!res.destroyed) res.destroy();
    } finally { lease?.requests.delete(controller); }
  }
  async close() { if (this.closed) return; this.closed = true; await this.ready.catch(()=>{}); for (const identity of [...this.leasesByIdentity.keys()]) this.release(identity); this.urls.clear(); await Promise.allSettled([...this.runtimes.values()].map(async pending => { await (await pending).close(); })); this.runtimes.clear(); if (this.server) { this.server.closeAllConnections(); await new Promise<void>(resolve => this.server!.close(()=>resolve())); } await this.writeChain; }
}

export function createModelAccess(options: ModelAccessOptions) {
  const application = new ModelAccessApplication(options);
  return {
    ensureLinked: () => application.ensureLinked(), invalidate: (id:string) => application.invalidate(id),
    accounts: { list: () => application.list(), read: (id: string) => application.read(id), snapshot: (id:string) => application.read(id), preferences:(id:string,input:ModelPreferenceUpdate)=>application.updatePreferences(id,input), add: (input: {provider:string;label?:string}) => application.add(input), login: (id:string,input:{expectedRevision:string}) => application.login(id,input), attempt: (id:string,attemptId:string) => application.attempt(id,attemptId), cancelLogin: (id:string,attemptId:string,input:{expectedRevision:string}) => application.cancelLogin(id,attemptId,input), check: (id:string,input:{expectedRevision?:string}={}) => application.check(id,input), disconnect: (id:string,input:{expectedRevision:string}) => application.disconnect(id,input) },
    catalog: { list: () => application.catalog() },
    leases: { create: (input:ModelLeaseInput) => application.createLease(input), release: (identity:string) => application.release(identity), updateRun:(identity:string,runId:string)=>application.updateRun(identity,runId) },
    close: () => application.close(),
  };
}
export type ModelAccess = ReturnType<typeof createModelAccess>;
