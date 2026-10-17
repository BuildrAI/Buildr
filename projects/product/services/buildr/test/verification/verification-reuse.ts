import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertMinimumNodeVersion, createExactNodeExecutionEnvironment, spawnCommandSync } from '../../src/infrastructure/process.ts';
import { verificationSteps, resolveVerificationExecutionProfile, verificationStepExecutionInputs } from './registry.ts';
import { estimateVerificationPlan } from './planner.ts';
import { preparationContentDigest } from '../../tools/verification/candidate-preparation-reuse.ts';
import { withExclusiveFileLock } from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';
import { collectVerificationSourceInputs } from './verification-source-inputs.ts';
import { resolveVerificationBase } from './changed-paths.ts';

export type ReuseDigest = `sha256-${string}`;
export type VerificationReuseScope = 'backend' | 'platform-backend' | 'web' | 'product' | 'repository' | 'plugin' | 'runtime';
export interface VerificationReusePolicy { scope: VerificationReuseScope; git?: boolean | 'comparison'; exactNode?: boolean; tools?: string[]; inputs?: readonly string[]; inputMode?: 'runtime-check'; releaseNotes?: false }
export interface VerificationReuseStep { id: string; executor: Record<string, any>; reuse?: VerificationReusePolicy | false; dependsOn?: string[]; contexts?: string[]; timeoutMs?: number; [key: string]: any }
export interface VerificationReuseEnvironment { platform: string; arch: string; nodeVersion: string; tools: Record<string, string>; variablesIdentity: ReuseDigest }
export interface VerificationReuseSnapshot {
  productRoot: string; repositoryRoot: string; contentIdentities: Record<VerificationReuseScope, ReuseDigest>;
  gitIdentity: ReuseDigest; sourceCommit: string; environment: VerificationReuseEnvironment;
  gitInputs?: { head: string; refsIdentity: ReuseDigest; historyIdentity: ReuseDigest };
  gitComparison?: { head: string; baseRef: string; base: string; mergeBase: string } | null;
  unavailableScopes?: VerificationReuseScope[];
  inputIdentities?: Record<string, ReuseDigest>;
  stepInputs?: Record<string, { contentIdentity: ReuseDigest; recipeIdentity: ReuseDigest; fallback: boolean; unavailable: boolean; unresolved?: string[] }>;
  proofInputs?: Record<string, NonNullable<VerificationReuseSnapshot['stepInputs']>[string] & { selectionIdentity: ReuseDigest }>;
  historicalInputs?: (commit: string) => ReturnType<typeof collectVerificationSourceInputs> | null;
}
export interface VerificationReuseIdentity {
  key: ReuseDigest; stepId: string; contentIdentity: ReuseDigest; recipeIdentity: ReuseDigest; environmentIdentity: ReuseDigest; gitIdentity?: ReuseDigest;
}
export interface VerificationReuseOrigin {
  kind: 'local' | 'ci'; runId: string; sourceCommit: string; startedAt: string; finishedAt: string;
  workflow?: { runId: string; runAttempt: number };
}
export interface VerificationReuseRecord {
  schemaVersion: 'buildr.verification-source-result/v1'; identity: VerificationReuseIdentity;
  environment: VerificationReuseEnvironment; origin: VerificationReuseOrigin; cleanup: 'clean'; identityAfter: ReuseDigest;
  result: { id: string; status: 'passed'; exitCode: 0; durationMs: number; childOutcome: 'passed'; childExitCode: 0; childSignal: null };
}
export interface VerificationReuseBundle { schemaVersion: 'buildr.verification-source-bundle/v1'; records: VerificationReuseRecord[] }
export interface VerificationReuseOptions {
  productRoot: string; projectRoot?: string; env?: NodeJS.ProcessEnv; snapshot?: VerificationReuseSnapshot;
  step?: VerificationReuseStep; stepId?: string; stepIds?: string[]; steps?: VerificationReuseStep[];
  runner?: string; arch?: string; environment?: VerificationReuseEnvironment;
  readOnly?: boolean;
}
export const VERIFICATION_REUSE_BUNDLE_SCHEMA = 'buildr.verification-source-bundle/v1';
export const VERIFICATION_REUSE_RECORD_SCHEMA = 'buildr.verification-source-result/v1';
const digestPattern = /^sha256-[a-f0-9]{64}$/u;
const digest = (value: unknown): ReuseDigest => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const runnerPlatform = (runner: string) => runner === 'macos' ? 'darwin' : runner === 'windows' ? 'win32' : runner;
const sorted = (value: Record<string, string>) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
const git = (root: string, args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const liveMysqlInput = 'BUILDR_TEST_MYSQL_CONNECTION_FILE';

export function requiresFreshExternalVerification(step: VerificationReuseStep, snapshot: VerificationReuseSnapshot): boolean {
  // A mutable external database cannot be attested by source bytes or an old
  // skipped test. Only its owning group loses reuse; credentials stay unread.
  return Boolean(step.executor.files?.includes('test/integration/mysql-client-live.test.ts')
    && snapshot.inputIdentities?.[liveMysqlInput] !== digest(''));
}

/** Hash actual source bytes, modes and link targets. HEAD is provenance, never the content key. */
export function collectVerificationReuseSnapshot(options: VerificationReuseOptions): VerificationReuseSnapshot {
  const productRoot = path.resolve(options.productRoot), repositoryRoot = git(productRoot, ['rev-parse', '--show-toplevel']).trim();
  const env = options.env ?? process.env;
  const steps = [...(options.steps ?? verificationSteps), ...(options.step ? [options.step] : [])];
  const sourceInputs = collectVerificationSourceInputs(repositoryRoot, productRoot, steps);
  const history = new Map<string, ReturnType<typeof collectVerificationSourceInputs> | null>();
  const historicalInputs = (commit: string) => {
    if (!history.has(commit)) {
      if (history.size >= 16) return null;
      try { history.set(commit, collectVerificationSourceInputs(repositoryRoot, productRoot, steps, commit)); }
      catch { history.set(commit, null); }
    }
    return history.get(commit)!;
  };
  const inputNames = [...new Set([liveMysqlInput, ...[...(options.steps ?? verificationSteps), ...(options.step ? [options.step] : [])]
    .flatMap((step: VerificationReuseStep) => step.reuse && step.reuse.inputs || [])])].sort();
  const inputIdentities = Object.fromEntries(inputNames.map(name => [name, digest(env[name] ?? '')]));
  const variables = Object.fromEntries(['TZ', 'LANG', 'LC_ALL', 'NODE_OPTIONS', 'BUILDR_VERIFICATION_PROFILE', 'BUILDR_VERIFICATION_NETWORK_MODE'].map(key => [key, env[key] ?? '']));
  const exactNode = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env, requireNpm: true });
  const npm = spawnCommandSync(exactNode.npmExecutable!, ['--version'], { env: exactNode.env, encoding: 'utf8', timeout: 10_000 });
  const tools = { git: git(repositoryRoot, ['--version']).trim().replace(/^git version /u, '').replace(/[^a-z0-9.+:-]/giu, '-'), npm: npm.status === 0 ? String(npm.stdout).trim() : 'unavailable',
    'backend-dependencies': preparationContentDigest([path.join(productRoot, 'node_modules')], { optional: true }) ?? 'unavailable',
    'web-dependencies': preparationContentDigest([path.resolve(productRoot, '../buildr-web/node_modules')], { optional: true, webDependencyCache: true }) ?? 'unavailable',
    'plugin-dependencies': preparationContentDigest([path.resolve(productRoot, '../dsh-plugin/node_modules')], { optional: true }) ?? 'unavailable' };
  const head = git(repositoryRoot, ['rev-parse', 'HEAD']), refs = git(repositoryRoot, ['show-ref', '--head']), gitHistory = git(repositoryRoot, ['log', '--all', '--format=%H:%P']);
  let gitComparison: VerificationReuseSnapshot['gitComparison'];
  if ([...(options.steps ?? verificationSteps), ...(options.step ? [options.step] : [])].some(step => step.reuse && step.reuse.git === 'comparison')) {
    try {
      const baseRef = resolveVerificationBase(repositoryRoot, env.BUILDR_VERIFICATION_BASE || null);
      const base = git(repositoryRoot, ['rev-parse', '--verify', `${baseRef}^{commit}`]).trim();
      gitComparison = { head: head.trim(), baseRef, base, mergeBase: git(repositoryRoot, ['merge-base', base, head.trim()]).trim() };
    } catch { gitComparison = null; }
  }
  return { productRoot, repositoryRoot, ...sourceInputs, historicalInputs, inputIdentities, sourceCommit: head.trim(),
    gitIdentity: digest([head, refs, gitHistory]), gitInputs: { head: head.trim(), refsIdentity: digest(refs), historyIdentity: digest(gitHistory) },
    ...(gitComparison !== undefined ? { gitComparison } : {}),
    environment: options.environment ? { ...options.environment, tools: { ...tools, ...options.environment.tools } }
      : { platform: process.platform, arch: process.arch, nodeVersion: process.versions.node, tools, variablesIdentity: digest(variables) } };
}

