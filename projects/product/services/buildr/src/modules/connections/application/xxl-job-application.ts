import crypto from 'node:crypto';
import { connectionFailure, expectedRevision, inputObject, recordRevision, type ConnectionRecord, type ConnectionScope, type PublicConnection } from '../domain/connection.ts';
import { xxlJobConfiguration, xxlJobRevision, xxlJobText } from '../domain/xxl-job-connection.ts';
import { mergeXxlJob, normalizeXxlJobCreate } from '../domain/xxl-job-job.ts';
import type { XxlJobAction, XxlJobDetail, XxlJobEditable, XxlJobExecutor, XxlJobOperations, XxlJobScope, XxlJobServiceBinding } from '../domain/xxl-job-types.ts';
import { consumeXxlJobAuthorization } from '../persistence/xxl-job-authorizations.ts';

export type XxlJobAccess = { scope: ConnectionScope; record: ConnectionRecord; credentials: Record<string, unknown>; xxlJob: XxlJobOperations };
export type XxlJobWriteAction = 'create' | 'update' | XxlJobAction;
type AccessResolver = (root: string, id: string) => XxlJobAccess;
type ServiceResolver = (root: string, serviceId: string) => void;
type ConnectionUpdater = (root: string, id: string, input: { expectedRevision: string; config: { serviceBindings: XxlJobServiceBinding[] } }) => { connection: PublicConnection };
type BoundAccess = XxlJobAccess & { serviceId: string; executor: XxlJobExecutor; remoteScope: XxlJobScope };

const MAX_EXECUTOR_PAGES = 20;
const sha256 = (value: unknown) => 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
function serviceIdentity(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) throw connectionFailure('xxl_job_service_invalid', '请明确指定已登记服务（Service）的 UUID。');
  return value.toLowerCase();
}
function appName(value: unknown): string {
  const name = xxlJobText(value, 'AppName', 64);
  if (name !== name.trim()) throw connectionFailure('xxl_job_app_name_invalid', '请提供从该环境实际配置中取得的完整 AppName。');
  return name;
}
function writeAction(value: unknown): XxlJobWriteAction {
  if (!['create', 'update', 'start', 'stop', 'trigger'].includes(String(value))) throw connectionFailure('xxl_job_action_invalid', '不支持该调度写入动作。');
  return value as XxlJobWriteAction;
}
function executorParameter(value: unknown): string {
  return xxlJobText(value, '运行参数', 512, true, true);
}
function target(access: BoundAccess) {
  return { connectionId: access.record.id, consoleUrl: access.record.config.consoleUrl, environment: access.record.environment, serviceId: access.serviceId, executorId: access.remoteScope.executorId, appName: access.remoteScope.appName, apiVersion: '2.3.0' as const };
}
function checkJobScope(access: BoundAccess, detail: XxlJobDetail): void {
  if (detail.jobGroup !== access.remoteScope.executorId) throw connectionFailure('xxl_job_scope_mismatch', '任务（Job）不属于该服务（Service）关联的执行器（Executor），已拒绝该结果。', 409);
}
function changes(before: unknown, after: unknown) {
  const old = before as Record<string, unknown> | null, next = after as Record<string, unknown>;
  return Object.entries(next).flatMap(([field, value]) => old?.[field] === value ? [] : [{ field, before: old?.[field] ?? null, after: value }]);
}
function authorize(value: unknown, scope: Record<string, string | number | null>) {
  if (value === undefined) throw connectionFailure('xxl_job_production_authorization_required', '每次生产实际操作前必须展示具体目标、差异或有效执行参数，取得本次明确用户授权并提交依据。', 403);
  let evidence: Record<string, unknown>;
  try { evidence = inputObject(value, ['source', 'statement', 'scope']); }
  catch { throw connectionFailure('xxl_job_production_authorization_invalid', '授权依据须包含 source、statement 与本次 preparation 的 scope。', 403); }
  if (![evidence.source, evidence.statement].every(value => typeof value === 'string' && value.trim() && Buffer.byteLength(value, 'utf8') <= 8192)) throw connectionFailure('xxl_job_production_authorization_invalid', '授权依据必须包含可回查的用户指令来源与本次授权原意。', 403);
  let observed: Record<string, unknown>;
  try { observed = inputObject(evidence.scope, Object.keys(scope)); }
  catch { throw connectionFailure('xxl_job_production_authorization_mismatch', '授权范围不匹配本次操作，请重新展示具体目标并取得用户授权。', 403); }
  if (Object.keys(scope).some(key => observed[key] !== scope[key])) throw connectionFailure('xxl_job_production_authorization_mismatch', '授权范围不匹配本次环境、连接、服务、执行器、动作、任务或候选，请重新准备并取得用户授权。', 403);
  return { source: evidence.source as string, statement: evidence.statement as string };
}

