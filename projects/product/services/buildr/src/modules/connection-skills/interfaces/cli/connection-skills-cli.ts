import fs from 'node:fs';
import path from 'node:path';
import type { ConnectionSkillsApplication } from '../../application/connection-skills-application.ts';
import { failure, object } from '../../domain/instance.ts';
function readInput(file: string, limit = 4 * 1024 * 1024): Buffer {
  const fd = file === '-' ? 0 : fs.openSync(path.resolve(file), 'r');
  try {
    const chunks: Buffer[] = []; let total = 0;
    for (;;) { const block = Buffer.alloc(64 * 1024); const count = fs.readSync(fd, block); if (!count) break; total += count; if (total > limit) throw failure('connection_skill_input_large', '输入超过大小限制。', 400); chunks.push(block.subarray(0, count)); }
    return Buffer.concat(chunks);
  } finally { if (fd !== 0) fs.closeSync(fd); }
}
export function createConnectionSkillsCli(application: ConnectionSkillsApplication) {
  return [Object.freeze({ key: 'connection-skill', surface: 'agent-machine', summary: '发现连接技能、管理共享实例和个人认证，并运行技能自带程序。',
    help: [
      'Usage: buildr connection-skill <definitions list|definitions inspect|list|get|create|update|remove|auth authorize|auth set|auth clear|auth use-team|auth migrate|auth relocate|check|help|test|discover|run> [--target <workspace>] [--json]',
      'get/update/remove/check/help/test/run --connection <id>; definitions inspect --asset <assetIdentity> --definition <definitionId>',
      'create/update/auth/test/discover --file <json-file|->; config/auth 仅从文件或标准输入读取，不在参数中传密码。',
      'run --connection <id> --expected-revision <revision> --program <id> [--context compare=<id>@<revision>] [--timeout-ms <10..300000>] -- <专业参数...>',
      'run 默认时限60000毫秒；专业等待窗口须为请求、清理和输出预留时间，结果仍在程序退出后完整遮蔽。',
      'run 的标准输入完整交给专业程序；多个上下文分别明确编号和观察版本。',
      'help 来自所选程序，不交付认证；list/get 仅返回遮蔽认证的观察，源已登记不代表程序已安装或连接已验证。',
      'auth migrate 仅在进程内转移完整组；auth relocate 将本 profile 的旧个人密文迁入工作空间 .buildr/local，均以 --file 提供准确观察，不输出秘密。',
      'auth authorize|ensure --connection <id> --file <json-file|-> 输入 {expected:{teamRevision,localRevision,definitionRevision},parameters?:{声明参数},browserMode?:headless|interactive}；ensure只准备认证，不执行或重放业务动作。',
      'browser list|inspect|create|adopt|reset --file <json-file|->：共享配置本机管理，输入{id,expectedRevision,directory?}；重置整个共享配置还须confirmSharedReset:true。',
    ], match: ({ domain }: { domain?: string }) => domain === 'connection-skill',
    async run(_runtime: unknown, context: { argv: string[] }) {
      const args = context.argv.slice(3), action = args.shift() || 'list';
      const subaction = ['definitions', 'auth', 'browser'].includes(action) ? args.shift() : null;
      const flags = new Map<string, string>(), contexts: Record<string, { id: string; revision: string }> = {};
      let professional: string[] = [];
      const actionFlags: Record<string, string[]> = {
        definitions: ['--asset', '--definition'], list: [], get: ['--connection'], create: ['--file'], update: ['--connection', '--file'], remove: ['--connection', '--file', '--expected-revision'],
        browser: ['--file'], auth: ['--connection', '--file'], check: ['--connection', '--program'], help: ['--connection', '--program'], test: ['--connection', '--file'], discover: ['--connection', '--file', '--hook'], run: ['--connection', '--expected-revision', '--program', '--context', '--timeout-ms'],
      };
      if (!actionFlags[action] || action === 'definitions' && !['list', 'inspect'].includes(subaction || '') || action === 'auth' && !['authorize', 'ensure', 'set', 'clear', 'use-team', 'migrate', 'relocate'].includes(subaction || '')) throw failure('connection_skill_cli_invalid', '未知连接技能动作。', 400);
      if (action === 'browser' && !['list', 'inspect', 'create', 'adopt', 'reset'].includes(subaction || '')) throw failure('connection_skill_cli_invalid', '未知共享浏览器动作。', 400);
      const allowed = ['--target', '--json', ...actionFlags[action]!];
      while (args.length) {
        const flag = args.shift()!;
        if (flag === '--' && action === 'run') { professional = args; break; }
        if (!allowed.includes(flag) || (flags.has(flag) && flag !== '--context')) throw failure('connection_skill_cli_invalid', '未知或重复参数。', 400);
        if (flag === '--json') { flags.set(flag, 'true'); continue; }
        const value = args.shift(); if (!value || value.startsWith('--')) throw failure('connection_skill_cli_invalid', '参数缺少值。', 400);
        if (flag === '--context') { const match = value.match(/^([A-Za-z][A-Za-z0-9_-]*)=([A-Za-z0-9_-]+)@(opaque-[a-f0-9]{64})$/); if (!match || contexts[match[1]!]) throw failure('connection_skill_cli_invalid', '附加上下文需 name=id@revision 且名称不重复。', 400); contexts[match[1]!] = { id: match[2]!, revision: match[3]! }; }
        else flags.set(flag, value);
      }
      const root = path.resolve(flags.get('--target') || process.cwd()), id = flags.get('--connection') || '', program = flags.get('--program') || 'cli';
      const timeout = flags.get('--timeout-ms');
      if (timeout !== undefined && (!/^\d+$/.test(timeout) || !Number.isSafeInteger(Number(timeout)) || Number(timeout) < 10 || Number(timeout) > 300_000)) throw failure('connection_skill_cli_invalid', '--timeout-ms 必须为10到300000的整数毫秒。', 400);
      let input: Record<string, unknown> = {};
      if (flags.has('--file')) { try { input = object(JSON.parse(readInput(flags.get('--file')!, 256 * 1024).toString('utf8'))); } catch { throw failure('connection_skill_cli_input_invalid', '连接输入必须是有界的 JSON 对象。', 400); } }
      if (['create', 'update', 'auth'].includes(action) && !flags.has('--file')) throw failure('connection_skill_cli_invalid', '此动作需要 --file 提供完整输入。', 400);
      if (action === 'definitions' && subaction === 'inspect' && (!flags.has('--asset') || !flags.has('--definition'))) throw failure('connection_skill_cli_invalid', '查看定义需要明确 --asset 和 --definition。', 400);
      if (action === 'remove' && flags.has('--expected-revision')) {
        if (input.expected !== undefined) throw failure('connection_skill_cli_invalid', '不能重复提供观察版本。', 400);
        const current = application.get(root, id).instance;
        if (current.revision !== flags.get('--expected-revision')) throw failure('connection_skill_revision_conflict', '连接已变化，请重新读取。');
        input.expected = { teamRevision: current.teamRevision };
      }
      if (['test', 'discover'].includes(action) && flags.has('--file')) {
        if (id && input.id !== undefined && input.id !== id) throw failure('connection_skill_cli_invalid', '参数和文件中的实例编号不一致。', 400);
        if (id) input.id = id;
        if (flags.has('--hook')) { if (input.hook !== undefined && input.hook !== flags.get('--hook')) throw failure('connection_skill_cli_invalid', '发现槽位不一致。', 400); input.hook = flags.get('--hook'); }
      }
      let result: unknown;
      if (action === 'browser') result = await application.browserProfiles(root, subaction!, input);
      else if (action === 'definitions') { const catalog = application.definitions(root); result = subaction === 'inspect' ? { ...catalog, definitions: catalog.definitions.filter(entry => entry.skill.assetIdentity === flags.get('--asset') && entry.definition.definitionId === flags.get('--definition')) } : catalog; }
      else if (action === 'list') result = application.list(root);
      else if (action === 'get') result = application.get(root, id);
      else if (action === 'create') result = application.save(root, null, input);
      else if (action === 'update') result = application.save(root, id, input);
      else if (action === 'remove') result = application.remove(root, id, input);
      else if (action === 'auth') {
        if (subaction === 'authorize' || subaction === 'ensure') {
          const controller = new AbortController(), abort = () => controller.abort();
          process.once('SIGINT', abort); process.once('SIGTERM', abort);
          try { result = await (subaction === 'ensure' ? application.ensureAuthentication(root, id, input, { signal: controller.signal }) : application.authorize(root, id, input, { signal: controller.signal })); }
          finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
        }
        else if (subaction === 'migrate') result = application.migrateAuth(root, id, input);
        else if (subaction === 'relocate') result = application.relocateAuth(root, id, input);
        else {
          if (subaction === 'use-team') {
            const sources = application.get(root, id).instance.definition?.definition.authentication.allowedSources;
            if (sources && !sources.includes('team')) throw failure('connection_skill_auth_source_denied', '此接入只允许个人认证；清除个人认证请使用 auth clear。');
          }
          result = application.saveAuth(root, id, { ...input, intent: subaction === 'set' ? 'replace' : 'remove' });
        }
      }
      else if (action === 'check') result = application.check(root, id, program);
      else if (action === 'help') result = await application.help(root, id, program);
      else if (action === 'test' || action === 'discover') {
        if (id && !flags.has('--file')) {
          const view = application.get(root, id).instance;
          input = { id, binding: view.binding, config: view.config, expected: { teamRevision: view.teamRevision, localRevision: view.localRevision, definitionRevision: view.definitionRevision }, authentication: { source: view.authentication.source, intent: 'keep' }, hook: flags.get('--hook') };
        }
        result = await application.hook(root, input, action);
      } else if (action === 'run') {
        if (!flags.get('--expected-revision')) throw failure('connection_skill_cli_invalid', '运行需要已观察的 --expected-revision。', 400);
        result = await application.run(root, { id, expectedRevision: flags.get('--expected-revision')!, program, args: professional, contexts, ...(timeout === undefined ? {} : { timeoutMs: Number(timeout) }), input: process.stdin.isTTY ? undefined : readInput('-') });
      } else throw failure('connection_skill_cli_invalid', '未知连接技能动作。', 400);
      const output = { schemaVersion: 'buildr.connection-skill-result/v1', operation: action, ...object(result) };
      process.stdout.write(JSON.stringify(output, null, 2) + '\n'); return output;
    },
  })];
}