function requiredToolKeys(step: VerificationReuseStep): string[] {
  const scope = step.reuse && step.reuse.scope;
  return [...new Set(['backend-dependencies', ...(!['backend', 'platform-backend'].includes(scope || '') ? ['web-dependencies'] : []), ...(scope === 'plugin' ? ['plugin-dependencies'] : []), ...(step.reuse && step.reuse.tools || [])])];
}

export function createVerificationReuseIdentity(step: VerificationReuseStep, snapshot: VerificationReuseSnapshot, legacy = false): VerificationReuseIdentity | null {
  if (!step.reuse || step.executor?.type === 'candidate-artifact' || step.executor?.consumesArtifact) return null;
  if (requiresFreshExternalVerification(step, snapshot)) return null;
  if (step.reuse.git === 'comparison' && !snapshot.gitComparison) return null;
  const selected = legacy ? null : snapshot.proofInputs?.[step.id];
  const proof = selected?.selectionIdentity === digest({ executor: step.executor, scope: step.reuse.scope }) ? selected : null;
  const inputs = proof ?? (step.reuse.inputMode ? snapshot.stepInputs?.[step.id] : null);
  if ((proof || step.reuse.inputMode) && (!inputs || inputs.unavailable)) return null;
  if (!inputs && snapshot.unavailableScopes?.includes(step.reuse.scope)) return null;
  const contentIdentity = inputs?.contentIdentity ?? snapshot.contentIdentities[step.reuse.scope];
  if (!contentIdentity) return null;
  const declared = verificationSteps.find((item: VerificationReuseStep) => item.id === step.id);
  const execution = verificationStepExecutionInputs(step);
  const recipeIdentity = digest({ version: proof ? 2 : 1, id: step.id, executor: step.executor, dependsOn: declared?.dependsOn ?? step.dependsOn ?? [], contexts: step.contexts ?? [], timeoutMs: step.timeoutMs ?? null, reuse: step.reuse,
    ...(execution ? { execution } : {}),
    ...(inputs ? { source: inputs.recipeIdentity, fallback: inputs.fallback, resources: step.resources, resourceDemand: step.resourceDemand, concurrencyClass: step.concurrencyClass } : {}) });
  const { platform, arch, nodeVersion, tools, variablesIdentity } = snapshot.environment;
  const requiredTools = Object.fromEntries(requiredToolKeys(step).map(key => [key, tools[key] ?? 'unavailable']));
  if (Object.values(requiredTools).includes('unavailable')) return null;
  const inputNames = step.reuse.inputs ?? [];
  if (inputNames.some(name => !digestPattern.test(snapshot.inputIdentities?.[name] ?? ''))) return null;
  const environmentInputs = Object.fromEntries(inputNames.map(name => [name, snapshot.inputIdentities![name]]));
  const environmentIdentity = digest({ platform, arch, node: step.reuse.exactNode ? nodeVersion : '>=24.15.0', tools: sorted(requiredTools), variablesIdentity,
    ...(inputNames.length > 0 ? { inputs: sorted(environmentInputs) } : {}) });
  const comparison = snapshot.gitComparison;
  const gitIdentity = step.reuse.git === 'comparison' && comparison
    ? digest({ head: comparison.head, base: comparison.base, mergeBase: comparison.mergeBase }) : snapshot.gitIdentity;
  const identity = { stepId: step.id, contentIdentity, recipeIdentity, environmentIdentity, ...(step.reuse.git ? { gitIdentity } : {}) };
  return { key: digest(identity), ...identity };
}

