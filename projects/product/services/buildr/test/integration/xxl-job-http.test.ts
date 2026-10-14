import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createXxlJobProvider } from '../../src/modules/connections/infrastructure/xxl-job-provider.ts';
import { XxlJobHttpClient, type XxlJobHttpOptions } from '../../src/modules/connections/infrastructure/xxl-job-http.ts';
import { xxlJobApiBase, xxlJobConfiguration, xxlJobRevision } from '../../src/modules/connections/domain/xxl-job-connection.ts';
import { mergeXxlJob, normalizeXxlJobCreate } from '../../src/modules/connections/domain/xxl-job-job.ts';
import type { XxlJobDetail } from '../../src/modules/connections/domain/xxl-job-types.ts';

type Seen = { route: string; method: string; query: URLSearchParams; form: URLSearchParams; cookie: string | undefined };
const password = 'only-xxl-fixture-secret', token = 'fixture-session-token';
const scope = { executorId: 7, appName: 'fixture-executor' };
const original = { id: 11, jobGroup: scope.executorId, glueType: 'BEAN', triggerStatus: 0, ...normalizeXxlJobCreate({ jobDesc: '本机模拟任务', author: 'fixture', executorHandler: 'fixtureHandler', executorParam: '完整参数\n保留换行', scheduleType: 'CRON', scheduleConf: '0 0 2 * * ?' }), updateTime: 123 };
async function fixture(t: { after(action: () => Promise<void>): void }, options: XxlJobHttpOptions = {}, fixturePassword = password) {
  const state = { jobs: [structuredClone(original)] as Record<string, unknown>[], executorAppName: scope.appName, loginCount: 0, writes: 0, jobReads: 0, requests: [] as Seen[], logs: [{ id: 101, jobId: 11, jobGroup: 7, triggerTime: 1_800_000_000_000 as number | string, executorAddress: 'http://recorded-node.invalid:9999', executorParam: original.executorParam, triggerCode: 200, handleCode: 0, triggerMsg: '调度已接受', handleMsg: '' }], detailEpoch: 1_800_000_000_000, logLines: ['第一行', '第二行', '第三行'], logEnd: false, override: null as null | ((seen: Seen, response: http.ServerResponse) => boolean | Promise<boolean>) };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://127.0.0.1'); let body = ''; for await (const part of request) body += part.toString('utf8');
    const seen = { route: url.pathname.replace('/proxy/xxl-job-admin', ''), method: request.method!, query: url.searchParams, form: new URLSearchParams(body), cookie: request.headers.cookie };
    state.requests.push(seen); if (seen.method === 'POST' && seen.route !== '/login') state.writes++;
    const json = (value: unknown, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json;charset=UTF-8' }); response.end(JSON.stringify(value)); };
    if (await state.override?.(seen, response)) return;
    if (seen.route === '/login') {
      assert.equal(seen.form.get('userName'), 'fixture-reader'); assert.equal(seen.form.get('password'), fixturePassword); assert.equal(seen.form.has('ifRemember'), false);
      state.loginCount++; response.setHeader('Set-Cookie', ['other-cookie=not-forwarded; Path=/', 'XXL_JOB_LOGIN_IDENTITY=' + token + '; Path=/; HttpOnly']); json({ code: 200, content: null }); return;
    }
    assert.equal(seen.cookie, 'XXL_JOB_LOGIN_IDENTITY=' + token);
    const group = { id: scope.executorId, appname: state.executorAppName, title: '模拟执行器', addressType: 0, addressList: 'http://recorded-node.invalid:9999', registryList: ['http://recorded-node.invalid:9999'] };
    if (seen.route === '/jobgroup/pageList') { json({ recordsTotal: 1, recordsFiltered: 1, data: Number(seen.query.get('start')) === 0 ? [group] : [] }); return; }
    if (seen.route === '/jobgroup/loadById') { json({ code: 200, content: group }); return; }
    if (seen.route === '/jobinfo/pageList') {
      state.jobReads++; assert.equal(seen.query.get('jobGroup'), '7'); assert.equal(seen.query.has('triggerStatus'), true);
      const offset = Number(seen.query.get('start')), limit = Number(seen.query.get('length')); json({ recordsTotal: state.jobs.length, recordsFiltered: state.jobs.length, data: state.jobs.slice(offset, offset + limit) }); return;
    }
    if (seen.route === '/jobinfo/nextTriggerTime') { json({ code: 200, content: ['2027-01-02 02:00:00', '2027-01-03 02:00:00'] }); return; }
    if (seen.route === '/jobinfo/add') {
      const candidate = Object.fromEntries(seen.form); for (const key of ['jobGroup', 'triggerStatus', 'executorTimeout', 'executorFailRetryCount']) candidate[key] = Number(candidate[key]) as never;
      state.jobs.push({ ...candidate, id: 12, updateTime: 456 }); json({ code: 200, content: '12' }); return;
    }
    if (seen.route === '/jobinfo/update') {
      const existing = state.jobs.find(job => job.id === Number(seen.form.get('id')))!;
      for (const [key, value] of seen.form) existing[key] = ['id', 'jobGroup', 'executorTimeout', 'executorFailRetryCount'].includes(key) ? Number(value) : value;
      existing.updateTime = 456; json({ code: 200, content: null }); return;
    }
    if (seen.route === '/jobinfo/start' || seen.route === '/jobinfo/stop') {
      state.jobs.find(job => job.id === Number(seen.form.get('id')))!.triggerStatus = seen.route.endsWith('/start') ? 1 : 0;
      json({ code: 200, content: null }); return;
    }
    if (seen.route === '/jobinfo/trigger') { json({ code: 200, content: null }); return; }
    if (seen.route === '/joblog/pageList') {
      assert.equal(seen.query.get('jobGroup'), '7'); const offset = Number(seen.query.get('start')), limit = Number(seen.query.get('length'));
      json({ recordsTotal: state.logs.length, recordsFiltered: state.logs.length, data: state.logs.slice(offset, offset + limit) }); return;
    }
    if (seen.route === '/joblog/logDetailPage') {
      assert.equal(seen.query.get('id'), String(state.logs[0].id)); response.writeHead(200, { 'Content-Type': 'text/html;charset=UTF-8' });
      response.end(`<html><script>\n    var triggerCode = '${state.logs[0].triggerCode}';\n    var handleCode = '${state.logs[0].handleCode}';\n    var executorAddress = '${state.logs[0].executorAddress}';\n    var triggerTime = '${state.detailEpoch}';\n    var logId = '${state.logs[0].id}';\n</script><script>throw new Error('scripts must never execute');</script></html>`); return;
    }
    if (seen.route === '/joblog/logDetailCat') {
      assert.equal(seen.query.get('executorAddress'), state.logs[0].executorAddress); assert.equal(seen.query.get('triggerTime'), String(typeof state.logs[0].triggerTime === 'number' ? state.logs[0].triggerTime : state.detailEpoch));
      const from = Number(seen.query.get('fromLineNum')); json({ code: 200, content: { fromLineNum: from, toLineNum: state.logLines.length, logContent: state.logLines.slice(from - 1).map(line => line + '\n').join(''), end: state.logEnd } }); return;
    }
    json({ code: 404 }, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  const address = server.address() as { port: number }, config = xxlJobConfiguration({ consoleUrl: `http://127.0.0.1:${address.port}/proxy/xxl-job-admin/`, username: 'fixture-reader', production: false, serviceBindings: [{ serviceId: 'fixture-service', ...scope }] });
  return { state, config, provider: createXxlJobProvider(options), credentials: { password: fixturePassword } };
}

test('XXL-JOB configuration rejects embedded secrets and clears bindings on website identity changes', () => {
  const config = xxlJobConfiguration({ consoleUrl: 'https://example.invalid:443/proxy/xxl-job-admin/', username: 'reader', serviceBindings: [{ serviceId: 'service', ...scope }] }), provider = createXxlJobProvider();
  assert.equal(config.production, true); assert.equal(config.apiVersion, 'auto'); assert.equal(config.consoleUrl, 'https://example.invalid/proxy/xxl-job-admin/');
  assert.equal(xxlJobApiBase(config.consoleUrl), 'https://example.invalid/proxy/xxl-job-admin');
  assert.equal(provider.authenticationTargetIdentity(config), provider.authenticationTargetIdentity({ ...config, consoleUrl: config.consoleUrl.slice(0, -1), serviceBindings: [] }));
  for (const consoleUrl of ['https://user:secret@example.invalid/admin', 'https://example.invalid/admin?token=value', 'https://example.invalid/admin#view', 'file:///admin', 'https://example.invalid/ad min']) assert.throws(() => xxlJobConfiguration({ ...config, consoleUrl }));
  assert.deepEqual(xxlJobConfiguration({ ...config, consoleUrl: 'https://other.invalid/admin', serviceBindings: config.serviceBindings }, config).serviceBindings, []);
  assert.deepEqual(xxlJobConfiguration({ ...config, username: 'another' }, config).serviceBindings, config.serviceBindings);
  assert.throws(() => xxlJobConfiguration({ ...config, serviceBindings: [...config.serviceBindings, ...config.serviceBindings] }), { code: 'xxl_job_input_invalid' });
});

test('XXL-JOB editable normalization is explicit and revisions ignore moving scheduling timestamps', () => {
  const candidate = normalizeXxlJobCreate({ jobDesc: '任务', author: 'reader', executorHandler: 'handler' });
  assert.equal(candidate.scheduleType, 'NONE'); assert.equal(candidate.executorFailRetryCount, 0); assert.equal(candidate.executorBlockStrategy, 'SERIAL_EXECUTION');
  for (const fields of [{ executorParam: 'a'.repeat(513) }, { scheduleType: 'FIX_DELAY' }, { executorTimeout: -1 }, { glueSource: 'script' }]) assert.throws(() => normalizeXxlJobCreate({ jobDesc: '任务', author: 'reader', executorHandler: 'handler', ...fields }));
  const detail: XxlJobDetail = { ...original, revision: xxlJobRevision(original) };
  assert.equal(xxlJobRevision(detail), xxlJobRevision({ ...detail, updateTime: 999, triggerNextTime: 1000 }));
  assert.notEqual(xxlJobRevision(detail), xxlJobRevision({ ...detail, executorParam: 'changed' }));
  assert.equal(mergeXxlJob(detail, { executorParam: '' }).alarmEmail, detail.alarmEmail);
  assert.throws(() => mergeXxlJob({ ...detail, glueType: 'GLUE_SHELL' }, {}), { code: 'xxl_job_glue_write_unsupported' });
});

test('XXL-JOB test verifies login and bounded executor metadata only', async t => {
  const f = await fixture(t), result = await f.provider.test(f.config, f.credentials);
  assert.equal(result.xxlJob?.readVerified, true); assert.equal(result.xxlJob?.executorCount, 1); assert.equal(f.state.writes, 0);
  assert.equal(f.state.requests.filter(request => request.route === '/jobgroup/pageList')[0].query.get('length'), '1');
  assert.equal(JSON.stringify(result).includes(password), false); assert.equal(JSON.stringify(result).includes(token), false);
});

test('XXL-JOB reads renew definite login rejections without following redirects', async t => {
  const f = await fixture(t); let rejected = false;
  f.state.override = (request, response) => { if (request.route !== '/jobinfo/pageList' || rejected) return false; rejected = true; response.writeHead(302, { Location: '/proxy/xxl-job-admin/toLogin' }); response.end(); return true; };
  assert.equal((await f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 })).id, 11); assert.equal(f.state.loginCount, 2);
  f.state.override = (request, response) => { if (request.route !== '/login') return false; response.writeHead(302, { Location: 'http://credential-sink.invalid/' }); response.end(password); return true; };
  await assert.rejects(() => f.provider.test(f.config, f.credentials), error => (error as { code: string }).code === 'xxl_job_redirect_rejected' && !String(error).includes(password));
  assert.equal(f.state.requests.some(request => request.route.includes('credential-sink')), false);
});

