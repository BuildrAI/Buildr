import path from 'node:path';
import type { CodexDesktopApplication } from '../../application/codex-desktop-application.ts';
import { codexFailure } from '../../domain/codex-desktop.ts';
import { runCodexMcpServer } from '../mcp/codex-mcp-server.ts';

export function createCodexDesktopCliContributions(application: CodexDesktopApplication, resolveWorkspaceTarget: (root: string) => string) {
  const help = ['Usage: buildr codex <connections|link|serve|complete-binding|acknowledge-handoff> [options]', 'buildr codex connections --json', 'buildr codex link --target <workspace> --task <code> --native-session-id <direct-CODEX_THREAD_ID> [--connection-id <id>] --json', 'buildr codex serve --connection-id <id>', 'buildr codex complete-binding --workspace-id <id> --connection-id <id> --binding-request-id <id> --native-session-id <direct-CODEX_THREAD_ID> --json', 'buildr codex acknowledge-handoff --workspace-id <id> --connection-id <id> --handoff-request-id <id> --native-session-id <direct-CODEX_THREAD_ID> --json', 'link 用于用户要求关联当前聊天，或在当前聊天按默认约定新建任务之后；无需创建待确认请求。身份只能由承载原聊天直接采集；工具服务环境、共享根身份与子执行不能代替。'];
  return ['connections', 'link', 'serve', 'complete-binding', 'acknowledge-handoff', ''].map(action => Object.freeze({
    key: ['codex', action].filter(Boolean).join(' '), surface: 'agent-machine', summary: '查看 Codex 桌面连接，或按准确原聊天身份确认绑定与接收。', help,
    match: ({ domain, action: candidate }: { domain?: string; action?: string }) => domain === 'codex' && (candidate || '') === action,
    run: async (_runtime: unknown, context: { argv: string[] }) => {
      if (!action) { console.log(help.join('\n')); return; }
      const args = context.argv.slice(4), values: Record<string, string> = {};
      const allowed = action === 'connections' ? [] : action === 'link' ? ['--target', '--task', '--native-session-id', '--connection-id'] : action === 'serve' ? ['--connection-id'] : ['--workspace-id', '--connection-id', action === 'complete-binding' ? '--binding-request-id' : '--handoff-request-id', '--native-session-id'];
      const required = action === 'link' ? ['--target', '--task', '--native-session-id'] : allowed;
      const seen = new Set<string>();
      for (let i = 0; i < args.length; i++) {
        const flag = args[i];
        if (seen.has(flag)) throw codexFailure('codex_cli_invalid', 'Codex 参数不能重复。');
        seen.add(flag);
        if (flag === '--json' && action !== 'serve') continue;
        if (!allowed.includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw codexFailure('codex_cli_invalid', 'Codex 命令参数无效。');
        values[flag] = args[++i];
      }
      if (required.some(flag => !values[flag])) throw codexFailure('codex_cli_invalid', 'Codex 命令缺少必要参数。');
      if (action === 'serve') return runCodexMcpServer(application, { connectionId: values['--connection-id'] });
      const value = action === 'connections' ? application.listConnections() : action === 'link'
        ? application.linkSession(resolveWorkspaceTarget(path.resolve(values['--target'])), { taskId: values['--task'], nativeSessionId: values['--native-session-id'], ...(values['--connection-id'] ? { connectionId: values['--connection-id'] } : {}) })
        : action === 'complete-binding'
        ? application.completeBinding(values['--workspace-id'], { bindingRequestId: values['--binding-request-id'], connectionId: values['--connection-id'], nativeSessionId: values['--native-session-id'] })
        : application.acknowledgeHandoff(values['--workspace-id'], { handoffRequestId: values['--handoff-request-id'], connectionId: values['--connection-id'], nativeSessionId: values['--native-session-id'] });
      process.stdout.write(JSON.stringify(value, null, 2) + '\n');
      return value;
    },
  }));
}
