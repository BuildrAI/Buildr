import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { ConnectionsApplication } from '../../src/modules/connections/application/connections-application.ts';
import { connectionFailure, inputObject, passwordInput, type ConnectionProvider, type PublicConnection } from '../../src/modules/connections/domain/connection.ts';
import { xxlJobApiBase, xxlJobConfiguration, xxlJobRevision, XXL_JOB_CONCURRENCY_LIMIT } from '../../src/modules/connections/domain/xxl-job-connection.ts';
import { normalizeXxlJobCreate } from '../../src/modules/connections/domain/xxl-job-job.ts';
import type { XxlJobDetail, XxlJobExecutor, XxlJobLogSummary, XxlJobOperations, XxlJobScope } from '../../src/modules/connections/domain/xxl-job-types.ts';
import { createConnectionsCliContributions } from '../../src/modules/connections/interfaces/cli/connections-cli.ts';
import { registerWorkspaceSqlite } from '../../src/infrastructure/sqlite/workspace-sqlite.ts';
import { registerSqliteTransaction } from '../../src/infrastructure/sqlite/transaction.ts';

const fields = { jobDesc: '同步测试数据', author: 'fixture-owner', executorHandler: 'fixtureHandler', scheduleType: 'CRON', scheduleConf: '0 0/5 * * * ?', executorParam: '完整\n参数' };
const executorA: XxlJobExecutor = { id: 31, appName: 'fixture-service-a', name: '服务甲', addressType: 0, addresses: [] };
const executorB: XxlJobExecutor = { id: 41, appName: 'fixture-service-b', name: '服务乙', addressType: 0, addresses: [] };

