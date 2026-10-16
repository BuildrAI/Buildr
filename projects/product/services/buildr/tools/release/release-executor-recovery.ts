/** A bounded replacement of release tooling; the authorized package and tag remain unchanged. */
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const releaseExecutorRecoverySchema = 'buildr.release-executor-recovery/v1';
export interface ReleaseExecutorRecovery {
  schemaVersion: typeof releaseExecutorRecoverySchema;
  sourceCommit: string;
  sourceTree: string;
  workflowDigest: string;
  originalContextIdentity: string;
  previousRunId: number;
  previousRunAttempt: number;
  previousEvidenceIdentity: string;
}
type Execute = (command: string, args: string[], options: any) => any;
const sha = /^[a-f0-9]{40}$/u;
const digest = /^sha256-[a-f0-9]{64}$/u;
const buildr = 'projects/product/services/buildr/';
const plugin = 'projects/product/services/dsh-plugin/';
// Explicit files only: no runtime, package metadata, lock, payload or build-tool changes.
export const releaseExecutorRecoveryPaths = new Set([
  'README.md', 'README.en.md', `${buildr}README.md`, `${buildr}docs/cli-reference.md`,
  `${plugin}test/unit/plugin-release.test.ts`,
  '.github/workflows/publish.yml', '.github/workflows/publish-dsh-plugin.yml', '.github/workflows/verify.yml',
  ...['release-executor-recovery', 'release-readiness', 'release-authority-oidc-probe', 'release-convergence',
    'release-transaction-evidence', 'release-package-evidence', 'release-publication', 'package-pair-diagnostics',
    'package-release-operation', 'release-transaction-runner', 'release-orchestration-runner', 'plugin-hosted-release',
    'package-pair-publisher-diagnosis', 'verify-pr-candidate', 'release-executor-admission', 'package-artifact-observation', 'release-consumption']
    .map(name => `${buildr}tools/release/${name}.ts`),
  ...['release-executor-recovery', 'release-readiness', 'package-pair-diagnostics', 'package-pair-publisher-diagnosis', 'candidate-ci-evidence'].map(name => `${buildr}test/unit/${name}.test.ts`),
  ...['release-executor-recovery', 'package-release-operation', 'package-publication-evidence', 'release-authority-cli', 'release-convergence', 'publication-effects', 'package-artifact-observation']
    .map(name => `${buildr}test/integration-candidate-release/${name}.test.ts`),
  ...['registry', 'planner', 'candidate-ci'].map(name => `${buildr}test/verification/${name}.ts`),
  `${buildr}test/contract/release-authority.test.ts`, `${buildr}test/contract/open-source-release.test.ts`,
  `${plugin}tools/buildr-peer.ts`, `${plugin}tools/verify-buildr-plugin-pair.ts`,
  `${plugin}tools/release-workflow.ts`, `${plugin}tools/trusted-publish.ts`,
  `${plugin}test/unit/buildr-pair.test.ts`, `${plugin}test/unit/buildr-peer.test.ts`,
  `${plugin}test/unit/trusted-publish.test.ts`, `${plugin}test/unit/release-workflow.test.ts`,
  'projects/product/knowledge/docs/flows/open-source-release.md',
  'projects/product/knowledge/docs/architecture/verification-framework.md',
]);

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
const hash = (bytes: string): string => `sha256-${crypto.createHash('sha256').update(bytes).digest('hex')}`;
function originalIdentity(context: any): string {
  const { identity: _identity, executorRecovery: _recovery, ...original } = context;
  return hash(JSON.stringify(canonical(original)));
}

export function releaseExecutionCommit(context: any): string {
  return validateReleaseExecutorRecovery(context)?.sourceCommit ?? context.convergence?.mainCommit ?? context.convergence?.sourceCommit;
}

export function validateReleaseExecutorRecovery(context: any, options: { repo?: string; verifyGit?: boolean } = {}, dependencies: { execute?: Execute } = {}): ReleaseExecutorRecovery | null {
  if (!Object.hasOwn(context, 'executorRecovery')) return null;
  const value = context.executorRecovery;
  const fields = ['schemaVersion', 'sourceCommit', 'sourceTree', 'workflowDigest', 'originalContextIdentity', 'previousRunId', 'previousRunAttempt', 'previousEvidenceIdentity'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))
      || value.schemaVersion !== releaseExecutorRecoverySchema || !sha.test(value.sourceCommit) || !sha.test(value.sourceTree)
      || !['workflowDigest', 'originalContextIdentity', 'previousEvidenceIdentity'].every(key => digest.test(value[key]))
      || !['previousRunId', 'previousRunAttempt'].every(key => Number.isSafeInteger(value[key]) && value[key] > 0)) throw new Error('Release executor recovery identity is invalid.');
  if (context.schemaVersion !== 'buildr.release-context/v2' || originalIdentity(context) !== value.originalContextIdentity
      || !sha.test(context.convergence?.mainCommit) || value.sourceCommit === context.convergence.mainCommit) throw new Error('Release executor recovery must preserve the exact original context.');
  if (options.repo || options.verifyGit) {
    if (!options.repo) throw new Error('Release executor recovery Git verification requires its repository.');
    const actual = assertReleaseExecutorSource({ repo: options.repo, originalCommit: context.convergence.mainCommit, executionCommit: value.sourceCommit }, dependencies);
    if (actual.sourceTree !== value.sourceTree || actual.workflowDigest !== value.workflowDigest) throw new Error('Release executor recovery tree or workflow changed.');
  }
  return { ...value };
}