test('XXL-JOB task reads reject scope drift and report incomplete scans truthfully', async t => {
  const f = await fixture(t, { maxScanPages: 1 }); f.state.executorAppName = 'replaced-executor';
  await assert.rejects(() => f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 }), { code: 'xxl_job_binding_changed' });
  f.state.executorAppName = scope.appName; f.state.jobs = Array.from({ length: 101 }, (_, index) => ({ ...original, id: index + 20 }));
  await assert.rejects(() => f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 }), { code: 'xxl_job_query_incomplete' });
  f.state.jobs = [{ ...original, jobGroup: 99 }];
  await assert.rejects(() => f.provider.xxlJob.jobs(f.config, f.credentials, scope, {}), { code: 'xxl_job_scope_mismatch' }); assert.equal(f.state.writes, 0);
});

test('XXL-JOB creation stays stopped, confirms identity and executes the final local guard before writing', async t => {
  const f = await fixture(t); let guards = 0;
  const result = await f.provider.xxlJob.create(f.config, f.credentials, scope, { fields: { jobDesc: '新任务', author: 'reader', executorHandler: 'handler' }, beforeWrite: () => { guards++; assert.equal(f.state.requests.at(-1)?.route, '/jobgroup/loadById'); } });
  assert.equal(guards, 1); assert.equal(result.created, true); assert.equal(result.verified, true); assert.equal(result.job?.triggerStatus, 0); assert.equal(f.state.writes, 1);
  const write = f.state.requests.find(request => request.route === '/jobinfo/add')!; assert.equal(write.form.get('jobGroup'), '7'); assert.equal(write.form.get('glueType'), 'BEAN');
  await assert.rejects(() => f.provider.xxlJob.create(f.config, f.credentials, scope, { fields: { jobDesc: '另一个', author: 'reader', executorHandler: 'handler' }, beforeWrite: () => { throw Object.assign(new Error('local connection changed'), { code: 'connection_revision_conflict' }); } }), { code: 'connection_revision_conflict' }); assert.equal(f.state.writes, 1);
});