function validEnvironment(value: any): value is VerificationReuseEnvironment {
  if (!value || !['darwin', 'win32', 'linux'].includes(value.platform) || !['arm64', 'x64', 'ia32', 'arm', 'ppc64', 's390x', 'riscv64'].includes(value.arch)
    || typeof value.nodeVersion !== 'string' || !digestPattern.test(value.variablesIdentity ?? '') || !value.tools || typeof value.tools !== 'object' || Array.isArray(value.tools)) return false;
  try { assertMinimumNodeVersion(value.nodeVersion, '24.15.0'); } catch { return false; }
  return Object.entries(value.tools).every(([key, item]) => /^[a-z0-9._:-]{1,80}$/iu.test(key) && typeof item === 'string' && /^[a-z0-9._:+@=-]{1,180}$/iu.test(item));
}

function closed(value: any, required: string[], optional: string[] = []): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

/** The checker may run on Ubuntu while validating a macOS execution environment. */
export function validateVerificationReuseRecord(record: unknown, options: VerificationReuseOptions): record is VerificationReuseRecord {
  try {
    const value = record as VerificationReuseRecord;
    const step = options.step ?? (options.steps ?? verificationSteps).find((item: VerificationReuseStep) => item.id === (options.stepId ?? value?.identity?.stepId));
    if (!step || !closed(value, ['schemaVersion', 'identity', 'environment', 'origin', 'cleanup', 'identityAfter', 'result'])
      || !closed(value.identity, ['key', 'stepId', 'contentIdentity', 'recipeIdentity', 'environmentIdentity'], ['gitIdentity'])
      || !closed(value.environment, ['platform', 'arch', 'nodeVersion', 'tools', 'variablesIdentity'])
      || value?.schemaVersion !== VERIFICATION_REUSE_RECORD_SCHEMA || !validEnvironment(value.environment) || value.cleanup !== 'clean'
      || value.identity?.stepId !== step.id || value.identityAfter !== value.identity.key || !digestPattern.test(value.identity.key)) return false;
    if (options.runner && runnerPlatform(options.runner) !== value.environment.platform || options.arch && options.arch !== value.environment.arch) return false;
    if (options.environment && (options.environment.variablesIdentity !== value.environment.variablesIdentity || requiredToolKeys(step).some(key => options.environment!.tools[key] !== value.environment.tools[key])
      || step.reuse && step.reuse.exactNode && options.environment.nodeVersion !== value.environment.nodeVersion)) return false;
    const result = value.result, origin = value.origin;
    if (!closed(result, ['id', 'status', 'exitCode', 'durationMs', 'childOutcome', 'childExitCode', 'childSignal'])
      || !closed(origin, ['kind', 'runId', 'sourceCommit', 'startedAt', 'finishedAt'], ['workflow'])
      || result.id !== step.id || result.status !== 'passed' || result.exitCode !== 0 || result.childOutcome !== 'passed' || result.childExitCode !== 0 || result.childSignal !== null
      || !Number.isFinite(result.durationMs) || result.durationMs < 0 || !origin || !['local', 'ci'].includes(origin.kind)
      || !/^[a-z0-9._:-]{1,180}$/iu.test(origin.runId) || !/^[a-f0-9]{40,64}$/u.test(origin.sourceCommit)
      || !Number.isFinite(Date.parse(origin.startedAt)) || !Number.isFinite(Date.parse(origin.finishedAt)) || Date.parse(origin.finishedAt) < Date.parse(origin.startedAt)) return false;
    if (origin.workflow && (!closed(origin.workflow, ['runId', 'runAttempt']) || !/^[1-9]\d*$/u.test(origin.workflow.runId) || !Number.isSafeInteger(origin.workflow.runAttempt) || origin.workflow.runAttempt < 1)) return false;
    const snapshot = options.snapshot ?? collectVerificationReuseSnapshot(options);
    const identity = createVerificationReuseIdentity(step, { ...snapshot, environment: value.environment });
    if (identity !== null && JSON.stringify(identity) === JSON.stringify(value.identity)) return true;
    // Old records remain original execution evidence. Authenticate their broad
    // input digest against immutable source before comparing the narrower inputs.
    if (!identity || !step.reuse || step.reuse.git || !snapshot.historicalInputs) return false;
    const original = snapshot.historicalInputs(origin.sourceCommit);
    if (!original) return false;
    const historical = { ...snapshot, ...original, environment: value.environment };
    const before = createVerificationReuseIdentity(step, historical, true);
    return before !== null && JSON.stringify(before) === JSON.stringify(value.identity)
      && JSON.stringify(createVerificationReuseIdentity(step, historical)) === JSON.stringify(identity);
  } catch { return false; }
}

