import path from 'node:path';
import type { NativeSessionLinksApplication } from '../../application/native-session-links-application.ts';
import { nativeSessionFailure } from '../../domain/native-session-links.ts';

export function createDshSessionLinksCliContributions(application: NativeSessionLinksApplication, resolveWorkspaceTarget: (root: string) => string) {
  const help = ['Usage: buildr dsh <link|sessions|open-task> [options]', 'buildr dsh link --target <workspace> --task <code> --native-session-id <direct-DSH_SESSION_ID> [--connection-id <id>] --json', 'buildr dsh sessions --target <workspace> [--task <code>] [--native-session-id <id>] [--connection-id <id>] --json', 'buildr dsh open-task <code> --target <workspace> --native-session-id <direct-DSH_SESSION_ID> [--connection-id <id>] --json', '当前 DSH 原生会话（Session）须直接从本次 Bash 工具（Tool）读取 DSH_SESSION_ID。不得用桌面焦点、服务进程或子执行代替；此命令不从环境隐式猜测身份。关联只保存关系，不发送消息或启动模型。'];
  return ['', 'link', 'sessions', 'open-task'].map(action => Object.freeze({
    key: ['dsh', action].filter(Boolean).join(' '), surface: 'agent-machine', summary: '关联准确 DSH 原生会话（Session），或查询任务（Task）与会话（Session）的关系。', help,
    match: ({ domain, action: candidate }: { domain?: string; action?: string }) => domain === 'dsh' && (candidate || '') === action,
    run: async (_runtime: unknown, context: { argv: string[] }) => {
      if (!action) { console.log(help.join('\n')); return; }
      const args = context.argv.slice(4), values: Record<string, string> = {}, seen = new Set<string>();
      if (action === 'open-task') { const task = args.shift(); if (!task || task.startsWith('--')) throw nativeSessionFailure('dsh_cli_invalid', '打开任务（Task）必须指定准确任务（Task）编号。'); values['--task'] = task; seen.add('--task'); }
      for (let index = 0; index < args.length; index++) {
        const flag = args[index];
        if (seen.has(flag)) throw nativeSessionFailure('dsh_cli_invalid', 'DSH 参数不能重复。');
        seen.add(flag);
        if (flag === '--json') continue;
        if (!['--target', '--task', '--native-session-id', '--connection-id'].includes(flag) || !args[index + 1] || args[index + 1].startsWith('--')) throw nativeSessionFailure('dsh_cli_invalid', 'DSH 命令参数无效。');
        values[flag] = args[++index];
      }
      if ((action === 'link' || action === 'open-task' ? ['--target', '--task', '--native-session-id'] : ['--target']).some(flag => !values[flag])) throw nativeSessionFailure('dsh_cli_invalid', 'DSH 命令缺少必要参数，必须显式提供当前原生会话（Session）身份。');
      const id = resolveWorkspaceTarget(path.resolve(values['--target']));
      const input = { ...(values['--task'] ? { taskId: values['--task'] } : {}), ...(values['--native-session-id'] ? { nativeSessionId: values['--native-session-id'] } : {}), ...(values['--connection-id'] ? { connectionId: values['--connection-id'] } : {}) };
      const exact = { ...input, taskId: values['--task'], nativeSessionId: values['--native-session-id'] };
      const result = action === 'link' ? application.linkDshSession(id, exact) : action === 'open-task' ? await application.openDshTask(id, exact) : application.dshSessionRelations(id, input);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return result;
    },
  }));
}