test('XXL-JOB partial update preserves unmodified fields and detects a change at the final recheck', async t => {
  const f = await fixture(t), current = await f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 });
  const result = await f.provider.xxlJob.update(f.config, f.credentials, scope, { jobId: 11, fields: { executorParam: '新参数' }, expectedJobRevision: current.revision });
  assert.equal(result.updated, true); assert.equal(result.verified, true); assert.equal(result.job?.scheduleConf, original.scheduleConf); assert.equal(result.job?.author, original.author);
  const latest = await f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 }); let reads = 0;
  f.state.override = (request) => { if (request.route === '/jobinfo/pageList' && ++reads === 2) f.state.jobs[0].jobDesc = '其他入口修改'; return false; };
  await assert.rejects(() => f.provider.xxlJob.update(f.config, f.credentials, scope, { jobId: 11, fields: { executorParam: '不能覆盖' }, expectedJobRevision: latest.revision }), { code: 'xxl_job_conflict' }); assert.equal(f.state.writes, 1);
});

test('XXL-JOB child-task additions are scoped while unchanged historical links do not block unrelated edits', async t => {
  const f = await fixture(t); f.state.jobs[0].childJobId = '99';
  const current = await f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 });
  assert.equal((await f.provider.xxlJob.update(f.config, f.credentials, scope, { jobId: 11, fields: { executorParam: 'ordinary-change' }, expectedJobRevision: current.revision })).verified, true);
  const latest = await f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 });
  await assert.rejects(() => f.provider.xxlJob.update(f.config, f.credentials, scope, { jobId: 11, fields: { childJobId: '100' }, expectedJobRevision: latest.revision }), { code: 'xxl_job_child_scope_mismatch' }); assert.equal(f.state.writes, 1);
});

