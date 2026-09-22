import path from 'node:path';
import type { PreferencesApplication } from '../../application/preferences-application.ts';
import type { createWorkbenchApplication } from '../../application/workbench-application.ts';
import type { WorkbenchPreference } from '../../../../../build/generated/workbench-dto.ts';

type Application = PreferencesApplication & ReturnType<typeof createWorkbenchApplication>;
export function createWorkbenchCliContributions(application: Application) {
  return [Object.freeze({
    key: 'workbench', surface: 'agent-machine', summary: '读取日常工作概览，逐项维护本机关注偏好。',
    help: ['Usage: buildr workbench <inspect|preferences|put|remove|visit> [--project <code>] [--date <YYYY-MM-DD>] [--kind <kind> --key <identity>] [--label <text> --href <workspace-route>] [--target <workspace>] [--json]', '', 'inspect只读真实来源；偏好操作不执行任务，最近访问最多保留30项。'],
    match: ({ domain }: any) => domain === 'workbench',
    run: (_runtime: unknown, context: any) => {
      const [action = 'inspect', ...args] = context.argv.slice(3);
      const values = new Map<string, string>();
      for (let index = 0; index < args.length; index += 1) {
        const key = args[index];
        if (!['--target', '--json', '--project', '--date', '--kind', '--key', '--label', '--href'].includes(key) || values.has(key)) throw new Error(`Unknown or duplicate argument: ${key}`);
        if (key === '--json') values.set(key, 'true'); else { const value = args[++index]; if (value === undefined) throw new Error(`Missing value: ${key}`); values.set(key, value); }
      }
      const root = path.resolve(values.get('--target') || process.cwd());
      const input = { ...(values.has('--label') ? { label: values.get('--label') } : {}), ...(values.has('--href') ? { href: values.get('--href') } : {}) };
      let result;
      if (action === 'inspect') result = application.inspectWorkbench(root, { ...(values.has('--project') ? { project: values.get('--project') } : {}), ...(values.has('--date') ? { date: values.get('--date') } : {}) });
      else if (action === 'preferences') result = application.inspectWorkbenchPreferences(root);
      else if (action === 'put') result = application.putWorkbenchPreference(root, values.get('--kind') as WorkbenchPreference['kind'], values.get('--key') || '', input);
      else if (action === 'remove') result = application.removeWorkbenchPreference(root, values.get('--kind') || '', values.get('--key') || '');
      else if (action === 'visit') result = application.recordWorkbenchVisit(root, { key: values.get('--key') || '', label: input.label || '', href: input.href || '' });
      else throw new Error('Unknown workbench action.');
      console.log(JSON.stringify(result, null, 2));
      return result;
    },
  })];
}
