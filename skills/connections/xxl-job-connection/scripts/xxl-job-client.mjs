#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { connectionFailure } from './lib/errors.mjs';
import { openContextChannel } from './lib/context.mjs';
import { createXxlJobWorkflow } from './lib/workflow.mjs';
import { createOutputProtection } from './lib/output.mjs';

const OBSERVATION = ['--expected-revision', '--expected-job-revision', '--authorization-file'];
const FLAGS = {
  test: [], executors: ['--offset', '--limit', '--app-name'], resolve: ['--service', '--app-name'], bind: ['--service', '--app-name', '--expected-revision', '--expected-binding-revision'],
  jobs: ['--service', '--offset', '--limit', '--description', '--handler', '--author', '--status'], get: ['--service', '--job'],
  prepare: ['--service', '--action', '--job', '--job-file', '--executor-param-file'],
  create: ['--service', '--job-file', '--expected-revision', '--authorization-file'], update: ['--service', '--job', '--job-file', ...OBSERVATION],
  start: ['--service', '--job', ...OBSERVATION], stop: ['--service', '--job', ...OBSERVATION], trigger: ['--service', '--job', '--executor-param-file', ...OBSERVATION],
  logs: ['--service', '--offset', '--limit', '--job', '--log-status', '--from', '--to'], log: ['--service', '--job', '--log', '--from-line', '--max-lines', '--max-bytes'],
  preview: ['--service', '--schedule-type', '--schedule-conf'],
};
const WRITES = ['create', 'update', 'start', 'stop', 'trigger'];
const HELP = [
  'xxl-job-client.mjs <test|executors|resolve|bind|jobs|get|prepare|create|update|start|stop|trigger|logs|log|preview> [--json]；通过 Buildr 已明确选择的连接执行。',
  'test 只验证登录与有界执行器读取；executors: [--app-name <actual-appname>] [--offset <0..>] [--limit <1..100>]，仅返回一页。',
  '其它动作必须 --service <registered-service-uuid>；程序用已安装 buildr assets inspect --target <context.workspace.root> --json 核对服务。',
  'resolve: --service <uuid> --app-name <actual-appname>；核实唯一远端执行器及当前本机关联，不保存。',
  'bind: --service <uuid> --app-name <actual-appname> --expected-revision <revision> --expected-binding-revision <revision|absent>；明确授权后保存本机专业关联，不写远端。',
  'jobs: --service <uuid> [--description <text>] [--handler <name>] [--author <text>] [--status <0|1>] [--offset <0..>] [--limit <1..100>]；get: --service <uuid> --job <id>。',
  'prepare: --service <uuid> --action <create|update|start|stop|trigger> [--job <id>] [--job-file <json-file|->] [--executor-param-file <text-file|->]；diff 是同一只读动作别名，返回完整候选、差异、版本和 authorizationScope。',
  'create: --service <uuid> --job-file <json-file|-> --expected-revision <revision>；BEAN 模式必填 jobDesc/author/executorHandler，创建保持停止。',
  'update: --service <uuid> --job <id> --job-file <json-file|-> --expected-revision <revision> --expected-job-revision <digest>；局部更新，保留其它字段和启停状态。',
  'start|stop|trigger: --service <uuid> --job <id> --expected-revision <revision> --expected-job-revision <digest>；trigger 可加 --executor-param-file，未传则沿用完整参数，空文件表示空参数。',
  '生产实际操作还需 --authorization-file <json-file|->，内容 {source,statement,scope}，scope 取本次 prepare.authorizationScope；同一用户依据仅限一次尝试。',
  'logs: --service <uuid> [--job <id>] [--log-status <1|2|3>] [--from <yyyy-MM-dd HH:mm:ss> --to <yyyy-MM-dd HH:mm:ss>] [--offset <0..>] [--limit <1..100>]；时间使用调度中心当地时间。',
  'log: --service <uuid> --job <id> --log <id> [--from-line <1..>] [--max-lines <1..1000>] [--max-bytes <1..262144>]；按 nextFromLine 续读，不接受任意节点地址。',
  'preview: --service <uuid> --schedule-type <NONE|CRON|FIX_RATE> --schedule-conf <configuration>；预演由调度中心计算。',
  '只适配 2.3.0；写前核对本机上下文及远端身份/任务版本，不提供原子比较并交换（CAS）。受理、回读与业务执行分别报告。结果未知先调查，不自动重发。',
  '不提供在线脚本（GLUE）编辑、删除任务、终止运行、清理日志或任意请求。认证只从私有进程间通信（IPC）取得，不能用参数、环境或标准输入注入。',
];
const invalid = message => { throw connectionFailure('xxl_job_cli_invalid', message); };
function readText(file, maximum) {
  try {
    const fd = file === '-' ? 0 : fs.openSync(path.resolve(file), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      if (fd !== 0 && !fs.fstatSync(fd).isFile()) throw new Error('not regular');
      const chunks = []; let bytes = 0;
      while (true) { const block = Buffer.alloc(Math.min(8192, maximum + 1 - bytes)); const count = fs.readSync(fd, block, 0, block.length, null); if (!count) break; bytes += count; if (bytes > maximum) throw new Error('too large'); chunks.push(block.subarray(0, count)); }
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
    } finally { if (fd !== 0) fs.closeSync(fd); }
  } catch { throw connectionFailure('xxl_job_cli_input_invalid', '输入文件无法安全读取、不是 UTF-8 或超过容量限制。'); }
}
function readJson(file, maximum) { try { return JSON.parse(readText(file, maximum)); } catch (error) { if (error.code) throw error; throw connectionFailure('xxl_job_cli_input_invalid', '候选或授权文件必须为合法 JSON。'); } }
function parse(args) {
  let [action = 'help', ...rest] = args;
  if (['--version', '--help', '-h', 'help'].includes(action)) { if (rest.some(value => value !== '--json')) invalid('帮助或版本参数无效。'); return { action }; }
  if (action === 'diff') action = 'prepare';
  if (action === 'local') action = 'bind';
  if (!Object.hasOwn(FLAGS, action)) invalid('未知 XXL-JOB 操作。');
  const values = new Map();
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    if (values.has(flag) || ![...FLAGS[action], '--json'].includes(flag)) invalid('参数无效或重复。');
    if (flag === '--json') { values.set(flag, true); continue; }
    const value = rest[++index]; if (value === undefined || value.startsWith('--')) invalid('参数缺少值。'); values.set(flag, value);
  }
  const require = (...names) => { for (const name of names) if (!values.has(name) || !values.get(name)) invalid('操作缺少必需参数：' + name); };
  if (!['test', 'executors'].includes(action)) require('--service');
  if (['resolve', 'bind'].includes(action)) require('--app-name');
  if (['bind', ...WRITES].includes(action)) require('--expected-revision');
  if (action === 'bind') require('--expected-binding-revision');
  if (['get', 'update', 'start', 'stop', 'trigger', 'log'].includes(action)) require('--job');
  if (['update', 'start', 'stop', 'trigger'].includes(action)) require('--expected-job-revision');
  if (['create', 'update'].includes(action)) require('--job-file');
  if (action === 'log') require('--log');
  if (action === 'preview') { require('--schedule-type'); if (!values.has('--schedule-conf')) invalid('预演必须提供 --schedule-conf；NONE 可提供空值。'); }
  if (action === 'prepare') {
    require('--action'); const planned = values.get('--action'); if (!WRITES.includes(planned)) invalid('准备动作无效。');
    if (planned !== 'create') require('--job'); else if (values.has('--job')) invalid('创建准备不接受 --job。');
    if (['create', 'update'].includes(planned)) require('--job-file');
    if (!['create', 'update'].includes(planned) && values.has('--job-file') || planned !== 'trigger' && values.has('--executor-param-file')) invalid('候选文件或参数不适用于本次准备。');
  }
  const input = {};
  for (const [flag, key] of Object.entries({ '--offset': 'offset', '--limit': 'limit', '--job': 'jobId', '--log': 'logId', '--status': 'triggerStatus', '--log-status': 'logStatus', '--from-line': 'fromLine', '--max-lines': 'maxLines', '--max-bytes': 'maxBytes' })) if (values.has(flag)) {
    const value = values.get(flag); if (!/^(0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(Number(value))) invalid('数值参数必须为非负安全整数。'); input[key] = Number(value);
  }
  for (const [flag, key] of Object.entries({ '--service': 'serviceId', '--app-name': 'appName', '--description': 'jobDesc', '--handler': 'executorHandler', '--author': 'author', '--from': 'from', '--to': 'to', '--action': 'action', '--expected-revision': 'expectedRevision', '--expected-job-revision': 'expectedJobRevision', '--expected-binding-revision': 'expectedBindingRevision', '--schedule-type': 'scheduleType', '--schedule-conf': 'scheduleConf' })) if (values.has(flag)) input[key] = values.get(flag);
  if (['--job-file', '--executor-param-file', '--authorization-file'].filter(flag => values.get(flag) === '-').length > 1) invalid('候选、参数和授权不能同时占用标准输入。');
  return { action, values, input };
}
let channel;
const protection = createOutputProtection();
try {
  const { action, values, input } = parse(process.argv.slice(2));
  let result;
  if (action === '--version') result = { version: '1.0.0', contextProtocol: 'buildr.connection-context/v1' };
  else if (['help', '--help', '-h'].includes(action)) result = { help: HELP };
  else {
    channel = openContextChannel(); const context = await channel.ready;
    const workflow = createXxlJobWorkflow(context, { protection, revalidate: channel.revalidate });
    if (values.has('--job-file')) input.fields = readJson(values.get('--job-file'), 64 * 1024);
    if (values.has('--executor-param-file')) input.executorParam = readText(values.get('--executor-param-file'), 16 * 1024);
    if (values.has('--authorization-file')) input.authorization = readJson(values.get('--authorization-file'), 32 * 1024);
    result = WRITES.includes(action) ? await workflow.execute(action, input) : ['test'].includes(action) ? await workflow.test() : await workflow[action](input);
  }
  const output = JSON.stringify(protection.visit({ schemaVersion: 'xxl-job.connection-result/v1', operation: action, ...result }));
  if (Buffer.byteLength(output) > 4 * 1024 * 1024) throw connectionFailure('xxl_job_output_too_large', '本次输出超过 4 MiB，请缩小查询范围。', 413);
  await new Promise(resolve => process.stdout.write(output + '\n', resolve));
} catch (error) {
  const message = error.code ? error.message : 'XXL-JOB 程序未完成，请保留现场并核对当前事实。';
  const status = ['xxl_job_write_outcome_unknown', 'xxl_job_create_result_unknown'].includes(error.code) ? 'unknown' : 'failure';
  const output = protection.visit({ schemaVersion: 'xxl-job.connection-result/v1', ok: false, status, checks: [], diagnostics: [message], limitations: [], observedAt: new Date().toISOString(), error: { code: error.code || 'xxl_job_execution_failed', message, status: error.status || 500 } });
  await new Promise(resolve => process.stdout.write(JSON.stringify(output) + '\n', resolve)); process.exitCode = 1;
} finally { if (channel) channel.close(); else if (process.connected) process.disconnect(); }