test('XXL-JOB trigger preserves absent overrides, accepts explicit empty parameters and never invents run identity', async t => {
  const f = await fixture(t), current = await f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 });
  const first = await f.provider.xxlJob.action(f.config, f.credentials, scope, { jobId: 11, action: 'trigger', expectedJobRevision: current.revision });
  assert.equal(first.submitted, true); assert.equal(first.executionSucceeded, null); assert.equal(first.executionObserved, false); assert.equal(first.verified, false); assert.equal(first.executorParam, original.executorParam); assert.equal('logId' in first, false);
  await f.provider.xxlJob.action(f.config, f.credentials, scope, { jobId: 11, action: 'trigger', expectedJobRevision: current.revision, executorParam: '' });
  const requests = f.state.requests.filter(request => request.route === '/jobinfo/trigger'); assert.equal(requests[0].form.get('executorParam'), original.executorParam); assert.equal(requests[1].form.get('executorParam'), ''); assert.equal(requests[0].form.get('addressList'), '');
  await assert.rejects(() => f.provider.xxlJob.action(f.config, f.credentials, scope, { jobId: 11, action: 'trigger', expectedJobRevision: current.revision, addressList: 'http://untrusted.invalid' } as never), { code: 'connection_input_invalid' }); assert.equal(f.state.writes, 2);
});