/** The external scheduler is substituted; SQLite, revisions and encrypted credential binding are real. */
async function fixture(t: TestContext) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-xxl-job-application-'));
  const root = path.join(base, 'workspace'), dataRoot = path.join(base, 'profile'), workspaceId = crypto.randomUUID(), serviceA = crypto.randomUUID(), serviceB = crypto.randomUUID();
  fs.mkdirSync(root); fs.mkdirSync(dataRoot); fs.mkdirSync(path.join(root, '.buildr'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const scope = { rootPath: root, workspaceId };
  const store = registerSqliteTransaction(registerWorkspaceSqlite({ assertInitializedBuildrWorkspace(target: string) { assert.equal(target, root); assert.equal(fs.existsSync(path.join(target, '.buildr')), true); } }));
  const calls: Array<{ action: string; consoleUrl: string; scope?: XxlJobScope; input?: unknown }> = [];
  const writes: Array<{ action: string; consoleUrl: string; scope: XxlJobScope; input: unknown }> = [];
  const remote = new Map<string, Map<number, XxlJobDetail>>();
  const executors = new Map<string, XxlJobExecutor[]>();
  let onGet: (() => Promise<void> | void) | undefined;
  let onProviderRecheck: (() => void) | undefined;
  let unknownWrite = false, verificationFailure = false;
  const observe = (action: string, config: Record<string, unknown>, credentials: Record<string, unknown>, remoteScope?: XxlJobScope, input?: unknown) => {
    assert.equal(credentials.password, 'fixture-password-only', '仅外部提供者可得到解密认证');
    calls.push({ action, consoleUrl: String(config.consoleUrl), ...(remoteScope ? { scope: structuredClone(remoteScope) } : {}), ...(input !== undefined ? { input: JSON.parse(JSON.stringify(input)) } : {}) });
  };
  const find = (config: Record<string, unknown>, jobId: unknown) => {
    const job = remote.get(String(config.consoleUrl))?.get(Number(jobId));
    if (!job) throw connectionFailure('xxl_job_job_missing', '测试任务不存在。', 404);
    return structuredClone(job);
  };
  const changed = (job: Omit<XxlJobDetail, 'revision'>): XxlJobDetail => ({ ...job, revision: xxlJobRevision(job) });
  const accepted = (action: string, config: Record<string, unknown>, remoteScope: XxlJobScope, input: unknown) => {
    writes.push({ action, consoleUrl: String(config.consoleUrl), scope: structuredClone(remoteScope), input: JSON.parse(JSON.stringify(input)) });
    if (unknownWrite) throw connectionFailure('xxl_job_write_outcome_unknown', '请求结果未知；未自动重发。', 502);
  };
  const verification = (job: XxlJobDetail) => ({ apiVersion: '2.3.0' as const, jobId: job.id, verified: !verificationFailure, ...(verificationFailure ? { verificationError: { code: 'xxl_job_verification_failed', message: '请求已接受但回读失败。' } } : { job }), concurrencyProtection: 'preflight-recheck' as const, concurrencyWarning: XXL_JOB_CONCURRENCY_LIMIT });
  const summary = (job: XxlJobDetail): XxlJobLogSummary => ({ id: 301, jobId: job.id, jobGroup: job.jobGroup, triggerTime: 1_700_000_000_000, executorAddress: null, executorParam: job.executorParam, triggerCode: 200, handleCode: 0, triggerResult: 'success', handleResult: 'pending', triggerMsg: '', handleMsg: '', messagesTruncated: false });
  const operations: XxlJobOperations = {
    async executors(config, credentials, input = {}) {
      observe('executors', config, credentials, undefined, input);
      const offset = Number(input.offset ?? 0), limit = Number(input.limit ?? 20), all = (executors.get(String(config.consoleUrl)) ?? []).filter(item => input.appName === undefined || item.appName.includes(String(input.appName)));
      return { apiVersion: '2.3.0', offset, limit, totalCount: all.length, hasMore: offset + limit < all.length, items: structuredClone(all.slice(offset, offset + limit)) };
    },
    async jobs(config, credentials, remoteScope, input) {
      observe('jobs', config, credentials, remoteScope, input);
      const offset = Number(input.offset ?? 0), limit = Number(input.limit ?? 20), all = [...remote.get(String(config.consoleUrl))!.values()].filter(job => job.jobGroup === remoteScope.executorId);
      return { apiVersion: '2.3.0', offset, limit, totalCount: all.length, hasMore: offset + limit < all.length, items: structuredClone(all.slice(offset, offset + limit)) };
    },
    async get(config, credentials, remoteScope, input) {
      observe('get', config, credentials, remoteScope, input);
      const job = find(config, input.jobId);
      await onGet?.();
      return job;
    },
    async create(config, credentials, remoteScope, input) {
      observe('create', config, credentials, remoteScope, input); onProviderRecheck?.(); input.beforeWrite?.(); accepted('create', config, remoteScope, input);
      const job = changed({ ...input.fields as XxlJobDetail, id: 701, jobGroup: remoteScope.executorId, glueType: 'BEAN', triggerStatus: 0, updateTime: 'created' });
      remote.get(String(config.consoleUrl))!.set(job.id, job);
      return { created: true, ...verification(job) };
    },
    async update(config, credentials, remoteScope, input) {
      observe('update', config, credentials, remoteScope, input);
      const current = find(config, input.jobId);
      assert.equal(input.expectedJobRevision, current.revision);
      onProviderRecheck?.(); input.beforeWrite?.();
      accepted('update', config, remoteScope, input);
      const job = changed({ ...current, ...input.fields as XxlJobDetail, updateTime: 'updated' });
      remote.get(String(config.consoleUrl))!.set(job.id, job);
      return { updated: true, ...verification(job) };
    },
    async action(config, credentials, remoteScope, input) {
      observe(input.action, config, credentials, remoteScope, input);
      const current = find(config, input.jobId);
      assert.equal(input.expectedJobRevision, current.revision);
      onProviderRecheck?.(); input.beforeWrite?.();
      accepted(input.action, config, remoteScope, input);
      const job = input.action === 'trigger' ? current : changed({ ...current, triggerStatus: input.action === 'start' ? 1 : 0 });
      remote.get(String(config.consoleUrl))!.set(job.id, job);
      return { action: input.action, submitted: true, ...verification(job), executionSucceeded: null, executionObserved: false, warnings: [], ...(input.action === 'trigger' ? { executorParam: String(input.executorParam), submittedAt: '2026-10-14T10:00:00Z' } : {}) };
    },
    async logs(config, credentials, remoteScope, input) {
      observe('logs', config, credentials, remoteScope, input);
      const job = [...remote.get(String(config.consoleUrl))!.values()].find(item => item.jobGroup === remoteScope.executorId)!;
      return { apiVersion: '2.3.0', offset: Number(input.offset ?? 0), limit: Number(input.limit ?? 20), totalCount: 1, hasMore: false, items: [summary(job)] };
    },
    async log(config, credentials, remoteScope, input) {
      observe('log', config, credentials, remoteScope, input);
      return { apiVersion: '2.3.0', log: summary(find(config, input.jobId)), fromLine: 1, toLine: 0, nextFromLine: 1, content: '', ended: false, truncated: false, availability: 'missing', warning: '正文暂时不可用，已知调度成功、执行待完成。' };
    },
    async preview(config, credentials, remoteScope, input) {
      observe('preview', config, credentials, remoteScope, input);
      return { apiVersion: '2.3.0', scheduleType: 'CRON', scheduleConf: String(input.scheduleConf), nextTriggerTimes: ['2026-10-14 18:05:00'], timeZone: 'admin-server', warning: '调度中心时区。' };
    },
  };
  const provider: ConnectionProvider = { category: 'scheduling', type: 'xxl-job', validateConfig: (value, previous) => xxlJobConfiguration(value, previous as ReturnType<typeof xxlJobConfiguration>), validateCredentials: value => { const input = inputObject(value, ['password']); return { password: passwordInput(input.password) }; }, authenticationTargetIdentity: value => { const config = xxlJobConfiguration(value); return JSON.stringify([xxlJobApiBase(config.consoleUrl), config.username]); }, async test() { return { ok: true, elapsedMs: 1 }; }, xxlJob: operations };
  const services = new Set([serviceA, serviceB]);
  const resolveService = (target: string, id: string) => { assert.equal(target, root); if (!services.has(id)) throw connectionFailure('xxl_job_service_missing', '服务未登记。', 404); };
  const application = new ConnectionsApplication({ dataRoot, store, resolveScope: () => scope, resolveService, providers: [provider] });
  const create = (production: boolean) => {
    const connection = application.create(root, { name: production ? '生产调度中心' : '测试调度中心', category: 'scheduling', type: 'xxl-job', environment: production ? 'prod' : 'qa', config: { consoleUrl: `https://${production ? 'prod' : 'qa'}.scheduler.invalid/xxl-job-admin/`, username: 'fixture-user', production }, credentials: { password: 'fixture-password-only' } }).connection;
    remote.set(String(connection.config.consoleUrl), new Map()); executors.set(String(connection.config.consoleUrl), [structuredClone(executorA), structuredClone(executorB)]);
    return connection;
  };
  const seed = (connection: PublicConnection, patch: Partial<XxlJobDetail> = {}) => {
    const job = changed({ ...normalizeXxlJobCreate(fields), id: 101, jobGroup: executorA.id, glueType: 'BEAN', triggerStatus: 0, updateTime: 'observed', ...patch });
    remote.get(String(connection.config.consoleUrl))!.set(job.id, job); return job;
  };
  const createdQa = create(false), createdProd = create(true);
  await application.xxlJob.bind(root, createdQa.id, { serviceId: serviceA, appName: executorA.appName, expectedRevision: createdQa.revision });
  await application.xxlJob.bind(root, createdProd.id, { serviceId: serviceA, appName: executorA.appName, expectedRevision: createdProd.revision });
  const currentConnection = (id: string) => application.list(root).connections.find(item => item.id === id)!;
  const qa = currentConnection(createdQa.id), prod = currentConnection(createdProd.id); seed(qa); seed(prod); calls.length = 0;
  return { base, root, dataRoot, workspaceId, scope, store, application, provider, resolveService, qa, prod, services, serviceA, serviceB, seed, currentConnection, remote, executors, calls, writes, setOnGet(hook: typeof onGet) { onGet = hook; }, setOnProviderRecheck(hook: typeof onProviderRecheck) { onProviderRecheck = hook; }, setUnknownWrite(value: boolean) { unknownWrite = value; }, setVerificationFailure(value: boolean) { verificationFailure = value; } };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function authorization(scope: unknown, source = 'fixture-user-message-1') { return { source, statement: '授权展示的本次生产目标、差异与有效执行参数。', scope }; }
async function prepared(f: Fixture, action = 'update', connection = f.prod, patch: unknown = { executorParam: '新的参数' }) {
  const specification = { serviceId: f.serviceA, action, ...(action === 'create' ? { fields } : { jobId: 101 }), ...(action === 'update' ? { fields: patch } : {}) };
  const prepare = await f.application.xxlJob.prepare(f.root, connection.id, specification);
  const { action: _, ...rest } = specification;
  return { prepare, input: { ...rest, expectedRevision: prepare.expectedRevision, ...(prepare.expectedJobRevision ? { expectedJobRevision: prepare.expectedJobRevision } : {}) } };
}
async function cli(t: TestContext, f: Fixture, action: string, args: string[] = [], connection = f.qa) {
  const contribution = createConnectionsCliContributions(f.application)[0];
  let printed = '';
  const capture = t.mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => { printed += String(chunk); return true; });
  try {
    const result = await contribution.run(null, { argv: ['node', 'buildr', 'connection', 'xxl-job', action, '--target', f.root, '--connection', connection.id, '--json', ...args] });
    assert.deepEqual(JSON.parse(printed), result); assert.equal(printed.includes('fixture-password-only'), false);
    return JSON.parse(printed) as Record<string, any>;
  } finally { capture.mock.restore(); }
}

test('服务关联使用已登记 UUID、唯一远端 AppName 和已观察连接版本，保存只发生在本机', async t => {
  const f = await fixture(t);
  const observed = await f.application.xxlJob.resolve(f.root, f.qa.id, { serviceId: f.serviceB, appName: executorB.appName });
  assert.equal(observed.executor.id, executorB.id); assert.equal(observed.persisted, false); assert.equal(observed.environment, 'qa');
  assert.equal(f.currentConnection(f.qa.id).config.serviceBindings instanceof Array, true);
  assert.equal((f.currentConnection(f.qa.id).config.serviceBindings as unknown[]).length, 1);
  const binding = await f.application.xxlJob.bind(f.root, f.qa.id, { serviceId: f.serviceB, appName: executorB.appName, expectedRevision: observed.expectedRevision });
  assert.deepEqual(binding.binding, { serviceId: f.serviceB, executorId: executorB.id, appName: executorB.appName });
  assert.equal(binding.externalSystemChanged, false); assert.equal(f.currentConnection(f.qa.id).hasCredentials, true); assert.equal(f.writes.length, 0);
  await assert.rejects(f.application.xxlJob.bind(f.root, f.qa.id, { serviceId: f.serviceB, appName: executorB.appName, expectedRevision: observed.expectedRevision }), { code: 'connection_revision_conflict' });
  await assert.rejects(f.application.xxlJob.resolve(f.root, f.qa.id, { serviceId: 'service-name', appName: executorA.appName }), { code: 'xxl_job_service_invalid' });
  const before = f.calls.length;
  await assert.rejects(f.application.xxlJob.resolve(f.root, f.qa.id, { serviceId: crypto.randomUUID(), appName: executorA.appName }), { code: 'xxl_job_service_missing' });
  assert.equal(f.calls.length, before, '未登记服务不能发起远端定位');
});

test('唯一匹配不按显示名称猜测；重名与未完整分页不保存关联', async t => {
  const f = await fixture(t);
  await assert.rejects(f.application.xxlJob.resolve(f.root, f.qa.id, { serviceId: f.serviceB, appName: executorA.name }), { code: 'xxl_job_executor_missing' });
  f.executors.get(String(f.qa.config.consoleUrl))!.push({ ...executorB, id: 42 });
  await assert.rejects(f.application.xxlJob.bind(f.root, f.qa.id, { serviceId: f.serviceB, appName: executorB.appName, expectedRevision: f.qa.revision }), { code: 'xxl_job_executor_ambiguous' });
  assert.equal((f.currentConnection(f.qa.id).config.serviceBindings as unknown[]).length, 1);
  t.mock.method(f.provider.xxlJob!, 'executors', async (_config, _credentials, input = {}) => ({ apiVersion: '2.3.0', offset: Number(input.offset ?? 0), limit: 100, totalCount: 10_000, hasMore: true, items: [{ ...executorB, id: 41, appName: 'substring-only' }] }));
  await assert.rejects(f.application.xxlJob.resolve(f.root, f.qa.id, { serviceId: f.serviceB, appName: executorB.appName }), { code: 'xxl_job_executor_lookup_incomplete' });
  assert.equal(f.writes.length, 0);
});

test('执行器短页继续读取实际下一位置，第二页重复 AppName 不会被跳过或绑定', async t => {
  const f = await fixture(t), offsets: number[] = [];
  t.mock.method(f.provider.xxlJob!, 'executors', async (_config, _credentials, input = {}) => {
    const offset = Number(input.offset ?? 0); offsets.push(offset);
    return { apiVersion: '2.3.0', offset, limit: 100, totalCount: 2, hasMore: offset === 0, items: offset === 0 ? [executorB] : offset === 1 ? [{ ...executorB, id: 42 }] : [] };
  });
  await assert.rejects(f.application.xxlJob.bind(f.root, f.qa.id, { serviceId: f.serviceB, appName: executorB.appName, expectedRevision: f.qa.revision }), { code: 'xxl_job_executor_ambiguous' });
  assert.deepEqual(offsets, [0, 1]);
  assert.equal((f.currentConnection(f.qa.id).config.serviceBindings as unknown[]).length, 1); assert.equal(f.writes.length, 0);
});

test('执行器第一页及最后一页返回位置不匹配均不能证明唯一目标', async t => {
  const f = await fixture(t);
  const first = t.mock.method(f.provider.xxlJob!, 'executors', async () => ({ apiVersion: '2.3.0', offset: 10, limit: 100, totalCount: 1, hasMore: false, items: [executorB] }));
  await assert.rejects(f.application.xxlJob.resolve(f.root, f.qa.id, { serviceId: f.serviceB, appName: executorB.appName }), { code: 'xxl_job_executor_lookup_incomplete' });
  first.mock.restore();
  const offsets: number[] = [];
  t.mock.method(f.provider.xxlJob!, 'executors', async (_config, _credentials, input = {}) => {
    const requested = Number(input.offset ?? 0); offsets.push(requested);
    return { apiVersion: '2.3.0', offset: requested === 0 ? 0 : 100, limit: 100, totalCount: 2, hasMore: requested === 0, items: requested === 0 ? [executorB] : [{ ...executorB, id: 42 }] };
  });
  await assert.rejects(f.application.xxlJob.resolve(f.root, f.qa.id, { serviceId: f.serviceB, appName: executorB.appName }), { code: 'xxl_job_executor_lookup_incomplete' });
  assert.deepEqual(offsets, [0, 1]); assert.equal(f.writes.length, 0);
});

test('每次任务操作核对服务关联，编号重建和远端范围错误只阻止相关服务', async t => {
  const f = await fixture(t);
  const page = await f.application.xxlJob.jobs(f.root, f.qa.id, { serviceId: f.serviceA, offset: 0, limit: 10, executorHandler: fields.executorHandler });
  assert.equal(page.target.executorId, executorA.id); assert.equal(page.target.serviceId, f.serviceA); assert.equal(page.items.length, 1);
  assert.deepEqual(f.calls.find(item => item.action === 'jobs')?.input, { offset: 0, limit: 10, executorHandler: fields.executorHandler });
  await assert.rejects(f.application.xxlJob.get(f.root, f.qa.id, { serviceId: f.serviceB, jobId: 101 }), { code: 'xxl_job_service_unbound' });
  f.seed(f.qa, { jobGroup: executorB.id });
  await assert.rejects(f.application.xxlJob.get(f.root, f.qa.id, { serviceId: f.serviceA, jobId: 101 }), { code: 'xxl_job_scope_mismatch' });
  f.seed(f.qa); f.executors.get(String(f.qa.config.consoleUrl))![0].id = 32;
  const before = f.calls.filter(item => item.action === 'get').length;
  await assert.rejects(f.application.xxlJob.get(f.root, f.qa.id, { serviceId: f.serviceA, jobId: 101 }), { code: 'xxl_job_binding_changed' });
  assert.equal(f.calls.filter(item => item.action === 'get').length, before);
  assert.equal((await f.application.xxlJob.get(f.root, f.prod.id, { serviceId: f.serviceA, jobId: 101 })).job.id, 101, '其它连接仍可读取');
});

test('创建准备展示完整默认值，代码处理器任务保持停止，未知创建不会重发', async t => {
  const f = await fixture(t), { prepare, input } = await prepared(f, 'create', f.qa);
  assert.equal(prepare.expectedJobRevision, null); assert.equal(prepare.defaultsApplied, true); assert.equal(prepare.candidate.glueType, 'BEAN'); assert.equal(prepare.candidate.triggerStatus, 0);
  assert.equal(prepare.candidate.executorFailRetryCount, 0); assert.equal(prepare.candidate.executorRouteStrategy, 'FIRST'); assert.equal(f.writes.length, 0);
  const created = await f.application.xxlJob.execute(f.root, f.qa.id, 'create', input);
  assert.equal('created' in created && created.created, true); assert.equal(created.verified, true); assert.equal(created.job?.triggerStatus, 0);
  f.setUnknownWrite(true);
  await assert.rejects(f.application.xxlJob.execute(f.root, f.qa.id, 'create', input), { code: 'xxl_job_write_outcome_unknown' });
  assert.equal(f.writes.length, 2, '每次调用只提交一次，不自动重试未知创建');
});

test('局部修改保留其它字段，配置与连接版本冲突不写入，调度动态时间不造成假冲突', async t => {
  const f = await fixture(t), { prepare, input } = await prepared(f, 'update', f.qa, { executorParam: '局部新参数' });
  assert.equal(prepare.candidate.executorHandler, fields.executorHandler); assert.equal(prepare.candidate.scheduleConf, fields.scheduleConf); assert.equal(prepare.candidate.executorParam, '局部新参数');
  const result = await f.application.xxlJob.execute(f.root, f.qa.id, 'update', input);
  assert.equal('updated' in result && result.updated, true); assert.equal(result.verified, true);
  const sent = (f.writes[0].input as { fields: Record<string, unknown> }).fields;
  assert.equal(sent.executorHandler, fields.executorHandler); assert.equal(sent.scheduleConf, fields.scheduleConf); assert.equal(sent.executorParam, '局部新参数');
  f.seed(f.qa, { author: '其它入口已修改' });
  await assert.rejects(f.application.xxlJob.execute(f.root, f.qa.id, 'update', input), { code: 'xxl_job_revision_conflict' });
  assert.equal(f.writes.length, 1);
  f.seed(f.qa);
  const next = await prepared(f, 'update', f.qa);
  f.seed(f.qa, { updateTime: '调度后更新的动态时间' });
  assert.equal((await f.application.xxlJob.execute(f.root, f.qa.id, 'update', next.input)).verified, true);
  const fresh = await prepared(f, 'update', f.qa);
  f.application.update(f.root, f.qa.id, { expectedRevision: f.qa.revision, name: '连接已更名' });
  await assert.rejects(f.application.xxlJob.execute(f.root, f.qa.id, 'update', fresh.input), { code: 'connection_revision_conflict' });
});

test('读取期间其它入口改变连接或删除服务，外部操作不能覆盖该变化', async t => {
  const f = await fixture(t), { input } = await prepared(f, 'update', f.qa);
  f.setOnGet(() => { f.setOnGet(undefined); f.application.update(f.root, f.qa.id, { expectedRevision: f.qa.revision, environment: 'changed' }); });
  await assert.rejects(f.application.xxlJob.execute(f.root, f.qa.id, 'update', input), { code: 'connection_revision_conflict' });
  assert.equal(f.writes.length, 0);
  const prod = await prepared(f, 'update', f.prod);
  f.setOnGet(() => { f.setOnGet(undefined); f.services.delete(f.serviceA); });
  await assert.rejects(f.application.xxlJob.execute(f.root, f.prod.id, 'update', { ...prod.input, authorization: authorization(prod.prepare.authorizationScope) }), { code: 'xxl_job_service_missing' });
  assert.equal(f.writes.length, 0);
});

test('提供者最后重读期间的本机变化在写入回调拒绝，不消费尚未发起的生产授权', async t => {
  const f = await fixture(t), { prepare, input } = await prepared(f), evidence = authorization(prepare.authorizationScope);
  const directory = path.join(f.root, '.buildr', 'local', 'xxl-job-authorizations');
  f.setOnProviderRecheck(() => { throw connectionFailure('xxl_job_revision_conflict', '提供者最终远端观察冲突。', 409); });
  await assert.rejects(f.application.xxlJob.execute(f.root, f.prod.id, 'update', { ...input, authorization: evidence }), { code: 'xxl_job_revision_conflict' });
  assert.equal(f.writes.length, 0); assert.equal(fs.existsSync(directory), false);
  f.setOnProviderRecheck(() => { f.setOnProviderRecheck(undefined); f.application.update(f.root, f.prod.id, { expectedRevision: f.prod.revision, name: '最后远端重读期间被其它入口更名' }); });
  await assert.rejects(f.application.xxlJob.execute(f.root, f.prod.id, 'update', { ...input, authorization: evidence }), { code: 'connection_revision_conflict' });
  assert.equal(f.writes.length, 0); assert.equal(fs.existsSync(directory), false);
});

test('写入准备拒绝回显认证被遮蔽的配置，避免把遮蔽参数覆盖到远端', async t => {
  const f = await fixture(t), originalGet = f.provider.xxlJob!.get;
  t.mock.method(f.provider.xxlJob!, 'get', async (...args: Parameters<typeof originalGet>) => ({ ...await originalGet(...args), executorParam: '[REDACTED]' }));
  const read = await f.application.xxlJob.get(f.root, f.qa.id, { serviceId: f.serviceA, jobId: 101 });
  assert.equal(read.job.executorParam, '[REDACTED]');
  for (const action of ['update', 'trigger', 'start']) await assert.rejects(f.application.xxlJob.prepare(f.root, f.qa.id, { serviceId: f.serviceA, action, jobId: 101, ...(action === 'update' ? { fields: { author: 'new-owner' } } : {}) }), { code: 'xxl_job_redacted_configuration' });
  assert.equal(f.writes.length, 0);
});

test('生产授权严格限定本次环境、连接、服务、执行器、动作、原摘要与完整候选', async t => {
  const f = await fixture(t), { prepare, input } = await prepared(f);
  assert.equal(prepare.authorizationScope.workspaceId, f.workspaceId); assert.equal(prepare.authorizationScope.environment, 'prod'); assert.equal(prepare.authorizationScope.serviceId, f.serviceA); assert.equal(prepare.authorizationScope.executorId, executorA.id);
  assert.equal(prepare.authorizationScope.action, 'update'); assert.equal(prepare.authorizationScope.expectedJobRevision, input.expectedJobRevision);
  await assert.rejects(f.application.xxlJob.execute(f.root, f.prod.id, 'update', input), { code: 'xxl_job_production_authorization_required' });
  for (const key of ['workspaceId', 'connectionId', 'expectedRevision', 'consoleUrl', 'environment', 'serviceId', 'executorId', 'appName', 'action', 'jobId', 'expectedJobRevision', 'candidateSha256']) {
    const evidence = authorization({ ...prepare.authorizationScope, [key]: 'wrong-target' });
    await assert.rejects(f.application.xxlJob.execute(f.root, f.prod.id, 'update', { ...input, authorization: evidence }), { code: 'xxl_job_production_authorization_mismatch' }, key);
  }
  assert.equal(f.writes.length, 0);
  const result = await f.application.xxlJob.execute(f.root, f.prod.id, 'update', { ...input, authorization: authorization(prepare.authorizationScope) });
  assert.equal(result.verified, true); assert.equal('authorizationKind' in result && result.authorizationKind, 'user-dialogue-evidence');
});

test('一次生产授权只用于一次尝试，未知结果仍消费，不保存参数或授权正文', async t => {
  const f = await fixture(t), { prepare, input } = await prepared(f, 'trigger'), evidence = authorization(prepare.authorizationScope);
  assert.equal(prepare.candidate.executorParam, fields.executorParam);
  f.setUnknownWrite(true);
  await assert.rejects(f.application.xxlJob.execute(f.root, f.prod.id, 'trigger', { ...input, authorization: evidence }), { code: 'xxl_job_write_outcome_unknown' });
  await assert.rejects(f.application.xxlJob.execute(f.root, f.prod.id, 'trigger', { ...input, authorization: evidence }), { code: 'xxl_job_production_authorization_used' });
  assert.equal(f.writes.length, 1);
  const directory = path.join(f.root, '.buildr', 'local', 'xxl-job-authorizations'), files = fs.readdirSync(directory);
  assert.equal(files.length, 1);
  const record = JSON.parse(fs.readFileSync(path.join(directory, files[0]), 'utf8'));
  assert.deepEqual(Object.keys(record).sort(), ['schemaVersion', 'usedAt']); assert.equal(record.schemaVersion, 'buildr.xxl-job-authorization-use/v1');
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(directory, files[0])).mode & 0o777, 0o600);
  f.setUnknownWrite(false);
  const result = await f.application.xxlJob.execute(f.root, f.prod.id, 'trigger', { ...input, authorization: authorization(prepare.authorizationScope, 'fixture-user-message-2') });
  assert.equal('submitted' in result && result.submitted, true); assert.equal('executionSucceeded' in result && result.executionSucceeded, null); assert.equal('executionObserved' in result && result.executionObserved, false);
  assert.equal((f.writes[1].input as { executorParam: string }).executorParam, fields.executorParam);
});

