import path from 'node:path';
import process from 'node:process';
import type { CodeApplication, CodeInput } from '../../application/code-application.ts';
import type { CodeSourceControlInput } from '../../application/source-control-model.ts';
import { codeFailure } from '../../infrastructure/code-file-reader.ts';
import { CODE_HTTP_PATHS, CODE_HTTP_REQUESTS } from '../http/code-http-contracts.ts';

export function createCodeCliContributions(application: CodeApplication) {
  return (Object.keys(CODE_HTTP_PATHS) as Array<keyof typeof CODE_HTTP_PATHS>).map(operation => {
    const command = CODE_HTTP_PATHS[operation];
    return Object.freeze({
      key: 'code ' + command, surface: 'agent-machine', summary: '按已登记代码库、比较层及固定版本只读查看代码，不执行 Git 或文件写入。',
      help: ['Usage: buildr code ' + command + ' [--repository <id>] [--checkout <opaque-id>] [--worktree <opaque-id>] [--task <id>] [--commit <full-sha>] [--path <relative>] [--area unstaged|staged|untracked|commit] [--branch <local-name>] [--query <text>] [--limit <1-200>] [--cursor <value>] [--expected-revision <value>] [--page <index> | --line <number>] [--match-query <text>] [--mode name|content] [--show-ignored] [--target <workspace>] [--json]', '每个操作只接受其适用参数；source-control 保留全部 Git 工作树，--task 仅提供已核对范围的预选提示。'],
      match: ({ domain, action }: { domain?: string; action?: string }) => domain === 'code' && action === command,
      run: async (_runtime: unknown, context: { argv: string[] }) => {
        const args = context.argv.slice(4), input: Partial<CodeInput & CodeSourceControlInput> = {}; let target = process.cwd();
        const seen = new Set<string>();
        const flags: Record<string, string> = { '--repository': 'repositoryId','--worktree':'worktreeId','--checkout':'checkoutId', '--path': 'path', '--task': 'taskId', '--commit': 'commitHash', '--query': 'query', '--mode': 'mode', '--page': 'page', '--line': 'line', '--match-query': 'matchQuery', '--expected-revision': 'expectedRevision', '--area': 'area', '--branch': 'branch', '--limit': 'limit', '--cursor': 'cursor' };
        const allowed = Object.keys(CODE_HTTP_REQUESTS[operation].properties);
        for (let index = 0; index < args.length; index++) {
          const flag = args[index]; if (seen.has(flag)) throw codeFailure('code_cli_invalid', '不能重复参数：' + flag); seen.add(flag);
          if (flag === '--json') continue;
          if (flag === '--show-ignored') { if (!allowed.includes('showIgnored')) throw codeFailure('code_cli_invalid', '该操作不接受忽略文件参数。'); input.showIgnored = true; continue; }
          const key = flags[flag];
          if (flag !== '--target' && (!key || !allowed.includes(key === 'path' ? 'filePath' : key))) throw codeFailure('code_cli_invalid', '该代码操作不接受参数：' + flag);
          const value = args[++index]; if (!value || value.startsWith('--')) throw codeFailure('code_cli_invalid', '参数缺少值：' + flag);
          if (flag === '--target') target = path.resolve(value);
          else if (['page', 'line', 'limit'].includes(key)) { if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw codeFailure('code_cli_invalid', '数量与位置必须是十进制整数。'); (input as Record<string, unknown>)[key] = Number(value); }
          else (input as Record<string, unknown>)[key] = value;
        }
        for (const key of CODE_HTTP_REQUESTS[operation].required) if (!(input as Record<string, unknown>)[key === 'filePath' ? 'path' : key]) throw codeFailure('code_cli_invalid', '缺少参数：' + key);
        if (input.mode && !['name', 'content'].includes(input.mode)) throw codeFailure('code_cli_invalid', '搜索模式无效。');
        const result = await (operation === 'repositories' ? application.repositories(target, input.taskId) : application[operation](target, input as CodeInput));
        process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return result;
      },
    });
  });
}