test('XXL-JOB start/stop confirm scheduling state and do not claim termination or execution success', async t => {
  const f = await fixture(t), current = await f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 });
  const started = await f.provider.xxlJob.action(f.config, f.credentials, scope, { jobId: 11, action: 'start', expectedJobRevision: current.revision }); assert.equal(started.verified, true); assert.equal(started.job?.triggerStatus, 1);
  const stopped = await f.provider.xxlJob.action(f.config, f.credentials, scope, { jobId: 11, action: 'stop', expectedJobRevision: started.job!.revision }); assert.equal(stopped.verified, true); assert.match(stopped.warnings.join(''), /预读/u); assert.equal(stopped.executionSucceeded, null); assert.equal(stopped.executionObserved, false);
  assert.equal(f.state.requests.some(request => request.route.includes('Kill')), false);
});

test('XXL-JOB uncertain mutation results and rejected writes are never automatically repeated', async t => {
  const f = await fixture(t), current = await f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 });
  f.state.override = (request, response) => { if (request.route !== '/jobinfo/trigger') return false; response.destroy(); return true; };
  await assert.rejects(() => f.provider.xxlJob.action(f.config, f.credentials, scope, { jobId: 11, action: 'trigger', expectedJobRevision: current.revision }), { code: 'xxl_job_unreachable' }); assert.equal(f.state.writes, 1);
  f.state.override = (request, response) => { if (request.route !== '/jobinfo/add') return false; response.end(JSON.stringify({ code: 200, content: null })); return true; };
  await assert.rejects(() => f.provider.xxlJob.create(f.config, f.credentials, scope, { fields: { jobDesc: 'unknown', author: 'reader', executorHandler: 'handler' } }), { code: 'xxl_job_create_result_unknown' }); assert.equal(f.state.writes, 2);
  f.state.override = (request, response) => { if (request.route !== '/jobinfo/stop') return false; response.writeHead(302, { Location: '/proxy/xxl-job-admin/toLogin' }); response.end(); return true; };
  await assert.rejects(() => f.provider.xxlJob.action(f.config, f.credentials, scope, { jobId: 11, action: 'stop', expectedJobRevision: current.revision }), { code: 'xxl_job_access_denied' }); assert.equal(f.state.writes, 3);
});

test('XXL-JOB bounded log reads keep pending status and resume without skipping lines', async t => {
  const f = await fixture(t), page = await f.provider.xxlJob.logs(f.config, f.credentials, scope, { jobId: 11 }); assert.equal(page.items[0].handleResult, 'pending');
  const first = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101, maxLines: 1 }); assert.equal(first.content, '第一行\n'); assert.equal(first.nextFromLine, 2); assert.equal(first.truncated, true); assert.equal(first.ended, false);
  const rest = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101, fromLine: first.nextFromLine }); assert.equal(rest.content, '第二行\n第三行\n'); assert.equal(rest.nextFromLine, 4); assert.equal(rest.ended, false);
  const empty = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101, fromLine: 4 }); assert.equal(empty.content, ''); assert.equal(empty.nextFromLine, 4); assert.equal(empty.ended, false);
  f.state.logs[0].handleCode = 200; const complete = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101, fromLine: 4 }); assert.equal(complete.ended, true); assert.equal(complete.log.handleResult, 'success');
  f.state.logLines = ['a'.repeat(50)]; const longLine = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101, maxBytes: 10 }); assert.equal(longLine.availability, 'unavailable'); assert.equal(longLine.nextFromLine, 1); assert.equal(longLine.truncated, true);
});

test('XXL-JOB missing and unreachable log content keep known execution results', async t => {
  const f = await fixture(t); f.state.logs[0].handleCode = 200;
  f.state.override = (request, response) => { if (request.route !== '/joblog/logDetailCat') return false; response.end(JSON.stringify({ code: 200, content: { fromLineNum: 1, toLineNum: 0, logContent: 'readLog fail, logFile not exists', end: true } })); return true; };
  const missing = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101 }); assert.equal(missing.availability, 'missing'); assert.equal(missing.log.handleResult, 'success');
  f.state.override = (request, response) => { if (request.route !== '/joblog/logDetailCat') return false; response.end(JSON.stringify({ code: 500, msg: password + token })); return true; };
  const unavailable = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101 }); assert.equal(unavailable.availability, 'unreachable'); assert.equal(unavailable.log.handleResult, 'success'); assert.equal(JSON.stringify(unavailable).includes(password), false); assert.equal(JSON.stringify(unavailable).includes(token), false);
});