export function reusedVerificationResult(record: VerificationReuseRecord): any {
  return { ...record.result, durationMs: 0, stdout: '', stderr: '', processCleanup: { status: 'clean', ownership: 'prior-execution' },
    disposition: 'reused', reusedFrom: { key: record.identity.key, origin: record.origin, environment: record.environment, durationMs: record.result.durationMs }, sourceRecord: record };
}

export function resolveVerificationReuseDirectory(options: VerificationReuseOptions): string {
  const override = (options.env ?? process.env).BUILDR_VERIFICATION_REUSE_DIR;
  if (override) { if (!path.isAbsolute(override)) throw new Error('BUILDR_VERIFICATION_REUSE_DIR must be absolute'); return override; }
  const common = fs.realpathSync(path.resolve(options.productRoot, git(options.productRoot, ['rev-parse', '--git-common-dir']).trim()));
  return path.join(os.tmpdir(), 'buildr-verification-reuse', digest(common).slice(7, 31), 'v1');
}

export function readVerificationReuseBundle(file: string): VerificationReuseBundle {
  if (fs.statSync(file).size > 2 * 1024 * 1024) throw new Error('Source result bundle exceeds its byte budget');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value?.schemaVersion !== VERIFICATION_REUSE_BUNDLE_SCHEMA || !Array.isArray(value.records) || value.records.length > 512) throw new Error('Invalid source result bundle');
  return value;
}

export function writeVerificationReuseBundle(file: string, bundle: VerificationReuseBundle): void {
  const text = `${JSON.stringify(bundle)}\n`;
  if (Buffer.byteLength(text) > 2 * 1024 * 1024 || bundle.records.length > 512) throw new Error('Source result bundle exceeds its byte budget');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, text); fs.renameSync(temporary, file);
}

