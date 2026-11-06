import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveVerificationWorkerBudget } from '../../buildr/test/verification/worker-budget.ts';
const root = resolve(import.meta.dirname, '..');
export const PLUGIN_SOURCE_PHASE_IDS = ['dsh-plugin:unit'] as const;
export const PLUGIN_PEER_PHASE_FILES = ['test/integration/source-business-gateway.test.ts'] as const;
export function pluginSourcePhaseFiles(group: 'unit' | 'static' | 'integration' | 'e2e', pluginRoot = root): string[] {
  const files = readdirSync(join(pluginRoot, 'test', group)).filter(name => name.endsWith('.test.ts')).sort()
    .map(name => `test/${group}/${name}`).filter(file => !(PLUGIN_PEER_PHASE_FILES as readonly string[]).includes(file));
  return files;
}
export function pluginSourcePhaseStep(group: 'unit' | 'static' | 'integration' | 'e2e', files: string[], env: NodeJS.ProcessEnv = process.env) {
  const workers = resolveVerificationWorkerBudget({ env, fallback: 2, maximum: files.length, label: `Plugin ${group} tests` });
  return { id: `dsh-plugin:${group}`, executor: { type: 'node-test', files: [...files].sort(), args: [`--test-concurrency=${workers}`] },
    resourceDemand: { workers, processes: workers },
    reuse: group === 'unit' ? { scope: 'plugin' as const, git: false } : false as const };
}
