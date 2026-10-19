import path from 'node:path';
import type { TaskWorkContextApplication } from '../../application/work-context-application.ts';

export function workContextCommand(application: TaskWorkContextApplication, args: string[]) {
  const [action, taskId, ...rest] = args;
  const allowed = new Set(['--target', '--json', '--expected-current', '--progress', '--next-step', '--attention-kind', '--attention-reason', '--clear-attention', '--attention', '--response', '--stage', '--clear-stage', '--check', '--check-status', '--check-reason', '--clear-checks']);
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index];
    if (!allowed.has(name) || values.has(name)) throw new Error(`Unknown or duplicate argument: ${name}`);
    if (name === '--json' || name === '--clear-attention' || name === '--clear-stage' || name === '--clear-checks') values.set(name, 'true');
    else { const value = rest[++index]; if (value === undefined) throw new Error(`Missing value: ${name}`); values.set(name, value); }
  }
  if (!taskId || !['inspect', 'record', 'respond'].includes(action)) throw new Error('Usage: buildr task work-context <inspect|record|respond> <task-id> [options]');
  const root = path.resolve(values.get('--target') || process.cwd());
  let result;
  if (action === 'inspect') result = application.inspectTaskWorkContext(root, taskId);
  else if (action === 'respond') result = application.respondTaskWorkContext(root, taskId, { expectedContextDigest: values.get('--expected-current') || '', attentionId: values.get('--attention') || '', response: values.get('--response') || '' });
  else {
    if (values.has('--clear-attention') && (values.has('--attention-kind') || values.has('--attention-reason'))) throw new Error('--clear-attention cannot be combined with a new attention request.');
    if (values.has('--stage') && values.has('--clear-stage')) throw new Error('--stage cannot be combined with --clear-stage.');
    if (values.has('--clear-checks') && (values.has('--check') || values.has('--check-status') || values.has('--check-reason'))) throw new Error('--clear-checks cannot be combined with a check record.');
    if (values.has('--check') && (!values.has('--check-status') || !values.has('--check-reason'))) throw new Error('--check requires --check-status and --check-reason.');
    if ((values.has('--check-status') || values.has('--check-reason')) && !values.has('--check')) throw new Error('--check-status and --check-reason require --check.');
    result = application.recordTaskWorkContext(root, taskId, {
      ...(values.has('--clear-stage') ? { stage: null } : values.has('--stage') ? { stage: values.get('--stage') as NonNullable<Parameters<TaskWorkContextApplication['recordTaskWorkContext']>[2]['stage']> } : {}),
      expectedContextDigest: values.get('--expected-current') || '', progress: values.get('--progress') || '', nextStep: values.get('--next-step') || '',
      ...(values.has('--clear-attention') ? { attention: null } : values.has('--attention-kind') || values.has('--attention-reason') ? { attention: { kind: values.get('--attention-kind') as 'decision' | 'acceptance' | 'question', reason: values.get('--attention-reason') || '' } } : {}),
      ...(values.has('--clear-checks') ? { checks: null } : values.has('--check') ? { checks: [{ check: values.get('--check') as 'planning-review' | 'implementation-review' | 'verification', status: values.get('--check-status') as 'needed' | 'not-applicable', reason: values.get('--check-reason') || '' }] } : {}),
    });
  }
  if (values.has('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else console.log(`${taskId}: ${result.context?.progress || '尚未登记工作摘要'}`);
  return result;
}
export function createWorkContextCliContributions(application: TaskWorkContextApplication) {
  return ['inspect', 'record', 'respond'].map((action) => Object.freeze({
    key: `task work-context ${action}`, surface: 'agent-machine', summary: '查看或维护独立工作摘要和明确待处理事项；不改变任务状态。',
    help: ['Usage: buildr task work-context <inspect|record|respond> <task-id> [--expected-current <absent|sha256>] [--progress <text> --next-step <text>] [--stage <requirements|design|planning-review|implementation|implementation-review|verification|acceptance|closeout> | --clear-stage] [--attention-kind <decision|acceptance|question> --attention-reason <text> | --clear-attention] [--check <planning-review|implementation-review|verification> --check-status <needed|not-applicable> --check-reason <text> | --clear-checks] [--attention <id> --response <text>] [--target <workspace>] [--json]', '', '写入必须提供已观察版本；省略事项保留原请求与答复，明确新请求产生新身份。检查适用性结论只记录当前判断与理由，不替代审查或验证结果；任务终态后不再修改。回应不代表任务完成或通用授权。'],
    match: ({ domain, action: route, runtimeId }: any) => domain === 'task' && route === 'work-context' && runtimeId === action,
    run: (_runtime: unknown, context: any) => workContextCommand(application, context.argv.slice(4)),
  }));
}