function writeCacheValue(file: string, record: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(record)}\n`); fs.renameSync(temporary, file);
}

export function collectVerificationReuseBundle(options: VerificationReuseOptions): VerificationReuseBundle {
  const snapshot = options.snapshot ?? collectVerificationReuseSnapshot(options);
  const records: VerificationReuseRecord[] = [];
  const store = createVerificationReuseStore({ ...options, snapshot });
  for (const step of options.steps ?? verificationSteps) {
    if (options.stepIds && !options.stepIds.includes(step.id)) continue;
    const record = store.lookup(step);
    if (record) records.push(record);
  }
  return { schemaVersion: VERIFICATION_REUSE_BUNDLE_SCHEMA, records: records.sort((a, b) => a.identity.key.localeCompare(b.identity.key)) };
}

export function createVerificationReuseStore(options: VerificationReuseOptions & { imports?: VerificationReuseBundle[]; portableImports?: boolean }) {
  const directory = resolveVerificationReuseDirectory(options);
  const snapshot = options.snapshot ?? collectVerificationReuseSnapshot(options);
  const staged = new Map<string, VerificationReuseRecord>();
  const generations = new Map<string, string | null>(), invalidKeys = new Set<string>();
  let historicalRecords: VerificationReuseRecord[] | undefined;
  let available = true;
  const fileFor = (key: string) => path.join(directory, `${key}.json`);
  const markerFor = (key: string): { generation: string | null; invalidatedAt: number; accepted?: ReuseDigest } => {
    try {
      const marker = JSON.parse(fs.readFileSync(`${fileFor(key)}.invalid`, 'utf8'));
      if (!closed(marker, ['generation', 'invalidatedAt'], ['accepted'])
        || marker.generation !== null && !/^[a-f0-9-]{36}$/u.test(marker.generation ?? '')
        || !Number.isFinite(marker.invalidatedAt) || marker.invalidatedAt < 0 || marker.accepted !== undefined && !digestPattern.test(marker.accepted)) throw new Error('Invalid marker');
      return marker;
    } catch (error: any) { return { generation: error.code === 'ENOENT' ? null : 'invalid', invalidatedAt: 0 }; }
  };
  const observeGeneration = (key: string) => { if (!generations.has(key)) generations.set(key, markerFor(key).generation); };
  for (const step of options.steps ?? verificationSteps) { const identity = createVerificationReuseIdentity(step, snapshot); if (identity) observeGeneration(identity.key); }
  const locked = <T>(key: string, operation: () => T): T => {
    fs.mkdirSync(directory, { recursive: true });
    return withExclusiveFileLock(`${fileFor(key)}.lock`, fileFor(key), operation);
  };
  const applicableKeys = (identity: VerificationReuseIdentity) => {
    const step = (options.steps ?? verificationSteps).find((item: VerificationReuseStep) => item.id === identity.stepId);
    const current = step && createVerificationReuseIdentity(step, snapshot);
    return [...new Set([identity.key, ...(current ? [current.key] : [])])];
  };
  const acceptsMarker = (record: VerificationReuseRecord) => {
    if (!record?.identity?.key) return false;
    // Foreign clocks never order executions. A local invalidation rejects every
    // imported older proof until this generation accepts a fresh real result.
    return applicableKeys(record.identity).every(key => {
      if (invalidKeys.has(key)) return false;
      const marker = markerFor(key);
      return marker.generation === null || marker.accepted === digest(record);
    });
  };
  try {
    if (!options.readOnly) {
      fs.mkdirSync(directory, { recursive: true });
      const probe = path.join(directory, `.probe-${process.pid}-${crypto.randomUUID()}`);
      fs.writeFileSync(probe, ''); fs.rmSync(probe);
    }
  } catch { available = false; }
  const invalidate = (identity: VerificationReuseIdentity) => {
    if (options.readOnly) throw new Error('Read-only verification inspection cannot invalidate results.');
    for (const key of applicableKeys(identity)) {
      staged.delete(key); invalidKeys.add(key);
      if (!available) continue;
      try { locked(key, () => {
      const generation = crypto.randomUUID();
      writeCacheValue(`${fileFor(key)}.invalid`, { generation, invalidatedAt: Date.now() });
      generations.set(key, generation); fs.rmSync(fileFor(key), { force: true });
      }); } catch { available = false; }
    }
  };
  return {
    snapshot, directory,
    cacheAvailable: () => available,
    isCurrent(record: VerificationReuseRecord): boolean { return acceptsMarker(record); },
    isCurrentFresh(record: VerificationReuseRecord): boolean {
      const key = record.identity.key;
      return acceptsMarker(record) || !available && staged.get(key) === record && !invalidKeys.has(key)
        && markerFor(key).generation === generations.get(key);
    },
    lookup(step: VerificationReuseStep): VerificationReuseRecord | null {
      const identity = createVerificationReuseIdentity(step, snapshot);
      if (!identity) return null;
      observeGeneration(identity.key);
      let local: any = null;
      try { if (available) local = JSON.parse(fs.readFileSync(fileFor(identity.key), 'utf8')); } catch { /* Cache miss. */ }
      if (local && acceptsMarker(local) && validateVerificationReuseRecord(local, { ...options, snapshot, step, runner: snapshot.environment.platform, arch: snapshot.environment.arch, environment: snapshot.environment })) return local;
      const portableCommon = options.portableImports && step.platformScope?.kind === 'common';
      const imported = (options.imports ?? []).flatMap(bundle => bundle.records).find(record => acceptsMarker(record)
        && (!portableCommon || ['darwin', 'win32'].includes(record.environment?.platform))
        && validateVerificationReuseRecord(record, { ...options, snapshot, step, ...(portableCommon ? { runner: undefined } : { runner: snapshot.environment.platform }),
          ...(options.portableImports ? {} : { arch: snapshot.environment.arch, environment: snapshot.environment }) })) ?? null;
      if (imported) return imported;
      if (!historicalRecords) {
        historicalRecords = [];
        try {
          for (const file of fs.readdirSync(directory).filter(file => /^sha256-[a-f0-9]{64}\.json$/u.test(file)).sort().slice(0, 4096)) {
            try {
              const target = path.join(directory, file);
              if (fs.statSync(target).size <= 65536) historicalRecords.push(JSON.parse(fs.readFileSync(target, 'utf8')));
            } catch { /* Corrupt or concurrently removed records are not evidence. */ }
          }
        } catch { /* An unavailable cache cannot create an old proof. */ }
      }
      return historicalRecords.filter(record => record?.identity?.stepId === step.id)
        .sort((a, b) => Number(b.origin?.sourceCommit === snapshot.sourceCommit) - Number(a.origin?.sourceCommit === snapshot.sourceCommit)
          || String(b.origin?.finishedAt ?? '').localeCompare(String(a.origin?.finishedAt ?? ''))).slice(0, 8)
        .find(record => acceptsMarker(record) && validateVerificationReuseRecord(record, { ...options, snapshot, step,
          runner: snapshot.environment.platform, arch: snapshot.environment.arch, environment: snapshot.environment })) ?? null;
    },
    invalidate,
    stage(step: VerificationReuseStep, result: any, origin: VerificationReuseOrigin): VerificationReuseRecord | null {
      if (options.readOnly) throw new Error('Read-only verification inspection cannot stage results.');
      const identity = createVerificationReuseIdentity(step, snapshot);
      if (!identity) return null;
      if (result.status === 'blocked' || result.status === 'skipped') return null;
      if (result.status !== 'passed' || result.exitCode !== 0 || result.childOutcome !== 'passed' || result.childExitCode !== 0 || result.childSignal !== null || result.processCleanup?.status !== 'clean') { invalidate(identity); return null; }
      observeGeneration(identity.key);
      const record: VerificationReuseRecord = { schemaVersion: VERIFICATION_REUSE_RECORD_SCHEMA, identity, environment: snapshot.environment, origin, cleanup: 'clean', identityAfter: identity.key,
        result: { id: step.id, status: 'passed', exitCode: 0, durationMs: result.durationMs, childOutcome: 'passed', childExitCode: 0, childSignal: null } };
      staged.set(identity.key, record); return record;
    },
    commit(after: VerificationReuseSnapshot, cleanupClean: boolean): VerificationReuseBundle {
      if (options.readOnly) throw new Error('Read-only verification inspection cannot commit results.');
      const records: VerificationReuseRecord[] = [];
      for (const record of staged.values()) {
        const step = (options.steps ?? verificationSteps).find((item: VerificationReuseStep) => item.id === record.identity.stepId);
        const identity = step ? createVerificationReuseIdentity(step, after) : null;
        if (!cleanupClean || identity?.key !== record.identity.key) { invalidate(record.identity); continue; }
        if (!validateVerificationReuseRecord(record, { ...options, snapshot: after, step })) { invalidate(identity!); continue; }
        if (!available) { records.push(record); continue; }
        try { locked(record.identity.key, () => {
          const marker = markerFor(record.identity.key);
          if (marker.generation !== generations.get(record.identity.key)) return;
          writeCacheValue(fileFor(record.identity.key), record);
          writeCacheValue(`${fileFor(record.identity.key)}.invalid`, { ...marker, generation: marker.generation === 'invalid' ? crypto.randomUUID() : marker.generation, accepted: digest(record) });
          invalidKeys.delete(record.identity.key); records.push(record);
        }); } catch { available = false; records.push(record); }
      }
      return { schemaVersion: VERIFICATION_REUSE_BUNDLE_SCHEMA, records };
    },
  };
}

/** Read-only explanation. Historical candidates explain misses; only lookup's
 * fully validated result can authorize reuse. No result is created here. */
export function inspectVerificationReusePlan(plan: any, options: VerificationReuseOptions & { force?: boolean; imports?: VerificationReuseBundle[] } ): any {
  const snapshot = options.snapshot ?? collectVerificationReuseSnapshot({ ...options, steps: plan.steps });
  const store = createVerificationReuseStore({ ...options, snapshot, steps: plan.steps, readOnly: true });
  const historical: any[] = [...(options.imports ?? []).flatMap(bundle => bundle.records)];
  try {
    const files = fs.readdirSync(store.directory).filter(file => /^sha256-[a-f0-9]{64}\.json$/u.test(file)).sort();
    for (const file of files.slice(0, 4096)) {
      try { const target = path.join(store.directory, file); if (fs.statSync(target).size <= 65536) historical.push(JSON.parse(fs.readFileSync(target, 'utf8'))); } catch { /* Diagnostic miss only. */ }
    }
  } catch { /* Missing cache is an ordinary first run. */ }
  let workMs = 0, reusedOriginalMs = 0;
  const steps = plan.steps.map((step: any) => {
    const identity = createVerificationReuseIdentity(step, snapshot), record = options.force ? null : store.lookup(step);
    const prior = historical.filter(value => value?.schemaVersion === VERIFICATION_REUSE_RECORD_SCHEMA && value.identity?.stepId === step.id)
      .sort((a, b) => String(b.origin?.finishedAt ?? '').localeCompare(String(a.origin?.finishedAt ?? '')))[0];
    const reasons: string[] = [];
    if (record) reasons.push('matching-complete-result');
    else if (options.force) reasons.push('explicit-force');
    else if (!step.reuse) reasons.push(step.reuseDisabledReason ?? 'fresh-proof-required');
    else if (requiresFreshExternalVerification(step, snapshot)) reasons.push('external-live-environment-requires-fresh-proof');
    else if (!identity) reasons.push('inputs-unavailable');
    else if (!prior) reasons.push('no-matching-result');
    else {
      for (const [field, reason] of [['contentIdentity', 'product-input-changed'], ['recipeIdentity', 'check-recipe-changed'],
        ['environmentIdentity', 'environment-changed'], ['gitIdentity', 'git-input-changed']] as const) {
        if (identity[field] !== prior.identity[field]) reasons.push(reason);
      }
      if (!reasons.length) reasons.push('prior-result-invalid-or-revoked');
    }
    const observed = prior?.environment?.platform === snapshot.environment.platform && prior?.environment?.arch === snapshot.environment.arch
      && Number.isFinite(prior?.result?.durationMs) && prior.result.durationMs >= 0 ? prior.result.durationMs : null;
    const estimate = Math.max(0, Number(observed ?? step.testing?.targetDurationMs ?? step.schedulingCostMs ?? 0));
    const durationMs = record ? 0 : Number.isFinite(estimate) ? estimate : 0;
    workMs += durationMs; reusedOriginalMs += record?.result.durationMs ?? 0;
    return { id: step.id, disposition: record ? 'reuse' : 'execute', reasons, estimatedDurationMs: durationMs,
      estimateSource: observed === null ? 'declared-target' : 'prior-execution',
      inputScope: (snapshot.proofInputs?.[step.id] ?? snapshot.stepInputs?.[step.id])?.fallback ? 'conservative-fallback' : step.reuse ? step.reuse.scope : 'fresh',
      ...(!identity && step.reuse ? { unavailableTools: requiredToolKeys(step).filter(key => !snapshot.environment.tools[key] || snapshot.environment.tools[key] === 'unavailable') } : {}),
      ...((snapshot.proofInputs?.[step.id] ?? snapshot.stepInputs?.[step.id])?.unresolved?.length ? { unresolvedInputs: (snapshot.proofInputs?.[step.id] ?? snapshot.stepInputs![step.id])!.unresolved } : {}),
      ...(record ? { origin: record.origin, originalDurationMs: record.result.durationMs } : {}) };
  });
  const durations = new Map(steps.map((step: any) => [step.id, step.estimatedDurationMs]));
  const limits = resolveVerificationExecutionProfile((options.env ?? process.env).BUILDR_VERIFICATION_PROFILE, options.env ?? process.env).limits;
  const estimate = estimateVerificationPlan({ ...plan, steps: plan.steps.map((step: any) => ({ ...step, budgetMs: durations.get(step.id) })) }, { concurrency: limits });
  return { schemaVersion: 'buildr.verification-reuse-plan/v1', steps,
    estimate: { source: 'prior-runs-and-declared-targets', remainingWorkMs: workMs, dependencyCriticalPathMs: estimate.dependencyCriticalPath.durationMs,
      resourceLowerBoundMs: estimate.minimumFeasibleDurationMs, limitingConstraints: estimate.limitingConstraints,
      reusedOriginalMs, executedCount: steps.filter((step: any) => step.disposition === 'execute').length,
      reusedCount: steps.filter((step: any) => step.disposition === 'reuse').length, excludes: ['platform-queue', 'environment-preparation'] } };
}

/** One execution owns cache writes; callers cannot manufacture a passed source result. */
export function createVerificationPlanReuse(plan: any, options: any): any {
  if (options.reuse === false || !plan.steps.some((step: VerificationReuseStep) => step.reuse)) return null;
  const env = { ...process.env, ...options.env }, config = options.reuse ?? {};
  let declaredProfile: any = null;
  try { declaredProfile = resolveVerificationExecutionProfile(options.executionProfile?.id ?? env.BUILDR_VERIFICATION_PROFILE, env); } catch { /* Unknown custom profiles cannot create portable proof. */ }
  const steps = plan.steps.map((step: VerificationReuseStep) => {
    if (!verificationStepExecutionInputs(step)) return step;
    const actualWorkers = options.executionProfile?.limits?.innerConcurrency?.[step.id] ?? step.resourceDemand?.workers ?? 1;
    const registeredWorkers = declaredProfile?.limits?.innerConcurrency?.[step.id] ?? step.resourceDemand?.workers ?? 1;
    return !declaredProfile || actualWorkers !== registeredWorkers
      ? { ...step, reuse: false, reuseDisabledReason: 'custom-worker-budget-requires-fresh-proof' } : step;
  });
  const imports = config.imports ? Array.isArray(config.imports) ? config.imports : [config.imports] : [];
  if (env.BUILDR_VERIFICATION_REUSE_IMPORT) imports.push(readVerificationReuseBundle(env.BUILDR_VERIFICATION_REUSE_IMPORT));
  const snapshotOptions = { productRoot: options.productRoot, projectRoot: options.projectRoot, env, steps };
  const snapshot = collectVerificationReuseSnapshot(snapshotOptions);
  const store = createVerificationReuseStore({ ...snapshotOptions, snapshot, imports, portableImports: config.portableImports === true });
  const force = config.force === true || env.BUILDR_VERIFICATION_FORCE === '1';
  const hits = new Map<string, VerificationReuseRecord>();
  for (const step of steps) {
    const identity = createVerificationReuseIdentity(step, snapshot);
    if (identity && force) store.invalidate(identity);
    const record = !force ? store.lookup(step) : null;
    if (record) hits.set(step.id, record);
  }
  return {
    hits,
    explanation: inspectVerificationReusePlan({ ...plan, steps }, { ...snapshotOptions, snapshot, force, imports }),
    finish(results: any[], cleanupClean: boolean): VerificationReuseBundle {
      const after = collectVerificationReuseSnapshot(snapshotOptions);
      for (const result of results) {
        const step = steps.find((item: VerificationReuseStep) => item.id === result.id);
        if (!step || result.disposition === 'reused') continue;
        const start = result.startedAt ?? new Date().toISOString(), finish = result.finishedAt ?? start;
        store.stage(step, result, { kind: env.GITHUB_RUN_ID ? 'ci' : 'local', runId: options.runId ?? `verification-${process.pid}`,
          sourceCommit: snapshot.sourceCommit, startedAt: start, finishedAt: finish,
          ...(env.GITHUB_RUN_ID ? { workflow: { runId: env.GITHUB_RUN_ID, runAttempt: Number(env.GITHUB_RUN_ATTEMPT || 1) } } : {}) });
      }
      const written = store.commit(after, cleanupClean);
      const records = new Map(written.records.map(record => [record.identity.key, record]));
      for (const result of results) {
        const step = steps.find((item: VerificationReuseStep) => item.id === result.id), prior = hits.get(result.id);
        if (!step || result.status === 'blocked' || result.status === 'skipped') continue;
        const identity = createVerificationReuseIdentity(step, snapshot), current = createVerificationReuseIdentity(step, after);
        if (!identity) continue;
        // A reused check did not touch this execution's shared contexts or
        // leases. Their cleanup cannot revoke its original clean execution.
        // Its current inputs and any independently observed revocation still
        // have to match before it can remain in this run's exported coverage.
        const cleanupAffected = !cleanupClean && result.disposition !== 'reused';
        if (cleanupAffected || identity.key !== current?.key) {
          store.invalidate(identity);
          result.sourceRecord = undefined;
          const code = cleanupAffected ? 'verification-reuse-cleanup-failed' : 'verification-reuse-input-drift';
          const changes = (['contentIdentity', 'recipeIdentity', 'environmentIdentity', 'gitIdentity'] as const)
            .filter(field => identity[field] !== current?.[field])
            .map(field => ({ field, before: identity[field] ?? null, after: current?.[field] ?? null }));
          const details = { changes, cleanupClean,
            ...(changes.some(change => change.field === 'gitIdentity') ? { git: {
              before: step.reuse.git === 'comparison' ? snapshot.gitComparison : snapshot.gitInputs,
              after: step.reuse.git === 'comparison' ? after.gitComparison : after.gitInputs,
            } } : {}) };
          result.failureFacts = [...(result.failureFacts ?? []), { stage: 'execution', kind: 'execution', code, ...details }];
          options.stream?.write(`[verification-reuse] ${step.id}: ${code} ${JSON.stringify(details)}\n`);
          if (result.status === 'passed') Object.assign(result, { status: 'failed', exitCode: 1, failureCode: code });
          continue;
        }
        if (prior && result.status === 'passed') {
          if (store.isCurrent(prior)) records.set(prior.identity.key, prior);
          else { Object.assign(result, { status: 'failed', exitCode: 1, failureCode: 'verification-reuse-superseded', sourceRecord: undefined }); continue; }
        }
        const record = records.get(identity.key);
        if (record) result.sourceRecord = record;
        else if (!prior && result.status === 'passed' && result.childOutcome === 'passed' && result.processCleanup?.status === 'clean') {
          Object.assign(result, { status: 'failed', exitCode: 1, failureCode: 'verification-reuse-superseded', sourceRecord: undefined });
        }
      }
      const bundle: VerificationReuseBundle = { schemaVersion: VERIFICATION_REUSE_BUNDLE_SCHEMA, records: [...records.values()] };
      const output = config.output ?? env.BUILDR_VERIFICATION_REUSE_EXPORT;
      if (output) writeVerificationReuseBundle(path.resolve(output), bundle);
      if (!store.cacheAvailable()) options.stream?.write('[verification-reuse] cache unavailable; actual check results retained without cache writes\n');
      return bundle;
    },
    invalidate(): void {
      // This is disposal of the current execution, not a revocation of earlier
      // evidence that was only read here and never acquired these resources.
      for (const step of steps) {
        if (hits.has(step.id)) continue;
        const identity = createVerificationReuseIdentity(step, snapshot);
        if (identity) store.invalidate(identity);
      }
    },
  };
}
