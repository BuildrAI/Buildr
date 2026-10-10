import type { AgentOperationsApplication } from '../../application/agent-operations-application.ts';
import { agentFailure } from '../../domain/agent-operations.ts';

export function createAgentOperationsCliContributions(application: AgentOperationsApplication) {
  const help = ['Usage: buildr agent <list|register codex|register dsh|select> [options]', 'buildr agent list --json', 'buildr agent register codex --executable <discovered-absolute-entry> [--codex-home <discovered-home>] --expected-revision <revision> --json', 'buildr agent register dsh --executable <discovered-absolute-entry> [--dsh-home <discovered-home>] --expected-revision <revision> --json', 'buildr agent select <agent-id> --expected-revision <revision> --json', '接入由当前智能体（Agent）发现真实入口后完成，不复制凭证，不启动模型。'];
  const commands = ['list', 'register', 'select'].map(action => Object.freeze({
    key: 'agent ' + action, surface: 'agent-machine',
    summary: action === 'register' ? '由当前智能体（Agent）登记已发现的 Codex 或 DSH 本机入口，不复制凭证或启动模型。' : '查看本机智能体（Agent）接入，或按已观察版本选择唯一默认。',
    help: [action === 'register' ? 'Usage: buildr agent register <codex|dsh> --executable <discovered-absolute-entry> [--codex-home <discovered-home>|--dsh-home <discovered-home>] [--label <name>] --expected-revision <revision> [--json]' : action === 'select' ? 'Usage: buildr agent select <agent-id> --expected-revision <revision> [--json]' : 'Usage: buildr agent list [--json]', '先 list 读取登记版本；接入由当前智能体（Agent）发现真实安装后完成，不要求用户填写路径，不安装或更新智能体（Agent）。'],
    match: ({ domain, action: candidate }: { domain?: string; action?: string }) => domain === 'agent' && candidate === action,
    run: async (_runtime: unknown, context: { argv: string[] }) => {
      const args = context.argv.slice(4), values: Record<string, string> = {}, seen = new Set<string>();
      const identity = action === 'list' ? null : args.shift();
      if (action === 'register' && identity !== 'codex' && identity !== 'dsh') throw agentFailure('agent_kind_unsupported', '当前仅支持接入 Codex 或 DSH。');
      if (action === 'select' && !identity) throw agentFailure('agent_cli_invalid', '必须指定已登记智能体（Agent）身份。');
      const allowed = action === 'register' ? ['--executable', identity === 'dsh' ? '--dsh-home' : '--codex-home', '--label', '--expected-revision'] : action === 'select' ? ['--expected-revision'] : [];
      for (let index = 0; index < args.length; index++) {
        const flag = args[index];
        if (seen.has(flag)) throw agentFailure('agent_cli_invalid', '参数不能重复：' + flag);
        seen.add(flag); if (flag === '--json') continue;
        if (!allowed.includes(flag)) throw agentFailure('agent_cli_invalid', '该操作不接受参数：' + flag);
        const value = args[++index]; if (!value || value.startsWith('--')) throw agentFailure('agent_cli_invalid', '参数缺少值：' + flag);
        values[flag] = value;
      }
      const result = action === 'list' ? application.listRegistry() : action === 'select'
        ? application.selectAgent({ agentId: identity!, expectedRevision: values['--expected-revision'] })
        : identity === 'dsh' ? application.registerDsh({ executable: values['--executable'], dshHome: values['--dsh-home'], label: values['--label'], expectedRevision: values['--expected-revision'] })
        : application.registerCodex({ executable: values['--executable'], codexHome: values['--codex-home'], label: values['--label'], expectedRevision: values['--expected-revision'] });
      process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return result;
    },
  }));
  return [Object.freeze({ key: 'agent', surface: 'agent-machine', summary: '查询本机智能体（Agent）接入与默认选择命令。', help, match: ({ domain, action }: { domain?: string; action?: string }) => domain === 'agent' && !action, run: () => console.log(help.join('\n')) }), ...commands];
}
