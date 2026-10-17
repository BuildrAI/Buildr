import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { execFileSync } from 'node:child_process';
import { assertMinimumNodeVersion, createExactNodeExecutionEnvironment, spawnCommandSync } from '../../src/infrastructure/process.ts';
import { preparationContentDigest } from '../../tools/verification/candidate-preparation-reuse.ts';
import { CANDIDATE_CI_EVIDENCE_SCHEMA } from './release/candidate-ci-contract.ts';

export const CANDIDATE_ARTIFACT_IMPORT_ENV = 'BUILDR_ARTIFACT_VERIFICATION';
export const MAX_ARTIFACT_IMPORT_CHARACTERS = 56_000;
const MAX_BYTES = 8 * 1024 * 1024;
const packetSchema = 'buildr.candidate-artifact-import/v1';
const environmentSchema = 'buildr.candidate-execution-environment/v1';
const digestPattern = /^sha256-[a-f0-9]{64}$/u;
const digest = (value: unknown) => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const platform = (runner: string) => runner === 'macos' ? 'darwin' : runner === 'windows' ? 'win32' : runner;
const artifactFields = ['sourceCommit', 'filename', 'size', 'sha256', 'integrity', 'applicationPayloadDigest'];
const sourceDependencyInputs = new Map<string, string>();
const consumesWebDependencies = (preparation: string) => ['artifact', 'frontend', 'source-runtime'].includes(preparation);
const descriptorPreparation = (descriptor: any) => descriptor.preparation ?? (descriptor.kind === 'host-node' ? descriptor.id === 'host-minimum-macos' ? 'publisher' : 'host' : 'base');
export function candidateDependencyInputsIdentity(productRoot: string, sourceCommit: string, preparation = 'base'): string {
  productRoot = fs.realpathSync(path.resolve(productRoot));
  const key = `${productRoot}:${sourceCommit}:${preparation}`;
  const cached = sourceDependencyInputs.get(key);
  if (cached) return cached;
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(sourceCommit)) throw new Error('Candidate dependency inputs require an exact source.');
  const root = fs.realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: productRoot, encoding: 'utf8' }).trim());
  const prefix = path.relative(root, productRoot).split(path.sep).join('/');
  const files = ['package.json', 'package-lock.json', '.npmrc', 'tools/verification/candidate-environment.ts',
    'tools/verification/candidate-preparation-reuse.ts', 'src/infrastructure/process.ts'].map(file => prefix ? `${prefix}/${file}` : file);
  if (consumesWebDependencies(preparation)) files.push(...['package.json', 'package-lock.json', '.npmrc'].map(file => path.posix.normalize(`${prefix}/../buildr-web/${file}`)));
  const inventory = execFileSync('git', ['ls-tree', '-r', '-z', sourceCommit, '--', ...files], { cwd: root, encoding: 'utf8' });
  const identity = digest({ preparation, entries: inventory.split('\0').filter(Boolean).sort() });
  sourceDependencyInputs.set(key, identity);
  return identity;
}

export function assertFrozenCandidateCheckout(productRoot: string, expectedSource: string): void {
  const cwd = fs.realpathSync(productRoot);
  const git = (args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(expectedSource) || git(['rev-parse', 'HEAD']) !== expectedSource) {
    throw new Error('Local Candidate verification requires the exact frozen source checkout.');
  }
  if (git(['status', '--porcelain=v1', '--untracked-files=all'])) throw new Error('Local Candidate verification requires a clean frozen checkout; working bytes cannot be recorded as committed proof.');
}
export const sameCandidateArtifact = (left: any, right: any): boolean => Boolean(left && right && artifactFields.every(key => left[key] === right[key]));

function assertEvidence(value: any): void {
  if (!Array.isArray(value) || value.length > 128 || value.some(item => item?.schemaVersion !== CANDIDATE_CI_EVIDENCE_SCHEMA
    || !['shard', 'host-node'].includes(item.kind) || typeof item.id !== 'string' || item.id.length > 160 || !item.artifact)) {
    throw new Error('Artifact verification import requires bounded original Candidate evidence.');
  }
}

