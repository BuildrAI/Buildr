#!/usr/bin/env node
import { createKibanaOperations } from './lib/operations.mjs';
import { openContextChannel, selectedConfiguration } from './lib/context.mjs';
import { HELP, parseArguments, createResultFile, finishResultFile } from './lib/cli.mjs';

let channel, resultFile, action;
try {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.length === 1 && ['--help', 'help'].includes(argv[0])) process.stdout.write(HELP);
  else if (argv.length === 1 && argv[0] === '--version') process.stdout.write('kibana-connection 1.0.0\n');
  else if (argv.length === 1 && argv[0] === '--self-test') process.stdout.write(JSON.stringify({ status: 'success', checks: ['本机程序及标准库已加载'], limitations: ['未访问真实系统，未验证账号或日志'] }) + '\n');
  else {
    const parsed = parseArguments(argv); action = parsed.action;
    resultFile = createResultFile(parsed.resultFile);
    channel = openContextChannel();
    const context = await channel.ready, selected = selectedConfiguration(context), api = createKibanaOperations();
    let result;
    if (action === 'test') {
      const checked = await api.test(selected.config, selected.credentials);
      result = { status: 'success', checks: ['已读取选定数据视图及当前字段', '同步搜索通道已通过零文档查询'], warnings: checked.kibana.warnings, limitations: ['只证明当前账号在所选视图及最近 15 分钟的最小查询通道，不证明任意日志或业务正常'] };
    } else if (action === 'discover') {
      const found = await api.views(selected.config, selected.credentials, { limit: 500 });
      // Option identities are never rewritten by display redaction.
      if (found.redactionCount) throw Object.assign(new Error('发现结果含需隐藏的身份，未交付可能改变编号的选项。'), { code: 'kibana_discovery_identity_unavailable', status: 422 });
      result = { status: 'success', checks: ['已读取当前账号可见数据视图'], options: found.dataViews.map(view => ({ value: view.id, label: view.name + ' · ' + view.title })), truncated: found.limitReached, warnings: found.warnings, limitations: found.limitReached ? ['本次最多返回 500 项，更多视图请使用专业 views 分页发现'] : [] };
    } else {
      const found = await api[action](selected.config, selected.credentials, parsed.input);
      result = { schemaVersion: 'kibana.connection-result/v1', operation: action, status: found.incomplete || found.limitReached ? 'unknown' : 'success', ...selected.observation, ...found, limitations: found.incompleteReasons || (found.limitReached ? ['page_limit_reached'] : []) };
    }
    if (Buffer.byteLength(JSON.stringify(result)) > 4 * 1024 * 1024) throw Object.assign(new Error('专业结果超过 4 MiB，请缩小范围、字段或正文大小。'), { code: 'kibana_output_limit', status: 413 });
    finishResultFile(resultFile, result); resultFile = null;
    process.stdout.write(JSON.stringify(result) + '\n');
  }
} catch (error) {
  const code = typeof error?.code === 'string' && /^(?:kibana|connection)_/u.test(error.code) ? error.code : 'kibana_operation_failed';
  const message = code === 'kibana_operation_failed' ? '操作未完成；未输出远端错误正文或本机异常详情。' : error.message;
  const result = { schemaVersion: 'kibana.connection-result/v1', operation: action || 'input', status: ['kibana_timeout', 'kibana_unreachable'].includes(code) ? 'unknown' : 'failure', checks: [], diagnostics: [message], error: { code, message, status: error.status || 400 }, limitations: ['未据此证明目标日志完整或业务正常'] };
  finishResultFile(resultFile, result); resultFile = null;
  process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = 1;
} finally { channel?.close(); }
