import path from 'node:path';
import type { ServiceDeploymentApplication } from '../../application/service-deployment-application.ts';
import type { ServiceRuntimeApplication } from '../../application/service-runtime-application.ts';
import type { ServiceRuntimeView } from '../../application/service-runtime-view.ts';

const FLAGS = ['--target', '--json', '--service', '--worktree', '--run', '--branch', '--commit', '--environment', '--max-bytes', '--acknowledge-unknown'];
const ACTIONS = ['overview', 'show', 'worktrees', 'start', 'stop', 'log', 'plan', 'deploy'];

export function createServiceRuntimeCliContributions(deps: { view: ServiceRuntimeView; runtime: ServiceRuntimeApplication; deployment: ServiceDeploymentApplication }) {
  return [Object.freeze({
    key: 'service-runtime',
    surface: 'agent-machine',
    summary: '读取服务运行定义与受管运行，启动或停止本地运行，读取日志，核对并提交 QA 部署。',
    help: [
      'Usage: buildr service-runtime <overview|show|worktrees|start|stop|log|plan|deploy> [--service <code>] [--worktree <id>] [--run <id>] [--branch <name>] [--commit <sha>] [--environment qa] [--max-bytes <n>] [--acknowledge-unknown] [--target <workspace>] [--json]',
      '',
      'overview 汇总全部服务的本地运行与最近部署结果；show/worktrees 读取单个服务的运行定义与检出目录。',
      'start 需要 --service 与 --worktree；stop/log 需要 --run；plan 只读部署计划；deploy 需要 --service、--branch 与 --commit。',
      '结果为 unknown 时不会自动重试；核对外部系统实际记录后用 --acknowledge-unknown 才可以再次提交同一计划。',
    ],
    match: ({ domain }: any) => domain === 'service-runtime',
    run: (_runtime: unknown, context: any) => {
      const [action = 'overview', ...args] = context.argv.slice(3);
      if (!ACTIONS.includes(action)) throw new Error(`Unknown service-runtime action: ${action}`);
      const values = new Map<string, string>();
      for (let index = 0; index < args.length; index += 1) {
        const key = args[index];
        if (!FLAGS.includes(key) || values.has(key)) throw new Error(`Unknown or duplicate argument: ${key}`);
        if (key === '--json' || key === '--acknowledge-unknown') values.set(key, 'true');
        else {
          const value = args[++index];
          if (value === undefined) throw new Error(`Missing value: ${key}`);
          values.set(key, value);
        }
      }
      const root = path.resolve(values.get('--target') || process.cwd());
      const required = (...flags: string[]) => {
        for (const flag of flags) if (!values.has(flag)) throw new Error(`${action} 需要 ${flag}。`);
        return undefined;
      };
      const environment = values.get('--environment') ?? 'qa';
      let result: unknown;
      if (action === 'overview') result = deps.view.overview(root);
      else if (action === 'show') { required('--service'); result = deps.view.detail(root, values.get('--service')!); }
      else if (action === 'worktrees') { required('--service'); result = deps.runtime.listWorktrees(root, values.get('--service')!); }
      else if (action === 'start') { required('--service', '--worktree'); result = deps.runtime.startRun(root, { serviceCode: values.get('--service')!, worktreeId: values.get('--worktree')! }); }
      else if (action === 'stop') { required('--run'); result = deps.runtime.stopRun(root, values.get('--run')!); }
      else if (action === 'log') {
        required('--run');
        const rawMaxBytes = values.get('--max-bytes');
        const maxBytes = rawMaxBytes === undefined ? undefined : Number(rawMaxBytes);
        if (maxBytes !== undefined && (!Number.isInteger(maxBytes) || maxBytes < 1024)) throw new Error('--max-bytes 必须是不小于 1024 的整数。');
        result = deps.runtime.readLog(root, values.get('--run')!, maxBytes === undefined ? {} : { maxBytes });
      }
      else if (action === 'plan') {
        required('--service');
        result = deps.deployment.plan(root, {
          serviceCode: values.get('--service')!,
          environment,
          ...(values.has('--branch') ? { branch: values.get('--branch') } : {}),
          ...(values.has('--worktree') ? { worktreeId: values.get('--worktree') } : {}),
        });
      } else {
        required('--service', '--branch', '--commit');
        result = deps.deployment.submit(root, {
          serviceCode: values.get('--service')!,
          environment,
          branch: values.get('--branch')!,
          commit: values.get('--commit')!,
          ...(values.has('--acknowledge-unknown') ? { acknowledgeUnknown: true } : {}),
        });
      }
      return Promise.resolve(result).then(value => {
        console.log(JSON.stringify(value, null, 2));
        return value;
      });
    },
  })];
}