export function encodeCandidateArtifactImport(evidence: any[]): string {
  assertEvidence(evidence);
  const packet = JSON.stringify({ schemaVersion: packetSchema, digest: digest(evidence), evidence });
  if (Buffer.byteLength(packet) > MAX_BYTES) throw new Error('Artifact verification exceeds its decoded byte budget.');
  const encoded = gzipSync(packet).toString('base64');
  if (encoded.length > MAX_ARTIFACT_IMPORT_CHARACTERS) throw new Error('Artifact verification exceeds the workflow input budget; no Candidate was dispatched.');
  return encoded;
}

export function decodeCandidateArtifactImport(encoded: string): any[] {
  if (!encoded || encoded.length > MAX_ARTIFACT_IMPORT_CHARACTERS || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) throw new Error('Artifact verification transport is invalid or exceeds its input budget.');
  let packet: any;
  try { packet = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64'), { maxOutputLength: MAX_BYTES }).toString('utf8')); }
  catch { throw new Error('Artifact verification transport cannot be decoded within its byte budget.'); }
  assertEvidence(packet?.evidence);
  if (packet.schemaVersion !== packetSchema || packet.digest !== digest(packet.evidence)) throw new Error('Artifact verification transport integrity differs.');
  return packet.evidence;
}

/** Read existing evidence, never turn a log or aggregate boolean into a result. */
export function readCandidateArtifactImports(filename: string): any[] {
  const root = path.resolve(filename), values: any[] = [];
  const read = (file: string) => {
    if (fs.statSync(file).size > MAX_BYTES) throw new Error('Artifact evidence exceeds its byte budget.');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    values.push(...(Array.isArray(value) ? value : [value]));
  };
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && /^candidate-ci-evidence-.+\.json$/u.test(entry.name)) read(target);
    }
  };
  if (fs.statSync(root).isDirectory()) visit(root); else read(root);
  const artifacts = values.filter(item => item?.artifact);
  assertEvidence(artifacts);
  return artifacts;
}

export function candidateArtifactImportFromEnvironment(env: Record<string, string | undefined>): any[] {
  const encoded = env[CANDIDATE_ARTIFACT_IMPORT_ENV];
  if (!encoded) return [];
  if (env.GITHUB_EVENT_NAME && env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('Imported artifact verification requires the controlled manual Candidate entry.');
  return decodeCandidateArtifactImport(encoded);
}

export function candidateDeferredArtifactIds(descriptors: any[], localRunner?: string): string[] {
  if (!localRunner) return [];
  if (!['macos', 'windows'].includes(localRunner)) throw new Error('Candidate local runner must be macos or windows.');
  return descriptors.filter(descriptor => descriptor.requiresArtifact && !descriptor.producesArtifact
    && (descriptor.platformScope?.kind === 'common' || descriptor.runner === localRunner)).map(descriptor => descriptor.id).sort();
}

export function createCandidateDeferredPlan(input: any): any {
  const body = { schemaVersion: 'buildr.candidate-deferred-plan/v1', registryIdentity: input.registryIdentity,
    sourceCommit: input.sourceCommit, sourceTree: input.sourceTree, purpose: input.purpose, rehearsalIdentity: input.rehearsalIdentity ?? null,
    workflow: input.workflow ?? null, localRunner: input.localRunner ?? null, deferredIds: [...input.deferredIds].sort() };
  return { ...body, identity: digest(body) };
}

export function readCandidateDeferredPlan(directory: string, expected: any, registryIdentity: string, workflow: any, descriptors?: any[]): string[] {
  const files: string[] = [];
  const visit = (root: string) => {
    if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) return;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const target = path.join(root, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name === 'candidate-ci-deferred-plan.json') files.push(target);
    }
  };
  visit(directory);
  if (files.length === 0) return [];
  if (files.length !== 1 || fs.statSync(files[0]).size > 64_000) throw new Error('Candidate deferred plan is ambiguous or exceeds its byte budget.');
  const value = JSON.parse(fs.readFileSync(files[0], 'utf8')), { identity, ...body } = value;
  const priorAttempt = Number(value.workflow?.runAttempt), currentAttempt = Number(workflow?.runAttempt);
  if (value.schemaVersion !== 'buildr.candidate-deferred-plan/v1' || digest(body) !== identity || value.registryIdentity !== registryIdentity
    || ['sourceCommit', 'sourceTree', 'purpose', 'rehearsalIdentity'].some(key => (value[key] ?? null) !== (expected[key] ?? null))
    || String(value.workflow?.runId) !== String(workflow?.runId) || !Number.isSafeInteger(priorAttempt) || priorAttempt < 1
    || !Number.isSafeInteger(currentAttempt) || currentAttempt < priorAttempt
    || !['macos', 'windows'].includes(value.localRunner) || !Array.isArray(value.deferredIds)
    || new Set(value.deferredIds).size !== value.deferredIds.length
    || descriptors && value.deferredIds.some((id: string) => !candidateDeferredArtifactIds(descriptors, value.localRunner).includes(id))) {
    throw new Error('Candidate deferred plan differs from its controlled execution.');
  }
  return value.deferredIds;
}

