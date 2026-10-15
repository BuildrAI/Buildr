#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { connectionFailure } from './lib/errors.mjs';
import { NACOS_CONTENT_BYTES } from './lib/configuration.mjs';
import { openContextChannel } from './lib/context.mjs';
import { createNacosWorkflow } from './lib/workflow.mjs';
import { createOutputProtection } from './lib/output.mjs';

const FLAGS = {
  test: [], namespaces: [], list: ['--data-id', '--group', '--page', '--page-size'], get: ['--data-id', '--group', '--output-file'],
  diff: ['--data-id', '--group', '--content-file', '--compare-context', '--compare-data-id', '--compare-group'],
  publish: ['--data-id', '--group', '--content-file', '--expected-revision', '--expected-md5', '--authorization-file'],
};
const HELP = [
  'nacos-client.mjs <test|namespaces|list|get|diff|publish> [--json]；通过 Buildr 所选连接的通用启动入口执行。',
  'list: [--data-id <filter>] [--group <filter>] [--page <1..>] [--page-size <1..100>]，只读取一页。',
  'get: --data-id <id> [--group <group>] [--output-file <new-file>]；完整原文写入受限本机新文件，不回显、不覆盖既有文件。',
  'diff: --data-id <id> [--group <group>] (--content-file <file|-> | --compare-context <name> [--compare-data-id <id>] [--compare-group <group>])。',
  '第二上下文由通用启动入口明确注入，专业程序不按名称或编号自行取得其他认证。',
  'publish: --data-id <id> [--group <group>] --content-file <file|-> --expected-revision <revision> --expected-md5 <md5> [--authorization-file <json-file|->]，只发布已存在配置。',
  '生产每次实际发布必须展示目标及差异并取得具体用户授权；授权文件为 {source,statement,scope}，scope 使用此次 diff.authorizationScope。',
  '相同内容不发布。写前核对本机上下文、远端完整正文与格式；原生比较并交换（CAS）或二次读取的实际保护范围分别说明。',
  '受理、内容回读、服务加载与业务成功是不同事实；超时或未知结果先调查，不盲目重发。',
  '认证只从私有进程通道取得。专业标准输入可提交内容或授权，但两者不能同时占用同一标准输入。',
];
function parse(argv) {
  const [action = 'help', ...args] = argv;
  if (['help', '--help', '-h', '--version'].includes(action)) {
    if (args.some(value => value !== '--json')) throw connectionFailure('nacos_cli_invalid', '帮助或版本参数无效。');
    return { action };
  }
  if (!Object.hasOwn(FLAGS, action)) throw connectionFailure('nacos_cli_invalid', '未知 Nacos 操作。');
  const values = new Map();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (values.has(flag) || ![...FLAGS[action], '--json'].includes(flag)) throw connectionFailure('nacos_cli_invalid', '参数无效或重复。');
    if (flag === '--json') { values.set(flag, true); continue; }
    const value = args[++index];
    if (value === undefined || value.startsWith('--')) throw connectionFailure('nacos_cli_invalid', '参数缺少值。');
    values.set(flag, value);
  }
  if (['get', 'diff', 'publish'].includes(action) && !values.has('--data-id')) throw connectionFailure('nacos_cli_invalid', '配置操作必须明确 --data-id。');
  if (action === 'publish' && ['--content-file', '--expected-revision', '--expected-md5'].some(flag => !values.has(flag))) throw connectionFailure('nacos_cli_invalid', '发布必须提供内容、连接观察版本和配置摘要。');
  if (action === 'diff' && (values.has('--content-file') === values.has('--compare-context') || !values.has('--compare-context') && (values.has('--compare-data-id') || values.has('--compare-group')))) throw connectionFailure('nacos_cli_invalid', '比较必须选择候选文件或明确第二上下文。');
  if (values.get('--content-file') === '-' && values.get('--authorization-file') === '-') throw connectionFailure('nacos_cli_invalid', '内容与授权不能同时占用标准输入。');
  const input = {};
  for (const [flag, key] of Object.entries({ '--data-id': 'dataId', '--group': 'group', '--page': 'pageNo', '--page-size': 'pageSize', '--compare-context': 'compareContext', '--compare-data-id': 'compareDataId', '--compare-group': 'compareGroup', '--expected-revision': 'expectedRevision', '--expected-md5': 'expectedMd5' })) {
    if (!values.has(flag)) continue;
    let value = values.get(flag);
    if (['pageNo', 'pageSize'].includes(key)) {
      if (!/^[1-9][0-9]*$/u.test(value) || !Number.isSafeInteger(Number(value))) throw connectionFailure('nacos_cli_invalid', '页码和页大小必须为正整数。');
      value = Number(value);
    }
    input[key] = value;
  }
  return { action, values, input };
}
function readText(filename, limit) {
  try {
    const descriptor = filename === '-' ? 0 : fs.openSync(path.resolve(filename), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      if (descriptor !== 0 && !fs.fstatSync(descriptor).isFile()) throw new Error('not a file');
      const chunks = []; let bytes = 0;
      const block = Buffer.alloc(64 * 1024);
      for (;;) {
        const length = fs.readSync(descriptor, block, 0, Math.min(block.length, limit - bytes + 1), null);
        if (!length) break;
        bytes += length;
        if (bytes > limit) throw new Error('input limit');
        chunks.push(Buffer.from(block.subarray(0, length)));
      }
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
    } finally { if (descriptor !== 0) fs.closeSync(descriptor); }
  } catch { throw connectionFailure('nacos_cli_input_invalid', '输入文件不可安全读取、无效 UTF-8 或超过大小限制。'); }
}

let channel;
const protection = createOutputProtection();
try {
  const { action, values, input } = parse(process.argv.slice(2));
  let result;
  if (action === '--version') result = { version: '1.0.0', contextProtocol: 'buildr.connection-context/v1' };
  else if (['help', '--help', '-h'].includes(action)) result = { help: HELP };
  else {
    channel = openContextChannel();
    const context = await channel.ready;
    const workflow = createNacosWorkflow(context, { protection, revalidate: channel.revalidate });
    if (values.has('--content-file')) input.content = readText(values.get('--content-file'), NACOS_CONTENT_BYTES);
    if (values.has('--authorization-file')) {
      try { input.authorization = JSON.parse(readText(values.get('--authorization-file'), 32 * 1024)); }
      catch (error) { if (error.code) throw error; throw connectionFailure('nacos_cli_input_invalid', '授权文件必须为合法 JSON。'); }
    }
    result = action === 'test' || action === 'namespaces' ? await workflow[action]() : action === 'get' ? await workflow.get(input, values.get('--output-file')) : await workflow[action](input);
  }
  const output = protection.visit({ schemaVersion: 'nacos.connection-result/v1', operation: action, ...result });
  await new Promise(resolve => process.stdout.write(JSON.stringify(output) + '\n', resolve));
} catch (error) {
  const message = error.code ? error.message : 'Nacos 程序未完成，请保留现场并核对当前事实。';
  const output = protection.visit({ schemaVersion: 'nacos.connection-result/v1', ok: false, status: error.code === 'nacos_publish_outcome_unknown' ? 'unknown' : 'failure', checks: [], diagnostics: [message], limitations: [], observedAt: new Date().toISOString(), error: { code: error.code || 'nacos_execution_failed', message, status: error.status || 500 } });
  await new Promise(resolve => process.stdout.write(JSON.stringify(output) + '\n', resolve));
  process.exitCode = 1;
} finally {
  if (channel) channel.close();
  else if (process.connected) process.disconnect();
}