test('参数覆盖影响生产授权；同内容与相同启停状态不写入，回读失败保留已受理事实', async t => {
  const f = await fixture(t);
  const unchanged = await prepared(f, 'update', f.prod, { executorParam: fields.executorParam });
  const unchangedResult = await f.application.xxlJob.execute(f.root, f.prod.id, 'update', unchanged.input);
  assert.equal(unchangedResult.unchanged, true); assert.equal('executionSucceeded' in unchangedResult && unchangedResult.executionSucceeded, null); assert.equal('executionObserved' in unchangedResult && unchangedResult.executionObserved, false);
  const stop = await prepared(f, 'stop');
  assert.equal((await f.application.xxlJob.execute(f.root, f.prod.id, 'stop', stop.input)).unchanged, true); assert.equal(f.writes.length, 0);
  const trigger = await prepared(f, 'trigger');
  await assert.rejects(f.application.xxlJob.execute(f.root, f.prod.id, 'trigger', { ...trigger.input, executorParam: '', authorization: authorization(trigger.prepare.authorizationScope) }), { code: 'xxl_job_production_authorization_mismatch' });
  f.setVerificationFailure(true);
  const start = await prepared(f, 'start', f.qa);
  const result = await f.application.xxlJob.execute(f.root, f.qa.id, 'start', start.input);
  assert.equal('submitted' in result && result.submitted, true); assert.equal(result.verified, false); assert.equal('verificationError' in result && result.verificationError?.code, 'xxl_job_verification_failed');
});