/** Actual installed dependencies and Node remain visible, even for a local run. */
export function createCandidateExecutionEnvironment(productRoot: string, checkInputs: Record<string, string>, env: NodeJS.ProcessEnv = process.env, options: { preparation?: string } = {}): any {
  const exact = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env, requireNpm: true, minimumVersion: '24.15.0' });
  const npm = spawnCommandSync(exact.npmExecutable, ['--version'], { env: exact.env, encoding: 'utf8', timeout: 10_000 });
  if (npm.status !== 0) throw new Error('Candidate execution cannot record the actual npm version.');
  const preparation = options.preparation ?? 'base';
  const body = { schemaVersion: environmentSchema, platform: process.platform, arch: process.arch, preparation,
    nodeVersion: process.versions.node, nodeExecutable: exact.nodeExecutable, npmVersion: String(npm.stdout).trim(),
    dependencyIdentity: preparationContentDigest([path.join(productRoot, 'node_modules'),
      ...(consumesWebDependencies(preparation) ? [path.resolve(productRoot, '../buildr-web/node_modules')] : [])], { optional: true, webDependencyCache: true }),
    dependencyInputsIdentity: candidateDependencyInputsIdentity(productRoot,
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: productRoot, encoding: 'utf8' }).trim(), preparation),
    inputsIdentity: digest(checkInputs),
    variablesIdentity: digest(Object.fromEntries(['NODE_OPTIONS', 'NODE_ENV', 'TZ', 'LANG', 'LC_ALL', 'BUILDR_VERIFICATION_NETWORK_MODE'].map(key => [key, env[key] ?? '']))) };
  if (!digestPattern.test(body.dependencyIdentity ?? '')) throw new Error('Candidate execution cannot fingerprint its actual installed dependencies.');
  return { ...body, identity: digest(body) };
}

export function validCandidateExecutionEnvironment(evidence: any, checkInputs: Record<string, string>): boolean {
  if (!checkInputs || typeof checkInputs !== 'object' || Array.isArray(checkInputs)) return false;
  const value = evidence?.executionEnvironment;
  if (!value || value.schemaVersion !== environmentSchema) return false;
  const { identity, ...body } = value;
  try { assertMinimumNodeVersion(value.nodeVersion, '24.15.0'); } catch { return false; }
  return identity === digest(body) && value.platform === evidence.runner?.platform && value.arch === evidence.runner?.arch
    && value.nodeVersion === evidence.runner?.nodeVersion && ['darwin', 'win32'].includes(value.platform) && typeof value.preparation === 'string'
    && ['arm64', 'x64'].includes(value.arch) && typeof value.nodeExecutable === 'string' && value.nodeExecutable.length > 0
    && /^\d+\.\d+\.\d+$/u.test(value.npmVersion ?? '') && digestPattern.test(value.dependencyIdentity ?? '')
    && digestPattern.test(value.dependencyInputsIdentity ?? '')
    && digestPattern.test(value.variablesIdentity ?? '') && value.inputsIdentity === digest(checkInputs);
}