test('XXL-JOB response byte limits and hanging response bodies are bounded', async t => {
  const f = await fixture(t, { maxResponseBytes: 1500 }); f.state.jobs[0].executorParam = 'a'.repeat(1600);
  await assert.rejects(() => f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 }), { code: 'xxl_job_response_too_large' });
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return calls === 1 ? new Response(JSON.stringify({ code: 200 }), { headers: { 'Set-Cookie': 'XXL_JOB_LOGIN_IDENTITY=' + token } }) : new Response(new ReadableStream({ start() {} })); };
  const client = new XxlJobHttpClient(f.config, password, { fetch: fetcher, timeoutMs: 25 });
  await assert.rejects(() => client.request('/jobgroup/pageList'), { code: 'xxl_job_timeout' }); assert.equal(calls, 2);
});

test('XXL-JOB read outputs redact authentication echoes and preview uses remote times', async t => {
  const f = await fixture(t); f.state.jobs[0].jobDesc = 'Cookie: ' + token + ' password=' + password;
  const result = await f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 }); assert.equal(result.jobDesc.includes(password), false); assert.equal(result.jobDesc.includes(token), false);
  assert.equal(result.redacted, true); assert.match(result.revision, /^sha256-[a-f0-9]{64}$/u);
  const preview = await f.provider.xxlJob.preview(f.config, f.credentials, scope, { scheduleType: 'CRON', scheduleConf: original.scheduleConf }); assert.equal(preview.timeZone, 'admin-server'); assert.equal(preview.nextTriggerTimes.length, 2); assert.equal(f.state.writes, 0);
});

test('XXL-JOB existing GLUE observation hashes script changes without exposing its source', async t => {
  const f = await fixture(t); f.state.jobs[0] = { ...f.state.jobs[0], glueType: 'GLUE_SHELL', executorHandler: '', glueSource: 'echo first', glueUpdatetime: 100 };
  const first = await f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 }); assert.equal('glueSource' in first, false); assert.match(first.glueRevision!, /^sha256-/u);
  f.state.jobs[0].glueSource = 'echo changed';
  const second = await f.provider.xxlJob.get(f.config, f.credentials, scope, { jobId: 11 }); assert.notEqual(second.revision, first.revision);
  await assert.rejects(() => f.provider.xxlJob.action(f.config, f.credentials, scope, { jobId: 11, action: 'trigger', expectedJobRevision: first.revision }), { code: 'xxl_job_conflict' }); assert.equal(f.state.writes, 0);
});

test('XXL-JOB final redacted log bytes stay bounded even when a single-letter secret expands', async t => {
  const f = await fixture(t, {}, 'E'); f.state.logLines = ['E', 'E', 'next'];
  const first = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101, maxBytes: 11 });
  assert.equal(first.content, '[REDACTED]\n'); assert.equal(Buffer.byteLength(first.content), 11); assert.equal(first.nextFromLine, 2); assert.equal(first.truncated, true);
  const second = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101, fromLine: first.nextFromLine, maxBytes: 11 });
  assert.equal(second.content, '[REDACTED]\n'); assert.equal(Buffer.byteLength(second.content), 11); assert.equal(second.nextFromLine, 3);
  const final = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101, fromLine: second.nextFromLine, maxBytes: 11 }); assert.equal(final.content, 'next\n');
  const tooSmall = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101, maxBytes: 5 }); assert.equal(tooSmall.content, ''); assert.equal(tooSmall.nextFromLine, 1); assert.equal(tooSmall.truncated, true);
});

test('XXL-JOB log time filters validate dates and keep the Admin-local time basis explicit', async t => {
  const f = await fixture(t);
  const result = await f.provider.xxlJob.logs(f.config, f.credentials, scope, { from: '2024-02-29 00:00:00', to: '2024-03-01 00:00:00' });
  assert.equal(result.timeBasis, 'admin-server'); assert.match(result.warning!, /调度中心当地时间/u);
  assert.equal(f.state.requests.find(request => request.route === '/joblog/pageList')?.query.get('filterTime'), '2024-02-29 00:00:00 - 2024-03-01 00:00:00');
  for (const from of ['2023-02-29 00:00:00', '2024-04-31 00:00:00', '2024-00-01 00:00:00', '2024-01-01 24:00:00', '2024-01-01 00:60:00', '2024-01-01 00:00:60']) await assert.rejects(() => f.provider.xxlJob.logs(f.config, f.credentials, scope, { from, to: '2024-12-31 00:00:00' }), { code: 'xxl_job_input_invalid' });
  assert.equal(f.state.writes, 0);
});