test('只读预览可观察并准备，关联与实际外部写入在网络调用前拒绝', async t => {
  const f = await fixture(t), { input } = await prepared(f, 'update', f.qa);
  const preview = new ConnectionsApplication({ dataRoot: path.join(f.base, 'preview-profile'), credentialDataRoot: f.dataRoot, readonlyScope: f.scope, store: f.store, resolveScope: () => f.scope, resolveService: f.resolveService, providers: [f.provider] });
  assert.equal((await preview.xxlJob.get(f.root, f.qa.id, { serviceId: f.serviceA, jobId: 101 })).job.id, 101);
  assert.equal((await preview.xxlJob.prepare(f.root, f.qa.id, { serviceId: f.serviceA, action: 'start', jobId: 101 })).action, 'start');
  const before = f.calls.length;
  await assert.rejects(preview.xxlJob.bind(f.root, f.qa.id, { serviceId: f.serviceB, appName: executorB.appName, expectedRevision: f.qa.revision }), { code: 'connection_preview_readonly' });
  await assert.rejects(preview.xxlJob.execute(f.root, f.qa.id, 'update', input), { code: 'connection_preview_readonly' });
  assert.equal(f.calls.length, before); assert.equal(f.writes.length, 0);
});

test('日志返回已知调度与待完成执行，正文不可用不抹掉原状态', async t => {
  const f = await fixture(t);
  const records = await f.application.xxlJob.logs(f.root, f.qa.id, { serviceId: f.serviceA, jobId: 101, offset: 0, limit: 20 });
  assert.equal(records.items[0].triggerResult, 'success'); assert.equal(records.items[0].handleResult, 'pending');
  const content = await f.application.xxlJob.log(f.root, f.qa.id, { serviceId: f.serviceA, jobId: 101, logId: 301, fromLine: 1, maxLines: 5, maxBytes: 1024 });
  assert.equal(content.availability, 'missing'); assert.equal(content.log.triggerResult, 'success'); assert.equal(content.log.handleResult, 'pending'); assert.equal(content.ended, false); assert.equal(content.nextFromLine, 1);
});

