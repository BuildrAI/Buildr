import path from 'node:path';
import { connectionFailure, inputObject, passwordInput } from './errors.mjs';
import { xxlJobConfiguration, xxlJobApiBase, xxlJobRevision, xxlJobText } from './configuration.mjs';
import { mergeXxlJob, normalizeXxlJobCreate } from './job.mjs';
import { createXxlJobProvider } from './operations.mjs';
import { createOutputProtection } from './output.mjs';
import { createBindingStore, consumeAuthorization, inspectService, serviceIdentity, digest } from './state.mjs';

function actionName(value) {
  if (!['create', 'update', 'start', 'stop', 'trigger'].includes(value)) throw connectionFailure('xxl_job_action_invalid', '不支持该调度写入动作。');
  return value;
}
function appName(value) {
  const name = xxlJobText(value, 'AppName', 64);
  if (name !== name.trim()) throw connectionFailure('xxl_job_app_name_invalid', '请提供从当前环境实际配置取得的完整 AppName。');
  return name;
}
function authorize(value, scope) {
  if (value === undefined) throw connectionFailure('xxl_job_production_authorization_required', '每次生产实际操作前必须展示具体目标、差异或有效参数，并取得本次明确用户授权。', 403);
  const evidence = inputObject(value, ['source', 'statement', 'scope']);
  if (![evidence.source, evidence.statement].every(value => typeof value === 'string' && value.trim() && Buffer.byteLength(value) <= 8192)) throw connectionFailure('xxl_job_production_authorization_invalid', '授权依据须包含可回查用户指令来源与本次原意。', 403);
  const observed = inputObject(evidence.scope, Object.keys(scope));
  if (Object.keys(scope).some(key => observed[key] !== scope[key])) throw connectionFailure('xxl_job_production_authorization_mismatch', '授权与本次连接、服务、执行器、动作、版本或候选不一致，请重新准备。', 403);
  return evidence;
}
function changes(before, after) {
  return Object.entries(after).flatMap(([field, value]) => before?.[field] === value ? [] : [{ field, before: before?.[field] ?? null, after: value }]);
}
export function createXxlJobWorkflow(context, options = {}) {
  if (context?.protocolVersion !== 'buildr.connection-context/v1' || typeof context.workspace?.id !== 'string' || !context.workspace.id || typeof context.workspace?.root !== 'string' || !path.isAbsolute(context.workspace.root) || !context.connections?.primary) throw connectionFailure('xxl_job_context_invalid', '私有连接上下文无效。', 409);
  const connection = context.connections.primary;
  if (typeof connection.id !== 'string' || !connection.id || typeof connection.revision !== 'string' || !connection.revision || !['team', 'personal'].includes(connection.authentication?.source)) throw connectionFailure('xxl_job_context_invalid', '实例身份、观察版本或认证来源无效。', 409);
  const authentication = inputObject(connection.authentication.values, ['username', 'password']);
  if (!Object.hasOwn(authentication, 'username') || !Object.hasOwn(authentication, 'password')) throw connectionFailure('xxl_job_credentials_missing', '所选认证组必须同时含用户名和密码，不混合其它来源。', 409);
  const configuration = inputObject(connection.config, ['consoleUrl', 'production', 'apiVersion']);
  const config = xxlJobConfiguration({ ...configuration, username: authentication.username });
  const credentials = { password: passwordInput(authentication.password) };
  const protection = options.protection ?? createOutputProtection(); protection.secrets.add(credentials.password);
  const provider = createXxlJobProvider({ ...options.http, secrets: protection.secrets });
  const remote = provider.xxlJob, store = createBindingStore(context, connection, xxlJobApiBase(config.consoleUrl));
  const revalidate = options.revalidate ?? (() => { throw connectionFailure('xxl_job_context_required', '此动作需要宿主重新核对当前连接上下文。', 409); });
  const resolveService = options.resolveService ?? (id => inspectService(context.workspace, id));
  const observed = revision => { if (revision !== connection.revision) throw connectionFailure('connection_revision_conflict', '连接观察版本不匹配，请重新读取并核对目标。', 409); };
  async function service(value) {
    const id = serviceIdentity(value), result = await resolveService(id);
    if (result?.service?.id !== id || result.service.workspaceId !== context.workspace.id) throw connectionFailure('xxl_job_service_missing', '该服务未在当前工作空间唯一登记。', 409);
    const record = result.service;
    return { serviceId: id, serviceRevision: digest([record.id, record.workspaceId, record.repositoryId, record.modulePath]) };
  }
  async function uniqueExecutor(expected) {
    let offset = 0, match;
    for (let page = 0; page < 20; page++) {
      const listed = await remote.executors(config, credentials, { appName: expected, offset, limit: 100 });
      if (listed.offset !== offset || listed.limit < 1) throw connectionFailure('xxl_job_executor_lookup_incomplete', '执行器分页位置不匹配，无法确认唯一目标。', 409);
      for (const item of listed.items) if (item.appName === expected) {
        if (match) throw connectionFailure('xxl_job_executor_ambiguous', '该 AppName 匹配多个执行器，无法确认唯一目标。', 409);
        match = item;
      }
      if (!listed.hasMore) { if (!match) throw connectionFailure('xxl_job_executor_missing', '当前账号未看到该 AppName 对应执行器。', 404); return match; }
      if (!listed.items.length) throw connectionFailure('xxl_job_executor_lookup_incomplete', '执行器分页未完整，未确认唯一目标。', 409);
      offset += listed.items.length;
    }
    throw connectionFailure('xxl_job_executor_lookup_incomplete', '执行器发现达到本次上限，未确认唯一目标。', 409);
  }
  async function bound(value) {
    const registered = await service(value), state = store.read(), binding = state.bindings.find(item => item.serviceId === registered.serviceId);
    if (!binding) throw connectionFailure('xxl_job_service_unbound', '该服务尚未关联当前连接的执行器；先从同环境配置取得 AppName，再定位并明确绑定。', 409);
    let executor;
    try { executor = await uniqueExecutor(binding.appName); }
    catch (error) { if (error.code === 'xxl_job_executor_missing') throw connectionFailure('xxl_job_binding_changed', '已关联执行器不存在或 AppName 变化，请重新核对。', 409); throw error; }
    if (executor.id !== binding.executorId) throw connectionFailure('xxl_job_binding_changed', 'AppName 对应执行器编号已变化，未自动替换。', 409);
    await revalidate();
    return { ...registered, bindingRevision: state.revision, remoteScope: { executorId: binding.executorId, appName: binding.appName } };
  }
  function target(access) { return { connectionId: connection.id, consoleUrl: config.consoleUrl, production: config.production, serviceId: access.serviceId, executorId: access.remoteScope.executorId, appName: access.remoteScope.appName, apiVersion: '2.3.0' }; }
  function checkJob(access, job) { if (job.jobGroup !== access.remoteScope.executorId) throw connectionFailure('xxl_job_scope_mismatch', '任务不属于当前服务关联的执行器，已拒绝该结果。', 409); }
  async function current(access) {
    await revalidate();
    if (store.read().revision !== access.bindingRevision) throw connectionFailure('xxl_job_binding_revision_conflict', '服务关联在操作期间已变化，未执行旧上下文写入。', 409);
    if ((await service(access.serviceId)).serviceRevision !== access.serviceRevision) throw connectionFailure('xxl_job_service_changed', '服务登记在准备后已变化，请重新核对。', 409);
  }
  async function preparation(input, action) {
    const access = await bound(input.serviceId);
    if (action === 'create' && input.jobId !== undefined || action !== 'create' && input.jobId === undefined) throw connectionFailure('xxl_job_input_invalid', '创建不接受任务编号；其它动作必须明确指定任务编号。');
    if (!['create', 'update'].includes(action) && input.fields !== undefined || action !== 'trigger' && input.executorParam !== undefined) throw connectionFailure('xxl_job_input_invalid', '候选字段或参数覆盖不适用于本次动作。');
    let currentJob = null;
    if (action !== 'create') {
      currentJob = await remote.get(config, credentials, access.remoteScope, { jobId: input.jobId }); checkJob(access, currentJob);
      if (xxlJobRevision(currentJob) !== currentJob.revision) throw connectionFailure('xxl_job_redacted_configuration', '当前配置含遮蔽内容，不能安全展示完整候选或沿用原参数；请通过原站核对。', 409);
    }
    const currentConfiguration = currentJob ? Object.fromEntries(Object.entries(currentJob).filter(([field]) => !['revision', 'updateTime'].includes(field))) : null;
    let fields = null, candidate, candidateSha256;
    if (action === 'create') { fields = normalizeXxlJobCreate(input.fields); candidate = { ...fields, jobGroup: access.remoteScope.executorId, glueType: 'BEAN', triggerStatus: 0 }; candidateSha256 = digest(candidate); }
    else if (action === 'update') { fields = mergeXxlJob(currentJob, input.fields); candidate = { ...currentConfiguration, ...fields }; candidateSha256 = xxlJobRevision(candidate); }
    else if (action === 'trigger') { candidate = { action, jobId: currentJob.id, executorParam: input.executorParam === undefined ? currentJob.executorParam : xxlJobText(input.executorParam, '运行参数', 512, true, true) }; candidateSha256 = digest(candidate); }
    else { candidate = { ...currentConfiguration, triggerStatus: action === 'start' ? 1 : 0 }; candidateSha256 = xxlJobRevision(candidate); }
    await current(access);
    const authorizationScope = { workspaceId: context.workspace.id, connectionId: connection.id, expectedRevision: connection.revision, consoleUrl: config.consoleUrl, production: config.production, serviceId: access.serviceId, serviceRevision: access.serviceRevision, bindingRevision: access.bindingRevision, executorId: access.remoteScope.executorId, appName: access.remoteScope.appName, action, jobId: currentJob?.id ?? null, expectedJobRevision: currentJob?.revision ?? null, candidateSha256 };
    return { access, fields, currentJob, result: { target: target(access), action, expectedRevision: connection.revision, expectedJobRevision: currentJob?.revision ?? null, candidateSha256, authorizationScope, current: currentJob, candidate, changes: changes(currentConfiguration, candidate), equal: action !== 'create' && action !== 'trigger' && candidateSha256 === currentJob.revision, defaultsApplied: action === 'create', concurrencyProtection: 'preflight-recheck', concurrencyWarning: '写前重读与写入并非原子操作，最后读取后仍可能出现其它入口并发修改。' } };
  }
  return {
    protection,
    async test() {
      const result = await provider.test(config, credentials);
      return { ...result, status: 'success', connectionId: connection.id, authenticationSource: connection.authentication.source, checks: ['login', 'bounded-executor-read'], diagnostics: [], limitations: ['只证明登录与有界执行器读取；没有运行任务，未证明写入、部署或业务执行。', '按 2.3.0 接口适配，auto 不代表验证了全部远端版本。'], observedAt: new Date().toISOString() };
    },
    async executors(input = {}) {
      inputObject(input, ['offset', 'limit', 'appName']);
      const result = await remote.executors(config, credentials, input);
      return { status: 'success', checks: ['login', 'executor-discovery'], diagnostics: [], limitations: ['仅返回本次分页，不代表全量。'], observedAt: new Date().toISOString(), connectionId: connection.id, consoleUrl: config.consoleUrl, expectedRevision: connection.revision, ...result, options: result.items.map(item => ({ value: String(item.id), label: `${item.name} · ${item.appName}` })) };
    },
    async resolve(input) {
      inputObject(input, ['serviceId', 'appName']); const registered = await service(input.serviceId), executor = await uniqueExecutor(appName(input.appName)); await revalidate();
      const state = store.read();
      return { connectionId: connection.id, ...registered, consoleUrl: config.consoleUrl, executor, binding: state.bindings.find(item => item.serviceId === registered.serviceId) ?? null, expectedRevision: connection.revision, expectedBindingRevision: state.revision, persisted: false };
    },
    async bind(input) {
      inputObject(input, ['serviceId', 'appName', 'expectedRevision', 'expectedBindingRevision']); observed(input.expectedRevision);
      if (typeof input.expectedBindingRevision !== 'string') throw connectionFailure('xxl_job_binding_revision_required', '先定位并取得当前本机关联版本；首次绑定使用 absent。', 409);
      const registered = await service(input.serviceId), executor = await uniqueExecutor(appName(input.appName)); await revalidate();
      if ((await service(registered.serviceId)).serviceRevision !== registered.serviceRevision) throw connectionFailure('xxl_job_service_changed', '服务登记已变化，请重新核对。', 409);
      const binding = { serviceId: registered.serviceId, executorId: executor.id, appName: executor.appName }, saved = store.bind(binding, input.expectedBindingRevision);
      return { connectionId: connection.id, binding, expectedRevision: connection.revision, expectedBindingRevision: saved.revision, unchanged: saved.unchanged, bound: true, externalSystemChanged: false, storage: 'provider-private-local' };
    },
    async jobs(input) { inputObject(input, ['serviceId', 'offset', 'limit', 'jobDesc', 'executorHandler', 'author', 'triggerStatus']); const { serviceId, ...query } = input, access = await bound(serviceId); const result = await remote.jobs(config, credentials, access.remoteScope, query); result.items.forEach(job => checkJob(access, job)); return { target: target(access), ...result }; },
    async get(input) { inputObject(input, ['serviceId', 'jobId']); const access = await bound(input.serviceId), job = await remote.get(config, credentials, access.remoteScope, { jobId: input.jobId }); checkJob(access, job); return { target: target(access), job, expectedRevision: connection.revision, expectedJobRevision: job.revision }; },
    async logs(input) { inputObject(input, ['serviceId', 'offset', 'limit', 'jobId', 'logStatus', 'from', 'to']); const { serviceId, ...query } = input, access = await bound(serviceId); return { target: target(access), ...await remote.logs(config, credentials, access.remoteScope, query) }; },
    async log(input) { inputObject(input, ['serviceId', 'jobId', 'logId', 'fromLine', 'maxLines', 'maxBytes']); const { serviceId, ...query } = input, access = await bound(serviceId); return { target: target(access), ...await remote.log(config, credentials, access.remoteScope, query) }; },
    async preview(input) { inputObject(input, ['serviceId', 'scheduleType', 'scheduleConf']); const { serviceId, ...query } = input, access = await bound(serviceId); return { target: target(access), ...await remote.preview(config, credentials, access.remoteScope, query) }; },
    async prepare(input) { inputObject(input, ['serviceId', 'action', 'jobId', 'fields', 'executorParam']); return (await preparation(input, actionName(input.action))).result; },
    async execute(action, input) {
      actionName(action); inputObject(input, ['serviceId', 'jobId', 'fields', 'executorParam', 'expectedRevision', 'expectedJobRevision', 'authorization']); observed(input.expectedRevision);
      const { access, fields, currentJob, result } = await preparation(input, action);
      if (currentJob && input.expectedJobRevision !== currentJob.revision) throw connectionFailure('xxl_job_revision_conflict', '任务配置已变化或未提供刚观察版本，请重新读取和准备。', 409);
      if (!currentJob && input.expectedJobRevision !== undefined && input.expectedJobRevision !== null) throw connectionFailure('xxl_job_input_invalid', '创建任务没有原配置摘要。');
      if (result.equal) return { target: result.target, action, unchanged: true, submitted: false, verified: true, job: currentJob, executionSucceeded: null, executionObserved: false };
      const evidence = config.production || input.authorization !== undefined ? authorize(input.authorization, result.authorizationScope) : undefined;
      const beforeWrite = async () => { await current(access); if (config.production) consumeAuthorization(context, connection.id, evidence); };
      const outcome = action === 'create' ? await remote.create(config, credentials, access.remoteScope, { fields, beforeWrite }) : action === 'update' ? await remote.update(config, credentials, access.remoteScope, { jobId: currentJob.id, fields, expectedJobRevision: currentJob.revision, beforeWrite }) : await remote.action(config, credentials, access.remoteScope, { jobId: currentJob.id, action, expectedJobRevision: currentJob.revision, ...(action === 'trigger' ? { executorParam: result.candidate.executorParam } : {}), beforeWrite });
      return { target: result.target, ...outcome, ...(config.production ? { authorizationKind: 'user-dialogue-evidence' } : {}) };
    },
  };
}
