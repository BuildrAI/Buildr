import path from 'node:path';
import type { CodexDesktopApplication } from '../../application/codex-desktop-application.ts';
import { codexFailure, retiredCodexPlugin } from '../../domain/codex-desktop.ts';

const retiredActions = new Set(['serve', 'complete-binding', 'acknowledge-handoff']);
export function createCodexDesktopCliContributions(application: CodexDesktopApplication, resolveWorkspaceTarget: (root: string) => string) {
  const help = ['Usage: buildr codex <connections|link|sessions> [options]', 'buildr codex connections --json', 'buildr codex link --target <workspace> --task <code> --native-session-id <direct-CODEX_THREAD_ID> [--connection-id <id>] --json', 'buildr codex sessions --target <workspace> [--task <code>] [--native-session-id <id>] [--connection-id <id>] --json', 'link 用于用户要求关联当前会话，或在当前会话按默认约定新建任务之后。身份只能由承载原生会话直接采集；工具服务环境、共享根身份与子执行不能代替。sessions 只读查询已有关系，不发消息、不启动执行。'];
  return ['connections', 'link', 'sessions', ''].map(action => Object.freeze({
    key: ['codex', action].filter(Boolean).join(' '), surface: 'agent-machine', summary: '查看 Codex 关联配置、准确关联当前会话或查询任务与会话关系。', help,
    match: ({ domain, action: candidate }: { domain?: string; action?: string }) => domain === 'codex' && ((candidate || '') === action || !action && retiredActions.has(candidate || '')),
    run: async (_runtime: unknown, context: { argv: string[] }) => {
      if (retiredActions.has(context.argv[3])) throw retiredCodexPlugin();
      if (!action) { console.log(help.join('\n')); return; }
      const args = context.argv.slice(4), values: Record<string, string> = {};
      const allowed = action === 'connections' ? [] : ['--target', '--task', '--native-session-id', '--connection-id'];
      const required = action === 'link' ? ['--target', '--task', '--native-session-id'] : action === 'sessions' ? ['--target'] : [];
      const seen = new Set<string>();
      for (let i = 0; i < args.length; i++) {
        const flag = args[i];
        if (seen.has(flag)) throw codexFailure('codex_cli_invalid', 'Codex 参数不能重复。');
        seen.add(flag);
        if (flag === '--json') continue;
        if (!allowed.includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw codexFailure('codex_cli_invalid', 'Codex 命令参数无效。');
        values[flag] = args[++i];
      }
      if (required.some(flag => !values[flag])) throw codexFailure('codex_cli_invalid', 'Codex 命令缺少必要参数。');
      const input = { ...(values['--task'] ? { taskId: values['--task'] } : {}), ...(values['--native-session-id'] ? { nativeSessionId: values['--native-session-id'] } : {}), ...(values['--connection-id'] ? { connectionId: values['--connection-id'] } : {}) };
      const value = action === 'connections' ? application.listConnections() : action === 'link'
        ? application.linkSession(resolveWorkspaceTarget(path.resolve(values['--target'])), { ...input, taskId: values['--task'], nativeSessionId: values['--native-session-id'] })
        : application.sessionRelations(resolveWorkspaceTarget(path.resolve(values['--target'])), input);
      process.stdout.write(JSON.stringify(value, null, 2) + '\n');
      return value;
    },
  }));
}