test('公开命令入口可发现、按服务读取、准备和修改，输出不泄露认证', async t => {
  const f = await fixture(t), jobFile = path.join(f.base, 'job.json'); fs.writeFileSync(jobFile, JSON.stringify({ executorParam: 'CLI 新参数' }));
  const discovered = await cli(t, f, 'executors', ['--offset', '0', '--limit', '10']); assert.equal(discovered.items.length, 2);
  const resolved = await cli(t, f, 'resolve', ['--service', f.serviceB, '--app-name', executorB.appName]); assert.equal(resolved.executor.id, executorB.id); assert.equal(resolved.persisted, false);
  const read = await cli(t, f, 'get', ['--service', f.serviceA, '--job', '101']); assert.equal(read.job.id, 101);
  const diff = await cli(t, f, 'diff', ['--service', f.serviceA, '--action', 'update', '--job', '101', '--job-file', jobFile]);
  assert.equal(diff.operation, 'xxl-job-diff'); assert.equal(diff.candidate.executorParam, 'CLI 新参数');
  const updated = await cli(t, f, 'update', ['--service', f.serviceA, '--job', '101', '--job-file', jobFile, '--expected-revision', diff.expectedRevision, '--expected-job-revision', diff.expectedJobRevision]);
  assert.equal(updated.updated, true); assert.equal(updated.verified, true);
  const logs = await cli(t, f, 'logs', ['--service', f.serviceA, '--job', '101', '--offset', '0', '--limit', '20']); assert.equal(logs.items[0].handleResult, 'pending');
  const log = await cli(t, f, 'log', ['--service', f.serviceA, '--job', '101', '--log', '301', '--from-line', '1', '--max-lines', '5', '--max-bytes', '1024']); assert.equal(log.availability, 'missing');
});