export function assertReleaseExecutorSource(input: { repo: string; originalCommit: string; executionCommit: string }, dependencies: { execute?: Execute } = {}): { sourceCommit: string; sourceTree: string; workflowDigest: string } {
  if (!sha.test(input.originalCommit) || !sha.test(input.executionCommit) || input.originalCommit === input.executionCommit) throw new Error('Release executor requires a strict descendant commit.');
  const execute: Execute = dependencies.execute ?? ((command, args, opts) => spawnSync(command, args, opts));
  const git = (args: string[]): string => {
    const result = execute('git', args, { cwd: input.repo, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error('Release executor recovery Git identity could not be verified.');
    return String(result.stdout ?? '');
  };
  git(['merge-base', '--is-ancestor', input.originalCommit, input.executionCommit]);
  const paths = git(['diff', '--name-only', '-z', '--no-renames', input.originalCommit, input.executionCommit, '--']).split('\0').filter(Boolean);
  if (!paths.length || paths.some(file => !releaseExecutorRecoveryPaths.has(file))) throw new Error('Release executor recovery contains changes outside the explicit release-tool paths.');
  for (const file of paths) {
    const entry = git(['ls-tree', input.executionCommit, '--', file]).trim();
    if (entry && !/^100(?:644|755) blob [a-f0-9]{40}\t/u.test(entry)) throw new Error('Release executor recovery requires regular release-tool files.');
  }
  return { sourceCommit: input.executionCommit, sourceTree: git(['rev-parse', `${input.executionCommit}^{tree}`]).trim(),
    workflowDigest: hash(git(['show', `${input.executionCommit}:.github/workflows/publish.yml`])) };
}

export function assertReleaseExecutorRecoverySource(context: any, options: { repo: string }, dependencies: { execute?: Execute } = {}): ReleaseExecutorRecovery | null {
  return validateReleaseExecutorRecovery(context, { ...options, verifyGit: true }, dependencies);
}

export function assertReleaseExecutorRecoveryEvidence(context: any, previous: any, run?: any): void {
  const recovery = validateReleaseExecutorRecovery(context);
  if (!recovery) throw new Error('Release executor recovery evidence requires its bound context.');
  const { identity, ...unsigned } = previous ?? {};
  if (previous?.schemaVersion !== 'buildr.release-transaction-evidence/v2' || previous.status !== 'failed'
      || previous.context?.identity !== recovery.originalContextIdentity || previous.context?.executorRecovery
      || hash(JSON.stringify(unsigned)) !== identity || identity !== recovery.previousEvidenceIdentity
      || previous.aggregateEligible !== false || previous.publish?.repository !== 'BuildrAI/Buildr'
      || previous.publish?.workflow !== '.github/workflows/publish.yml' || previous.publish?.headSha !== context.convergence.mainCommit
      || previous.publish?.runId !== recovery.previousRunId || previous.publish?.runAttempt !== recovery.previousRunAttempt
      || previous.attempt?.runId !== recovery.previousRunId || previous.attempt?.runAttempt !== recovery.previousRunAttempt) throw new Error('Release executor recovery previous evidence changed.');
  if (run && (run.id !== recovery.previousRunId || run.run_attempt !== recovery.previousRunAttempt || run.status !== 'completed'
      || run.conclusion !== 'failure' || run.repository?.full_name !== 'BuildrAI/Buildr' || run.event !== 'workflow_dispatch'
      || run.head_branch !== 'main' || run.head_sha !== context.convergence.mainCommit
      || run.path?.split('@')[0] !== '.github/workflows/publish.yml')) throw new Error('Release executor recovery previous run is not the original failed publisher.');
}

export function createReleaseExecutorRecovery(context: any, input: { repo: string; sourceCommit: string; previousEvidence: any }, dependencies: { execute?: Execute } = {}): ReleaseExecutorRecovery {
  const previous = input.previousEvidence;
  const { identity: previousIdentity, ...unsigned } = previous ?? {};
  if (context.executorRecovery || context.identity !== originalIdentity(context) || previous?.status !== 'failed'
      || previous.schemaVersion !== 'buildr.release-transaction-evidence/v2' || previous.context?.identity !== context.identity
      || previous.publish?.headSha !== context.convergence?.mainCommit || previous.publish?.repository !== 'BuildrAI/Buildr'
      || previous.publish?.workflow !== '.github/workflows/publish.yml' || hash(JSON.stringify(unsigned)) !== previousIdentity
      || previous.attempt?.runId !== previous.publish?.runId || previous.attempt?.runAttempt !== previous.publish?.runAttempt
      || previous.aggregateEligible !== false) throw new Error('Release executor recovery requires the original failed publication evidence.');
  const execute: Execute = dependencies.execute ?? ((command, args, opts) => spawnSync(command, args, opts));
  const read = (args: string[]): string => {
    const result = execute('git', args, { cwd: input.repo, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error('Release executor recovery source could not be read.');
    return String(result.stdout ?? '');
  };
  if (!sha.test(input.sourceCommit)) throw new Error('Release executor recovery source requires an exact commit.');
  const recovery: ReleaseExecutorRecovery = {
    schemaVersion: releaseExecutorRecoverySchema, sourceCommit: input.sourceCommit,
    sourceTree: read(['rev-parse', `${input.sourceCommit}^{tree}`]).trim(),
    workflowDigest: hash(read(['show', `${input.sourceCommit}:.github/workflows/publish.yml`])),
    originalContextIdentity: context.identity, previousRunId: previous.publish.runId,
    previousRunAttempt: previous.publish.runAttempt, previousEvidenceIdentity: previousIdentity,
  };
  const bound = { ...context, executorRecovery: recovery };
  assertReleaseExecutorRecoveryEvidence(bound, previous);
  return validateReleaseExecutorRecovery(bound, { repo: input.repo }, { execute })!;
}