/** The current connection and remote system own the facts; the application constrains their scope. */
export class XxlJobApplication {
  private readonly access: AccessResolver;
  private readonly assertWritable: () => void;
  private readonly resolveService: ServiceResolver;
  private readonly updateConnection: ConnectionUpdater;
  constructor(access: AccessResolver, assertWritable: () => void, resolveService: ServiceResolver, updateConnection: ConnectionUpdater) {
    this.access = access; this.assertWritable = assertWritable; this.resolveService = resolveService; this.updateConnection = updateConnection;
  }

  private service(access: XxlJobAccess, value: unknown): string {
    const serviceId = serviceIdentity(value);
    this.resolveService(access.scope.rootPath, serviceId);
    return serviceId;
  }
  private observed(access: XxlJobAccess, value: unknown): void {
    if (expectedRevision(value) !== recordRevision(access.record)) throw connectionFailure('connection_revision_conflict', '连接已变化，请重新读取并核对目标。', 409);
  }
  private current(root: string, access: XxlJobAccess): void {
    if (recordRevision(this.access(root, access.record.id).record) !== recordRevision(access.record)) throw connectionFailure('connection_revision_conflict', '读取期间连接已变化，未执行操作；请重新核对目标。', 409);
  }
  private async uniqueExecutor(access: XxlJobAccess, expectedAppName: string): Promise<XxlJobExecutor> {
    let offset = 0, match: XxlJobExecutor | undefined;
    for (let page = 0; page < MAX_EXECUTOR_PAGES; page++) {
      const listed = await access.xxlJob.executors(access.record.config, access.credentials, { appName: expectedAppName, offset, limit: 100 });
      if (listed.offset !== offset || listed.limit < 1) throw connectionFailure('xxl_job_executor_lookup_incomplete', '执行器（Executor）分页位置不匹配，无法确认完整或唯一目标。', 409);
      for (const item of listed.items) if (item.appName === expectedAppName) {
        if (match) throw connectionFailure('xxl_job_executor_ambiguous', '该 AppName 匹配多个执行器（Executor），无法确认唯一目标。', 409);
        match = item;
      }
      if (!listed.hasMore) {
        if (!match) throw connectionFailure('xxl_job_executor_missing', '该 AppName 没有匹配当前账号可见的执行器（Executor）。', 404);
        return match;
      }
      if (!listed.items.length) throw connectionFailure('xxl_job_executor_lookup_incomplete', '执行器（Executor）分页未完整，无法确认唯一目标。', 409);
      offset += listed.items.length;
    }
    throw connectionFailure('xxl_job_executor_lookup_incomplete', '执行器（Executor）发现达到本次读取上限，未确认完整或唯一目标。', 409);
  }
  private async bound(root: string, id: string, value: unknown): Promise<BoundAccess> {
    const access = this.access(root, id), serviceId = this.service(access, value), config = xxlJobConfiguration(access.record.config);
    const binding = config.serviceBindings.find(item => item.serviceId === serviceId);
    if (!binding) throw connectionFailure('xxl_job_service_unbound', '该服务（Service）尚未关联此环境的执行器（Executor）；请根据实际配置取得 AppName，再核验并绑定。', 409);
    let executor: XxlJobExecutor;
    try { executor = await this.uniqueExecutor(access, binding.appName); }
    catch (error) {
      if ((error as { code?: string }).code === 'xxl_job_executor_missing') throw connectionFailure('xxl_job_binding_changed', '已关联执行器（Executor）不存在或 AppName 已变化；请重新核对，未按同名替换。', 409);
      throw error;
    }
    if (executor.id !== binding.executorId) throw connectionFailure('xxl_job_binding_changed', '该 AppName 的执行器（Executor）编号已变化；请重新确认关联，未自动替换。', 409);
    this.current(root, access);
    return { ...access, serviceId, executor, remoteScope: { executorId: binding.executorId, appName: binding.appName } };
  }
  async executors(root: string, id: string, value: unknown = {}) {
    const input = inputObject(value, ['offset', 'limit', 'appName']), access = this.access(root, id);
    return { connectionId: id, consoleUrl: access.record.config.consoleUrl, environment: access.record.environment, expectedRevision: recordRevision(access.record), ...await access.xxlJob.executors(access.record.config, access.credentials, input) };
  }
  async resolve(root: string, id: string, value: unknown) {
    const input = inputObject(value, ['serviceId', 'appName']), access = this.access(root, id), serviceId = this.service(access, input.serviceId);
    const executor = await this.uniqueExecutor(access, appName(input.appName));
    this.current(root, access);
    return { connectionId: id, serviceId, environment: access.record.environment, consoleUrl: access.record.config.consoleUrl, executor, expectedRevision: recordRevision(access.record), persisted: false };
  }
  async bind(root: string, id: string, value: unknown) {
    this.assertWritable();
    const input = inputObject(value, ['serviceId', 'appName', 'expectedRevision']), access = this.access(root, id), serviceId = this.service(access, input.serviceId);
    this.observed(access, input.expectedRevision);
    const executor = await this.uniqueExecutor(access, appName(input.appName));
    this.current(root, access);
    const bindings = xxlJobConfiguration(access.record.config).serviceBindings;
    if (bindings.some(item => item.serviceId !== serviceId && item.executorId === executor.id)) throw connectionFailure('xxl_job_executor_already_bound', '该执行器（Executor）已关联另一服务（Service），请核对服务边界。', 409);
    const binding = { serviceId, executorId: executor.id, appName: executor.appName };
    const existing = bindings.find(item => item.serviceId === serviceId);
    if (existing?.executorId === binding.executorId && existing.appName === binding.appName) return { connectionId: id, binding, unchanged: true, expectedRevision: recordRevision(access.record) };
    const result = this.updateConnection(access.scope.rootPath, id, { expectedRevision: recordRevision(access.record), config: { serviceBindings: [...bindings.filter(item => item.serviceId !== serviceId), binding] } });
    return { connectionId: id, binding, connection: result.connection, expectedRevision: result.connection.revision, bound: true, externalSystemChanged: false };
  }
  async jobs(root: string, id: string, value: unknown) {
    const input = inputObject(value, ['serviceId', 'offset', 'limit', 'jobDesc', 'executorHandler', 'author', 'triggerStatus']), { serviceId, ...query } = input;
    const access = await this.bound(root, id, serviceId), page = await access.xxlJob.jobs(access.record.config, access.credentials, access.remoteScope, query);
    for (const job of page.items) checkJobScope(access, job);
    return { target: target(access), ...page };
  }
  async get(root: string, id: string, value: unknown) {
    const input = inputObject(value, ['serviceId', 'jobId']), access = await this.bound(root, id, input.serviceId);
    const job = await access.xxlJob.get(access.record.config, access.credentials, access.remoteScope, { jobId: input.jobId });
    checkJobScope(access, job);
    return { target: target(access), job, expectedRevision: recordRevision(access.record), expectedJobRevision: job.revision };
  }
  async logs(root: string, id: string, value: unknown) {
    const input = inputObject(value, ['serviceId', 'offset', 'limit', 'jobId', 'logStatus', 'from', 'to']), { serviceId, ...query } = input;
    const access = await this.bound(root, id, serviceId), page = await access.xxlJob.logs(access.record.config, access.credentials, access.remoteScope, query);
    if (page.items.some(log => log.jobGroup !== access.remoteScope.executorId)) throw connectionFailure('xxl_job_scope_mismatch', '调度记录不属于当前服务（Service）的执行器（Executor），已拒绝该结果。', 409);
    return { target: target(access), ...page };
  }
  async log(root: string, id: string, value: unknown) {
    const input = inputObject(value, ['serviceId', 'jobId', 'logId', 'fromLine', 'maxLines', 'maxBytes']), { serviceId, ...query } = input;
    const access = await this.bound(root, id, serviceId);
    const result = await access.xxlJob.log(access.record.config, access.credentials, access.remoteScope, { ...query, jobId: query.jobId, logId: query.logId });
    if (result.log.jobGroup !== access.remoteScope.executorId) throw connectionFailure('xxl_job_scope_mismatch', '日志不属于当前服务（Service）的执行器（Executor），已拒绝该结果。', 409);
    return { target: target(access), ...result };
  }
  async preview(root: string, id: string, value: unknown) {
    const input = inputObject(value, ['serviceId', 'scheduleType', 'scheduleConf']), access = await this.bound(root, id, input.serviceId);
    return { target: target(access), ...await access.xxlJob.preview(access.record.config, access.credentials, access.remoteScope, { scheduleType: input.scheduleType, scheduleConf: input.scheduleConf }) };
  }
  private async preparation(root: string, id: string, input: Record<string, unknown>, action: XxlJobWriteAction) {
    const access = await this.bound(root, id, input.serviceId);
    if (action === 'create' && input.jobId !== undefined || action !== 'create' && input.jobId === undefined) throw connectionFailure('xxl_job_input_invalid', '创建不接受任务编号；其它动作必须明确指定任务（Job）编号。');
    if (!['create', 'update'].includes(action) && input.fields !== undefined || action !== 'trigger' && input.executorParam !== undefined) throw connectionFailure('xxl_job_input_invalid', '候选字段或参数覆盖不适用于本次动作。');
    let current: XxlJobDetail | null = null;
    if (action !== 'create') {
      current = await access.xxlJob.get(access.record.config, access.credentials, access.remoteScope, { jobId: input.jobId });
      checkJobScope(access, current);
      if (xxlJobRevision(current) !== current.revision) throw connectionFailure('xxl_job_redacted_configuration', '当前配置含已遮蔽内容，无法安全展示完整候选或沿用原参数，未执行写入；请通过原站核对相关字段。', 409);
    }
    const currentConfiguration = current ? Object.fromEntries(Object.entries(current).filter(([field]) => !['revision', 'updateTime'].includes(field))) : null;
    let fields: XxlJobEditable | null = null, candidate: Record<string, unknown>, candidateSha256: string;
    if (action === 'create') {
      fields = normalizeXxlJobCreate(input.fields);
      candidate = { ...fields, jobGroup: access.remoteScope.executorId, glueType: 'BEAN', triggerStatus: 0 };
      candidateSha256 = sha256(candidate);
    } else if (action === 'update') {
      fields = mergeXxlJob(current!, input.fields);
      candidate = { ...currentConfiguration!, ...fields };
      candidateSha256 = xxlJobRevision(candidate);
    } else if (action === 'trigger') {
      candidate = { action, jobId: current!.id, executorParam: input.executorParam === undefined ? current!.executorParam : executorParameter(input.executorParam) };
      candidateSha256 = sha256(candidate);
    } else {
      candidate = { ...currentConfiguration!, triggerStatus: action === 'start' ? 1 : 0 };
      candidateSha256 = xxlJobRevision(candidate);
    }
    this.current(root, access);
    const authorizationScope = { workspaceId: access.scope.workspaceId, connectionId: id, expectedRevision: recordRevision(access.record), consoleUrl: String(access.record.config.consoleUrl), environment: access.record.environment, serviceId: access.serviceId, executorId: access.remoteScope.executorId, appName: access.remoteScope.appName, action, jobId: current?.id ?? null, expectedJobRevision: current?.revision ?? null, candidateSha256 };
    const equal = action !== 'create' && action !== 'trigger' && candidateSha256 === current!.revision;
    return { access, fields, current, result: { target: target(access), action, expectedRevision: recordRevision(access.record), expectedJobRevision: current?.revision ?? null, candidateSha256, authorizationScope, current, candidate, changes: changes(currentConfiguration, candidate), equal, defaultsApplied: action === 'create', concurrencyProtection: 'preflight-recheck' as const, concurrencyWarning: '写前重读与写入并非原子操作，最后读取后仍可能出现其它入口的并发修改。' } };
  }
  async prepare(root: string, id: string, value: unknown) {
    const input = inputObject(value, ['serviceId', 'action', 'jobId', 'fields', 'executorParam']);
    return (await this.preparation(root, id, input, writeAction(input.action))).result;
  }
  async execute(root: string, id: string, actionValue: unknown, value: unknown) {
    this.assertWritable();
    const action = writeAction(actionValue), input = inputObject(value, ['serviceId', 'jobId', 'fields', 'executorParam', 'expectedRevision', 'expectedJobRevision', 'authorization']);
    this.observed(this.access(root, id), input.expectedRevision);
    const prepared = await this.preparation(root, id, input, action), { access, current, fields, result } = prepared;
    this.observed(access, input.expectedRevision);
    if (current && input.expectedJobRevision !== current.revision) throw connectionFailure('xxl_job_revision_conflict', '任务（Job）配置已变化或未提供刚观察的摘要，请重新读取并准备操作。', 409);
    if (!current && input.expectedJobRevision !== undefined && input.expectedJobRevision !== null) throw connectionFailure('xxl_job_input_invalid', '创建任务（Job）没有原配置摘要。');
    if (result.equal) return { target: result.target, action, unchanged: true, submitted: false, verified: true, job: current, executionSucceeded: null, executionObserved: false };
    // Revalidate source identity immediately before authorizing an external attempt.
    this.service(access, access.serviceId);
    this.current(root, access);
    const evidence = access.record.config.production === true ? authorize(input.authorization, result.authorizationScope) : undefined;
    if (access.record.config.production !== true && input.authorization !== undefined) authorize(input.authorization, result.authorizationScope);
    const beforeWrite = () => {
      this.assertWritable();
      this.service(access, access.serviceId);
      this.current(root, access);
      if (evidence) consumeXxlJobAuthorization(access.scope, id, evidence.source, evidence.statement);
    };
    let outcome;
    if (action === 'create') outcome = await access.xxlJob.create(access.record.config, access.credentials, access.remoteScope, { fields: fields!, beforeWrite });
    else if (action === 'update') outcome = await access.xxlJob.update(access.record.config, access.credentials, access.remoteScope, { jobId: current!.id, fields: fields!, expectedJobRevision: current!.revision, beforeWrite });
    else outcome = await access.xxlJob.action(access.record.config, access.credentials, access.remoteScope, { jobId: current!.id, action, expectedJobRevision: current!.revision, ...(action === 'trigger' ? { executorParam: result.candidate.executorParam } : {}), beforeWrite });
    return { target: result.target, ...outcome, ...(access.record.config.production === true ? { authorizationKind: 'user-dialogue-evidence' as const } : {}) };
  }
}