test('命令行在缺服务、版本冲突、互斥标准输入等已知非法参数时先拒绝，不等输入', async t => {
  const f = await fixture(t), digest = 'sha256-' + '0'.repeat(64), originalRead = fs.readFileSync.bind(fs);
  let stdinReads = 0;
  const capture = t.mock.method(fs, 'readFileSync', (...args: Parameters<typeof fs.readFileSync>) => { if (args[0] === 0) { stdinReads++; return Buffer.from('{}'); } return originalRead(...args); });
  try {
    for (const [action, args] of [
      ['create', ['--job-file', '-', '--expected-revision', digest]],
      ['update', ['--service', f.serviceA, '--job', '101', '--job-file', '-', '--expected-revision', digest]],
      ['create', ['--service', f.serviceA, '--job-file', '-', '--expected-revision', digest, '--authorization-file', '-']],
      ['prepare', ['--service', f.serviceA, '--action', 'trigger', '--job', '101', '--job-file', '-']],
      ['update', ['--service', f.serviceA, '--job', '101', '--job-file', '-', '--expected-revision', 'invalid', '--expected-job-revision', digest]],
      ['jobs', ['--service', f.serviceA, '--offset', '1.5']],
      ['get', ['--service', f.serviceA, '--job', '101', '--url', 'https://arbitrary.invalid/']],
    ] as const) await assert.rejects(cli(t, f, action, [...args]), { code: 'xxl_job_cli_invalid' });
    assert.equal(stdinReads, 0); assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
  } finally { capture.mock.restore(); }
});

test('命令行生产触发采用本次准备授权与完整参数，未提供覆盖显式使用原参数', async t => {
  const f = await fixture(t), authFile = path.join(f.base, 'authorization.json');
  const prepare = await cli(t, f, 'prepare', ['--service', f.serviceA, '--action', 'trigger', '--job', '101'], f.prod);
  fs.writeFileSync(authFile, JSON.stringify(authorization(prepare.authorizationScope)));
  const flags = ['--service', f.serviceA, '--job', '101', '--expected-revision', prepare.expectedRevision, '--expected-job-revision', prepare.expectedJobRevision, '--authorization-file', authFile];
  const result = await cli(t, f, 'trigger', flags, f.prod);
  assert.equal(result.submitted, true); assert.equal(result.executionSucceeded, null); assert.equal(result.executionObserved, false); assert.equal(result.executorParam, fields.executorParam);
  await assert.rejects(cli(t, f, 'trigger', flags, f.prod), { code: 'xxl_job_production_authorization_used' }); assert.equal(f.writes.length, 1);
});