test('XXL-JOB naive Admin log timestamps stay intact and detail-page epoch resolves log reads without guessing timezone', async t => {
  const f = await fixture(t); f.state.logs[0].triggerTime = '2026-10-14 01:02:03'; f.state.detailEpoch = 1_800_000_123_456;
  const page = await f.provider.xxlJob.logs(f.config, f.credentials, scope, { jobId: 11 });
  assert.equal(page.items[0].triggerTime, '2026-10-14 01:02:03'); assert.equal(page.items[0].timeBasis, 'admin-server');
  assert.equal(f.state.requests.some(request => request.route === '/joblog/logDetailPage'), false);
  const content = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101, maxLines: 1 });
  assert.equal(content.availability, 'available'); assert.equal(content.content, '第一行\n'); assert.equal(content.log.triggerTime, '2026-10-14 01:02:03');
  assert.equal(f.state.requests.find(request => request.route === '/joblog/logDetailCat')?.query.get('triggerTime'), '1800000123456');
  assert.equal(f.state.writes, 0);
});

test('XXL-JOB detail-page metadata must uniquely match the record and node before log content is requested', async t => {
  const f = await fixture(t); f.state.logs[0].triggerTime = '2026-10-14 01:02:03';
  const page = (logId: number, address: string) => `<script>\nvar executorAddress = '${address}';\nvar triggerTime = '1800000123456';\nvar logId = '${logId}';\n</script>`;
  for (const html of [page(102, f.state.logs[0].executorAddress), page(101, 'http://other-node.invalid'), page(101, f.state.logs[0].executorAddress) + page(101, f.state.logs[0].executorAddress), '<script>var triggerTime = computeSomething();</script>']) {
    f.state.override = (request, response) => { if (request.route !== '/joblog/logDetailPage') return false; response.end(html); return true; };
    const result = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101 }); assert.equal(result.availability, 'unavailable'); assert.equal(result.log.handleResult, 'pending');
  }
  assert.equal(f.state.requests.some(request => request.route === '/joblog/logDetailCat'), false);
});

test('XXL-JOB historical records remain readable after the current task was removed', async t => {
  const f = await fixture(t); f.state.jobs = [];
  const page = await f.provider.xxlJob.logs(f.config, f.credentials, scope, { jobId: 11 }); assert.equal(page.items[0].jobId, 11);
  const content = await f.provider.xxlJob.log(f.config, f.credentials, scope, { jobId: 11, logId: 101 }); assert.equal(content.availability, 'available'); assert.equal(content.log.jobId, 11);
  assert.equal(f.state.requests.some(request => request.route === '/jobinfo/pageList'), false);
  f.state.logs[0].jobGroup = 99;
  await assert.rejects(() => f.provider.xxlJob.logs(f.config, f.credentials, scope, { jobId: 11 }), { code: 'xxl_job_scope_mismatch' }); assert.equal(f.state.writes, 0);
});

test('XXL-JOB credentials containing the redaction marker are hidden completely and repeated sanitization is stable', async t => {
  const secret = 'prefix[REDACTED]suffix', cookieSecret = 'cookie[REDACTED]secret'; let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return calls === 1 ? new Response(JSON.stringify({ code: 200 }), { headers: { 'Set-Cookie': 'XXL_JOB_LOGIN_IDENTITY=' + cookieSecret } }) : new Response(JSON.stringify({ recordsTotal: 0, recordsFiltered: 0, data: [] })); };
  const client = new XxlJobHttpClient(xxlJobConfiguration({ consoleUrl: 'http://fixture.invalid/admin', username: 'fixture' }), secret, { fetch: fetcher });
  await client.request('/jobgroup/pageList');
  const result = client.sanitize('echo ' + secret + ' and ' + cookieSecret); assert.equal(result.includes(secret), false); assert.equal(result.includes(cookieSecret), false); assert.equal(result, 'echo [REDACTED] and [REDACTED]'); assert.equal(client.sanitize(result), result);
});
