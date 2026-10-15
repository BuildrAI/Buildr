import crypto from 'node:crypto';
import { connectionFailure, inputObject, passwordInput,                         } from './errors.mjs';
import { XXL_JOB_CONCURRENCY_LIMIT, XXL_JOB_LOG_BYTES, XXL_JOB_SCAN_PAGES, xxlJobApiBase, xxlJobConfiguration, xxlJobExpectedRevision, xxlJobInteger, xxlJobRevision, xxlJobScope, xxlJobText } from './configuration.mjs';
import { mergeXxlJob, normalizeXxlJobCreate, XXL_JOB_EDITABLE_FIELDS } from './job.mjs';
import { XxlJobHttpClient, xxlJobData,                        } from './http.mjs';
const apiVersion = '2.3.0'         ;
function object(value         )                          {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 返回结构不受支持，未当作成功空结果。', 502);
  return value                           ;
}
function remoteNumber(value         , min = 0)         {
  if (!Number.isSafeInteger(value) || Number(value) < min) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 返回的编号或数量不受支持。', 502);
  return Number(value);
}
function remoteText(value         , max = 1024 * 1024)         {
  if (typeof value !== 'string' || !value.isWellFormed() || value.includes('\0') || Buffer.byteLength(value) > max) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 返回的文本不完整或超过限制。', 502);
  return value;
}
function optionalText(value         )         { return value === undefined || value === null ? '' : remoteText(value); }
function pageInput(input                                       )                                    { return { offset: xxlJobInteger(input.offset, '起始位置', 0, Number.MAX_SAFE_INTEGER, 0), limit: xxlJobInteger(input.limit, '页大小', 1, 100, 20) }; }
function page   (value         , input                                   , parse                      )                {
  const data = object(value);
  if (!Array.isArray(data.data) || data.data.length > input.limit) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 分页结构不受支持。', 502);
  const totalCount = remoteNumber(data.recordsFiltered), total = remoteNumber(data.recordsTotal);
  if (total !== totalCount || data.data.length > Math.max(0, totalCount - input.offset)) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 分页计数不一致。', 502);
  const hasMore = input.offset + data.data.length < totalCount;
  if (hasMore && data.data.length === 0) throw connectionFailure('xxl_job_query_incomplete', 'XXL-JOB 返回空页但还有未读记录，未将查询解释成全量。', 502);
  return { apiVersion, ...input, totalCount, hasMore, items: data.data.map(parse) };
}
function executor(value         )                 {
  const item = object(value), addressType = remoteNumber(item.addressType);
  if (![0, 1].includes(addressType)) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 执行器注册方式不受支持。', 502);
  const addresses = item.registryList !== undefined && item.registryList !== null ? item.registryList : optionalText(item.addressList).split(',').filter(Boolean);
  if (!Array.isArray(addresses) || addresses.length > 1000) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 执行器节点列表不受支持。', 502);
  return { id: remoteNumber(item.id, 1), appName: remoteText(item.appname, 256), name: remoteText(item.title, 512), addressType: addressType         , addresses: addresses.map(address => remoteText(address, 2048)) };
}
function job(value         , scope             )               {
  const item = object(value), jobGroup = remoteNumber(item.jobGroup, 1);
  if (jobGroup !== scope.executorId) throw connectionFailure('xxl_job_scope_mismatch', 'XXL-JOB 返回了其他执行器的任务，已拒绝该结果。', 502);
  const scheduleType = remoteText(item.scheduleType, 64), triggerStatus = remoteNumber(item.triggerStatus);
  if (!['NONE', 'CRON', 'FIX_RATE'].includes(scheduleType) || ![0, 1].includes(triggerStatus)) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 调度方式或状态不受支持。', 502);
  const detail = {
    id: remoteNumber(item.id, 1), jobGroup, glueType: remoteText(item.glueType, 64), triggerStatus: triggerStatus         ,
    jobDesc: remoteText(item.jobDesc), author: optionalText(item.author), alarmEmail: optionalText(item.alarmEmail), scheduleType: scheduleType                                  , scheduleConf: optionalText(item.scheduleConf),
    executorHandler: optionalText(item.executorHandler), executorParam: optionalText(item.executorParam), executorRouteStrategy: remoteText(item.executorRouteStrategy, 64), executorBlockStrategy: remoteText(item.executorBlockStrategy, 64),
    executorTimeout: remoteNumber(item.executorTimeout), executorFailRetryCount: remoteNumber(item.executorFailRetryCount), misfireStrategy: remoteText(item.misfireStrategy, 64), childJobId: optionalText(item.childJobId),
    updateTime: item.updateTime === undefined || item.updateTime === null ? null : typeof item.updateTime === 'number' ? remoteNumber(item.updateTime) : remoteText(item.updateTime, 128),
  };
  if (detail.glueType !== 'BEAN') {
    const source = remoteText(item.glueSource), glueTime = item.glueUpdatetime;
    if (glueTime !== null && glueTime !== undefined && typeof glueTime !== 'number' && typeof glueTime !== 'string') throw connectionFailure('xxl_job_protocol_unsupported', '在线脚本版本无法核验，未猜测当前源码版本。', 502);
    const glueRevision = 'sha256-' + crypto.createHash('sha256').update(JSON.stringify([source, glueTime ?? null])).digest('hex');
    return { ...detail, glueRevision, revision: xxlJobRevision({ ...detail, glueRevision }) };
  }
  return { ...detail, revision: xxlJobRevision(detail) };
}
function fields(value        )                         { return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, String(value)])); }
async function verifyScope(client                  , value             )                       {
  const scope = xxlJobScope(value);
  let observed                ;
  try { observed = executor(xxlJobData(await client.request('/jobgroup/loadById', { id: String(scope.executorId) }))); }
  catch (error) { if ((error                     ).code === 'xxl_job_request_rejected') throw connectionFailure('xxl_job_binding_changed', '服务关联的执行器不存在或当前账号不可见，请重新核实。', 409); throw error; }
  if (observed.id !== scope.executorId || observed.appName !== scope.appName) throw connectionFailure('xxl_job_binding_changed', '服务关联的执行器身份已变化，请重新核实；未按同名替换。', 409);
  return scope;
}
async function executors(client                  , input                          = {}) {
  inputObject(input, ['offset', 'limit', 'appName']); const paging = pageInput(input);
  return page(await client.request('/jobgroup/pageList', { start: String(paging.offset), length: String(paging.limit), appname: input.appName === undefined ? '' : xxlJobText(input.appName, 'AppName 过滤', 64), title: '' }), paging, executor);
}
async function jobs(client                  , scope             , input                 ) {
  inputObject(input, ['offset', 'limit', 'jobDesc', 'executorHandler', 'author', 'triggerStatus']); const paging = pageInput(input);
  const query = { start: String(paging.offset), length: String(paging.limit), jobGroup: String(scope.executorId), triggerStatus: String(xxlJobInteger(input.triggerStatus, '调度状态', -1, 1, -1)), jobDesc: input.jobDesc === undefined ? '' : xxlJobText(input.jobDesc, '描述过滤', 255, true), executorHandler: input.executorHandler === undefined ? '' : xxlJobText(input.executorHandler, '处理方法过滤', 255, true), author: input.author === undefined ? '' : xxlJobText(input.author, '负责人过滤', 64, true) };
  return page(await client.request('/jobinfo/pageList', query), paging, value => job(value, scope));
}
async function get(client                  , scope             , id        , maxPages        )                        {
  let offset = 0;
  for (let index = 0; index < maxPages; index++) {
    const result = await jobs(client, scope, { offset, limit: 100 }), found = result.items.find(item => item.id === id);
    if (found) return found;
    if (!result.hasMore) throw connectionFailure('xxl_job_missing', '指定任务在该执行器中不存在或当前账号不可见。', 404);
    offset += result.items.length;
  }
  throw connectionFailure('xxl_job_query_incomplete', '任务定位达到读取上限，尚未遍历完成；未报告任务不存在。', 422);
}
function matches(current              , expected         )       {
  if (current.revision !== xxlJobExpectedRevision(expected)) throw connectionFailure('xxl_job_conflict', '调度任务配置已变化，请重新读取并判断，未提交修改。', 409);
}
async function childJobs(client                  , scope             , candidate                , maxPages        , previous               ) {
  if (!candidate.childJobId || previous?.childJobId === candidate.childJobId) return;
  for (const id of candidate.childJobId.split(',')) {
    try { await get(client, scope, Number(id), maxPages); }
    catch (error) { if ((error                     ).code === 'xxl_job_missing') throw connectionFailure('xxl_job_child_scope_mismatch', '新增或变更的子任务必须属于当前服务关联的执行器。', 422); throw error; }
  }
}
function errorSummary(error         )                          { return { code: String((error                      )?.code || 'xxl_job_verification_failed'), message: String((error                         )?.message || '写入后的远端状态未能核验。') }; }
async function verifiedResult(client                  , scope             , id        , maxPages        , expected                                  )                             {
  try {
    await verifyScope(client, scope);
    const detail = await get(client, scope, id, maxPages);
    if (!expected(detail)) return { apiVersion, jobId: id, verified: false, job: detail, verificationError: { code: 'xxl_job_verification_mismatch', message: '请求已受理，但回读配置与本次候选不一致，请检查远端当前状态。' }, concurrencyProtection: 'preflight-recheck', concurrencyWarning: XXL_JOB_CONCURRENCY_LIMIT };
    return { apiVersion, jobId: id, verified: true, job: detail, concurrencyProtection: 'preflight-recheck', concurrencyWarning: XXL_JOB_CONCURRENCY_LIMIT };
  } catch (error) { return { apiVersion, jobId: id, verified: false, verificationError: errorSummary(error), concurrencyProtection: 'preflight-recheck', concurrencyWarning: XXL_JOB_CONCURRENCY_LIMIT }; }
}
function editableEqual(detail              , candidate                )          { return XXL_JOB_EDITABLE_FIELDS.every(key => detail[key] === candidate[key]); }
async function validateSchedule(client                  , candidate                ) {
  if (candidate.scheduleType === 'NONE') return;
  const times = xxlJobData(await client.request('/jobinfo/nextTriggerTime', { scheduleType: candidate.scheduleType, scheduleConf: candidate.scheduleConf }));
  if (!Array.isArray(times) || !times.length || times.length > 5 || times.some(value => typeof value !== 'string')) throw connectionFailure('xxl_job_schedule_invalid', '远端未能确认该调度配置存在后续触发时间，未提交写入。', 422);
}
async function beforeWrite(callback         ) {
  if (callback === undefined) return;
  if (typeof callback !== 'function') throw connectionFailure('xxl_job_input_invalid', '内部写入检查无效。');
  await callback();
}
function limitedText(value        , maximum        ) { const bytes = Buffer.from(value, 'utf8'); if (bytes.length <= maximum) return { text: value, truncated: false }; let end = maximum; while (end && (bytes[end] & 0xc0) === 0x80) end--; return { text: bytes.subarray(0, end).toString('utf8'), truncated: true }; }
function logSummary(value         , scope             )                   {
  const item = object(value), jobGroup = remoteNumber(item.jobGroup, 1);
  if (jobGroup !== scope.executorId) throw connectionFailure('xxl_job_scope_mismatch', 'XXL-JOB 返回了其他执行器的执行记录，已拒绝该结果。', 502);
  const triggerCode = remoteNumber(item.triggerCode), handleCode = remoteNumber(item.handleCode);
  const triggerMsg = limitedText(optionalText(item.triggerMsg), 16 * 1024), handleMsg = limitedText(optionalText(item.handleMsg), 16 * 1024);
  let triggerTime                 ;
  if (typeof item.triggerTime === 'number') triggerTime = remoteNumber(item.triggerTime);
  else if (typeof item.triggerTime === 'string' && /(?:Z|[+-]\d\d:\d\d)$/u.test(item.triggerTime) && Number.isFinite(Date.parse(item.triggerTime))) triggerTime = Date.parse(item.triggerTime);
  else if (typeof item.triggerTime === 'string' && /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d{1,9})?$/u.test(item.triggerTime)) triggerTime = remoteText(item.triggerTime, 64);
  else throw connectionFailure('xxl_job_log_time_unsupported', '执行记录时间格式不受支持，未猜测日志文件位置。', 502);
  return { id: remoteNumber(item.id, 1), jobId: remoteNumber(item.jobId, 1), jobGroup, triggerTime, timeBasis: typeof triggerTime === 'number' ? 'epoch' : 'admin-server', executorAddress: item.executorAddress ? remoteText(item.executorAddress, 2048) : null, executorParam: optionalText(item.executorParam), triggerCode, handleCode, triggerResult: triggerCode === 0 ? 'pending' : triggerCode === 200 ? 'success' : 'failed', handleResult: handleCode === 0 ? 'pending' : handleCode === 200 ? 'success' : 'failed', triggerMsg: triggerMsg.text, handleMsg: handleMsg.text, messagesTruncated: triggerMsg.truncated || handleMsg.truncated };
}
/** Parse only the fixed 2.3.0 metadata declarations; page scripts are never executed. */
function logPageEpoch(html        , log                  )         {
  const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/giu)].map(match => match[1]);
  const candidates                           = [];
  for (const block of blocks) {
    const declarations = [...block.matchAll(/^\s*var\s+(logId|triggerTime|executorAddress)\s*=\s*'([^'\r\n\\]*)'\s*;[\t ]*$/gmu)];
    if (declarations.length !== 3 || new Set(declarations.map(match => match[1])).size !== 3) continue;
    candidates.push(Object.fromEntries(declarations.map(match => [match[1], match[2]])));
  }
  if (candidates.length !== 1) throw connectionFailure('xxl_job_log_metadata_unsupported', '日志详情页未提供唯一且受支持的时间元数据，未猜测时区。', 502);
  const metadata = candidates[0];
  if (!/^[1-9]\d*$/u.test(metadata.logId) || Number(metadata.logId) !== log.id || metadata.executorAddress !== log.executorAddress) throw connectionFailure('xxl_job_log_metadata_mismatch', '日志详情页的记录或执行器身份与已读取记录不一致，未读取节点日志。', 502);
  if (!/^\d+$/u.test(metadata.triggerTime) || !Number.isSafeInteger(Number(metadata.triggerTime))) throw connectionFailure('xxl_job_log_metadata_unsupported', '日志详情页没有可核验的原始毫秒时间，未猜测时区。', 502);
  return Number(metadata.triggerTime);
}
async function logs(client                  , scope             , input                 ) {
  inputObject(input, ['offset', 'limit', 'jobId', 'logStatus', 'from', 'to']); const paging = pageInput(input);
  let filterTime = '';
  if (input.from !== undefined || input.to !== undefined) {
    const from = xxlJobText(input.from, '开始时间', 19), to = xxlJobText(input.to, '结束时间', 19);
    const validDate = (time        ) => {
      const match = time.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/u);
      if (!match) return false;
      const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0), days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && hour <= 23 && minute <= 59 && second <= 59;
    };
    if (![from, to].every(validDate) || from >= to) throw connectionFailure('xxl_job_input_invalid', '时间范围需要有效且有序的调度中心时间，格式 yyyy-MM-dd HH:mm:ss。');
    filterTime = from + ' - ' + to;
  }
  const id = xxlJobInteger(input.jobId, '任务编号', 0, Number.MAX_SAFE_INTEGER, 0);
  const result = page(await client.request('/joblog/pageList', { start: String(paging.offset), length: String(paging.limit), jobGroup: String(scope.executorId), jobId: String(id), logStatus: String(xxlJobInteger(input.logStatus, '日志状态', -1, 3, -1)), filterTime }), paging, value => {
    const detail = logSummary(value, scope);
    if (id && detail.jobId !== id) throw connectionFailure('xxl_job_scope_mismatch', 'XXL-JOB 返回的日志不属于请求的任务。', 502);
    return detail;
  });
  return { ...result, timeBasis: 'admin-server'         , warning: '时间筛选采用调度中心当地时间；远端时区未知时不按本机时区转换。' };
}
async function logById(client                  , scope             , jobId        , logId        , maxPages        ) {
  let offset = 0;
  for (let index = 0; index < maxPages; index++) {
    const result = await logs(client, scope, { jobId, offset, limit: 100 }), found = result.items.find(item => item.id === logId);
    if (found) return found;
    if (!result.hasMore) throw connectionFailure('xxl_job_log_missing', '指定执行记录在当前任务中不存在或当前账号不可见。', 404);
    offset += result.items.length;
  }
  throw connectionFailure('xxl_job_query_incomplete', '执行记录定位达到读取上限，尚未遍历完成；未报告记录不存在。', 422);
}
export function createXxlJobProvider(options                    = {})                 {
  const maxPages = options.maxScanPages ?? XXL_JOB_SCAN_PAGES;
  const client = (config                         , credentials                         ) => {
    if (!Object.hasOwn(credentials, 'password')) throw connectionFailure('connection_credentials_missing', '该 XXL-JOB 连接尚未在本机配置认证信息。', 409);
    return new XxlJobHttpClient(xxlJobConfiguration(config), passwordInput(credentials.password), options);
  };
  const run = async    (config                         , credentials                         , operation                                          )             => {
    const current = client(config, credentials);
    return current.sanitize(await operation(current));
  };
  const operations                   = {
    executors: (config, credentials, input) => run(config, credentials, client => executors(client, input)),
    jobs: (config, credentials, scope, input) => run(config, credentials, async client => jobs(client, await verifyScope(client, scope), input)),
    get: (config, credentials, scope, input) => run(config, credentials, async client => { inputObject(input, ['jobId']); return get(client, await verifyScope(client, scope), xxlJobInteger(input.jobId, '任务编号'), maxPages); }),
    create: (config, credentials, scope, input) => run(config, credentials, async client => {
      inputObject(input, ['fields', 'beforeWrite']); const candidate = normalizeXxlJobCreate(input.fields), target = await verifyScope(client, scope);
      await childJobs(client, target, candidate, maxPages);
      await validateSchedule(client, candidate);
      await verifyScope(client, target);
      await beforeWrite(input.beforeWrite);
      const rawId = xxlJobData(await client.request('/jobinfo/add', fields({ ...candidate, jobGroup: target.executorId, glueType: 'BEAN', glueSource: '', glueRemark: '', triggerStatus: 0 }), true));
      const id = typeof rawId === 'string' && /^[1-9]\d*$/u.test(rawId) ? Number(rawId) : typeof rawId === 'number' ? rawId : NaN;
      if (!Number.isSafeInteger(id) || id < 1) throw connectionFailure('xxl_job_create_result_unknown', '创建请求已发送，但未返回可核验任务编号；不要自动重发，请先查看远端。', 502);
      return { created: true         , ...await verifiedResult(client, target, id, maxPages, detail => detail.glueType === 'BEAN' && detail.triggerStatus === 0 && editableEqual(detail, candidate)) };
    }),
    update: (config, credentials, scope, input) => run(config, credentials, async client => {
      inputObject(input, ['jobId', 'fields', 'expectedJobRevision', 'beforeWrite']); const id = xxlJobInteger(input.jobId, '任务编号'), target = await verifyScope(client, scope), current = await get(client, target, id, maxPages);
      matches(current, input.expectedJobRevision); const candidate = mergeXxlJob(current, input.fields);
      if (editableEqual(current, candidate)) return { updated: false, unchanged: true, apiVersion, jobId: id, verified: true, job: current, concurrencyProtection: 'preflight-recheck'         , concurrencyWarning: XXL_JOB_CONCURRENCY_LIMIT };
      await childJobs(client, target, candidate, maxPages, current);
      if (candidate.scheduleType !== current.scheduleType || candidate.scheduleConf !== current.scheduleConf) await validateSchedule(client, candidate);
      await verifyScope(client, target); matches(await get(client, target, id, maxPages), input.expectedJobRevision);
      await beforeWrite(input.beforeWrite);
      xxlJobData(await client.request('/jobinfo/update', fields({ ...candidate, id, jobGroup: target.executorId }), true));
      return { updated: true, ...await verifiedResult(client, target, id, maxPages, detail => detail.glueType === current.glueType && detail.triggerStatus === current.triggerStatus && editableEqual(detail, candidate)) };
    }),
    action: (config, credentials, scope, input) => run(config, credentials, async client => {
      inputObject(input, ['jobId', 'action', 'expectedJobRevision', 'executorParam', 'beforeWrite']); const id = xxlJobInteger(input.jobId, '任务编号');
      if (!['start', 'stop', 'trigger'].includes(input.action) || input.action !== 'trigger' && input.executorParam !== undefined) throw connectionFailure('xxl_job_input_invalid', '调度动作或覆盖参数无效。');
      const target = await verifyScope(client, scope), current = await get(client, target, id, maxPages); matches(current, input.expectedJobRevision);
      if (input.action === 'start' && current.scheduleType === 'NONE') throw connectionFailure('xxl_job_schedule_none', '不调度（NONE）的任务不能启动自动调度。', 422);
      const effectiveParam = input.executorParam === undefined ? current.executorParam : xxlJobText(input.executorParam, '本次运行参数', 512, true, true);
      if (input.action === 'start') await validateSchedule(client, current);
      await verifyScope(client, target); matches(await get(client, target, id, maxPages), input.expectedJobRevision);
      const submittedAt = (options.now?.() || new Date()).toISOString();
      await beforeWrite(input.beforeWrite);
      xxlJobData(await client.request('/jobinfo/' + input.action, input.action === 'trigger' ? { id: String(id), executorParam: effectiveParam, addressList: '' } : { id: String(id) }, true));
      const result                     = { apiVersion, jobId: id, action: input.action, submitted: true, verified: false, executionSucceeded: null, executionObserved: false, concurrencyProtection: 'preflight-recheck', concurrencyWarning: XXL_JOB_CONCURRENCY_LIMIT, warnings: input.action === 'stop' ? ['已停止后续自动调度；正在运行、已预读及排队的任务可能继续执行。'] : input.action === 'trigger' ? ['只确认触发请求已受理；没有远端运行编号，执行结果请读取记录，不自动关联最近一条。'] : ['已请求启动后续自动调度，不代表立即运行或业务执行成功。'] };
      if (input.action === 'trigger') return { ...result, executorParam: effectiveParam, submittedAt };
      return { ...result, ...await verifiedResult(client, target, id, maxPages, detail => detail.triggerStatus === (input.action === 'start' ? 1 : 0)) };
    }),
    logs: (config, credentials, scope, input) => run(config, credentials, async client => {
      const target = await verifyScope(client, scope);
      return logs(client, target, input);
    }),
    log: (config, credentials, scope, input) => run(config, credentials, async client => {
      inputObject(input, ['jobId', 'logId', 'fromLine', 'maxLines', 'maxBytes']); const jobId = xxlJobInteger(input.jobId, '任务编号'), logId = xxlJobInteger(input.logId, '执行记录编号'), fromLine = xxlJobInteger(input.fromLine, '起始行', 1, Number.MAX_SAFE_INTEGER, 1), maxLines = xxlJobInteger(input.maxLines, '日志行数', 1, 1000, 200), maxBytes = xxlJobInteger(input.maxBytes, '日志字节数', 1, XXL_JOB_LOG_BYTES, 64 * 1024);
      const target = await verifyScope(client, scope); const log = await logById(client, target, jobId, logId, maxPages);
      const empty                   = { apiVersion, log, fromLine, toLine: fromLine - 1, nextFromLine: fromLine, content: '', ended: false, truncated: false, availability: 'unavailable' };
      if (!log.executorAddress) return { ...empty, warning: '执行记录尚无执行器地址，日志正文当前不可用。' };
      try {
        const triggerTime = typeof log.triggerTime === 'number' ? log.triggerTime : logPageEpoch(await client.logDetailPage(logId), log);
        const raw = object(xxlJobData(await client.request('/joblog/logDetailCat', { executorAddress: log.executorAddress, triggerTime: String(triggerTime), logId: String(logId), fromLineNum: String(fromLine) })));
        const returnedFrom = remoteNumber(raw.fromLineNum, 1), returnedTo = remoteNumber(raw.toLineNum), content = remoteText(raw.logContent), ended = raw.end ?? raw.isEnd;
        if (returnedFrom !== fromLine || typeof ended !== 'boolean' || raw.end !== undefined && raw.isEnd !== undefined && raw.end !== raw.isEnd) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 日志行号或结束状态不能核验。', 502);
        if (returnedTo === 0 && ended && /^readLog fail, logFile (?:not found|not exists)$/u.test(content)) return { ...empty, availability: 'missing', warning: '执行器上的日志文件不存在；已知调度与执行结果仍保留。' };
        if (returnedTo < fromLine) { if (content) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 空日志与行号不一致。', 502); return { ...empty, availability: 'available', ended: ended || log.handleCode > 0 }; }
        const lines = content.split('\n'); if (lines.at(-1) === '') lines.pop();
        if (lines.length !== returnedTo - returnedFrom + 1) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 日志正文与行号不一致，未跳过未读内容。', 502);
        const selected           = []; let bytes = 0;
        for (const line of lines) {
          const sanitized = client.sanitize(line), size = Buffer.byteLength(sanitized + '\n');
          if (selected.length >= maxLines || bytes + size > maxBytes) break;
          selected.push(sanitized); bytes += size;
        }
        if (!selected.length && lines.length) return { ...empty, warning: '当前单行日志超过输出字节限制，请提高 maxBytes；未跳过该行。', truncated: true };
        const truncated = selected.length < lines.length;
        return { ...empty, availability: 'available', toLine: fromLine + selected.length - 1, nextFromLine: fromLine + selected.length, content: selected.join('\n') + '\n', ended: !truncated && (ended || log.handleCode > 0), truncated };
      } catch (error) {
        const failure = errorSummary(error);
        return { ...empty, availability: ['xxl_job_unreachable', 'xxl_job_timeout', 'xxl_job_request_rejected'].includes(failure.code) ? 'unreachable' : 'unavailable', warning: failure.message };
      }
    }),
    preview: (config, credentials, scope, input) => run(config, credentials, async client => {
      inputObject(input, ['scheduleType', 'scheduleConf']); const scheduleType = input.scheduleType;
      if (!['NONE', 'CRON', 'FIX_RATE'].includes(String(scheduleType))) throw connectionFailure('xxl_job_input_invalid', '调度类型不受支持。');
      const scheduleConf = xxlJobText(input.scheduleConf, '调度配置', 128, scheduleType === 'NONE');
      await verifyScope(client, scope);
      const times = xxlJobData(await client.request('/jobinfo/nextTriggerTime', { scheduleType: String(scheduleType), scheduleConf }));
      if (!Array.isArray(times) || times.length > 5) throw connectionFailure('xxl_job_protocol_unsupported', 'XXL-JOB 调度预演结果不受支持。', 502);
      return { apiVersion, scheduleType: scheduleType                                  , scheduleConf, nextTriggerTimes: times.map(time => remoteText(time, 128)), timeZone: 'admin-server', warning: '预演时间采用调度中心时区；本次未运行任务，也未将本机时区当作远端时区。' };
    }),
  };
  return {
    category: 'scheduling', type: 'xxl-job', validateConfig: (value, previous) => xxlJobConfiguration(value, previous                                   ),
    validateCredentials: value => { const input = inputObject(value, ['password']); return { password: passwordInput(input.password) }; },
    authenticationTargetIdentity: config => { const current = xxlJobConfiguration(config); return JSON.stringify([xxlJobApiBase(current.consoleUrl), current.username]); },
    async test(config, credentials) {
      return run(config, credentials, async client => { const startedAt = Date.now(), observed = await executors(client, { limit: 1 }); return { ok: true         , elapsedMs: Date.now() - startedAt, xxlJob: { apiVersion, readVerified: true         , executorCount: observed.totalCount, warnings: ['只验证登录与执行器读取；没有运行任务，也没有证明所有写入能力。', '按 2.3.0 管理接口适配，本次未证明服务器无定制或后续版本兼容。', ...(client.baseUrl.startsWith('http:') ? ['当前 HTTP 网站以明文传输认证和业务数据。'] : [])] } }; });
    },
    xxlJob: operations,
  };
}
