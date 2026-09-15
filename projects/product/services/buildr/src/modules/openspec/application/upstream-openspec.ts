import process from 'node:process';
import { spawnCommandSync } from '../../../infrastructure/process.ts';
import { resolveProductResource } from '../../../infrastructure/product-resources/index.ts';
import type { DeltaOperation, OpenSpecDelta } from './delta-model.ts';
import { convergenceDigest, convergenceIdentity, convergencePlanIdentity, CONVERGENCE_PLAN_SCHEMA, CONVERGENCE_ALGORITHM_VERSION, type ConvergencePlan, type ExecutableIdentity } from './convergence-model.ts';

type UpstreamData = {
  capabilities: { capability: string; file: string; content: string; operations: DeltaOperation[] }[];
  files: { path: string; beforeExists: boolean; beforeContent: string; expectedExists: boolean; expectedContent: string }[];
  diagnostics: { capability: string; code: string; message: string }[];
};
const UPSTREAM_OPENSPEC_WORKER = resolveProductResource('runtime/upstream-openspec-worker.cjs', {
  developmentFallback: 'src/modules/openspec/application/upstream-openspec-worker.ts',
});
export function readUpstreamOpenSpec(executable: string, projectRoot: string, changeRoot: string, operation: 'inspect' | 'plan' = 'inspect'): UpstreamData {
  const result = spawnCommandSync(process.execPath, [UPSTREAM_OPENSPEC_WORKER], {
    input: JSON.stringify({ executable, projectRoot, changeRoot, operation }), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`OpenSpec adapter failed: ${result.error?.message || String(result.stderr).slice(0, 2000)}`);
  return JSON.parse(String(result.stdout));
}
export function upstreamDelta(data: UpstreamData): OpenSpecDelta {
  return { capabilities: new Map(data.capabilities.map(({ capability, ...item }) => [capability, item])), operations: data.capabilities.flatMap(item => item.operations), hash: convergenceDigest(data.capabilities.map(item => ({ capability: item.capability, content: item.content }))) };
}
export function upstreamConvergencePlan({ executable, projectRoot, changeRoot, change, project, executableIdentity }: { executable: string; projectRoot: string; changeRoot: string; change: string; project: string; executableIdentity: ExecutableIdentity }): ConvergencePlan {
  const data = readUpstreamOpenSpec(executable, projectRoot, changeRoot, 'plan');
  const delta = upstreamDelta(data);
  const files = data.files.map(item => ({ ...item,
    beforeDigest: item.beforeExists ? convergenceDigest(item.beforeContent) : null,
    expectedDigest: item.expectedExists ? convergenceDigest(item.expectedContent) : null,
  }));
  const operations = delta.operations.map(item => ({ capability: item.capability, type: item.type, requirement: item.title || item.from, status: 'safe', reason: 'upstream-validated' }));
  const plan: ConvergencePlan = { schemaVersion: CONVERGENCE_PLAN_SCHEMA, algorithmVersion: CONVERGENCE_ALGORITHM_VERSION,
    convergenceIdentity: convergenceIdentity({ change, project, deltaDigest: delta.hash, files, executableIdentity }), planIdentity: null,
    change, project, deltaDigest: delta.hash, executableIdentity, status: data.diagnostics.length ? 'blocked' : 'safe', operations, blocked: data.diagnostics, files };
  plan.planIdentity = convergencePlanIdentity(plan);
  return plan;
}