/** The caller authenticates immutable input identities before checking reuse. */
export function validateCandidateArtifactEvidence(evidence: any, descriptor: any, context: any, checkInputs: Record<string, string>, artifact?: any,
  expectedEnvironment?: { dependencyInputsIdentity?: string; executionEnvironment?: any }): boolean {
  if (evidence?.schemaVersion !== CANDIDATE_CI_EVIDENCE_SCHEMA || !descriptor.requiresArtifact || descriptor.producesArtifact
    || evidence.id !== descriptor.id || evidence.kind !== descriptor.kind || evidence.sourceCommit !== context.sourceCommit
    || evidence.sourceTree !== context.sourceTree || evidence.purpose !== 'candidate' || evidence.rehearsalIdentity
    || (descriptor.platformScope?.kind === 'common' ? !['darwin', 'win32'].includes(evidence.runner?.platform)
      : evidence.runner?.platform !== platform(descriptor.runner) || evidence.runner?.os !== descriptor.runner)
    || descriptor.arch && evidence.runner.arch !== descriptor.arch
    || evidence.status !== 'passed' || evidence.cleanupClean !== true || !evidence.artifact
    || evidence.artifact.sourceCommit !== context.sourceCommit || !/^[a-f0-9]{64}$/u.test(evidence.artifact.sha256 ?? '')
    || evidence.runner?.os !== (evidence.runner?.platform === 'darwin' ? 'macos' : 'windows')
    || !Number.isSafeInteger(evidence.artifact.size) || evidence.artifact.size < 1
    || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(evidence.artifact.integrity ?? '') || !digestPattern.test(evidence.artifact.applicationPayloadDigest ?? '')
    || artifact && !sameCandidateArtifact(evidence.artifact, artifact)
    || !isDeepStrictEqual(evidence.checkInputs, checkInputs) || !validCandidateExecutionEnvironment(evidence, checkInputs)
    || evidence.executionEnvironment.preparation !== descriptorPreparation(descriptor)
    || expectedEnvironment?.dependencyInputsIdentity && evidence.executionEnvironment.dependencyInputsIdentity !== expectedEnvironment.dependencyInputsIdentity
    || expectedEnvironment?.executionEnvironment && !sameCandidateExecutionEnvironment(evidence.executionEnvironment, expectedEnvironment.executionEnvironment)) return false;
  if (descriptor.kind === 'host-node') {
    if (evidence.requestedNode !== descriptor.requestedNode || descriptor.expectation === 'minimum' && evidence.runner.nodeVersion !== '24.15.0') return false;
    if (descriptor.expectation === 'current' && !/^24\.\d+\.\d+$/u.test(evidence.runner.nodeVersion)) return false;
  }
  const expected = descriptor.steps.map((step: any) => step.id);
  if (!Array.isArray(evidence.results) || evidence.results.length !== expected.length || new Set(evidence.results.map((result: any) => result.id)).size !== expected.length) return false;
  return expected.every((id: string) => evidence.results.some((result: any) => result.id === id && result.status === 'passed' && result.exitCode === 0
    && (result.childExitCode === undefined || result.childExitCode === 0) && (result.childSignal === undefined || result.childSignal === null)
    && (result.childOutcome === undefined || result.childOutcome === 'passed') && (!result.processCleanup || result.processCleanup.status === 'clean')));
}

export function sameCandidateExecutionEnvironment(left: any, right: any): boolean {
  // Executable location is provenance; actual version, dependencies and recipe
  // decide compatibility. A copied Node installation is not a different target.
  const projection = (value: any) => value && Object.fromEntries(Object.entries(value).filter(([key]) => !['identity', 'nodeExecutable', 'inputsIdentity'].includes(key)));
  return Boolean(left && right && isDeepStrictEqual(projection(left), projection(right)));
}

export function reusedCandidateArtifactResult(evidence: any, stepId: string): any {
  const original = evidence.results.find((result: any) => result.id === stepId);
  // Flatten adoption so repeated repairs preserve one original observation.
  const origin = original.artifactRecord ?? evidence;
  return { ...original, durationMs: 0, disposition: 'reused', artifactRecord: origin,
    reusedFrom: { kind: origin.workflow ? 'ci' : 'local', workflow: origin.workflow, runner: origin.runner,
      sourceCommit: origin.sourceCommit, startedAt: origin.startedAt, finishedAt: origin.finishedAt, durationMs: original.reusedFrom?.durationMs ?? original.durationMs } };
}
